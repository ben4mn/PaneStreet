// Red/green TDD for the focus-mode state transitions triggered by
// closing and minimizing panes. Extracted so we can assert without
// standing up the whole app.js monolith.

import { handleClose, handleMinimize } from '../layout-focus-state.js';

describe('handleClose', () => {
  it('is a noop when no pane is maximized', () => {
    const r = handleClose({ maximizedIndex: null, fullscreenAllMode: false, focusedIndex: 2, closedIndex: 1, totalSessions: 3 });
    expect(r).toEqual({ maximizedIndex: null, fullscreenAllMode: false, focusedIndex: 2 });
  });

  it('decrements maximizedIndex when an earlier pane closes', () => {
    const r = handleClose({ maximizedIndex: 2, fullscreenAllMode: true, focusedIndex: 2, closedIndex: 0, totalSessions: 3 });
    expect(r.maximizedIndex).toBe(1);
    expect(r.fullscreenAllMode).toBe(true);
  });

  it('leaves maximizedIndex unchanged when a later pane closes', () => {
    const r = handleClose({ maximizedIndex: 0, fullscreenAllMode: true, focusedIndex: 0, closedIndex: 2, totalSessions: 3 });
    expect(r.maximizedIndex).toBe(0);
    expect(r.fullscreenAllMode).toBe(true);
  });

  it('in focus mode, closing the middle maximized pane promotes the next pane', () => {
    // sessions [0,1,2], close idx 1 (maximized) → after splice [0,2]; new idx 1 should be the old session 2.
    const r = handleClose({ maximizedIndex: 1, fullscreenAllMode: true, focusedIndex: 1, closedIndex: 1, totalSessions: 3 });
    expect(r.maximizedIndex).toBe(1);
    expect(r.focusedIndex).toBe(1);
    expect(r.fullscreenAllMode).toBe(true);
  });

  it('in focus mode, closing the last maximized pane falls back to the previous pane', () => {
    // sessions [0,1,2], close idx 2 (maximized) → [0,1]; new maximized should be 1.
    const r = handleClose({ maximizedIndex: 2, fullscreenAllMode: true, focusedIndex: 2, closedIndex: 2, totalSessions: 3 });
    expect(r.maximizedIndex).toBe(1);
    expect(r.focusedIndex).toBe(1);
    expect(r.fullscreenAllMode).toBe(true);
  });

  it('in focus mode, closing the only pane exits focus mode cleanly', () => {
    const r = handleClose({ maximizedIndex: 0, fullscreenAllMode: true, focusedIndex: 0, closedIndex: 0, totalSessions: 1 });
    expect(r.maximizedIndex).toBe(null);
    expect(r.fullscreenAllMode).toBe(false);
  });

  it('without focus mode, closing the maximized pane clears maximize (legacy behavior)', () => {
    const r = handleClose({ maximizedIndex: 1, fullscreenAllMode: false, focusedIndex: 1, closedIndex: 1, totalSessions: 3 });
    expect(r.maximizedIndex).toBe(null);
    expect(r.fullscreenAllMode).toBe(false);
  });
});

describe('handleMinimize', () => {
  it('is a noop when the minimized pane is not the maximized one', () => {
    const sessions = [{ minimized: false }, { minimized: false }, { minimized: false }];
    const r = handleMinimize({ maximizedIndex: 2, fullscreenAllMode: true, minimizedIndex: 0, sessions });
    expect(r.maximizedIndex).toBe(2);
    expect(r.fullscreenAllMode).toBe(true);
  });

  it('in focus mode, minimizing the maximized pane promotes the next visible pane', () => {
    // All visible, maximize 1, minimize 1 → expect 2 as next (forward wrap).
    const sessions = [{ minimized: false }, { minimized: false }, { minimized: false }];
    const r = handleMinimize({ maximizedIndex: 1, fullscreenAllMode: true, minimizedIndex: 1, sessions });
    expect(r.maximizedIndex).toBe(2);
    expect(r.fullscreenAllMode).toBe(true);
  });

  it('in focus mode, minimizing wraps forward past already-minimized panes', () => {
    // Sessions 0 visible, 1 already minimized, 2 visible. Maximize 2, minimize 2 → wrap to 0.
    const sessions = [{ minimized: false }, { minimized: true }, { minimized: false }];
    const r = handleMinimize({ maximizedIndex: 2, fullscreenAllMode: true, minimizedIndex: 2, sessions });
    expect(r.maximizedIndex).toBe(0);
    expect(r.fullscreenAllMode).toBe(true);
  });

  it('in focus mode, minimizing the last visible pane exits focus mode', () => {
    // Session 0 visible (will be minimized), session 1 already minimized. No visible remain.
    const sessions = [{ minimized: false }, { minimized: true }];
    const r = handleMinimize({ maximizedIndex: 0, fullscreenAllMode: true, minimizedIndex: 0, sessions });
    expect(r.maximizedIndex).toBe(null);
    expect(r.fullscreenAllMode).toBe(false);
  });

  it('without focus mode, minimizing the maximized pane just clears maximize', () => {
    const sessions = [{ minimized: false }, { minimized: false }];
    const r = handleMinimize({ maximizedIndex: 1, fullscreenAllMode: false, minimizedIndex: 1, sessions });
    expect(r.maximizedIndex).toBe(null);
    expect(r.fullscreenAllMode).toBe(false);
  });
});
