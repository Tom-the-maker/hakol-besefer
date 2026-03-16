import { getAuthUser } from '../lib/auth.js';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { parseJsonBody, sendError, sendJson, setCors } from '../lib/http.js';

function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function normalizeStatus(value) {
  const normalized = getString(value).toLowerCase();
  return ['success', 'error', 'pending'].includes(normalized) ? normalized : 'pending';
}

function normalizeGender(value) {
  const normalized = getString(value).toLowerCase();
  return ['male', 'female'].includes(normalized) ? normalized : null;
}

function normalizeInteger(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function normalizeDecimal(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

  const payload = normalizeObject(parsed.body);
  const sessionId = getString(payload.session_id);
  const actionType = getString(payload.action_type);

  if (!sessionId || !actionType) {
    return sendError(res, 400, 'Missing system log fields');
  }

  const metadata = normalizeObject(payload.metadata);
  const authUser = await getAuthUser(req, supabase);

  const { error } = await supabase
    .from('system_logs')
    .insert({
      session_id: sessionId,
      user_id: authUser?.id || null,
      book_slug: getString(payload.book_slug) || null,
      action_type: actionType,
      stage: getString(payload.stage) || null,
      status: normalizeStatus(payload.status),
      model_name: getString(payload.model_name) || null,
      provider_model: getString(metadata.provider_model) || getString(payload.provider_model) || null,
      input_tokens: normalizeInteger(payload.input_tokens),
      output_tokens: normalizeInteger(payload.output_tokens),
      estimated_cost_usd: normalizeDecimal(metadata.estimated_cost),
      duration_ms: normalizeInteger(metadata.duration_ms),
      prompt_token: getString(metadata.prompt_token) || null,
      hero_name: getString(payload.child_name) || getString(payload.hero_name) || null,
      topic: getString(payload.topic) || null,
      art_style: getString(payload.art_style) || null,
      hero_gender: normalizeGender(payload.hero_gender),
      hero_age: normalizeInteger(payload.hero_age),
      book_title: getString(payload.book_title) || null,
      parent_character: getString(payload.extra_char_1) || getString(payload.parent_character) || null,
      parent_name: getString(payload.parent_name) || null,
      metadata,
    });

  if (error) {
    return sendError(res, 500, 'Failed to write system log', error.message);
  }

  return sendJson(res, 200, { success: true });
}
