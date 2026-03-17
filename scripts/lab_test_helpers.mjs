import { createClient } from '@supabase/supabase-js';

import { loadLocalEnv } from './load_local_env.mjs';

loadLocalEnv();

function readEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function getRequiredEnv(...names) {
  for (const name of names) {
    const value = readEnv(name);
    if (value) {
      return value;
    }
  }

  return '';
}

export function ensureLabEnvironment() {
  const appEnv = getRequiredEnv('APP_ENV', 'VITE_APP_ENV');
  if (appEnv !== 'lab') {
    throw new Error(`Refusing to run outside lab. Current app env: ${appEnv || 'unknown'}`);
  }
}

export function getServiceSupabase() {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = getRequiredEnv('SUPABASE_SERVICE_KEY');
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY');
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getAnonSupabase() {
  const supabaseUrl = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const anonKey = getRequiredEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY');
  }

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createTinyImageDataUrl() {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0eQAAAAASUVORK5CYII=';
}

export async function removeBookArtifacts(supabase, slug) {
  const normalizedSlug = String(slug || '').trim();
  if (!normalizedSlug) {
    return;
  }

  async function listAll(bucket, path = normalizedSlug) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(path, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

    if (error || !Array.isArray(data)) {
      return [];
    }

    const paths = [];
    for (const entry of data) {
      if (!entry?.name) continue;
      const nextPath = `${path}/${entry.name}`;
      const isFolder = entry?.id == null && entry?.metadata == null;
      if (isFolder) {
        paths.push(...await listAll(bucket, nextPath));
      } else {
        paths.push(nextPath);
      }
    }
    return paths;
  }

  const [publicPaths, privatePaths] = await Promise.all([
    listAll('book-public-assets'),
    listAll('book-private-assets'),
  ]);
  if (publicPaths.length > 0) {
    await supabase.storage.from('book-public-assets').remove(publicPaths);
  }
  if (privatePaths.length > 0) {
    await supabase.storage.from('book-private-assets').remove(privatePaths);
  }

  await supabase.from('analytics_events').delete().eq('book_slug', normalizedSlug);
  await supabase.from('system_logs').delete().eq('book_slug', normalizedSlug);
  await supabase.from('books').delete().eq('slug', normalizedSlug);
}
