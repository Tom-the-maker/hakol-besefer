// Book persistence service - saves/loads books from Supabase
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Story, UserInputs } from '../types';

export interface BookRecord {
  id: string;
  slug: string;
  created_at: string;
  title: string;
  hero_name: string;
  segments: string[];
  segment_count?: number;
  composite_image_url: string;
  is_unlocked: boolean;
  payment_status: 'pending' | 'paid' | 'free';
  email?: string;
  access_token?: string;
  // User inputs
  child_name?: string;
  age?: number;
  gender?: string;
  topic?: string;
  art_style?: string;
  metadata?: Record<string, unknown>;
}

export interface BookGenerationArtifacts {
  created_at: string;
  story?: {
    model: string;
    usage?: { input?: number; output?: number };
    prompt_token?: string;
    request_json?: Record<string, unknown>;
    response_json?: Record<string, unknown>;
  };
  image?: {
    model?: string;
    usage?: { input?: number; output?: number };
    image_resolution?: string | null;
    prompt_token?: string;
    request_json?: Record<string, unknown>;
    response_json?: Record<string, unknown>;
    mock?: boolean;
    mock_reason?: string;
  };
}

export interface SaveBookOptions {
  generationArtifacts?: BookGenerationArtifacts;
}

interface UploadedAsset {
  path: string;
  url: string;
}

const BOOK_PUBLIC_BUCKET = import.meta.env.VITE_BOOK_PUBLIC_BUCKET || 'book-public-assets';
const BOOK_PRIVATE_BUCKET = import.meta.env.VITE_BOOK_PRIVATE_BUCKET || 'book-private-assets';
const ASSET_CACHE_SECONDS = '31536000';
const MAX_OWNED_BOOKS = 500;

// ---- Access Token Management (localStorage) ----
const OWNED_BOOKS_KEY = 'hakol_besefer_owned_books';

type OwnedBookEntry = { token: string; savedAt: number };

function normalizeOwnedBooks(value: unknown): Record<string, OwnedBookEntry> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([slug, entry]) => {
      const normalizedSlug = typeof slug === 'string' ? slug.trim() : '';
      const token = typeof entry === 'string'
        ? entry.trim()
        : (typeof (entry as OwnedBookEntry | undefined)?.token === 'string'
          ? (entry as OwnedBookEntry).token.trim()
          : '');
      const rawSavedAt = (entry as OwnedBookEntry | undefined)?.savedAt;
      const savedAt = Number.isFinite(Number(rawSavedAt)) ? Number(rawSavedAt) : 0;

      if (!normalizedSlug || !token) return null;

      return [normalizedSlug, { token, savedAt }] as const;
    })
    .filter(Boolean)
    .sort(([, left], [, right]) => right.savedAt - left.savedAt)
    .slice(0, MAX_OWNED_BOOKS);

  return Object.fromEntries(entries);
}

function readOwnedBooks(): Record<string, OwnedBookEntry> {
  if (typeof localStorage === 'undefined') return {};

  try {
    const stored = JSON.parse(localStorage.getItem(OWNED_BOOKS_KEY) || '{}');
    const normalized = normalizeOwnedBooks(stored);
    const serializedStored = JSON.stringify(stored);
    const serializedNormalized = JSON.stringify(normalized);
    if (serializedStored !== serializedNormalized) {
      localStorage.setItem(OWNED_BOOKS_KEY, serializedNormalized);
    }
    return normalized;
  } catch {
    return {};
  }
}

function persistOwnedBooks(owned: Record<string, OwnedBookEntry>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OWNED_BOOKS_KEY, JSON.stringify(normalizeOwnedBooks(owned)));
}

export function saveBookOwnership(slug: string, token: string): void {
  const normalizedSlug = typeof slug === 'string' ? slug.trim() : '';
  const normalizedToken = typeof token === 'string' ? token.trim() : '';
  if (!normalizedSlug || !normalizedToken) return;

  const owned = readOwnedBooks();
  owned[normalizedSlug] = { token: normalizedToken, savedAt: Date.now() };
  persistOwnedBooks(owned);
}

export function getBookToken(slug: string): string | null {
  const owned = getOwnedBooks();
  return owned[slug]?.token || null;
}

export function getOwnedBooks(): Record<string, OwnedBookEntry> {
  return readOwnedBooks();
}

export function getOwnedBookSlugs(): string[] {
  return Object.keys(getOwnedBooks());
}

export function removeBookOwnership(slug: string): void {
  const normalizedSlug = typeof slug === 'string' ? slug.trim() : '';
  if (!normalizedSlug) return;

  const owned = readOwnedBooks();
  if (normalizedSlug in owned) {
    delete owned[normalizedSlug];
    persistOwnedBooks(owned);
  }
}

// Generate a short, URL-safe slug (6 chars)
function generateSlug(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'; // No confusing chars (0/O, 1/l)
  let slug = '';
  for (let i = 0; i < 6; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

function generateAccessToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getAssetValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isEphemeralAssetSource(value: string | undefined): boolean {
  if (!value) return false;
  return value.startsWith('data:') || value.startsWith('blob:');
}

function getPublicAssetUrl(path: string | undefined): string | undefined {
  if (!supabase || !path) return undefined;
  const trimmedPath = path.trim();
  if (!trimmedPath) return undefined;
  const { data } = supabase.storage.from(BOOK_PUBLIC_BUCKET).getPublicUrl(trimmedPath);
  return typeof data?.publicUrl === 'string' && data.publicUrl.trim().length > 0 ? data.publicUrl : undefined;
}

async function getBookApiHeaders(includeContentType = false): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers['Content-Type'] = 'application/json';
  }

  if (!supabase) return headers;

  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers.Authorization = `Bearer ${data.session.access_token}`;
    }
  } catch {
    // Ignore auth lookup failures and continue without an auth header.
  }

  return headers;
}

function buildBookApiUrl(slug: string): string {
  const params = new URLSearchParams({ slug });
  const accessToken = getBookToken(slug);
  if (accessToken) {
    params.set('token', accessToken);
  }
  return `/api/book?${params.toString()}`;
}

async function loadBookFromApi(slug: string): Promise<BookRecord | null | undefined> {
  if (!slug) return null;

  try {
    const response = await fetch(buildBookApiUrl(slug), {
      headers: await getBookApiHeaders(),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;

    const responseMetadata = normalizeObject((data as Record<string, unknown>).metadata);
    const responseAssets = normalizeObject(responseMetadata.assets);
    const sourceAssetUrl = getAssetValue(responseAssets.source_image_url);
    const displayAssetUrl = getAssetValue(responseAssets.display_image_url);
    const sourceImageUrl = getAssetValue((data as Record<string, unknown>).source_image_url)
      || getAssetValue((data as Record<string, unknown>).composite_image_url)
      || getAssetValue((data as Record<string, unknown>).display_image_url);
    const thumbImageUrl = getAssetValue(responseAssets.thumb_image_url);

    return {
      ...(data as BookRecord),
      composite_image_url: sourceImageUrl || '',
      metadata: {
        ...responseMetadata,
        assets: {
          ...responseAssets,
          ...(sourceAssetUrl || sourceImageUrl ? { source_image_url: sourceAssetUrl || sourceImageUrl } : {}),
          ...(displayAssetUrl ? { display_image_url: displayAssetUrl } : {}),
          ...(thumbImageUrl ? { thumb_image_url: thumbImageUrl } : {}),
        },
      },
    };
  } catch {
    return undefined;
  }
}

async function createBookViaApi(bookData: Record<string, unknown>): Promise<BookRecord | null | undefined> {
  try {
    const response = await fetch('/api/book', {
      method: 'POST',
      headers: await getBookApiHeaders(true),
      body: JSON.stringify({
        action: 'create',
        book: bookData,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    return data?.book ? (data.book as BookRecord) : null;
  } catch {
    return undefined;
  }
}

function compactGenerationArtifacts(generationArtifacts?: BookGenerationArtifacts): Record<string, unknown> | null {
  if (!generationArtifacts) return null;

  const compactStory = generationArtifacts.story
    ? {
        model: generationArtifacts.story.model,
        usage: generationArtifacts.story.usage,
      }
    : undefined;

  const compactImage = generationArtifacts.image
    ? {
        model: generationArtifacts.image.model,
        usage: generationArtifacts.image.usage,
        image_resolution: generationArtifacts.image.image_resolution ?? null,
        mock: generationArtifacts.image.mock ?? false,
        mock_reason: generationArtifacts.image.mock_reason ?? null,
      }
    : undefined;

  return {
    created_at: generationArtifacts.created_at,
    ...(compactStory ? { story: compactStory } : {}),
    ...(compactImage ? { image: compactImage } : {}),
  };
}

function isImageMimeType(mimeType: string | null | undefined): boolean {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/');
}

function decodeDataUrl(dataUrl: string): { blob: Blob; mimeType: string } | null {
  const match = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1];
  const base64Data = match[2];
  const byteChars = atob(base64Data);
  const byteArray = new Uint8Array(byteChars.length);

  for (let i = 0; i < byteChars.length; i++) {
    byteArray[i] = byteChars.charCodeAt(i);
  }

  return {
    blob: new Blob([byteArray], { type: mimeType }),
    mimeType,
  };
}

async function loadImageBlob(imageSource: string): Promise<{ blob: Blob; mimeType: string } | null> {
  if (!imageSource) return null;

  if (imageSource.startsWith('data:')) {
    return decodeDataUrl(imageSource);
  }

  try {
    const response = await fetch(imageSource);
    if (!response.ok) return null;
    const responseMimeType = response.headers.get('content-type');
    if (!isImageMimeType(responseMimeType)) {
      console.warn('Skipping non-image source while loading book image:', imageSource, responseMimeType);
      return null;
    }
    const blob = await response.blob();
    if (!isImageMimeType(blob.type || responseMimeType)) {
      console.warn('Fetched source did not resolve to an image blob:', imageSource, blob.type);
      return null;
    }
    return {
      blob,
      mimeType: blob.type || 'image/png',
    };
  } catch (err) {
    console.error('Error loading image blob:', err);
    return null;
  }
}

async function createDisplayPreviewBlob(sourceBlob: Blob, maxDimension = 1400, quality = 0.82): Promise<Blob | null> {
  return createResizedJpegBlob(sourceBlob, maxDimension, quality);
}

async function createCardThumbnailBlob(sourceBlob: Blob, maxDimension = 480, quality = 0.6): Promise<Blob | null> {
  return createResizedJpegBlob(sourceBlob, maxDimension, quality);
}

async function createResizedJpegBlob(sourceBlob: Blob, maxDimension: number, quality: number): Promise<Blob | null> {
  if (typeof document === 'undefined') return sourceBlob;

  const objectUrl = URL.createObjectURL(sourceBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image for preview compression'));
      image.src = objectUrl;
    });

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) return sourceBlob;

    const scale = Math.min(1, maxDimension / width, maxDimension / height);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) return sourceBlob;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const previewBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
    });

    return previewBlob || sourceBlob;
  } catch (err) {
    console.error('Error creating display preview:', err);
    return sourceBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function inferFileExtension(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'application/pdf') return 'pdf';
  return normalized.split('/')[1] || 'bin';
}

async function uploadBookAsset(
  blob: Blob,
  mimeType: string,
  bookSlug: string,
  accessToken: string | undefined,
  bucketName: string,
  folder: string,
  prefix: string
): Promise<UploadedAsset | null> {
  if (!supabase || !blob || !mimeType || !bookSlug) return null;

  try {
    const ext = inferFileExtension(mimeType);
    const tokenFragment = (accessToken || generateAccessToken())
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 24);
    const filePath = `${bookSlug}/${folder}/${prefix}-${tokenFragment || Date.now().toString(36)}.${ext}`;

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, blob, {
        contentType: mimeType,
        cacheControl: ASSET_CACHE_SECONDS,
        upsert: false,
      });

    if (error) {
      console.error(`Failed to upload asset ${prefix}:`, error);
      return null;
    }

    return {
      path: filePath,
      url: bucketName === BOOK_PUBLIC_BUCKET
        ? (supabase.storage.from(bucketName).getPublicUrl(filePath).data.publicUrl || '')
        : '',
    };
  } catch (err) {
    console.error(`Error uploading asset ${prefix}:`, err);
    return null;
  }
}

export async function removeBookStorageAssets(paths: string[]): Promise<void> {
  if (!supabase || paths.length === 0) return;

  const uniquePaths = [...new Set(paths.filter((path) => typeof path === 'string' && path.trim().length > 0))];
  if (uniquePaths.length === 0) return;

  try {
    await Promise.all([
      supabase.storage.from(BOOK_PUBLIC_BUCKET).remove(uniquePaths).catch(() => ({ error: null })),
      supabase.storage.from(BOOK_PRIVATE_BUCKET).remove(uniquePaths).catch(() => ({ error: null })),
    ]);
  } catch (err) {
    console.warn('Book asset cleanup error:', err);
  }
}

async function uploadBookImages(
  imageSource: string,
  bookSlug: string,
  accessToken?: string
): Promise<{ source: UploadedAsset | null; display: UploadedAsset | null; thumb: UploadedAsset | null } | null> {
  if (!imageSource) return null;

  const loadedImage = await loadImageBlob(imageSource);
  if (!loadedImage) return null;

  const sourceAsset = await uploadBookAsset(
    loadedImage.blob,
    loadedImage.mimeType,
    bookSlug,
    accessToken,
    BOOK_PRIVATE_BUCKET,
    'source',
    'scene-source'
  );

  const previewBlob = await createDisplayPreviewBlob(loadedImage.blob);
  const shouldUploadDisplayPreview = Boolean(
    previewBlob
    && previewBlob !== loadedImage.blob
    && previewBlob.size > 0
    && previewBlob.size < loadedImage.blob.size
  );
  const displayAsset = shouldUploadDisplayPreview
    ? await uploadBookAsset(previewBlob!, 'image/jpeg', bookSlug, accessToken, BOOK_PUBLIC_BUCKET, 'display', 'scene-display')
    : null;
  const cardThumbSource = previewBlob || loadedImage.blob;
  const thumbBlob = await createCardThumbnailBlob(cardThumbSource);
  const comparisonBlob = displayAsset ? (previewBlob || loadedImage.blob) : loadedImage.blob;
  const shouldUploadThumb = Boolean(
    thumbBlob
    && thumbBlob !== comparisonBlob
    && thumbBlob.size > 0
    && thumbBlob.size < comparisonBlob.size
  );
  const thumbAsset = shouldUploadThumb
    ? await uploadBookAsset(thumbBlob!, 'image/jpeg', bookSlug, accessToken, BOOK_PUBLIC_BUCKET, 'thumb', 'scene-thumb')
    : null;

  return {
    source: sourceAsset,
    display: displayAsset,
    thumb: thumbAsset,
  };
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function uploadBookPdf(
  slug: string,
  pdfBlob: Blob,
  fileName: string
): Promise<UploadedAsset | null> {
  if (!supabase || !slug || !pdfBlob) return null;

  const safeFileName = sanitizeFileName(fileName || `hakol-besefer-story-${Date.now()}.pdf`);
  const filePath = `${slug}/pdf/${Date.now()}-${safeFileName}`;

  try {
    const { error } = await supabase.storage
      .from(BOOK_PRIVATE_BUCKET)
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        cacheControl: ASSET_CACHE_SECONDS,
        upsert: false,
      });

    if (error) {
      console.error('Failed to upload book PDF:', error);
      return null;
    }
    return { path: filePath, url: '' };
  } catch (err) {
    console.error('Error uploading book PDF:', err);
    return null;
  }
}

export async function appendBookPdfArtifact(
  slug: string,
  asset: UploadedAsset,
  fileName: string,
  sizeBytes: number
): Promise<boolean> {
  try {
    const response = await fetch('/api/book', {
      method: 'POST',
      headers: await getBookApiHeaders(true),
      body: JSON.stringify({
        action: 'record_pdf_artifact',
        slug,
        access_token: getBookToken(slug) || undefined,
        asset,
        fileName,
        sizeBytes,
      }),
    });

    if (response.ok) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// Save a book to Supabase after generation
export async function saveBook(
  story: Story,
  inputs: UserInputs,
  sessionId: string,
  options?: SaveBookOptions
): Promise<BookRecord | null> {
  if (!isSupabaseConfigured() || !supabase) {
    console.warn('Supabase not configured - book not saved');
    return null;
  }

  const slug = generateSlug();
  const accessToken = generateAccessToken();

  const compactArtifacts = compactGenerationArtifacts(options?.generationArtifacts);
  const currentMetadata = normalizeObject(
    compactArtifacts
      ? { generation: compactArtifacts }
      : {}
  );
  const currentAssets = normalizeObject(currentMetadata.assets);
  const nextAssets = {
    ...currentAssets,
  };
  const metadata = {
    ...currentMetadata,
    assets: nextAssets,
  };

  const bookData = {
    slug,
    access_token: accessToken,
    session_id: sessionId,
    title: story.title,
    hero_name: story.heroName,
    segments: story.segments,
    composite_image_url: getAssetValue(story.source_image_url) || story.composite_image_url,
    is_unlocked: story.is_unlocked || false,
    payment_status: 'pending' as const,
    child_name: inputs.childName,
    age: inputs.age,
    gender: inputs.gender,
    topic: inputs.topic,
    art_style: inputs.artStyle,
    parent_character: inputs.parentCharacter,
    parent_name: inputs.parentName,
    metadata,
  };

  const apiBook = await createBookViaApi(bookData);
  if (apiBook) {
    saveBookOwnership(slug, accessToken);
    return apiBook;
  }

  return null;
}

// Load a book by slug (for sharing / viewing)
export async function loadBookBySlug(slug: string): Promise<BookRecord | null> {
  const apiBook = await loadBookFromApi(slug);
  return apiBook ?? null;
}

// Update book email (registration step)
export async function updateBookEmail(slug: string, email: string): Promise<boolean> {
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!slug || !normalizedEmail) return false;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const accessToken = getBookToken(slug);

  try {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
    }
  } catch {
    // Ignore auth lookup failures - token-based ownership still works.
  }

  try {
    const response = await fetch('/api/book', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'claim',
        slug,
        email: normalizedEmail,
        access_token: accessToken || undefined,
      }),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      if (typeof data?.access_token === 'string' && data.access_token) {
        saveBookOwnership(slug, data.access_token);
      }
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

// Convert BookRecord back to Story type (for rendering)
export function bookRecordToStory(book: BookRecord): Story {
  const metadata = normalizeObject(book.metadata);
  const assets = normalizeObject(metadata.assets);
  const sourceImagePath = getAssetValue(assets.source_image_path);
  const displayImagePath = getAssetValue(assets.display_image_path);
  const sourceImageUrl = getPublicAssetUrl(sourceImagePath) || getAssetValue(assets.source_image_url) || book.composite_image_url;
  const displayImageUrl = getPublicAssetUrl(displayImagePath) || getAssetValue(assets.display_image_url) || sourceImageUrl;

  return {
    title: book.title,
    heroName: book.hero_name,
    segments: Array.isArray(book.segments) ? book.segments : [],
    composite_image_url: sourceImageUrl,
    display_image_url: displayImageUrl,
    source_image_url: sourceImageUrl,
    is_unlocked: book.is_unlocked,
  };
}

export function resolveBookCardImageUrl(book: BookRecord): string {
  const metadata = normalizeObject(book.metadata);
  const assets = normalizeObject(metadata.assets);
  const thumbImagePath = getAssetValue(assets.thumb_image_path);

  return (
    getPublicAssetUrl(thumbImagePath) ||
    getAssetValue(assets.thumb_image_url) ||
    ''
  );
}
