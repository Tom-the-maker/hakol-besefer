import { z } from 'zod';
import { hashAccessToken } from './crypto.js';
import { getPublicAssetUrl, getSignedPrivateAssetUrl, isStoragePath } from './supabase.js';
import { normalizeEmail } from './auth.js';

export const PAYMENT_STATUSES = ['pending', 'paid', 'free', 'failed', 'refunded'];
export const HERO_GENDERS = ['male', 'female'];

export const LIBRARY_BOOK_SELECT = [
  'id',
  'slug',
  'title',
  'hero_name',
  'topic',
  'art_style',
  'preview_excerpt',
  'payment_status',
  'is_unlocked',
  'updated_at',
  'thumb_image_path',
].join(', ');

export const DASHBOARD_BOOK_SELECT = [
  'id',
  'session_id',
  'slug',
  'title',
  'hero_name',
  'topic',
  'art_style',
  'preview_excerpt',
  'payment_status',
  'is_unlocked',
  'updated_at',
  'thumb_image_path',
].join(', ');

export const BOOK_DETAIL_SELECT = [
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

export const BOOK_OWNER_SELECT = [
  'id',
  'slug',
  'session_id',
  'email',
  'user_id',
  'access_token_hash',
  'source_image_path',
  'display_image_path',
  'thumb_image_path',
  'latest_pdf_path',
].join(', ');

export const SYSTEM_LOG_SELECT = [
  'id',
  'created_at',
  'session_id',
  'book_slug',
  'action_type',
  'stage',
  'status',
  'model_name',
  'provider_model',
  'input_tokens',
  'output_tokens',
  'estimated_cost_usd',
  'duration_ms',
  'hero_name',
  'topic',
  'art_style',
  'hero_gender',
  'hero_age',
  'book_title',
  'parent_character',
  'parent_name',
  'metadata',
].join(', ');

export const SYSTEM_LOG_WITH_PROMPT_SELECT = `${SYSTEM_LOG_SELECT}, prompt_token`;

export const ANALYTICS_EVENT_SELECT = [
  'id',
  'created_at',
  'session_id',
  'book_slug',
  'event_name',
  'page',
  'device_type',
  'event_data',
].join(', ');

export const FORBIDDEN_BOOK_METADATA_KEYS = [
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
];

const storagePathSchema = z
  .string()
  .trim()
  .min(3)
  .refine((value) => isStoragePath(value), 'storage path must be relative and non-public');

const optionalText = z.string().trim().min(1).max(255).nullable().optional();

const metadataSchema = z.record(z.string(), z.unknown()).default({});

const bookSchemaBase = z
  .object({
    slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    sessionId: z.string().trim().min(3).max(128),
    title: z.string().trim().min(1).max(160),
    heroName: z.string().trim().min(1).max(80),
    heroAge: z.number().int().min(0).max(120).nullable().optional(),
    heroGender: z.enum(HERO_GENDERS).nullable().optional(),
    topic: z.string().trim().min(1).max(120),
    artStyle: z.string().trim().min(1).max(120),
    parentCharacter: optionalText,
    parentName: optionalText,
    sourceImagePath: storagePathSchema,
    displayImagePath: storagePathSchema,
    thumbImagePath: storagePathSchema,
    storySegments: z.array(z.string().trim().min(1).max(2500)).length(10),
    previewExcerpt: z.string().trim().min(1).max(400).nullable().optional(),
    isUnlocked: z.boolean().default(false),
    paymentStatus: z.enum(PAYMENT_STATUSES).default('pending'),
    email: z.string().email().transform((value) => value.trim().toLowerCase()).nullable().optional(),
    userId: z.string().uuid().nullable().optional(),
    latestPdfPath: storagePathSchema.nullable().optional(),
    latestPdfFileName: optionalText,
    latestPdfSizeBytes: z.number().int().nonnegative().nullable().optional(),
    latestPdfExportedAt: z.string().datetime().nullable().optional(),
    metadata: metadataSchema,
    accessToken: z.string().trim().min(16).max(255).optional(),
  })
  .strict();

export const createBookSchema = bookSchemaBase.superRefine((value, ctx) => {
  const requiredPrefixes = [
    ['sourceImagePath', `${value.slug}/source/`],
    ['displayImagePath', `${value.slug}/display/`],
    ['thumbImagePath', `${value.slug}/thumb/`],
  ];

  for (const [fieldName, prefix] of requiredPrefixes) {
    const fieldValue = value[fieldName];
    if (!fieldValue.startsWith(prefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [fieldName],
        message: `expected path prefix ${prefix}`,
      });
    }
  }

  if (value.latestPdfPath && !value.latestPdfPath.startsWith(`${value.slug}/pdf/`)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['latestPdfPath'],
      message: `expected path prefix ${value.slug}/pdf/`,
    });
  }

  if (hasForbiddenKeys(value.metadata, FORBIDDEN_BOOK_METADATA_KEYS)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['metadata'],
      message: 'metadata contains forbidden product or URL keys',
    });
  }
});

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeSegments(value) {
  return Array.isArray(value) ? value.filter((segment) => typeof segment === 'string') : [];
}

function createPreviewExcerptFromSegments(segments) {
  const firstSegment = segments.find((segment) => typeof segment === 'string' && segment.trim());
  if (!firstSegment) {
    return null;
  }

  return firstSegment.trim().slice(0, 220);
}

export function hasForbiddenKeys(value, forbiddenKeys) {
  if (Array.isArray(value)) {
    return value.some((item) => hasForbiddenKeys(item, forbiddenKeys));
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    return forbiddenKeys.includes(key) || hasForbiddenKeys(nestedValue, forbiddenKeys);
  });
}

export function isBookOwner(book, authUser, accessToken) {
  const normalizedBookEmail = normalizeEmail(book.email);
  const normalizedUserEmail = normalizeEmail(authUser?.email);
  const tokenHash = accessToken ? hashAccessToken(accessToken) : '';

  return Boolean(
    (tokenHash && book.access_token_hash === tokenHash) ||
      (authUser &&
        ((book.user_id && book.user_id === authUser.id) ||
          (normalizedBookEmail && normalizedUserEmail && normalizedBookEmail === normalizedUserEmail))),
  );
}

export function serializeLibraryBookSummary(supabase, book) {
  return {
    slug: book.slug,
    title: book.title,
    heroName: book.hero_name,
    topic: book.topic,
    artStyle: book.art_style,
    previewExcerpt: book.preview_excerpt || null,
    paymentStatus: book.payment_status,
    isUnlocked: Boolean(book.is_unlocked),
    updatedAt: book.updated_at,
    thumbImagePath: book.thumb_image_path,
    thumbImageUrl: getPublicAssetUrl(supabase, book.thumb_image_path),
  };
}

export function serializeDashboardBookSummary(supabase, book) {
  return {
    sessionId: book.session_id,
    slug: book.slug,
    title: book.title,
    heroName: book.hero_name,
    topic: book.topic,
    artStyle: book.art_style,
    previewExcerpt: book.preview_excerpt || null,
    paymentStatus: book.payment_status,
    isUnlocked: Boolean(book.is_unlocked),
    updatedAt: book.updated_at,
    thumbImagePath: book.thumb_image_path,
    thumbImageUrl: getPublicAssetUrl(supabase, book.thumb_image_path),
  };
}

export async function serializeBookDetail(supabase, book, options) {
  const isOwner = Boolean(options?.isOwner);
  const segments = normalizeSegments(book.story_segments);
  const previewExcerpt = book.preview_excerpt || createPreviewExcerptFromSegments(segments);
  const metadata = normalizeObject(book.metadata);

  return {
    slug: book.slug,
    sessionId: book.session_id,
    createdAt: book.created_at,
    updatedAt: book.updated_at,
    title: book.title,
    heroName: book.hero_name,
    heroAge: book.hero_age ?? null,
    heroGender: book.hero_gender ?? null,
    topic: book.topic,
    artStyle: book.art_style,
    parentCharacter: book.parent_character ?? null,
    parentName: book.parent_name ?? null,
    previewExcerpt,
    paymentStatus: book.payment_status,
    isUnlocked: Boolean(book.is_unlocked),
    displayImagePath: book.display_image_path,
    displayImageUrl: getPublicAssetUrl(supabase, book.display_image_path),
    thumbImagePath: book.thumb_image_path,
    thumbImageUrl: getPublicAssetUrl(supabase, book.thumb_image_path),
    storySegments: isOwner || book.is_unlocked ? segments : [],
    metadata,
    sourceImagePath: isOwner ? book.source_image_path : null,
    sourceImageUrl: isOwner ? await getSignedPrivateAssetUrl(supabase, book.source_image_path) : null,
    latestPdf: isOwner && book.latest_pdf_path
      ? {
          path: book.latest_pdf_path,
          fileName: book.latest_pdf_file_name ?? null,
          sizeBytes: book.latest_pdf_size_bytes ?? null,
          exportedAt: book.latest_pdf_exported_at ?? null,
          signedUrl: await getSignedPrivateAssetUrl(supabase, book.latest_pdf_path),
        }
      : null,
  };
}

