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
  }, null, 2));
}

await run();
