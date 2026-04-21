export const STATUS_COLORS = {
  Working: 'var(--status-working)',
  Idle: 'var(--status-idle)',
  WaitingForInput: 'var(--status-waiting)',
  NeedsPermission: 'var(--status-permission)',
  ClaudeNeedsInput: 'var(--status-waiting)',
  Error: 'var(--status-exited)',
  ClaudeFinished: 'var(--status-idle)',
  Exited: 'var(--status-exited)',
};

const ATTENTION_STATUSES = new Set([
  'WaitingForInput', 'NeedsPermission', 'ClaudeNeedsInput',
  'Exited', 'Error', 'ClaudeFinished',
]);

const CLAUDE_EVENTS = new Set(['ClaudeNeedsInput', 'ClaudeFinished']);

export function computeStatusUpdate(status, focusedIndex, sessionIndex) {
  const color = STATUS_COLORS[status] || 'var(--status-idle)';
  const needsAttention = ATTENTION_STATUSES.has(status);
  return {
    color,
    needsAttention,
    needsAttentionRing: needsAttention && sessionIndex !== focusedIndex,
    shouldUpdateMascot: sessionIndex === focusedIndex,
    shouldNotify: CLAUDE_EVENTS.has(status),
  };
}
