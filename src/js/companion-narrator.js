// The narrator layer turns the full cross-pane state into a single quip
// for the companion. Three severities drive three vocabularies and three
// debounce policies. Tone (enthusiastic / neutral / terse) selects the
// phrasing style within each severity.

const STATUS_DEBOUNCE_MS = 30 * 1000;
const ATTENTION_DEBOUNCE_MS = 8 * 1000;

export const NARRATOR_TONES = Object.freeze({
  ENTHUSIASTIC: 'enthusiastic',
  NEUTRAL: 'neutral',
  TERSE: 'terse',
});

// Each pool maps severity → array of builder functions. A builder may
// return null if it doesn't apply to the current narration (e.g. the
// "working+finished" builder when finishedCount is 0).
const TONE_POOLS = {
  [NARRATOR_TONES.NEUTRAL]: {
    urgent: [
      p => `${p.paneName} needs approval.`,
      p => `${p.paneName} is waiting on you.`,
      p => `Permission prompt on ${p.paneName}.`,
    ],
    attention: [
      p => `${p.paneName} needs input.`,
      p => `${p.paneName} is stuck without you.`,
    ],
    status: [
      p => p.workingCount > 1 ? `${p.workingCount} sessions working.` : `One session working.`,
      p => p.finishedCount > 0 && p.workingCount > 0 ? `${p.workingCount} working, ${p.finishedCount} done.` : null,
      p => p.finishedCount > 0 && p.workingCount === 0 ? `${p.finishedCount} session${p.finishedCount === 1 ? '' : 's'} finished.` : null,
    ],
    idle: [
      () => 'All quiet.',
      () => 'Nothing needs you right now.',
    ],
  },
  [NARRATOR_TONES.ENTHUSIASTIC]: {
    urgent: [
      p => `Heads up! ${p.paneName} is ready for your call!`,
      p => `${p.paneName} is begging for approval!`,
      p => `Big moment on ${p.paneName} — permission needed!`,
    ],
    attention: [
      p => `${p.paneName} needs you — go get 'em!`,
      p => `${p.paneName} is waving for input!`,
    ],
    status: [
      p => p.workingCount > 1 ? `${p.workingCount} agents crushing it!` : `One agent cooking!`,
      p => p.finishedCount > 0 && p.workingCount > 0 ? `${p.workingCount} still going strong, ${p.finishedCount} victory lap${p.finishedCount === 1 ? '' : 's'}!` : null,
      p => p.finishedCount > 0 && p.workingCount === 0 ? `${p.finishedCount} done and dusted!` : null,
    ],
    idle: [
      () => 'All smooth sailing!',
      () => 'Everyone happy, nothing pending!',
    ],
  },
  [NARRATOR_TONES.TERSE]: {
    urgent: [
      p => `${p.paneName}: approve.`,
      p => `${p.paneName}: waiting.`,
      p => `${p.paneName}: prompt.`,
    ],
    attention: [
      p => `${p.paneName}: input.`,
      p => `${p.paneName}: needs you.`,
    ],
    status: [
      p => `${p.workingCount} working.`,
      p => p.finishedCount > 0 && p.workingCount > 0 ? `${p.workingCount}/${p.finishedCount}` : null,
      p => p.finishedCount > 0 && p.workingCount === 0 ? `${p.finishedCount} done.` : null,
    ],
    idle: [
      () => 'Idle.',
      () => 'Quiet.',
    ],
  },
};

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

export function pickNarratorQuip(narration, opts = {}) {
  if (!narration || !narration.severity) return null;
  const tone = TONE_POOLS[opts.tone] ? opts.tone : NARRATOR_TONES.NEUTRAL;
  const pool = TONE_POOLS[tone][narration.severity];
  if (!pool) return null;

  const seed = randomSeed();
  for (let i = 0; i < pool.length; i++) {
    const pick = pool[(i + seed) % pool.length](narration);
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
