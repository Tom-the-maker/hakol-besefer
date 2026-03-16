function getString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function sanitizeString(value, maxLength = 160) {
  const normalized = getString(value);
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('data:image')) {
    return '[inline-image]';
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...[truncated ${normalized.length} chars]`
    : normalized;
}

function sanitizeStringArray(value, limit = 8, maxLength = 160) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, limit)
    .map((item) => sanitizeString(item, maxLength))
    .filter(Boolean);
}

function sanitizeAnalyticsEventData(value, depth = 0) {
  if (depth > 2) {
    return '[max-depth]';
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value, 120);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeAnalyticsEventData(item, depth + 1));
  }

  if (typeof value === 'object') {
    const object = normalizeObject(value);
    const next = {};
    for (const [key, nestedValue] of Object.entries(object).slice(0, 16)) {
      next[key] = sanitizeAnalyticsEventData(nestedValue, depth + 1);
    }
    return next;
  }

  return sanitizeString(String(value), 120);
}

function sanitizeTraceList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 16)
    .map((item) => {
      if (typeof item === 'string') {
        return sanitizeString(item, 240);
      }

      const object = normalizeObject(item);
      const panel = toFiniteNumber(object.panel ?? object.panel_index);
      const segmentIndex = toFiniteNumber(object.segment_index);
      const stage = sanitizeString(object.stage, 80);
      const summary = sanitizeString(object.summary ?? object.description ?? object.text, 240);
      const visual = sanitizeString(object.visual, 180);
      const cast = sanitizeString(object.cast, 180);

      const parts = [];
      if (Number.isFinite(panel) && panel > 0) parts.push(`panel ${panel}`);
      if (Number.isFinite(segmentIndex) && segmentIndex > 0) parts.push(`segment ${segmentIndex}`);
      if (stage) parts.push(stage);
      if (summary) parts.push(summary);
      if (visual) parts.push(`visual: ${visual}`);
      if (cast) parts.push(`cast: ${cast}`);

      return parts.join(' | ');
    })
    .filter(Boolean);
}

function sanitizeSegments(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 10)
    .map((item) => {
      if (typeof item === 'string') {
        return sanitizeString(item, 2500);
      }

      const object = normalizeObject(item);
      return sanitizeString(object.text, 2500);
    })
    .filter(Boolean);
}

function sanitizeRequestContext(value) {
  const object = normalizeObject(value);
  const next = {};

  for (const key of [
    'parentName',
    'parentCharacter',
    'parentCharacterRole',
    'parentGender',
    'parentAge',
    'thirdCharacter',
    'thirdCharacterRole',
  ]) {
    if (key.endsWith('Age')) {
      const numeric = toFiniteNumber(object[key]);
      if (numeric !== null) {
        next[key] = numeric;
      }
      continue;
    }

    const normalized = sanitizeString(object[key], 120);
    if (normalized) {
      next[key] = normalized;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizePreflight(value) {
  const object = normalizeObject(value);
  const next = {};

  if (typeof object.enabled === 'boolean') next.enabled = object.enabled;
  if (typeof object.applied === 'boolean') next.applied = object.applied;

  const hardConstraintCount = toFiniteNumber(object.hard_constraint_count);
  if (hardConstraintCount !== null) {
    next.hard_constraint_count = hardConstraintCount;
  }

  const riskFlags = sanitizeStringArray(object.risk_flags, 12, 120);
  if (riskFlags.length > 0) {
    next.risk_flags = riskFlags;
  }

  const error = sanitizeString(object.error, 240);
  if (error) {
    next.error = error;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeNormalizedGrid(value) {
  const object = normalizeObject(value);
  const next = {};

  for (const key of [
    'sourceWidth',
    'sourceHeight',
    'targetWidth',
    'targetHeight',
    'panelSize',
    'left',
    'top',
    'columns',
    'rows',
  ]) {
    const numeric = toFiniteNumber(object[key]);
    if (numeric !== null) {
      next[key] = numeric;
    }
  }

  if (typeof object.wasNormalized === 'boolean') {
    next.wasNormalized = object.wasNormalized;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeReferenceFeatures(value) {
  const object = normalizeObject(value);
  const next = {};

  for (const [key, nestedValue] of Object.entries(object).slice(0, 24)) {
    if (Array.isArray(nestedValue)) {
      const items = sanitizeStringArray(nestedValue, 12, 140);
      if (items.length > 0) {
        next[key] = items;
      }
      continue;
    }

    if (typeof nestedValue === 'boolean') {
      next[key] = nestedValue;
      continue;
    }

    const numeric = toFiniteNumber(nestedValue);
    if (numeric !== null) {
      next[key] = numeric;
      continue;
    }

    const text = sanitizeString(nestedValue, 240);
    if (text) {
      next[key] = text;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeReferenceAnalysis(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, 8)
    .map((entry) => {
      const object = normalizeObject(entry);
      const usage = normalizeObject(object.usage);
      const profile = normalizeObject(object.profile);
      const next = {};

      for (const key of ['slot', 'characterType', 'subjectType', 'requestedModel', 'providerModel', 'model']) {
        const normalized = sanitizeString(object[key] ?? profile[key], 120);
        if (normalized) {
          next[key] = normalized;
        }
      }

      const usagePayload = {};
      for (const key of ['input', 'output']) {
        const numeric = toFiniteNumber(usage[key]);
        if (numeric !== null) {
          usagePayload[key] = numeric;
        }
      }
      if (Object.keys(usagePayload).length > 0) {
        next.usage = usagePayload;
      }

      const profilePayload = {};
      for (const key of ['subjectType', 'summary', 'hair', 'glasses', 'facialHair']) {
        const normalized = sanitizeString(profile[key], key === 'summary' ? 240 : 120);
        if (normalized) {
          profilePayload[key] = normalized;
        }
      }

      const identityAnchors = sanitizeStringArray(profile.identityAnchors, 8, 140);
      if (identityAnchors.length > 0) {
        profilePayload.identityAnchors = identityAnchors;
      }

      const accessories = sanitizeStringArray(profile.accessories, 8, 140);
      if (accessories.length > 0) {
        profilePayload.accessories = accessories;
      }

      if (Object.keys(profilePayload).length > 0) {
        next.profile = profilePayload;
      }

      return Object.keys(next).length > 0 ? next : null;
    })
    .filter(Boolean);
}

function sanitizeRawImageMetadata(value) {
  return sanitizeAnalyticsEventData(value);
}

function sanitizeResponseJson(value) {
  const object = normalizeObject(value);
  const next = {};

  const promptToken = sanitizeString(object.prompt_token, 255);
  if (promptToken) {
    next.prompt_token = promptToken;
  }

  const segments = sanitizeSegments(object.segments);
  if (segments.length > 0) {
    next.segments = segments;
  }

  for (const [sourceKey, targetKey] of [
    ['panel_plan', 'panel_plan'],
    ['segment_visual_map', 'segment_visual_map'],
    ['panel_cast_map', 'panel_cast_map'],
  ]) {
    const traceList = sanitizeTraceList(object[sourceKey]);
    if (traceList.length > 0) {
      next[targetKey] = traceList;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function serializeDashboardSystemLog(row) {
  const metadata = normalizeObject(row?.metadata);
  const nextMetadata = {};

  for (const [key, maxLength] of [
    ['requested_model', 120],
    ['provider_model', 120],
    ['provider_model_source', 80],
    ['provider_response_id', 160],
    ['provider_request_id', 160],
    ['pricing_model', 120],
    ['pricing_rule', 120],
    ['pricing_source', 80],
    ['prompt_token', 255],
    ['image_resolution', 80],
    ['imageResolution', 80],
    ['mock_reason', 120],
  ]) {
    const normalized = sanitizeString(
      key === 'provider_model' ? row?.provider_model || metadata[key] : metadata[key],
      maxLength,
    );
    if (normalized) {
      nextMetadata[key] = normalized;
    }
  }

  const resultData = sanitizeString(metadata.result_data, 320);
  if (resultData) {
    nextMetadata.result_data = resultData;
  }

  if (typeof metadata.mock_image_mode === 'boolean') {
    nextMetadata.mock_image_mode = metadata.mock_image_mode;
  }

  const estimatedCost = toFiniteNumber(metadata.estimated_cost ?? row?.estimated_cost_usd);
  if (estimatedCost !== null) {
    nextMetadata.estimated_cost = estimatedCost;
  }

  const durationMs = toFiniteNumber(metadata.duration_ms ?? row?.duration_ms);
  if (durationMs !== null) {
    nextMetadata.duration_ms = durationMs;
  }

  const preflight = sanitizePreflight(metadata.preflight);
  if (preflight) {
    nextMetadata.preflight = preflight;
  }

  const normalizedGrid = sanitizeNormalizedGrid(metadata.normalized_grid);
  if (normalizedGrid) {
    nextMetadata.normalized_grid = normalizedGrid;
  }

  const referenceFeatures = sanitizeReferenceFeatures(metadata.reference_features);
  if (referenceFeatures) {
    nextMetadata.reference_features = referenceFeatures;
  }

  const referenceAnalysis = sanitizeReferenceAnalysis(metadata.reference_analysis);
  if (referenceAnalysis.length > 0) {
    nextMetadata.reference_analysis = referenceAnalysis;
  }

  const rawImageMetadata = sanitizeRawImageMetadata(metadata.raw_image_metadata);
  if (rawImageMetadata && typeof rawImageMetadata === 'object' && !Array.isArray(rawImageMetadata)) {
    nextMetadata.raw_image_metadata = rawImageMetadata;
  }

  const requestJson = sanitizeRequestContext(metadata.request_json);
  if (requestJson) {
    nextMetadata.request_json = requestJson;
  }

  const inputs = sanitizeRequestContext(metadata.inputs);
  if (inputs) {
    nextMetadata.inputs = inputs;
  }

  const responseJson = sanitizeResponseJson(metadata.response_json);
  if (responseJson) {
    nextMetadata.response_json = responseJson;
  }

  const segments = sanitizeSegments(metadata.segments);
  if (segments.length > 0) {
    nextMetadata.segments = segments;
  }

  return {
    id: row.id,
    created_at: row.created_at,
    session_id: row.session_id,
    user_id: row.user_id || null,
    action_type: row.action_type,
    model_name: row.model_name || '',
    input_tokens: toFiniteNumber(row.input_tokens) || 0,
    output_tokens: toFiniteNumber(row.output_tokens) || 0,
    status: getString(row.status) || 'pending',
    child_name: getString(row.hero_name) || undefined,
    topic: getString(row.topic) || undefined,
    art_style: getString(row.art_style) || undefined,
    hero_gender: getString(row.hero_gender) || undefined,
    hero_age: toFiniteNumber(row.hero_age) ?? undefined,
    book_title: getString(row.book_title) || undefined,
    extra_char_1: getString(row.parent_character) || undefined,
    extra_char_2: undefined,
    metadata: nextMetadata,
  };
}

export function serializeDashboardAnalyticsEvent(row) {
  return {
    session_id: getString(row?.session_id) || null,
    event_name: getString(row?.event_name) || '',
    event_data: sanitizeAnalyticsEventData(row?.event_data),
    page: getString(row?.page) || null,
    device_type: getString(row?.device_type) || null,
    created_at: row?.created_at || null,
  };
}
