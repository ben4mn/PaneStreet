export function correlateHookSession(sessionId, sessions) {
  if (!sessions.length) return -1;
  if (sessions.length === 1) return 0;
  if (sessionId == null) return -1;
  const idx = sessions.findIndex(s => s.id === sessionId);
  return idx;
}

const HOOK_NOTIFICATIONS = {
  Notification: (data) => ({
    title: 'Claude Code',
    body: data.message || 'Needs your attention',
    mascotQuip: data.type === 'permission_prompt' ? 'Approval needed.' : 'Heads up.',
  }),
  Stop: (data) => ({
    title: 'Claude finished',
    body: data.last_message || 'Task complete',
    mascotQuip: 'All done.',
  }),
  StopFailure: (data) => ({
    title: 'Claude stopped unexpectedly',
    body: data.error || 'Something went wrong',
    mascotQuip: 'That went sideways.',
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
