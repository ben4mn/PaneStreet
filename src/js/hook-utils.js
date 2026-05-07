export function correlateHookSession(sessionId, sessions) {
  if (!sessions.length) return -1;
  if (sessions.length === 1) return 0;
  if (sessionId == null) return -1;
  const idx = sessions.findIndex(s => s.id === sessionId);
  return idx;
}

// Pull a compact one-liner out of a Claude hook payload so the mascot can
// "quote" what Claude just said. Split on the first sentence-ending
// punctuation, trim, and cap with an ellipsis if needed.
export function snippet(text, max = 60) {
  if (text === null || text === undefined || text === '') return '';
  const str = String(text).trim();
  if (!str) return '';
  const first = str.split(/[.!?](?=\s|$)/)[0].trim();
  if (first.length > max) return first.slice(0, max - 1) + '…';
  return first;
}

const HOOK_NOTIFICATIONS = {
  Notification: (data) => ({
    title: 'Claude Code',
    body: data.message || 'Needs your attention',
    mascotQuip: snippet(data.message) || (data.type === 'permission_prompt' ? 'Approval needed.' : 'Heads up.'),
  }),
  Stop: (data) => ({
    title: 'Claude finished',
    body: data.last_message || 'Task complete',
    mascotQuip: snippet(data.last_message) || 'All done.',
  }),
  StopFailure: (data) => ({
    title: 'Claude stopped unexpectedly',
    body: data.error || 'Something went wrong',
    mascotQuip: snippet(data.error) || 'That went sideways.',
  }),
  SubagentStop: () => ({
    title: 'Subagent finished',
    body: 'A background agent completed its task',
    mascotQuip: 'Sub-agent checked in.',
  }),
  SessionStart: () => ({
    title: 'Session started',
    body: 'Claude Code session is active',
    mascotQuip: 'New session.',
  }),
  TaskCompleted: (data) => ({
    title: 'Task completed',
    body: data.task_name || 'A task finished',
    mascotQuip: 'Task done.',
  }),
};

const SILENT_EVENTS = new Set([
  'PreToolUse', 'PostToolUse', 'CwdChanged',
]);

export function buildHookNotification(event, data) {
  if (SILENT_EVENTS.has(event)) return null;
  const builder = HOOK_NOTIFICATIONS[event];
  if (!builder) return null;
  return builder(data);
}
