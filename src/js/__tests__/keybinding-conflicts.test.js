// R/G TDD for keybinding conflict detection. Given an array of
// bindings ({ id, key, meta, shift, alt, ctrl }), return the set of
// collisions so the UI can warn before the user saves broken state.

import { findKeybindingConflicts, formatShortcut } from '../keybinding-conflicts.js';

describe('findKeybindingConflicts', () => {
  it('returns no conflicts for an empty binding set', () => {
    expect(findKeybindingConflicts([])).toEqual([]);
  });

  it('returns no conflicts for unique bindings', () => {
    const bindings = [
      { id: 'a', key: 'f', meta: true, shift: true },
      { id: 'b', key: 'g', meta: true, shift: true },
    ];
    expect(findKeybindingConflicts(bindings)).toEqual([]);
  });

  it('detects a simple duplicate', () => {
    const bindings = [
      { id: 'focus', key: 'f', meta: true, shift: true },
      { id: 'find',  key: 'f', meta: true, shift: true },
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].ids.sort()).toEqual(['find', 'focus']);
  });

  it('treats different modifier combos as different shortcuts', () => {
    const bindings = [
      { id: 'a', key: 'f', meta: true, shift: true },
      { id: 'b', key: 'f', meta: true, shift: false },
    ];
    expect(findKeybindingConflicts(bindings)).toEqual([]);
  });

  it('reports the shared shortcut in a human-readable form', () => {
    const bindings = [
      { id: 'focus', key: 'f', meta: true, shift: true },
      { id: 'find',  key: 'f', meta: true, shift: true },
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts[0].shortcut).toMatch(/f/i);
  });

  it('groups three-way collisions into a single entry', () => {
    const bindings = [
      { id: 'a', key: 'k', meta: true },
      { id: 'b', key: 'k', meta: true },
      { id: 'c', key: 'k', meta: true },
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores bindings without a key (unbound actions)', () => {
    const bindings = [
      { id: 'a', key: null },
      { id: 'b' },
      { id: 'c', key: 'f', meta: true, shift: true },
    ];
    expect(findKeybindingConflicts(bindings)).toEqual([]);
  });

  it('is case-insensitive on the key', () => {
    const bindings = [
      { id: 'a', key: 'F', meta: true, shift: true },
      { id: 'b', key: 'f', meta: true, shift: true },
    ];
    const conflicts = findKeybindingConflicts(bindings);
    expect(conflicts).toHaveLength(1);
  });
});

describe('formatShortcut', () => {
  it('produces a display string with modifiers in conventional order', () => {
    expect(formatShortcut({ key: 'f', meta: true, shift: true })).toBe('Cmd+Shift+F');
  });

  it('handles ctrl and alt', () => {
    expect(formatShortcut({ key: 'k', ctrl: true, alt: true })).toBe('Ctrl+Alt+K');
  });

  it('uppercases single letters', () => {
    expect(formatShortcut({ key: 'a', meta: true })).toBe('Cmd+A');
  });

  it('leaves multi-char keys as-is (Enter, Tab, Arrow keys)', () => {
    expect(formatShortcut({ key: 'Enter', meta: true, shift: true })).toBe('Cmd+Shift+Enter');
  });

  it('returns empty string for a null key', () => {
    expect(formatShortcut({ key: null, meta: true })).toBe('');
  });
});
