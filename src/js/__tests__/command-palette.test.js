// Tests for command-palette.js — fuzzy search, action registry

import { fuzzyMatch, registerPaletteAction, getPaletteActions, resetPalette } from '../command-palette.js';

describe('fuzzyMatch', () => {
  it('matches exact substring', () => {
    const result = fuzzyMatch('term', 'New Terminal');
    expect(result).toBeTruthy();
    expect(result.score).toBeGreaterThan(0);
  });

  it('matches characters in order', () => {
    const result = fuzzyMatch('nt', 'New Terminal');
    expect(result).toBeTruthy();
  });

  it('is case insensitive', () => {
    const result = fuzzyMatch('NT', 'new terminal');
    expect(result).toBeTruthy();
  });

  it('returns null for no match', () => {
    const result = fuzzyMatch('xyz', 'New Terminal');
    expect(result).toBeNull();
  });

  it('returns null for empty query', () => {
    const result = fuzzyMatch('', 'New Terminal');
    expect(result).toBeNull();
  });

  it('scores consecutive matches higher', () => {
    const exact = fuzzyMatch('term', 'Terminal');
    const scattered = fuzzyMatch('term', 'Theme for Room');
    expect(exact.score).toBeGreaterThan(scattered.score);
  });
});

describe('palette action registry', () => {
  beforeEach(() => resetPalette());

  it('registers an action', () => {
    registerPaletteAction('test', 'Test Action', null, () => {});
    const actions = getPaletteActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe('test');
    expect(actions[0].label).toBe('Test Action');
  });

  it('prevents duplicate IDs', () => {
    registerPaletteAction('test', 'First', null, () => {});
    registerPaletteAction('test', 'Second', null, () => {});
    const actions = getPaletteActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].label).toBe('Second'); // overwrites
  });

  it('stores shortcut text', () => {
    registerPaletteAction('test', 'Test', 'Cmd+T', () => {});
    expect(getPaletteActions()[0].shortcut).toBe('Cmd+T');
  });

  it('stores action callback', () => {
    const fn = vi.fn();
    registerPaletteAction('test', 'Test', null, fn);
    getPaletteActions()[0].action();
    expect(fn).toHaveBeenCalled();
  });
});
