import { createClient } from '@supabase/supabase-js';
import {
  getBookPrivateBucket,
  getBookPublicBucket,
  getSupabaseServiceKey,
  getSupabaseUrl,
} from './env.js';

let cachedClient = null;

const STORAGE_PATH_PATTERN = /^(?!https?:)(?!data:)(?!blob:)(?!\/)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9][A-Za-z0-9/_\-.]+$/;

export function isStoragePath(value) {
  return typeof value === 'string' && STORAGE_PATH_PATTERN.test(value.trim());
}

export function normalizeStoragePath(value) {
  if (!isStoragePath(value)) {
    return '';
  }

  return value.trim();
}

export function getStorageBuckets() {
  return {
    publicBucket: getBookPublicBucket(),
    privateBucket: getBookPrivateBucket(),
  };
}

export function getSupabaseAdmin() {
  if (cachedClient) {
    return cachedClient;
  }

  const url = getSupabaseUrl();
  const key = getSupabaseServiceKey();
  if (!url || !key) {
    return null;
  }

  cachedClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

export function getPublicAssetUrl(supabase, path) {
  const normalizedPath = normalizeStoragePath(path);
  if (!supabase || !normalizedPath) {
    return null;
  }

  const { publicBucket } = getStorageBuckets();
  const { data } = supabase.storage.from(publicBucket).getPublicUrl(normalizedPath);
  return typeof data?.publicUrl === 'string' && data.publicUrl.trim()
    ? data.publicUrl.trim()
    : null;
}

export async function getSignedPrivateAssetUrl(supabase, path, expiresInSeconds = 60) {
  const normalizedPath = normalizeStoragePath(path);
  if (!supabase || !normalizedPath) {
    return null;
  }

  const { privateBucket } = getStorageBuckets();
  const { data, error } = await supabase.storage
    .from(privateBucket)
    .createSignedUrl(normalizedPath, expiresInSeconds);

  if (error) {
    return null;
  }

  return typeof data?.signedUrl === 'string' && data.signedUrl.trim()
    ? data.signedUrl.trim()
    : null;
}

export async function listAllStoragePaths(supabase, bucket, prefix) {
  const normalizedPrefix = normalizeStoragePath(prefix);
  if (!supabase || !bucket || !normalizedPrefix) {
    return [];
  }

  const collected = [];

  async function walk(path) {
    const { data, error } = await supabase.storage.from(bucket).list(path, { limit: 1000 });
    if (error) {
      throw new Error(`Failed to list storage under ${path}: ${error.message}`);
    }

    if (!Array.isArray(data)) {
      return;
    }

    for (const entry of data) {
      const name = entry?.name;
      if (!name) {
        continue;
      }

      const fullPath = path ? `${path}/${name}` : name;
      const isFolder = entry?.id == null && entry?.metadata == null;

      if (isFolder) {
        await walk(fullPath);
      } else {
        collected.push(fullPath);
      }
    }
  }

  await walk(normalizedPrefix);
  return collected;
}

