import { getAuthUser } from '../lib/auth.js';
import { getStorageBuckets, getSupabaseAdmin, listAllStoragePaths } from '../lib/supabase.js';
import { hashAccessToken } from '../lib/crypto.js';
import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isBookOwner(book, authUser, accessToken) {
  const providedTokenHash = getString(accessToken) ? hashAccessToken(accessToken) : '';
  const normalizedBookEmail = normalizeEmail(book?.email);
  const normalizedAuthEmail = normalizeEmail(authUser?.email);

  return Boolean(
    (providedTokenHash && book?.access_token_hash === providedTokenHash) ||
      (authUser &&
        ((book?.user_id && book.user_id === authUser.id) ||
          (normalizedBookEmail && normalizedAuthEmail && normalizedBookEmail === normalizedAuthEmail))),
  );
}

async function removeStoragePrefix(supabase, bucket, slug) {
  const paths = await listAllStoragePaths(supabase, bucket, slug);
  if (paths.length === 0) {
    return;
  }

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      throw error;
    }
  }
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return sendError(res, 405, 'Method not allowed');
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  const parsed = parseJsonBody(req);
  if (!parsed.ok) {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const slug = getString(parsed.body.bookSlug) || getString(parsed.body.slug);
  const accessToken = getString(parsed.body.accessToken) || getString(parsed.body.access_token);
  if (!slug) {
    return sendError(res, 400, 'Missing bookSlug');
  }

  const authUser = await getAuthUser(req, supabase);
  const { data: book, error } = await supabase
    .from('books')
    .select('id, slug, session_id, email, user_id, access_token_hash')
    .eq('slug', slug)
    .maybeSingle();

  if (error || !book) {
    return sendError(res, 404, 'Book not found');
  }

  if (!isBookOwner(book, authUser, accessToken)) {
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

  const { error: deleteError } = await supabase
    .from('books')
    .delete()
    .eq('id', book.id);

  if (deleteError) {
    return sendError(res, 500, 'Failed to delete book record', deleteError.message);
  }

  try {
    await supabase
      .from('analytics_events')
      .insert({
        session_id: book.session_id || 'system',
        book_slug: book.slug,
        event_name: 'book_deleted',
        page: '/api/delete-book',
        device_type: 'server',
        event_data: {
          deletedBy: authUser ? 'auth-user' : 'access-token',
        },
      });
  } catch {
    // Ignore analytics logging failures on deletion.
  }

  return sendJson(res, 200, {
    success: true,
    message: 'הספר והתמונות נמחקו לצמיתות',
  });
}
