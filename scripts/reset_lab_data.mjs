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

const supabaseUrl = getRequiredEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
const supabaseServiceKey = getRequiredEnv('SUPABASE_SERVICE_KEY');
const appEnv = getRequiredEnv('APP_ENV', 'VITE_APP_ENV') || 'unknown';
const publicBucket = getRequiredEnv('BOOK_PUBLIC_BUCKET') || 'book-public-assets';
const privateBucket = getRequiredEnv('BOOK_PRIVATE_BUCKET') || 'book-private-assets';
const shouldApply = process.argv.includes('--apply');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in the environment.');
  process.exit(1);
}

if (appEnv !== 'lab') {
  console.error(`Refusing to run lab reset outside lab. Current app env: ${appEnv}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

function toObjectSizeBytes(entry) {
  const size = entry?.metadata?.size
    ?? entry?.metadata?.contentLength
    ?? entry?.metadata?.content_length;
  const numeric = Number(size);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isStorageFolder(entry) {
  return entry?.id == null && entry?.metadata == null;
}

async function getExactCount(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return Number(count) || 0;
}

async function listBucketObjects(bucket) {
  const objects = [];

  async function walk(path = '') {
    const { data, error } = await supabase.storage.from(bucket).list(path, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
      throw new Error(`${bucket}: ${error.message}`);
    }

    if (!Array.isArray(data)) {
      return;
    }

    for (const entry of data) {
      if (!entry?.name) {
        continue;
      }

      const nextPath = path ? `${path}/${entry.name}` : entry.name;
      if (isStorageFolder(entry)) {
        await walk(nextPath);
        continue;
      }

      objects.push({
        path: nextPath,
        bytes: toObjectSizeBytes(entry),
      });
    }
  }

  await walk('');
  return objects;
}

function formatBytes(bytes) {
  const numeric = Number(bytes) || 0;
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`;
  if (numeric < 1024 * 1024 * 1024) return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
  return `${(numeric / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function summarizeBucket(bucket, objects) {
  const totalBytes = objects.reduce((sum, entry) => sum + entry.bytes, 0);
  return {
    bucket,
    objects: objects.length,
    bytes: totalBytes,
    pretty: formatBytes(totalBytes),
  };
}

async function deleteTableRows(table, column = 'created_at') {
  const { error } = await supabase
    .from(table)
    .delete()
    .lt(column, new Date(Date.now() + 1000).toISOString());

  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
}

async function removeBucketObjects(bucket, objects) {
  if (objects.length === 0) {
    return;
  }

  for (let index = 0; index < objects.length; index += 100) {
    const chunk = objects.slice(index, index + 100).map((entry) => entry.path);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) {
      throw new Error(`${bucket}: ${error.message}`);
    }
  }
}

async function buildSummary() {
  const [books, systemLogs, analyticsEvents, publicObjects, privateObjects] = await Promise.all([
    getExactCount('books'),
    getExactCount('system_logs'),
    getExactCount('analytics_events'),
    listBucketObjects(publicBucket),
    listBucketObjects(privateBucket),
  ]);

  return {
    appEnv,
    mode: shouldApply ? 'apply' : 'dry-run',
    generatedAt: new Date().toISOString(),
    tables: {
      books,
      systemLogs,
      analyticsEvents,
    },
    storage: {
      buckets: {
        [publicBucket]: summarizeBucket(publicBucket, publicObjects),
        [privateBucket]: summarizeBucket(privateBucket, privateObjects),
      },
      totalBytes: [...publicObjects, ...privateObjects].reduce((sum, entry) => sum + entry.bytes, 0),
      totalPretty: formatBytes([...publicObjects, ...privateObjects].reduce((sum, entry) => sum + entry.bytes, 0)),
    },
    objectsByBucket: {
      [publicBucket]: publicObjects,
      [privateBucket]: privateObjects,
    },
  };
}

async function run() {
  const summaryBefore = await buildSummary();

  if (!shouldApply) {
    console.log(JSON.stringify({
      ...summaryBefore,
      nextStep: 'Run npm run lab:reset -- --apply to delete lab books, system logs, analytics events, and storage objects.',
    }, null, 2));
    return;
  }

  await removeBucketObjects(publicBucket, summaryBefore.objectsByBucket[publicBucket]);
  await removeBucketObjects(privateBucket, summaryBefore.objectsByBucket[privateBucket]);
  await deleteTableRows('analytics_events');
  await deleteTableRows('system_logs');
  await deleteTableRows('books');

  const summaryAfter = await buildSummary();
  console.log(JSON.stringify({
    before: summaryBefore,
    after: summaryAfter,
  }, null, 2));
}

await run();
