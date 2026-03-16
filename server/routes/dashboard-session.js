import { hasDashboardAccess } from '../lib/auth.js';
import {
  ANALYTICS_EVENT_SELECT,
  DASHBOARD_BOOK_SELECT,
  SYSTEM_LOG_SELECT,
  SYSTEM_LOG_WITH_PROMPT_SELECT,
  serializeDashboardBookSummary,
} from '../lib/books.js';
import { serializeDashboardAnalyticsEvent, serializeDashboardSystemLog } from '../lib/dashboard.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { getNumberQuery, getStringQuery, sendError, sendJson, setCors } from '../lib/http.js';

export default async function handler(req, res) {
  setCors(res, 'GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return sendError(res, 405, 'Method not allowed');
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return sendError(res, 503, 'Supabase server configuration is missing');
  }

  if (!hasDashboardAccess(req)) {
    return sendError(res, 403, 'Dashboard access denied');
  }

  const sessionId = getStringQuery(req, 'sessionId');
  if (!sessionId) {
    return sendError(res, 400, 'Missing sessionId query param');
  }

  const includePrompts = getStringQuery(req, 'includePrompts') === '1';
  const logLimit = getNumberQuery(req, 'logLimit', 200, 500);
  const eventLimit = getNumberQuery(req, 'eventLimit', 200, 500);

  const [bookResult, logsResult, eventsResult] = await Promise.all([
    supabase
      .from('books')
      .select(DASHBOARD_BOOK_SELECT)
      .eq('session_id', sessionId)
      .maybeSingle(),
    supabase
      .from('system_logs')
      .select(includePrompts ? SYSTEM_LOG_WITH_PROMPT_SELECT : SYSTEM_LOG_SELECT)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(logLimit),
    supabase
      .from('analytics_events')
      .select(ANALYTICS_EVENT_SELECT)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(eventLimit),
  ]);

  if (bookResult.error) {
    return sendError(res, 500, 'Failed to load session book', bookResult.error.message);
  }

  if (logsResult.error) {
    return sendError(res, 500, 'Failed to load system logs', logsResult.error.message);
  }

  if (eventsResult.error) {
    return sendError(res, 500, 'Failed to load analytics events', eventsResult.error.message);
  }

  return sendJson(res, 200, {
    sessionId,
    book: bookResult.data ? serializeDashboardBookSummary(supabase, bookResult.data) : null,
    logs: Array.isArray(logsResult.data) ? logsResult.data.map((row) => serializeDashboardSystemLog(row)) : [],
    events: Array.isArray(eventsResult.data) ? eventsResult.data.map((row) => serializeDashboardAnalyticsEvent(row)) : [],
  });
}
