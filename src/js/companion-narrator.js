// The narrator layer turns the full cross-pane state into a single quip
// for the companion. Three severities drive three vocabularies and three
// debounce policies.

const STATUS_DEBOUNCE_MS = 30 * 1000;
const ATTENTION_DEBOUNCE_MS = 8 * 1000;

const URGENT_QUIPS = [
  p => `${p.paneName} needs approval.`,
  p => `${p.paneName} is waiting on you.`,
  p => `Permission prompt on ${p.paneName}.`,
];

const ATTENTION_QUIPS = [
  p => `${p.paneName} needs input.`,
  p => `${p.paneName} is stuck without you.`,
];

const STATUS_QUIPS = [
  p => p.workingCount > 1
    ? `${p.workingCount} sessions working.`
    : `One session working.`,
  p => p.finishedCount > 0 && p.workingCount > 0
    ? `${p.workingCount} working, ${p.finishedCount} done.`
    : null,
  p => p.finishedCount > 0 && p.workingCount === 0
    ? `${p.finishedCount} session${p.finishedCount === 1 ? '' : 's'} finished.`
    : null,
];

const IDLE_QUIPS = [
  () => 'All quiet.',
  () => 'Nothing needs you right now.',
];

export function narrateCrossPaneState(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  const active = sessions.filter(s => s && s.claudeAttached && !s.minimized);
  if (active.length === 0) return null;

  const urgent = active.find(s => s.subStatus === 'PermissionPrompt' || s.status === 'NeedsPermission');
  if (urgent) {
    return { severity: 'urgent', paneName: urgent.name };
  }

  const attention = active.find(s => s.status === 'ClaudeNeedsInput' || s.status === 'WaitingForInput');
  if (attention) {
    return { severity: 'attention', paneName: attention.name };
  }

  const workingCount = active.filter(s => s.status === 'Working').length;
  const finishedCount = active.filter(s => s.status === 'ClaudeFinished').length;

  if (workingCount === 0 && finishedCount <= 1 && active.every(s => s.status === 'Idle' || s.status === 'ClaudeFinished')) {
    return { severity: 'idle', workingCount, finishedCount };
  }

  return { severity: 'status', workingCount, finishedCount };
}

export function pickNarratorQuip(narration) {
  if (!narration || !narration.severity) return null;
  const pool = {
    urgent: URGENT_QUIPS,
    attention: ATTENTION_QUIPS,
    status: STATUS_QUIPS,
    idle: IDLE_QUIPS,
  }[narration.severity];
  if (!pool) return null;

  for (let i = 0; i < pool.length; i++) {
    const pick = pool[(i + randomSeed()) % pool.length](narration);
    if (pick) return pick;
  }
  return null;
}

export function shouldNarrateNow(narration, opts) {
  if (!narration || !narration.severity) return false;
  const now = opts?.now ?? Date.now();
  const lastAt = opts?.lastAt ?? 0;
  if (!lastAt) return true;
  const elapsed = now - lastAt;

  if (narration.severity === 'urgent') return true;
  if (narration.severity === 'attention') return elapsed >= ATTENTION_DEBOUNCE_MS;
  return elapsed >= STATUS_DEBOUNCE_MS;
}

function randomSeed() {
  return Math.floor(Math.random() * 1000);
}
