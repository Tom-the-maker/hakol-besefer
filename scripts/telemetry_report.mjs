import { createClient } from '@supabase/supabase-js';

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
const appEnv = getRequiredEnv('VITE_APP_ENV') || 'unknown';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_KEY in the environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

const publicBucket = getRequiredEnv('BOOK_PUBLIC_BUCKET') || 'book-public-assets';
const privateBucket = getRequiredEnv('BOOK_PRIVATE_BUCKET') || 'book-private-assets';

function daysAgoIso(days) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

async function getExactCount(table, filter) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true });
  if (typeof filter === 'function') {
    query = filter(query);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }

  return Number(count) || 0;
}

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

async function getBucketStats(bucket) {
  let objects = 0;
  let bytes = 0;

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

      objects += 1;
      bytes += toObjectSizeBytes(entry);
    }
  }

  await walk('');
  return { bucket, objects, bytes };
}

function formatBytes(bytes) {
  const numeric = Number(bytes) || 0;
  if (numeric < 1024) return `${numeric} B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)} KB`;
  if (numeric < 1024 * 1024 * 1024) return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
  return `${(numeric / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function run() {
  const last7d = daysAgoIso(7);
  const noisyEvents = ['page_view', 'ui_click', 'ui_scroll', 'ui_input', 'chat_input', 'chat_parse'];

  const [
    totalBooks,
    totalSystemLogs,
    totalAnalyticsEvents,
    booksLast7d,
    systemLogsLast7d,
    analyticsLast7d,
  ] = await Promise.all([
    getExactCount('books'),
    getExactCount('system_logs'),
    getExactCount('analytics_events'),
    getExactCount('books', (query) => query.gte('created_at', last7d)),
    getExactCount('system_logs', (query) => query.gte('created_at', last7d)),
    getExactCount('analytics_events', (query) => query.gte('created_at', last7d)),
  ]);

  const noisyEventCounts = await Promise.all(
    noisyEvents.map(async (eventName) => ({
      eventName,
      count: await getExactCount(
        'analytics_events',
        (query) => query.eq('event_name', eventName).gte('created_at', last7d),
      ),
    })),
  );

  const bucketStats = await Promise.all([
    getBucketStats(publicBucket),
    getBucketStats(privateBucket),
  ]);

  const totalStorageBytes = bucketStats.reduce((sum, bucket) => sum + bucket.bytes, 0);

  console.log(JSON.stringify({
    appEnv,
    generatedAt: new Date().toISOString(),
    totals: {
      books: totalBooks,
      systemLogs: totalSystemLogs,
      analyticsEvents: totalAnalyticsEvents,
    },
    last7d: {
      books: booksLast7d,
      systemLogs: systemLogsLast7d,
      analyticsEvents: analyticsLast7d,
      noisyAnalytics: Object.fromEntries(noisyEventCounts.map((item) => [item.eventName, item.count])),
    },
    storage: {
      totalBytes: totalStorageBytes,
      totalPretty: formatBytes(totalStorageBytes),
      buckets: Object.fromEntries(bucketStats.map((bucket) => [bucket.bucket, {
        objects: bucket.objects,
        bytes: bucket.bytes,
        pretty: formatBytes(bucket.bytes),
      }])),
    },
  }, null, 2));
}

await run();
