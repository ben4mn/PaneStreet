// Comprehensive cross-feature integration tests

import { fuzzyMatch, registerPaletteAction, getPaletteActions, resetPalette } from '../command-palette.js';
import { getProfiles, saveProfile, deleteProfile, resetProfiles } from '../session-profiles.js';
import { getSnapshots, saveSnapshot, deleteSnapshot, resetSnapshots } from '../layout-snapshots.js';
import { groupNotifications } from '../notification-utils.js';
import { buildMascotSVG } from '../dock-icon.js';
import { isImageFile, getImageMimeType } from '../file-preview-utils.js';
import { buildSplitDiffLines } from '../diff-viewer.js';

// --- Fuzzy Match edge cases ---
describe('fuzzyMatch edge cases', () => {
  it('handles single character queries', () => {
    expect(fuzzyMatch('n', 'New Terminal')).toBeTruthy();
    expect(fuzzyMatch('z', 'New Terminal')).toBeNull();
  });

  it('handles query longer than label', () => {
    expect(fuzzyMatch('abcdefghij', 'abc')).toBeNull();
  });

  it('handles special characters in labels', () => {
    expect(fuzzyMatch('cmd', 'Cmd+Shift+N')).toBeTruthy();
  });

  it('ranks prefix matches higher', () => {
    const prefix = fuzzyMatch('ne', 'New Terminal');
    const middle = fuzzyMatch('ne', 'Rename Session');
    expect(prefix.score).toBeGreaterThan(middle.score);
  });
});

// --- Profile edge cases ---
describe('session profile edge cases', () => {
  beforeEach(() => resetProfiles());

  it('handles empty name gracefully', () => {
    saveProfile({ name: '', cwd: '/tmp' });
    expect(getProfiles()[0].name).toBe('Untitled');
  });

  it('handles multiple profiles', () => {
    saveProfile({ name: 'A' });
    saveProfile({ name: 'B' });
    saveProfile({ name: 'C' });
    expect(getProfiles()).toHaveLength(3);
  });

  it('deleting non-existent profile is a no-op', () => {
    saveProfile({ name: 'Exists' });
    deleteProfile('NonExistent');
    expect(getProfiles()).toHaveLength(1);
  });

  it('preserves autoStartClaude flag', () => {
    saveProfile({ name: 'Claude', autoStartClaude: true });
    expect(getProfiles()[0].autoStartClaude).toBe(true);
  });
});

// --- Layout snapshot edge cases ---
describe('layout snapshot edge cases', () => {
  beforeEach(() => resetSnapshots());

  it('handles complex session state', () => {
    saveSnapshot('Complex', {
      layoutMode: 'freeform',
      gridSplitRatios: { 2: { cols: ['50%', '50%'] } },
      sessions: [
        { cwd: '/a', minimized: false, freeformRect: { x: 0, y: 0, width: 50, height: 50 } },
        { cwd: '/b', minimized: true, freeformRect: null },
      ],
    });
    const snap = getSnapshots()[0];
    expect(snap.state.sessions).toHaveLength(2);
    expect(snap.state.gridSplitRatios[2].cols).toEqual(['50%', '50%']);
  });

  it('stores multiple snapshots', () => {
    saveSnapshot('One', { layoutMode: 'auto' });
    saveSnapshot('Two', { layoutMode: 'freeform' });
    saveSnapshot('Three', { layoutMode: 'auto' });
    expect(getSnapshots()).toHaveLength(3);
  });
});

// --- Notification grouping edge cases ---
describe('notification grouping edge cases', () => {
  it('handles very long sequences', () => {
    const history = Array.from({ length: 100 }, (_, i) => ({
      sessionName: 'T1', status: 'ClaudeFinished', sessionIndex: 0, timestamp: i,
    }));
    const result = groupNotifications(history);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(100);
    expect(result[0].timestamps).toHaveLength(100);
  });

  it('handles alternating sessions', () => {
    const history = Array.from({ length: 6 }, (_, i) => ({
      sessionName: i % 2 === 0 ? 'T1' : 'T2',
      status: 'ClaudeFinished',
      sessionIndex: i % 2,
      timestamp: i,
    }));
    const result = groupNotifications(history);
    expect(result).toHaveLength(6); // no consecutive duplicates
  });
});

// --- Dock icon SVG edge cases ---
describe('dock icon SVG edge cases', () => {
  it('handles hex colors with uppercase', () => {
    const svg = buildMascotSVG({ '--accent': '#FF00FF' });
    expect(svg).toContain('#FF00FF');
  });

  it('produces consistent output for same input', () => {
    const colors = { '--accent': '#abc', '--text-secondary': '#def', '--text-muted': '#123', '--bg-pane': '#456' };
    const svg1 = buildMascotSVG(colors);
    const svg2 = buildMascotSVG(colors);
    expect(svg1).toBe(svg2);
  });
});

// --- Image detection edge cases ---
describe('image detection edge cases', () => {
  it('handles files with no extension', () => {
    expect(isImageFile('Makefile')).toBe(false);
  });

  it('handles dotfiles', () => {
    expect(isImageFile('.gitignore')).toBe(false);
  });

  it('handles multiple dots in filename', () => {
    expect(isImageFile('my.photo.backup.png')).toBe(true);
  });

  it('handles bmp and ico', () => {
    expect(isImageFile('icon.ico')).toBe(true);
    expect(isImageFile('image.bmp')).toBe(true);
  });

  it('returns correct MIME for bmp', () => {
    expect(getImageMimeType('file.bmp')).toBe('image/bmp');
  });
});

// --- Split diff edge cases ---
describe('split diff edge cases', () => {
  it('handles multiple hunks', () => {
    const { left, right } = buildSplitDiffLines([
      { lines: [{ kind: 'context', content: 'a', old_lineno: 1, new_lineno: 1 }] },
      { lines: [{ kind: 'addition', content: 'b', old_lineno: null, new_lineno: 5 }] },
    ]);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
  });

  it('handles consecutive deletions', () => {
    const { left, right } = buildSplitDiffLines([{
      lines: [
        { kind: 'deletion', content: 'a', old_lineno: 1, new_lineno: null },
        { kind: 'deletion', content: 'b', old_lineno: 2, new_lineno: null },
        { kind: 'deletion', content: 'c', old_lineno: 3, new_lineno: null },
      ],
    }]);
    expect(left).toHaveLength(3);
    expect(left.every(l => l.kind === 'deletion')).toBe(true);
    expect(right.every(r => r.kind === 'placeholder')).toBe(true);
  });

  it('handles consecutive additions', () => {
    const { left, right } = buildSplitDiffLines([{
      lines: [
        { kind: 'addition', content: 'x', old_lineno: null, new_lineno: 1 },
        { kind: 'addition', content: 'y', old_lineno: null, new_lineno: 2 },
      ],
    }]);
    expect(right).toHaveLength(2);
    expect(right.every(r => r.kind === 'addition')).toBe(true);
    expect(left.every(l => l.kind === 'placeholder')).toBe(true);
  });

  it('preserves line numbers', () => {
    const { left, right } = buildSplitDiffLines([{
      lines: [
        { kind: 'context', content: 'x', old_lineno: 10, new_lineno: 15 },
      ],
    }]);
    expect(left[0].lineno).toBe(10);
    expect(right[0].lineno).toBe(15);
  });
});
