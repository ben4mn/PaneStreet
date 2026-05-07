// Broadcast a prompt to every Claude-attached pane. Selection and
// dispatch are pure (caller injects the write function), so multi-agent
// workflows can send "regenerate the README" to all Claude panes at once
// without the logic being coupled to xterm.

const SKIP_STATUSES = new Set(['Exited', 'Error']);

export function selectBroadcastTargets(sessions, opts = {}) {
  const { includeMinimized = false } = opts;
  if (!Array.isArray(sessions)) return [];
  return sessions.filter(s => {
    if (!s || !s.id) return false;
    if (!s.claudeAttached) return false;
    if (!includeMinimized && s.minimized) return false;
    if (s.status && SKIP_STATUSES.has(s.status)) return false;
    return true;
  });
}

export async function broadcastToClaudePanes(sessions, prompt, write, opts = {}) {
  const trimmed = typeof prompt === 'string' ? prompt.trim() : '';
  if (!trimmed) {
    return { targeted: 0, skipped: sessions?.length || 0, targetIds: [], failed: [], error: 'Empty prompt' };
  }

  const targets = selectBroadcastTargets(sessions, opts);
  const total = Array.isArray(sessions) ? sessions.length : 0;
  const skipped = total - targets.length;
  const payload = /\r$|\n$/.test(prompt) ? prompt : prompt + '\r';

  const failed = [];
  for (const target of targets) {
    try {
      await write(target.id, payload);
    } catch {
      failed.push(target.id);
    }
  }

  return {
    targeted: targets.length - failed.length,
    skipped,
    targetIds: targets.map(t => t.id),
    failed,
  };
}
