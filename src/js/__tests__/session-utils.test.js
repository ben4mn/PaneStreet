import { findAutoMinimizeTarget, formatAutoMinimizeMessage, getVisibleCount, createDebouncedSaver, migrateSessionState, buildSessionStatePayload, resolveScrollbackLines } from '../session-utils.js';

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

describe('createDebouncedSaver', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('collapses many schedule calls into a single fn invocation', () => {
    const fn = vi.fn();
    const saver = createDebouncedSaver(fn, 300);
    for (let i = 0; i < 10; i++) saver.schedule();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on each schedule call', () => {
    const fn = vi.fn();
    const saver = createDebouncedSaver(fn, 300);
    saver.schedule();
    vi.advanceTimersByTime(200);
    saver.schedule();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() fires immediately and cancels pending timer', () => {
    const fn = vi.fn();
    const saver = createDebouncedSaver(fn, 300);
    saver.schedule();
    saver.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() with no pending schedule is a no-op', () => {
    const fn = vi.fn();
    const saver = createDebouncedSaver(fn, 300);
    saver.flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('hasPending reports whether a save is scheduled', () => {
    const fn = vi.fn();
    const saver = createDebouncedSaver(fn, 300);
    expect(saver.hasPending()).toBe(false);
    saver.schedule();
    expect(saver.hasPending()).toBe(true);
    saver.flush();
    expect(saver.hasPending()).toBe(false);
  });
});

describe('buildSessionStatePayload', () => {
  it('includes version 4 and all UI state fields', () => {
    const payload = buildSessionStatePayload({
      layoutMode: 'auto',
      snapToGrid: true,
      fullscreenAllMode: false,
      gridSplitRatios: { '2x1': 0.5 },
      sessions: [{ name: 'a', cwd: '/tmp', minimized: false, freeformRect: null, scrollback: 'hi', fontSize: 14 }],
      focusedIndex: 0,
      ui: {
        sidebarCollapsed: true,
        sidebarWidth: 260,
        footerHeight: 120,
        activePanels: ['git'],
      },
    });
    expect(payload.version).toBe(4);
    expect(payload.ui.sidebarCollapsed).toBe(true);
    expect(payload.ui.sidebarWidth).toBe(260);
    expect(payload.ui.footerHeight).toBe(120);
    expect(payload.ui.activePanels).toEqual(['git']);
    expect(payload.sessions[0].fontSize).toBe(14);
  });

  it('omits ui block when snapshot.ui is absent but still writes v4', () => {
    const payload = buildSessionStatePayload({
      layoutMode: 'auto',
      snapToGrid: true,
      fullscreenAllMode: false,
      gridSplitRatios: {},
      sessions: [],
      focusedIndex: 0,
    });
    expect(payload.version).toBe(4);
    expect(payload.ui).toBeUndefined();
  });

  it('persists maximizedIndex when provided', () => {
    const payload = buildSessionStatePayload({
      layoutMode: 'auto',
      snapToGrid: true,
      fullscreenAllMode: true,
      maximizedIndex: 2,
      gridSplitRatios: {},
      sessions: [],
      focusedIndex: 2,
    });
    expect(payload.maximizedIndex).toBe(2);
  });

  it('omits maximizedIndex when null', () => {
    const payload = buildSessionStatePayload({
      layoutMode: 'auto',
      snapToGrid: true,
      fullscreenAllMode: false,
      maximizedIndex: null,
      gridSplitRatios: {},
      sessions: [],
      focusedIndex: 0,
    });
    expect(payload.maximizedIndex).toBeUndefined();
  });
});

describe('migrateSessionState', () => {
  it('v4 file passes through unchanged', () => {
    const v4 = {
      version: 4,
      layoutMode: 'auto',
      snapToGrid: true,
      sessions: [{ name: 'a' }],
      ui: { sidebarCollapsed: true, sidebarWidth: 300, footerHeight: 100, activePanels: [] },
    };
    const migrated = migrateSessionState(v4);
    expect(migrated.version).toBe(4);
    expect(migrated.ui.sidebarCollapsed).toBe(true);
  });

  it('v3 file gets sensible defaults for ui block and fontSize', () => {
    const v3 = {
      version: 3,
      layoutMode: 'auto',
      snapToGrid: true,
      fullscreenAllMode: false,
      sessions: [{ name: 'a', cwd: '/tmp', minimized: false, freeformRect: null, scrollback: '' }],
    };
    const migrated = migrateSessionState(v3);
    expect(migrated.version).toBe(4);
    expect(migrated.ui).toBeDefined();
    expect(migrated.ui.sidebarCollapsed).toBe(false);
    expect(migrated.ui.activePanels).toEqual([]);
    expect(migrated.sessions[0].fontSize).toBeUndefined();
  });

  it('v2 file is also accepted and migrated to v4', () => {
    const v2 = { version: 2, layoutMode: 'auto', snapToGrid: true, sessions: [] };
    const migrated = migrateSessionState(v2);
    expect(migrated.version).toBe(4);
  });

  it('returns null for unrecognized version', () => {
    expect(migrateSessionState({ version: 99 })).toBeNull();
  });

  it('returns null for malformed data', () => {
    expect(migrateSessionState(null)).toBeNull();
    expect(migrateSessionState('not an object')).toBeNull();
  });
});

describe('resolveScrollbackLines', () => {
  it('defaults to 2000 when no override', () => {
    expect(resolveScrollbackLines(null)).toBe(2000);
    expect(resolveScrollbackLines(undefined)).toBe(2000);
    expect(resolveScrollbackLines('')).toBe(2000);
  });

  it('honors a valid numeric override', () => {
    expect(resolveScrollbackLines('500')).toBe(500);
    expect(resolveScrollbackLines('10000')).toBe(10000);
  });

  it('ignores non-numeric or non-positive overrides', () => {
    expect(resolveScrollbackLines('abc')).toBe(2000);
    expect(resolveScrollbackLines('0')).toBe(2000);
    expect(resolveScrollbackLines('-100')).toBe(2000);
  });
});
