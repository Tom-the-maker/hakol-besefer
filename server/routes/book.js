import sharp from 'sharp';
import { generateAccessToken, hashAccessToken } from '../lib/crypto.js';
import { getAuthUser, normalizeEmail } from '../lib/auth.js';
import {
  getPublicAssetUrl,
  getSignedPrivateAssetUrl,
  getStorageBuckets,
  getSupabaseAdmin,
  isStoragePath,
} from '../lib/supabase.js';
import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';
import { appendSystemLog } from '../lib/system-log.js';

const CACHE_CONTROL_SECONDS = '31536000';
const LEGACY_BOOK_SELECT = [
  'id',
  'slug',
  'session_id',
  'created_at',
  'updated_at',
  'title',
  'hero_name',
  'hero_age',
  'hero_gender',
  'topic',
  'art_style',
  'parent_character',
  'parent_name',
  'source_image_path',
  'display_image_path',
  'thumb_image_path',
  'story_segments',
  'preview_excerpt',
  'is_unlocked',
  'payment_status',
  'email',
  'user_id',
  'access_token_hash',
  'latest_pdf_path',
  'latest_pdf_file_name',
  'latest_pdf_size_bytes',
  'latest_pdf_exported_at',
  'metadata',
].join(', ');

const LEGACY_LIST_SELECT = [
  'id',
  'slug',
  'created_at',
  'updated_at',
  'title',
  'hero_name',
  'topic',
  'art_style',
  'story_segments',
  'preview_excerpt',
  'is_unlocked',
  'payment_status',
  'display_image_path',
  'thumb_image_path',
  'email',
  'user_id',
  'access_token_hash',
  'metadata',
].join(', ');

const LEGACY_DASHBOARD_SELECT = [
  'id',
  'session_id',
  'slug',
  'created_at',
  'updated_at',
  'title',
  'hero_name',
  'topic',
  'art_style',
  'parent_character',
  'parent_name',
  'story_segments',
  'is_unlocked',
  'payment_status',
  'display_image_path',
  'thumb_image_path',
  'latest_pdf_path',
  'latest_pdf_file_name',
  'latest_pdf_size_bytes',
  'latest_pdf_exported_at',
  'email',
].join(', ');

const VALID_PAYMENT_STATUSES = new Set(['pending', 'paid', 'free', 'failed', 'refunded']);
const VALID_HERO_GENDERS = new Set(['male', 'female']);
const FORBIDDEN_METADATA_KEYS = new Set([
  'source_image_url',
  'display_image_url',
  'thumb_image_url',
  'latest_url',
  'source_image_path',
  'display_image_path',
  'thumb_image_path',
  'latest_pdf_path',
  'story_segments',
  'request_json',
  'response_json',
  'prompt',
  'html',
]);

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function parseSegments(value) {
  return Array.isArray(value)
    ? value.map((segment) => (typeof segment === 'string' ? segment.trim() : '')).filter(Boolean)
    : [];
}

function parseOwnedBookPairs(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueBySlug = new Map();

  for (const entry of value) {
    const slug = getString(entry?.slug);
    const accessToken = getString(entry?.access_token);
    if (!slug || !accessToken) {
      continue;
    }

    uniqueBySlug.set(slug, {
      slug,
      access_token: accessToken,
    });
  }

  return [...uniqueBySlug.values()].slice(0, 500);
}

function sanitizeMetadata(value) {
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadata(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const next = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) {
      continue;
    }

    next[key] = sanitizeMetadata(nestedValue);
  }

  return next;
}

function buildPreviewExcerpt(segments) {
  const firstSegment = segments.find((segment) => typeof segment === 'string' && segment.trim().length > 0);
  return firstSegment ? firstSegment.slice(0, 220) : null;
}

function getSignedTokenHash(token) {
  const normalized = getString(token);
  return normalized ? hashAccessToken(normalized) : '';
}

function isBookOwner(book, authUser, accessToken) {
  const providedTokenHash = getSignedTokenHash(accessToken);
  const normalizedBookEmail = normalizeEmail(book?.email);
  const normalizedAuthEmail = normalizeEmail(authUser?.email);

  return Boolean(
    (providedTokenHash && book?.access_token_hash === providedTokenHash) ||
      (authUser &&
        ((book?.user_id && book.user_id === authUser.id) ||
          (normalizedBookEmail && normalizedAuthEmail && normalizedBookEmail === normalizedAuthEmail))),
  );
}

function ensureBoolean(value) {
  return value === true;
}

function parseHeroGender(value) {
  const normalized = getString(value).toLowerCase();
  return VALID_HERO_GENDERS.has(normalized) ? normalized : null;
}

function parsePaymentStatus(value) {
  const normalized = getString(value).toLowerCase();
  return VALID_PAYMENT_STATUSES.has(normalized) ? normalized : 'pending';
}

function parseHeroAge(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  const rounded = Math.round(numeric);
  return rounded >= 0 && rounded <= 120 ? rounded : null;
}

function inferSourceImage(inputBook) {
  return (
    getString(inputBook?.composite_image_url) ||
    getString(inputBook?.source_image_url) ||
    getString(inputBook?.display_image_url)
  );
}

function getProvidedAssetPaths(inputBook) {
  const metadata = normalizeObject(inputBook?.metadata);
  const assets = normalizeObject(metadata.assets);
  const sourcePath = getString(inputBook?.source_image_path) || getString(assets.source_image_path);
  const displayPath = getString(inputBook?.display_image_path) || getString(assets.display_image_path);
  const thumbPath = getString(inputBook?.thumb_image_path) || getString(assets.thumb_image_path);

  return { sourcePath, displayPath, thumbPath };
}

function arePersistedAssetPathsValid(slug, assetPaths) {
  return (
    isStoragePath(assetPaths.sourcePath) &&
    isStoragePath(assetPaths.displayPath) &&
    isStoragePath(assetPaths.thumbPath) &&
    assetPaths.sourcePath.startsWith(`${slug}/source/`) &&
    assetPaths.displayPath.startsWith(`${slug}/display/`) &&
    assetPaths.thumbPath.startsWith(`${slug}/thumb/`)
  );
}

function dataUrlToBuffer(imageSource) {
  const match = imageSource.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }

  try {
    return {
      mimeType: match[1].toLowerCase(),
      buffer: Buffer.from(match[2], 'base64'),
    };
  } catch {
    return null;
  }
}

async function loadImageSource(imageSource) {
  const normalized = getString(imageSource);
  if (!normalized) {
    throw new Error('Missing image source');
  }

  const dataUrl = dataUrlToBuffer(normalized);
  if (dataUrl) {
    return dataUrl;
  }

  if (normalized.startsWith('blob:')) {
    throw new Error('Blob URLs cannot be resolved on the server');
  }

  const response = await fetch(normalized);
  if (!response.ok) {
    throw new Error(`Failed to fetch image source (${response.status})`);
  }

  const mimeType = getString(response.headers.get('content-type')).split(';')[0].toLowerCase();
  if (!mimeType.startsWith('image/')) {
    throw new Error('Fetched asset is not an image');
  }

  return {
    mimeType,
    buffer: Buffer.from(await response.arrayBuffer()),
  };
}

function inferExtension(mimeType) {
  const normalized = getString(mimeType).toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return 'jpg';
  }
  if (normalized === 'image/webp') {
    return 'webp';
  }
  return 'png';
}

function createTokenFragment(accessToken) {
  return getString(accessToken).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24) || Date.now().toString(36);
}

async function createAssetVariants(imageSource) {
  const loaded = await loadImageSource(imageSource);
  const baseImage = sharp(loaded.buffer, { failOn: 'none' }).rotate();
  const metadata = await baseImage.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Image dimensions could not be resolved');
  }

  const sourceFormat = inferExtension(loaded.mimeType);
  const sourceBuffer = sourceFormat === 'jpg'
    ? await baseImage.clone().jpeg({ quality: 94 }).toBuffer()
    : sourceFormat === 'webp'
      ? await baseImage.clone().webp({ quality: 94 }).toBuffer()
      : await baseImage.clone().png().toBuffer();

  const displayBuffer = await baseImage
    .clone()
    .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  const thumbBuffer = await baseImage
    .clone()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 60 })
    .toBuffer();

  return {
    source: {
      buffer: sourceBuffer,
      extension: sourceFormat,
      contentType: sourceFormat === 'jpg' ? 'image/jpeg' : sourceFormat === 'webp' ? 'image/webp' : 'image/png',
    },
    display: {
      buffer: displayBuffer,
      extension: 'jpg',
      contentType: 'image/jpeg',
    },
    thumb: {
      buffer: thumbBuffer,
      extension: 'jpg',
      contentType: 'image/jpeg',
    },
  };
}

async function uploadBuffer(supabase, bucket, path, buffer, contentType) {
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    cacheControl: CACHE_CONTROL_SECONDS,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function removeUploadedPaths(supabase, bucketPaths) {
  const buckets = new Map();
  for (const entry of bucketPaths) {
    if (!entry?.bucket || !entry?.path) {
      continue;
    }

    if (!buckets.has(entry.bucket)) {
      buckets.set(entry.bucket, []);
    }

    buckets.get(entry.bucket).push(entry.path);
  }

  for (const [bucket, paths] of buckets.entries()) {
    if (paths.length === 0) {
      continue;
    }

    try {
      await supabase.storage.from(bucket).remove(paths);
    } catch {
      // Cleanup is best-effort only.
    }
  }
}

async function persistBookAssets(supabase, slug, accessToken, imageSource) {
  const { publicBucket, privateBucket } = getStorageBuckets();
  const tokenFragment = createTokenFragment(accessToken);
  const variants = await createAssetVariants(imageSource);
  const uploaded = [];

  const sourcePath = `${slug}/source/scene-source-${tokenFragment}.${variants.source.extension}`;
  const displayPath = `${slug}/display/scene-display-${tokenFragment}.${variants.display.extension}`;
  const thumbPath = `${slug}/thumb/scene-thumb-${tokenFragment}.${variants.thumb.extension}`;

  try {
    await uploadBuffer(supabase, privateBucket, sourcePath, variants.source.buffer, variants.source.contentType);
    uploaded.push({ bucket: privateBucket, path: sourcePath });

    await uploadBuffer(supabase, publicBucket, displayPath, variants.display.buffer, variants.display.contentType);
    uploaded.push({ bucket: publicBucket, path: displayPath });

    await uploadBuffer(supabase, publicBucket, thumbPath, variants.thumb.buffer, variants.thumb.contentType);
    uploaded.push({ bucket: publicBucket, path: thumbPath });
  } catch (error) {
    await removeUploadedPaths(supabase, uploaded);
    throw error;
  }

  return {
    sourcePath,
    displayPath,
    thumbPath,
    uploaded,
  };
}

function buildLegacyMetadata(book, options) {
  const metadata = sanitizeMetadata(normalizeObject(book.metadata));
  const assets = normalizeObject(metadata.assets);
  const displayImageUrl = options.displayImageUrl || '';
  const thumbImageUrl = options.thumbImageUrl || '';
  const sourceImageUrl = options.sourceImageUrl || '';

  return {
    ...metadata,
    assets: {
      ...assets,
      ...(book.display_image_path ? { display_image_path: book.display_image_path } : {}),
      ...(book.thumb_image_path ? { thumb_image_path: book.thumb_image_path } : {}),
      ...(displayImageUrl ? { display_image_url: displayImageUrl } : {}),
      ...(thumbImageUrl ? { thumb_image_url: thumbImageUrl } : {}),
      ...(options.isOwner && book.source_image_path ? { source_image_path: book.source_image_path } : {}),
      ...(options.isOwner && sourceImageUrl ? { source_image_url: sourceImageUrl } : {}),
    },
  };
}

async function shapeLegacyBookForClient(supabase, book, options = {}) {
  const isOwner = Boolean(options.isOwner);
  const displayImageUrl = getPublicAssetUrl(supabase, book.display_image_path) || '';
  const thumbImageUrl = getPublicAssetUrl(supabase, book.thumb_image_path) || '';
  const sourceImageUrl = isOwner
    ? (await getSignedPrivateAssetUrl(supabase, book.source_image_path, 60)) || ''
    : '';
  const segments = parseSegments(book.story_segments);
  const visibleSegments = isOwner || book.is_unlocked ? segments : segments.slice(0, 2);

  return {
    id: book.id,
    slug: book.slug,
    created_at: book.created_at,
    updated_at: book.updated_at,
    title: book.title,
    hero_name: book.hero_name,
    segments: visibleSegments,
    composite_image_url: isOwner ? sourceImageUrl || displayImageUrl : displayImageUrl,
    source_image_url: sourceImageUrl,
    display_image_url: displayImageUrl,
    is_unlocked: Boolean(book.is_unlocked),
    payment_status: book.payment_status || 'pending',
    child_name: book.hero_name,
    age: book.hero_age ?? null,
    gender: book.hero_gender ?? null,
    topic: book.topic,
    art_style: book.art_style,
    metadata: buildLegacyMetadata(book, {
      isOwner,
      sourceImageUrl,
      displayImageUrl,
      thumbImageUrl,
    }),
    ...(isOwner ? { is_owner: true } : {}),
    ...(!isOwner && !book.is_unlocked ? { preview_only: true } : {}),
  };
}

function shapeLegacyLibraryCard(supabase, book) {
  const displayImageUrl = getPublicAssetUrl(supabase, book.display_image_path) || '';
  const thumbImageUrl = getPublicAssetUrl(supabase, book.thumb_image_path) || '';
  const segments = parseSegments(book.story_segments);

  return {
    id: book.id,
    slug: book.slug,
    created_at: book.created_at,
    updated_at: book.updated_at,
    title: book.title,
    hero_name: book.hero_name,
    segments: [],
    segment_count: segments.length,
    composite_image_url: thumbImageUrl || displayImageUrl,
    is_unlocked: Boolean(book.is_unlocked),
    payment_status: book.payment_status || 'pending',
    child_name: book.hero_name,
    topic: book.topic,
    art_style: book.art_style,
    metadata: buildLegacyMetadata(book, {
      isOwner: false,
      displayImageUrl,
      thumbImageUrl,
    }),
  };
}

async function shapeLegacyDashboardBook(supabase, book) {
  const displayImageUrl = getPublicAssetUrl(supabase, book.display_image_path) || '';
  const thumbImageUrl = getPublicAssetUrl(supabase, book.thumb_image_path) || '';
  const pdfUrl = book.latest_pdf_path
    ? (await getSignedPrivateAssetUrl(supabase, book.latest_pdf_path, 60)) || undefined
    : undefined;

  return {
    session_id: book.session_id,
    bookId: book.id,
    slug: book.slug,
    title: book.title,
    previewImageUrl: thumbImageUrl || undefined,
    compositeImageUrl: displayImageUrl || undefined,
    segments: parseSegments(book.story_segments),
    pdfUrl,
    pdfFileName: book.latest_pdf_file_name || undefined,
    parentCharacter: book.parent_character || undefined,
    parentName: book.parent_name || undefined,
    paymentStatus: book.payment_status || undefined,
    isUnlocked: Boolean(book.is_unlocked),
    email: book.email || undefined,
    childName: book.hero_name || undefined,
    topic: book.topic || undefined,
    artStyle: book.art_style || undefined,
    updated_at: book.updated_at,
    created_at: book.created_at,
  };
}

async function handleGet(req, res, supabase) {
  const slug = getString(req.query?.slug);
  if (!slug) {
    return sendError(res, 400, 'Missing slug');
  }

  const accessToken = getString(req.query?.token);
  const authUser = accessToken || getString(req.headers.authorization).startsWith('Bearer ')
    ? await getAuthUser(req, supabase)
    : null;

  const { data: book, error } = await supabase
    .from('books')
    .select(LEGACY_BOOK_SELECT)
    .eq('slug', slug)
    .maybeSingle();

  if (error || !book) {
    return sendError(res, 404, 'Book not found');
  }

  const payload = await shapeLegacyBookForClient(supabase, book, {
    isOwner: isBookOwner(book, authUser, accessToken),
  });

  return sendJson(res, 200, payload);
}

async function handleCreate(req, res, supabase, body) {
  const rawBook = normalizeObject(body.book);
  const slug = getString(rawBook.slug);
  const sessionId = getString(rawBook.session_id);
  const title = getString(rawBook.title);
  const heroName = getString(rawBook.hero_name) || getString(rawBook.child_name);
  const topic = getString(rawBook.topic);
  const artStyle = getString(rawBook.art_style);
  const segments = parseSegments(rawBook.segments);
  const accessToken = getString(rawBook.access_token) || generateAccessToken();

  if (!slug || !sessionId || !title || !heroName || !topic || !artStyle) {
    return sendError(res, 400, 'Missing required book fields');
  }

  if (segments.length !== 10) {
    return sendError(res, 400, 'Book must contain exactly 10 story segments');
  }

  const authUser = await getAuthUser(req, supabase);
  const normalizedEmail = normalizeEmail(authUser?.email || rawBook.email);
  const providedAssetPaths = getProvidedAssetPaths(rawBook);
  let assetPaths = providedAssetPaths;
  let uploaded = [];

  if (!arePersistedAssetPathsValid(slug, providedAssetPaths)) {
    const imageSource = inferSourceImage(rawBook);
    if (!imageSource) {
      return sendError(res, 400, 'Missing persisted book image or source image');
    }

    try {
      const persisted = await persistBookAssets(supabase, slug, accessToken, imageSource);
      assetPaths = persisted;
      uploaded = persisted.uploaded;
    } catch (error) {
      return sendError(res, 500, 'Failed to persist book images', error instanceof Error ? error.message : undefined);
    }
  }

  const metadata = sanitizeMetadata(normalizeObject(rawBook.metadata));
  const insertPayload = {
    slug,
    session_id: sessionId,
    title,
    hero_name: heroName,
    hero_age: parseHeroAge(rawBook.age),
    hero_gender: parseHeroGender(rawBook.gender),
    topic,
    art_style: artStyle,
    parent_character: getString(rawBook.parent_character) || null,
    parent_name: getString(rawBook.parent_name) || null,
    source_image_path: assetPaths.sourcePath,
    display_image_path: assetPaths.displayPath,
    thumb_image_path: assetPaths.thumbPath,
    story_segments: segments,
    preview_excerpt: getString(rawBook.preview_excerpt) || buildPreviewExcerpt(segments),
    is_unlocked: ensureBoolean(rawBook.is_unlocked),
    payment_status: parsePaymentStatus(rawBook.payment_status),
    email: normalizedEmail || null,
    user_id: authUser?.id || null,
    access_token_hash: hashAccessToken(accessToken),
    metadata,
  };

  const { data: createdBook, error } = await supabase
    .from('books')
    .insert(insertPayload)
    .select(LEGACY_BOOK_SELECT)
    .single();

  if (error || !createdBook) {
    if (uploaded.length > 0) {
      await removeUploadedPaths(supabase, uploaded);
    }

    return sendError(res, 500, 'Failed to create book', error?.message);
  }

  const payload = await shapeLegacyBookForClient(supabase, createdBook, { isOwner: true });
  return sendJson(res, 200, {
    book: payload,
    access_token: accessToken,
  });
}

async function handleVerifyPayment(res, supabase, body) {
  const slug = getString(body.slug);
  if (!slug) {
    return sendError(res, 400, 'Missing slug');
  }

  const { data: book, error } = await supabase
    .from('books')
    .select('is_unlocked, payment_status')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return sendError(res, 500, 'Failed to verify payment status', error.message);
  }

  if (!book) {
    return sendError(res, 404, 'Book not found');
  }

  return sendJson(res, 200, {
    is_unlocked: Boolean(book.is_unlocked),
    payment_status: book.payment_status || 'pending',
  });
}

async function handleClaim(req, res, supabase, body) {
  const slug = getString(body.slug);
  if (!slug) {
    return sendError(res, 400, 'Missing slug');
  }

  const providedToken = getString(body.access_token);
  const authUser = await getAuthUser(req, supabase);
  const normalizedEmail = normalizeEmail(body.email || authUser?.email);

  const { data: book, error } = await supabase
    .from('books')
    .select('id, slug, session_id, email, user_id, access_token_hash, metadata')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return sendError(res, 500, 'Failed to load book', error.message);
  }

  if (!book) {
    return sendError(res, 404, 'Book not found');
  }

  if (!isBookOwner(book, authUser, providedToken)) {
    return sendError(res, 403, 'Not authorized to claim this book');
  }

  const nextToken = providedToken || generateAccessToken();
  const nextMetadata = {
    ...sanitizeMetadata(normalizeObject(book.metadata)),
    ownership: {
      ...normalizeObject(normalizeObject(book.metadata).ownership),
      claimed_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await supabase
    .from('books')
    .update({
      access_token_hash: hashAccessToken(nextToken),
      email: normalizedEmail || normalizeEmail(book.email) || null,
      user_id: authUser?.id || book.user_id || null,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', book.id);

  if (updateError) {
    return sendError(res, 500, 'Failed to claim book', updateError.message);
  }

  await appendSystemLog(supabase, {
    sessionId: book.session_id || `ownership:${book.slug}`,
    userId: authUser?.id || book.user_id || null,
    bookSlug: book.slug,
    actionType: 'book_claim',
    stage: 'ownership_claimed',
    status: 'success',
    metadata: {
      claim_method: authUser ? 'auth-or-token' : 'token-only',
      has_email: Boolean(normalizedEmail || normalizeEmail(book.email)),
      has_existing_user_id: Boolean(book.user_id),
    },
  });

  return sendJson(res, 200, {
    access_token: nextToken,
  });
}

async function handleListOwned(req, res, supabase, body) {
  const authUser = await getAuthUser(req, supabase);
  const booksBySlug = new Map();
  const normalizedAuthEmail = normalizeEmail(authUser?.email);

  if (authUser?.id || normalizedAuthEmail) {
    const filters = [];
    if (authUser?.id) {
      filters.push(`user_id.eq.${authUser.id}`);
    }
    if (normalizedAuthEmail) {
      filters.push(`email.eq.${normalizedAuthEmail}`);
    }

    if (filters.length > 0) {
      const { data, error } = await supabase
        .from('books')
        .select(LEGACY_LIST_SELECT)
        .or(filters.join(','))
        .order('created_at', { ascending: false });

      if (error) {
        return sendError(res, 500, 'Failed to list owned books', error.message);
      }

      for (const book of data || []) {
        booksBySlug.set(book.slug, shapeLegacyLibraryCard(supabase, book));
      }
    }
  }

  const ownedPairs = parseOwnedBookPairs(body.owned_books);
  if (ownedPairs.length > 0) {
    const tokenMap = new Map(ownedPairs.map((entry) => [entry.slug, entry.access_token]));
    const { data, error } = await supabase
      .from('books')
      .select(LEGACY_LIST_SELECT)
      .in('slug', [...tokenMap.keys()]);

    if (error) {
      return sendError(res, 500, 'Failed to list token-owned books', error.message);
    }

    for (const book of data || []) {
      if (!isBookOwner(book, null, tokenMap.get(book.slug))) {
        continue;
      }

      booksBySlug.set(book.slug, shapeLegacyLibraryCard(supabase, book));
    }
  }

  return sendJson(res, 200, {
    books: [...booksBySlug.values()].sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      return rightTime - leftTime;
    }),
  });
}

async function handleListBySessionIds(res, supabase, body) {
  const sessionIds = Array.isArray(body.session_ids)
    ? body.session_ids.map((value) => getString(value)).filter(Boolean).slice(0, 500)
    : [];

  if (sessionIds.length === 0) {
    return sendJson(res, 200, { books: [] });
  }

  const { data, error } = await supabase
    .from('books')
    .select(LEGACY_DASHBOARD_SELECT)
    .in('session_id', sessionIds)
    .limit(1000);

  if (error) {
    return sendError(res, 500, 'Failed to list books by session ids', error.message);
  }

  const books = await Promise.all((data || []).map((book) => shapeLegacyDashboardBook(supabase, book)));
  books.sort((left, right) => {
    const leftTime = new Date(left.updated_at || left.created_at || 0).getTime();
    const rightTime = new Date(right.updated_at || right.created_at || 0).getTime();
    return rightTime - leftTime;
  });

  return sendJson(res, 200, { books });
}

async function handleListRecentDashboard(res, supabase, body) {
  const limit = Math.max(1, Math.min(Number(body.limit) || 5, 25));
  const offset = Math.max(0, Math.min(Number(body.offset) || 0, 500));

  const { data, error } = await supabase
    .from('books')
    .select(LEGACY_DASHBOARD_SELECT)
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) {
    return sendError(res, 500, 'Failed to list recent dashboard books', error.message);
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const slicedRows = rows.slice(0, limit);
  const books = await Promise.all(slicedRows.map((book) => shapeLegacyDashboardBook(supabase, book)));

  return sendJson(res, 200, {
    books,
    hasMore,
  });
}

async function handleLinkByEmail(req, res, supabase) {
  const authUser = await getAuthUser(req, supabase);
  const normalizedAuthEmail = normalizeEmail(authUser?.email);

  if (!authUser?.id || !normalizedAuthEmail) {
    return sendError(res, 401, 'Authenticated user required');
  }

  const { data: linkedBooks, error } = await supabase
    .from('books')
    .update({
      user_id: authUser.id,
      updated_at: new Date().toISOString(),
    })
    .eq('email', normalizedAuthEmail)
    .is('user_id', null)
    .select('id, slug, session_id');

  if (error) {
    return sendError(res, 500, 'Failed to link books by email', error.message);
  }

  const linkedCount = Array.isArray(linkedBooks) ? linkedBooks.length : 0;
  await appendSystemLog(supabase, {
    sessionId: `ownership:${authUser.id}`,
    userId: authUser.id,
    actionType: 'link_books_by_email',
    stage: 'ownership_linked_by_email',
    status: 'success',
    metadata: {
      email: normalizedAuthEmail,
      linked_count: linkedCount,
      linked_slugs: linkedCount > 0 ? linkedBooks.slice(0, 20).map((book) => book.slug) : [],
    },
  });

  return sendJson(res, 200, {
    success: true,
    linked_count: linkedCount,
  });
}

async function handleRecordPdfArtifact(req, res, supabase, body) {
  const slug = getString(body.slug);
  const asset = normalizeObject(body.asset);
  const assetPath = getString(asset.path);
  const providedToken = getString(body.access_token);
  const fileName = getString(body.fileName);
  const sizeBytes = Number.isFinite(Number(body.sizeBytes)) ? Number(body.sizeBytes) : null;

  if (!slug) {
    return sendError(res, 400, 'Missing slug');
  }

  if (!assetPath || !isStoragePath(assetPath) || !assetPath.startsWith(`${slug}/pdf/`)) {
    return sendError(res, 400, 'Missing PDF asset path');
  }

  const authUser = await getAuthUser(req, supabase);
  const { data: book, error } = await supabase
    .from('books')
    .select('id, email, user_id, access_token_hash')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return sendError(res, 500, 'Failed to load book for PDF artifact update', error.message);
  }

  if (!book) {
    return sendError(res, 404, 'Book not found');
  }

  if (!isBookOwner(book, authUser, providedToken)) {
    return sendError(res, 403, 'Not authorized to update this book');
  }

  const exportedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('books')
    .update({
      latest_pdf_path: assetPath,
      latest_pdf_file_name: fileName || null,
      latest_pdf_size_bytes: sizeBytes,
      latest_pdf_exported_at: exportedAt,
      updated_at: exportedAt,
    })
    .eq('id', book.id);

  if (updateError) {
    return sendError(res, 500, 'Failed to update PDF artifact metadata', updateError.message);
  }

  return sendJson(res, 200, {
    success: true,
    pdf: {
      latest_path: assetPath,
      latest_file_name: fileName || undefined,
      latest_size_bytes: sizeBytes ?? undefined,
      latest_exported_at: exportedAt,
    },
  });
}

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  if (req.method === 'GET') {
    return handleGet(req, res, supabase);
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const action = getString(parsed.body.action);

  switch (action) {
    case 'create':
      return handleCreate(req, res, supabase, parsed.body);
    case 'verify_payment':
      return handleVerifyPayment(res, supabase, parsed.body);
    case 'claim':
      return handleClaim(req, res, supabase, parsed.body);
    case 'list_owned':
      return handleListOwned(req, res, supabase, parsed.body);
    case 'list_by_session_ids':
      return handleListBySessionIds(res, supabase, parsed.body);
    case 'list_recent_dashboard':
      return handleListRecentDashboard(res, supabase, parsed.body);
    case 'link_by_email':
      return handleLinkByEmail(req, res, supabase);
    case 'record_pdf_artifact':
      return handleRecordPdfArtifact(req, res, supabase, parsed.body);
    default:
      return sendError(res, 400, 'Invalid action');
  }
}
