import { computeCardData, shouldPatchCard, diffCards } from '../sidebar-utils.js';

describe('computeCardData', () => {
  it('returns correct structure for a session', () => {
    const session = { id: 'abc', name: 'Terminal 1', cwd: '/Users/bob/projects/my-app', minimized: false, status: 'Working' };
    const card = computeCardData(session);
    expect(card.id).toBe('abc');
    expect(card.name).toBe('Terminal 1');
    expect(card.status).toBe('Working');
    expect(card.minimized).toBe(false);
    expect(card.shortCwd).toBeDefined();
  });

  it('shortens long CWDs to last two segments', () => {
    const session = { id: 'x', name: 'T', cwd: '/Users/bob/Documents/projects/my-app', minimized: false, status: 'Idle' };
    const card = computeCardData(session);
    expect(card.shortCwd).toBe('projects/my-app');
  });

  it('keeps short CWDs intact', () => {
    const session = { id: 'x', name: 'T', cwd: '/tmp', minimized: false, status: 'Idle' };
    const card = computeCardData(session);
    expect(card.shortCwd).toBe('/tmp');
  });

  it('handles empty cwd', () => {
    const session = { id: 'x', name: 'T', cwd: '', minimized: false, status: 'Idle' };
    const card = computeCardData(session);
    expect(card.shortCwd).toBe('');
  });

  it('handles home-only cwd', () => {
    const session = { id: 'x', name: 'T', cwd: '~', minimized: false, status: 'Idle' };
    const card = computeCardData(session);
    expect(card.shortCwd).toBe('~');
  });
});

describe('shouldPatchCard', () => {
  const base = { id: 'a', name: 'T1', status: 'Working', minimized: false, shortCwd: 'my-app' };

  it('returns false when cards are identical', () => {
    expect(shouldPatchCard(base, { ...base })).toBe(false);
  });

  it('returns true when name changes', () => {
    expect(shouldPatchCard(base, { ...base, name: 'Renamed' })).toBe(true);
  });

  it('returns true when status changes', () => {
    expect(shouldPatchCard(base, { ...base, status: 'Idle' })).toBe(true);
  });

  it('returns true when minimized changes', () => {
    expect(shouldPatchCard(base, { ...base, minimized: true })).toBe(true);
  });

  it('returns true when cwd changes', () => {
    expect(shouldPatchCard(base, { ...base, shortCwd: 'other-app' })).toBe(true);
  });
});

describe('diffCards', () => {
  const a = { id: '1', name: 'T1', status: 'Working', minimized: false, shortCwd: 'app' };
  const b = { id: '2', name: 'T2', status: 'Idle', minimized: false, shortCwd: 'lib' };
  const c = { id: '3', name: 'T3', status: 'Error', minimized: true, shortCwd: 'cli' };

  it('returns empty array when nothing changed', () => {
    expect(diffCards([a, b], [{ ...a }, { ...b }])).toEqual([]);
  });

  it('returns indices of changed cards', () => {
    const bChanged = { ...b, status: 'Working' };
    expect(diffCards([a, b, c], [{ ...a }, bChanged, { ...c }])).toEqual([1]);
  });

  it('returns all indices when lists differ in length', () => {
    expect(diffCards([a], [a, b])).toEqual([0, 1]);
  });

  it('handles empty old list', () => {
    expect(diffCards([], [a, b])).toEqual([0, 1]);
  });

  it('handles empty new list', () => {
    expect(diffCards([a, b], [])).toEqual([]);
  });
});
