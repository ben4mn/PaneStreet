// Frontend refinement layer over the Rust status detector.
// Given the base SessionStatus and the last N terminal lines, classify a
// richer Claude-specific sub-status and whether Claude is attached at all.
// Pure function — no DOM, no I/O — so the state is straightforward to test.

export const CLAUDE_SUB_STATUS = Object.freeze({
  PLAN_MODE: 'PlanMode',
  PERMISSION_PROMPT: 'PermissionPrompt',
  STOPPED_ALIVE: 'StoppedAlive',
  THINKING: 'Thinking',
});

const PLAN_MODE_MARKER = /would you like to proceed with this plan\??/i;
const PERMISSION_MARKERS = [
  /do you want me to run this/i,
  /do you want to proceed\??/i,
  /claude needs your permission/i,
];
const THINKING_MARKERS = [
  /thinking[…\.]{1,3}/i,
  /^[\s*✽•]+thinking/im,
];
const CLAUDE_COST_MARKER = /total cost:\s*\$/i;
const CLAUDE_TOKEN_MARKER = /total tokens:/i;
const SHELL_PROMPT_MARKER = /(^|\n)[^\n]*[$#%>]\s*$/;

// Statuses where Claude signal refinement is meaningful. Exited / Error
// keep whatever the base detector produced.
const REFINABLE_STATUSES = new Set(['Working', 'Idle', 'WaitingForInput', 'NeedsPermission', 'ClaudeNeedsInput', 'ClaudeFinished']);

export function refineClaudeStatus(baseStatus, recentLines) {
  const lines = Array.isArray(recentLines) ? recentLines : [];
  const joined = lines.join('\n');
  const claudeAttached = detectClaudeAttached(joined);

  if (!REFINABLE_STATUSES.has(baseStatus)) {
    return { subStatus: null, claudeAttached };
  }

  if (lines.length === 0) {
    return { subStatus: null, claudeAttached };
  }

  // Permission prompt has priority — if we see a tool-use approval we want
  // the pane to flash for attention even if the plan-mode marker is also
  // somewhere in scrollback from an earlier turn.
  if (PERMISSION_MARKERS.some(re => re.test(joined))) {
    return { subStatus: CLAUDE_SUB_STATUS.PERMISSION_PROMPT, claudeAttached: true };
  }

  if (PLAN_MODE_MARKER.test(joined)) {
    return { subStatus: CLAUDE_SUB_STATUS.PLAN_MODE, claudeAttached: true };
  }

  // Stopped-but-alive: Claude wrapped up (cost/tokens line) and we're back
  // at a shell prompt on the trailing line.
  if ((CLAUDE_COST_MARKER.test(joined) || CLAUDE_TOKEN_MARKER.test(joined)) && SHELL_PROMPT_MARKER.test(joined)) {
    return { subStatus: CLAUDE_SUB_STATUS.STOPPED_ALIVE, claudeAttached: true };
  }

  if (THINKING_MARKERS.some(re => re.test(joined))) {
    return { subStatus: CLAUDE_SUB_STATUS.THINKING, claudeAttached: true };
  }

  return { subStatus: null, claudeAttached };
}

function detectClaudeAttached(joined) {
  if (!joined) return false;
  if (CLAUDE_COST_MARKER.test(joined)) return true;
  if (CLAUDE_TOKEN_MARKER.test(joined)) return true;
  if (THINKING_MARKERS.some(re => re.test(joined))) return true;
  if (/claude code/i.test(joined)) return true;
  return false;
}
