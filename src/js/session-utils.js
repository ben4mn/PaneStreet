export function getVisibleCount(sessions) {
  return sessions.filter(s => !s.minimized).length;
}

export function findAutoMinimizeTarget(sessions, cap) {
  if (getVisibleCount(sessions) < cap) return -1;
  return sessions.findIndex(s => !s.minimized);
}

export function formatAutoMinimizeMessage(sessionName) {
  return `Auto-minimized "${sessionName}" to make room`;
}

export const SESSION_STATE_VERSION = 4;

export const DEFAULT_SCROLLBACK_LINES = 2000;

export function resolveScrollbackLines(raw) {
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULT_SCROLLBACK_LINES;
}

export function buildSessionStatePayload(snapshot) {
  const payload = {
    version: SESSION_STATE_VERSION,
    layoutMode: snapshot.layoutMode,
    snapToGrid: snapshot.snapToGrid,
    fullscreenAllMode: snapshot.fullscreenAllMode,
    gridSplitRatios: snapshot.gridSplitRatios,
    sessions: snapshot.sessions,
    focused_index: snapshot.focusedIndex,
  };
  if (snapshot.ui) payload.ui = snapshot.ui;
  if (typeof snapshot.maximizedIndex === 'number') {
    payload.maximizedIndex = snapshot.maximizedIndex;
  }
  return payload;
}

export function migrateSessionState(data) {
  if (!data || typeof data !== 'object') return null;
  const v = data.version;
  if (v !== 1 && v !== 2 && v !== 3 && v !== 4) return null;

  const migrated = { ...data, version: SESSION_STATE_VERSION };
  if (!migrated.ui) {
    migrated.ui = {
      sidebarCollapsed: false,
      sidebarWidth: null,
      footerHeight: null,
      activePanels: [],
    };
  }
  return migrated;
}

export function createDebouncedSaver(fn, delayMs) {
  let timer = null;
  return {
    schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    flush() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      fn();
    },
    hasPending() {
      return timer !== null;
    },
  };
}
