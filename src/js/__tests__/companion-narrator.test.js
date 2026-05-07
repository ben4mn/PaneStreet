// R/G TDD for the narrator layer — aggregates cross-pane state and
// chooses a single mascot quip. Pure function so we can feed it any
// imaginable combination of session states without xterm or timers.

import { narrateCrossPaneState, pickNarratorQuip, shouldNarrateNow } from '../companion-narrator.js';

describe('narrateCrossPaneState', () => {
  function mk(status, extra = {}) {
    return { status, claudeAttached: true, minimized: false, name: 'T', ...extra };
  }

  it('returns null when there are no panes', () => {
    expect(narrateCrossPaneState([])).toBe(null);
  });

  it('returns null when nothing is Claude-attached', () => {
    const result = narrateCrossPaneState([{ status: 'Working', claudeAttached: false, name: 'sh' }]);
    expect(result).toBe(null);
  });

  it('flags permission-waiting as the most urgent state', () => {
    const sessions = [
      mk('Working', { name: 'a' }),
      mk('WaitingForInput', { name: 'b', subStatus: 'PermissionPrompt' }),
      mk('Working', { name: 'c' }),
    ];
    const result = narrateCrossPaneState(sessions);
    expect(result.severity).toBe('urgent');
    expect(result.paneName).toBe('b');
  });

  it('flags Claude-needs-input above plain Working', () => {
    const sessions = [
      mk('Working', { name: 'a' }),
      mk('ClaudeNeedsInput', { name: 'b' }),
    ];
    const result = narrateCrossPaneState(sessions);
    expect(result.severity).toBe('attention');
  });

  it('reports a multi-session working summary when multiple are Working', () => {
    const sessions = [mk('Working', { name: 'a' }), mk('Working', { name: 'b' }), mk('Working', { name: 'c' })];
    const result = narrateCrossPaneState(sessions);
    expect(result.severity).toBe('status');
    expect(result.workingCount).toBe(3);
  });

  it('reports a mixed-state summary when some finished and some working', () => {
    const sessions = [mk('Working', { name: 'a' }), mk('ClaudeFinished', { name: 'b' })];
    const result = narrateCrossPaneState(sessions);
    expect(result.severity).toBe('status');
    expect(result.finishedCount).toBe(1);
    expect(result.workingCount).toBe(1);
  });

  it('skips minimized panes from the aggregate', () => {
    const sessions = [
      mk('Working', { name: 'a' }),
      mk('WaitingForInput', { name: 'b', minimized: true, subStatus: 'PermissionPrompt' }),
    ];
    const result = narrateCrossPaneState(sessions);
    expect(result.severity).toBe('status');
  });

  it('reports idle when everything is Idle or Finished and no activity', () => {
    const sessions = [mk('Idle', { name: 'a' }), mk('ClaudeFinished', { name: 'b' })];
    const result = narrateCrossPaneState(sessions);
    expect(result.severity).toBe('idle');
  });
});

describe('pickNarratorQuip', () => {
  it('returns an urgent quip mentioning the pane name', () => {
    const quip = pickNarratorQuip({ severity: 'urgent', paneName: 'b' });
    expect(quip.toLowerCase()).toContain('b');
  });

  it('returns an attention quip for Claude-needs-input', () => {
    const quip = pickNarratorQuip({ severity: 'attention', paneName: 'x' });
    expect(quip).toBeTruthy();
    expect(typeof quip).toBe('string');
  });

  it('returns a status quip summarizing working / finished counts', () => {
    const quip = pickNarratorQuip({ severity: 'status', workingCount: 3, finishedCount: 0 });
    expect(quip).toMatch(/3/);
  });

  it('returns null for unknown severity', () => {
    expect(pickNarratorQuip({ severity: 'mystery' })).toBe(null);
  });

  it('returns null for missing input', () => {
    expect(pickNarratorQuip(null)).toBe(null);
  });
});

describe('shouldNarrateNow', () => {
  it('allows the first narration', () => {
    expect(shouldNarrateNow({ severity: 'status' }, { lastAt: 0, now: 10000 })).toBe(true);
  });

  it('suppresses repeat status-level narration within the debounce window', () => {
    expect(shouldNarrateNow({ severity: 'status' }, { lastAt: 9000, now: 10000 })).toBe(false);
  });

  it('allows status-level narration after the debounce window', () => {
    expect(shouldNarrateNow({ severity: 'status' }, { lastAt: 0, now: 45000 })).toBe(true);
  });

  it('lets urgent narration bypass debounce', () => {
    expect(shouldNarrateNow({ severity: 'urgent' }, { lastAt: 9000, now: 10000 })).toBe(true);
  });

  it('blocks when narration is null', () => {
    expect(shouldNarrateNow(null, { lastAt: 0, now: 0 })).toBe(false);
  });
});
