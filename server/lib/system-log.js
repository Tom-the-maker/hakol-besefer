function normalizeMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

export async function appendSystemLog(supabase, {
  sessionId,
  userId,
  bookSlug,
  actionType,
  stage,
  status,
  metadata,
}) {
  if (!supabase || !sessionId || !actionType || !status) {
    return;
  }

  try {
    await supabase
      .from('system_logs')
      .insert({
        session_id: sessionId,
        user_id: userId || null,
        book_slug: bookSlug || null,
        action_type: actionType,
        stage: stage || null,
        status,
        metadata: normalizeMetadata(metadata),
      });
  } catch {
    // Forensics logging must never block the user flow.
  }
}
