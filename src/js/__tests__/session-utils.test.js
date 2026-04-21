import { findAutoMinimizeTarget, formatAutoMinimizeMessage, getVisibleCount } from '../session-utils.js';

describe('findAutoMinimizeTarget', () => {
  it('returns index of oldest visible when at cap', () => {
    const sessions = [
      { minimized: false }, { minimized: false }, { minimized: false },
      { minimized: false }, { minimized: false }, { minimized: false },
    ];
    expect(findAutoMinimizeTarget(sessions, 6)).toBe(0);
  });

  it('skips minimized sessions to find oldest visible', () => {
    const sessions = [
      { minimized: true }, { minimized: false }, { minimized: false },
      { minimized: false }, { minimized: false }, { minimized: false },
      { minimized: false },
    ];
    expect(findAutoMinimizeTarget(sessions, 6)).toBe(1);
  });

  it('returns -1 when under cap', () => {
    const sessions = [
      { minimized: false }, { minimized: false }, { minimized: false },
    ];
    expect(findAutoMinimizeTarget(sessions, 6)).toBe(-1);
  });

  it('returns -1 when all are minimized', () => {
    const sessions = [
      { minimized: true }, { minimized: true }, { minimized: true },
      { minimized: true }, { minimized: true }, { minimized: true },
    ];
    expect(findAutoMinimizeTarget(sessions, 6)).toBe(-1);
  });

  it('returns -1 for empty sessions array', () => {
    expect(findAutoMinimizeTarget([], 6)).toBe(-1);
  });

  it('respects a custom cap value', () => {
    const sessions = [
      { minimized: false }, { minimized: false }, { minimized: false }, { minimized: false },
    ];
    expect(findAutoMinimizeTarget(sessions, 4)).toBe(0);
    expect(findAutoMinimizeTarget(sessions, 5)).toBe(-1);
  });
});

describe('formatAutoMinimizeMessage', () => {
  it('returns a toast string containing the session name', () => {
    const msg = formatAutoMinimizeMessage('Terminal 3');
    expect(msg).toContain('Terminal 3');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('works with unusual names', () => {
    const msg = formatAutoMinimizeMessage('My <Special> Session');
    expect(msg).toContain('My <Special> Session');
  });
});

describe('getVisibleCount', () => {
  it('counts non-minimized sessions', () => {
    const sessions = [
      { minimized: false }, { minimized: true }, { minimized: false },
    ];
    expect(getVisibleCount(sessions)).toBe(2);
  });

  it('returns 0 when all minimized', () => {
    const sessions = [{ minimized: true }, { minimized: true }];
    expect(getVisibleCount(sessions)).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(getVisibleCount([])).toBe(0);
  });
});
