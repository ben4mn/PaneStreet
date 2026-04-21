import { shouldShowSpeech } from '../mascot-utils.js';

describe('shouldShowSpeech', () => {
  it('returns false when unfocused and not priority', () => {
    expect(shouldShowSpeech({ windowFocused: false, priority: false, onCooldown: false, withinBudget: true })).toBe(false);
  });

  it('returns true when unfocused but priority', () => {
    expect(shouldShowSpeech({ windowFocused: false, priority: true, onCooldown: false, withinBudget: true })).toBe(true);
  });

  it('returns true when focused and no cooldown', () => {
    expect(shouldShowSpeech({ windowFocused: true, priority: false, onCooldown: false, withinBudget: true })).toBe(true);
  });

  it('returns false when focused, non-priority, and on cooldown', () => {
    expect(shouldShowSpeech({ windowFocused: true, priority: false, onCooldown: true, withinBudget: true })).toBe(false);
  });

  it('bypasses cooldown for priority messages', () => {
    expect(shouldShowSpeech({ windowFocused: true, priority: true, onCooldown: true, withinBudget: true })).toBe(true);
  });

  it('returns false when focused, non-priority, and over budget', () => {
    expect(shouldShowSpeech({ windowFocused: true, priority: false, onCooldown: false, withinBudget: false })).toBe(false);
  });

  it('bypasses budget for priority messages', () => {
    expect(shouldShowSpeech({ windowFocused: true, priority: true, onCooldown: false, withinBudget: false })).toBe(true);
  });
});
