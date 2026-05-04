import { shouldShowSpeech, resetMascotPreferences, getMascotDiagnostics, claimMascotInit } from '../mascot-utils.js';

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

describe('resetMascotPreferences', () => {
  it('removes all three ps-robot-* keys from localStorage', () => {
    localStorage.setItem('ps-robot-enabled', 'false');
    localStorage.setItem('ps-robot-standstill', 'true');
    localStorage.setItem('ps-robot-location', 'sidebar');
    localStorage.setItem('ps-robot-frequency', 'high');
    localStorage.setItem('unrelated-key', 'keep-me');

    resetMascotPreferences();

    expect(localStorage.getItem('ps-robot-enabled')).toBeNull();
    expect(localStorage.getItem('ps-robot-standstill')).toBeNull();
    expect(localStorage.getItem('ps-robot-location')).toBeNull();
    expect(localStorage.getItem('ps-robot-frequency')).toBeNull();
    expect(localStorage.getItem('unrelated-key')).toBe('keep-me');
  });

  it('is a no-op when no ps-robot-* keys are set', () => {
    expect(() => resetMascotPreferences()).not.toThrow();
  });
});

describe('getMascotDiagnostics', () => {
  it('reports enabled/standstill/location/frequency from localStorage', () => {
    localStorage.setItem('ps-robot-enabled', 'false');
    localStorage.setItem('ps-robot-standstill', 'true');
    localStorage.setItem('ps-robot-location', 'sidebar');
    localStorage.setItem('ps-robot-frequency', 'low');

    const diag = getMascotDiagnostics();

    expect(diag.enabled).toBe(false);
    expect(diag.standstill).toBe(true);
    expect(diag.location).toBe('sidebar');
    expect(diag.frequency).toBe('low');
  });

  it('defaults enabled=true when key is absent', () => {
    const diag = getMascotDiagnostics();
    expect(diag.enabled).toBe(true);
    expect(diag.standstill).toBe(false);
    expect(diag.location).toBe('footer');
    expect(diag.frequency).toBe('medium');
  });

  it('reports mounted=true when #footer-mascot is in the DOM', () => {
    document.body.innerHTML = '<div id="footer-mascot"></div>';
    expect(getMascotDiagnostics().mounted).toBe(true);
    document.body.innerHTML = '';
    expect(getMascotDiagnostics().mounted).toBe(false);
  });
});

describe('claimMascotInit', () => {
  it('returns true the first time, false after', () => {
    const el = document.createElement('div');
    expect(claimMascotInit(el)).toBe(true);
    expect(claimMascotInit(el)).toBe(false);
    expect(claimMascotInit(el)).toBe(false);
  });

  it('treats distinct elements independently', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    expect(claimMascotInit(a)).toBe(true);
    expect(claimMascotInit(b)).toBe(true);
    expect(claimMascotInit(a)).toBe(false);
  });

  it('returns false for null/undefined element', () => {
    expect(claimMascotInit(null)).toBe(false);
    expect(claimMascotInit(undefined)).toBe(false);
  });
});
