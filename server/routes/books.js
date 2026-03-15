import { createBookSchema, BOOK_DETAIL_SELECT, BOOK_OWNER_SELECT, LIBRARY_BOOK_SELECT, isBookOwner, serializeBookDetail, serializeLibraryBookSummary } from '../lib/books.js';
import { generateAccessToken, hashAccessToken } from '../lib/crypto.js';
import { getAuthUser, normalizeEmail } from '../lib/auth.js';
import { getSupabaseAdmin, getStorageBuckets, listAllStoragePaths } from '../lib/supabase.js';
import { getNumberQuery, getStringQuery, parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';

async function loadLibraryBooks(supabase, authUser, limit, updatedBefore) {
  const booksById = new Map();

  let ownedQuery = supabase
    .from('books')
    .select(LIBRARY_BOOK_SELECT)
    .eq('user_id', authUser.id)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (updatedBefore) {
    ownedQuery = ownedQuery.lt('updated_at', updatedBefore);
  }

  const { data: ownedBooks, error: ownedBooksError } = await ownedQuery;
  if (ownedBooksError) {
    throw ownedBooksError;
  }

  for (const book of ownedBooks || []) {
    booksById.set(book.id, book);
  }

  const normalizedEmail = normalizeEmail(authUser.email);
  if (normalizedEmail) {
    let emailQuery = supabase
      .from('books')
      .select(LIBRARY_BOOK_SELECT)
      .eq('email', normalizedEmail)
      .is('user_id', null)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (updatedBefore) {
      emailQuery = emailQuery.lt('updated_at', updatedBefore);
    }

    const { data: emailBooks, error: emailBooksError } = await emailQuery;
    if (emailBooksError) {
      throw emailBooksError;
    }

    for (const book of emailBooks || []) {
      booksById.set(book.id, book);
    }
  }

  return [...booksById.values()]
    .sort((left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime())
    .slice(0, limit);
}

async function handleGet(req, res, supabase) {
  const slug = getStringQuery(req, 'slug');

  if (slug) {
    const accessToken = getStringQuery(req, 'token');
    const authUser = await getAuthUser(req, supabase);
    const { data, error } = await supabase
      .from('books')
      .select(BOOK_DETAIL_SELECT)
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return sendError(res, 500, 'Failed to load book', error.message);
    }

    if (!data) {
      return sendError(res, 404, 'Book not found');
    }

    const detail = await serializeBookDetail(supabase, data, {
      isOwner: isBookOwner(data, authUser, accessToken),
    });

    return sendJson(res, 200, { book: detail });
  }

  const scope = getStringQuery(req, 'scope');
  if (scope !== 'library') {
    return sendError(res, 400, 'Unsupported books GET scope');
  }

  const authUser = await getAuthUser(req, supabase);
  if (!authUser) {
    return sendError(res, 401, 'Library list requires an authenticated user');
  }

  const limit = getNumberQuery(req, 'limit', 24, 100);
  const updatedBefore = getStringQuery(req, 'updatedBefore');

  try {
    const books = await loadLibraryBooks(supabase, authUser, limit, updatedBefore);
    const payload = books.map((book) => serializeLibraryBookSummary(supabase, book));
    const nextCursor = payload.length === limit ? payload.at(-1)?.updatedAt || null : null;

    return sendJson(res, 200, {
      books: payload,
      pagination: {
        limit,
        nextCursor,
      },
    });
  } catch (error) {
    return sendError(res, 500, 'Failed to load library books', error instanceof Error ? error.message : undefined);
  }
}

async function handlePost(req, res, supabase) {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const validation = createBookSchema.safeParse(parsed.body);
  if (!validation.success) {
    return sendError(res, 400, 'Book payload validation failed', validation.error.flatten());
  }

  const payload = validation.data;
  const accessToken = payload.accessToken || generateAccessToken();
  const accessTokenHash = hashAccessToken(accessToken);
  const previewExcerpt = payload.previewExcerpt || payload.storySegments[0].slice(0, 220);

  const insertPayload = {
    slug: payload.slug,
    session_id: payload.sessionId,
    title: payload.title,
    hero_name: payload.heroName,
    hero_age: payload.heroAge ?? null,
    hero_gender: payload.heroGender ?? null,
    topic: payload.topic,
    art_style: payload.artStyle,
    parent_character: payload.parentCharacter ?? null,
    parent_name: payload.parentName ?? null,
    source_image_path: payload.sourceImagePath,
    display_image_path: payload.displayImagePath,
    thumb_image_path: payload.thumbImagePath,
    story_segments: payload.storySegments,
    preview_excerpt: previewExcerpt,
    is_unlocked: payload.isUnlocked,
    payment_status: payload.paymentStatus,
    email: payload.email ?? null,
    user_id: payload.userId ?? null,
    access_token_hash: accessTokenHash,
    latest_pdf_path: payload.latestPdfPath ?? null,
    latest_pdf_file_name: payload.latestPdfFileName ?? null,
    latest_pdf_size_bytes: payload.latestPdfSizeBytes ?? null,
    latest_pdf_exported_at: payload.latestPdfExportedAt ?? null,
    metadata: payload.metadata,
  };

  const { data, error } = await supabase
    .from('books')
    .insert(insertPayload)
    .select(BOOK_DETAIL_SELECT)
    .single();

  if (error) {
    return sendError(res, 500, 'Failed to create book', error.message);
  }

  const detail = await serializeBookDetail(supabase, data, { isOwner: true });

  return sendJson(res, 201, {
    accessToken,
    book: detail,
  });
}

async function removeStoragePrefix(supabase, bucket, slug) {
  const filePaths = await listAllStoragePaths(supabase, bucket, slug);
  if (filePaths.length === 0) {
    return;
  }

  for (let index = 0; index < filePaths.length; index += 100) {
    const chunk = filePaths.slice(index, index + 100);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      throw error;
    }
  }
}

async function handleDelete(req, res, supabase) {
  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const slug = getStringQuery(req, 'slug') || (typeof parsed.body.slug === 'string' ? parsed.body.slug.trim() : '');
  const accessToken =
    getStringQuery(req, 'token') ||
    (typeof parsed.body.accessToken === 'string' ? parsed.body.accessToken.trim() : '');

  if (!slug) {
    return sendError(res, 400, 'Missing slug for deletion');
  }

  const authUser = await getAuthUser(req, supabase);
  const { data, error } = await supabase
    .from('books')
    .select(BOOK_OWNER_SELECT)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return sendError(res, 500, 'Failed to load book for deletion', error.message);
  }

  if (!data) {
    return sendError(res, 404, 'Book not found');
  }

  if (!isBookOwner(data, authUser, accessToken)) {
    return sendError(res, 403, 'Not authorized to delete this book');
  }

  const { publicBucket, privateBucket } = getStorageBuckets();

  try {
    await Promise.all([
      removeStoragePrefix(supabase, publicBucket, slug),
      removeStoragePrefix(supabase, privateBucket, slug),
    ]);
  } catch (storageError) {
    return sendError(
      res,
      500,
      'Failed to remove book assets from storage',
      storageError instanceof Error ? storageError.message : undefined,
    );
  }

  const { error: deleteError } = await supabase.from('books').delete().eq('id', data.id);
  if (deleteError) {
    return sendError(res, 500, 'Failed to delete book record', deleteError.message);
  }

  await supabase.from('analytics_events').insert({
    session_id: data.session_id,
    book_slug: data.slug,
    event_name: 'book_deleted',
    page: '/api/books',
    device_type: 'server',
    event_data: {
      deletedBy: authUser ? 'auth-user' : 'access-token',
    },
  }).catch(() => {});

  return sendJson(res, 200, {
    success: true,
    slug,
  });
}

export default async function handler(req, res) {
  setCors(res, 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

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

  if (req.method === 'POST') {
    return handlePost(req, res, supabase);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res, supabase);
  }

  return sendError(res, 405, 'Method not allowed');
}
