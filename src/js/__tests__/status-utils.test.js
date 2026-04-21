import { computeStatusUpdate, STATUS_COLORS } from '../status-utils.js';

describe('STATUS_COLORS', () => {
  it('maps all known statuses to CSS variables', () => {
    expect(STATUS_COLORS.Working).toBe('var(--status-working)');
    expect(STATUS_COLORS.Idle).toBe('var(--status-idle)');
    expect(STATUS_COLORS.WaitingForInput).toBe('var(--status-waiting)');
    expect(STATUS_COLORS.NeedsPermission).toBe('var(--status-permission)');
    expect(STATUS_COLORS.ClaudeNeedsInput).toBe('var(--status-waiting)');
    expect(STATUS_COLORS.Error).toBe('var(--status-exited)');
    expect(STATUS_COLORS.ClaudeFinished).toBe('var(--status-idle)');
    expect(STATUS_COLORS.Exited).toBe('var(--status-exited)');
  });
});

describe('computeStatusUpdate', () => {
  it('returns correct color for Working', () => {
    const result = computeStatusUpdate('Working', 0, 1);
    expect(result.color).toBe('var(--status-working)');
  });

  it('returns correct color for Error', () => {
    const result = computeStatusUpdate('Error', 0, 1);
    expect(result.color).toBe('var(--status-exited)');
  });

  it('falls back to idle color for unknown status', () => {
    const result = computeStatusUpdate('UnknownStatus', 0, 1);
    expect(result.color).toBe('var(--status-idle)');
  });

  it('needsAttention is true for attention states', () => {
    for (const status of ['WaitingForInput', 'NeedsPermission', 'ClaudeNeedsInput', 'Exited', 'Error', 'ClaudeFinished']) {
      expect(computeStatusUpdate(status, 0, 1).needsAttention).toBe(true);
    }
  });

  it('needsAttention is false for Working and Idle', () => {
    expect(computeStatusUpdate('Working', 0, 0).needsAttention).toBe(false);
    expect(computeStatusUpdate('Idle', 0, 0).needsAttention).toBe(false);
  });

  it('needsAttentionRing is false when session IS focused', () => {
    expect(computeStatusUpdate('ClaudeNeedsInput', 2, 2).needsAttentionRing).toBe(false);
  });

  it('needsAttentionRing is true when session is NOT focused', () => {
    expect(computeStatusUpdate('ClaudeNeedsInput', 0, 1).needsAttentionRing).toBe(true);
  });

  it('shouldUpdateMascot is true when sessionIndex equals focusedIndex', () => {
    expect(computeStatusUpdate('Working', 2, 2).shouldUpdateMascot).toBe(true);
  });

  it('shouldUpdateMascot is false when sessionIndex differs from focusedIndex', () => {
    expect(computeStatusUpdate('Working', 2, 3).shouldUpdateMascot).toBe(false);
  });

  it('shouldNotify is true only for Claude events', () => {
    expect(computeStatusUpdate('ClaudeNeedsInput', 0, 1).shouldNotify).toBe(true);
    expect(computeStatusUpdate('ClaudeFinished', 0, 1).shouldNotify).toBe(true);
  });

  it('shouldNotify is false for non-Claude statuses', () => {
    expect(computeStatusUpdate('Working', 0, 0).shouldNotify).toBe(false);
    expect(computeStatusUpdate('Error', 0, 1).shouldNotify).toBe(false);
    expect(computeStatusUpdate('Idle', 0, 0).shouldNotify).toBe(false);
  });
});
