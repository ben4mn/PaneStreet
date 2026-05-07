// Pure state transitions for the focus-mode / maximized-pane layout state.
// Kept dependency-free so the state machine can be tested without the DOM.

export function handleClose({ maximizedIndex, fullscreenAllMode, focusedIndex, closedIndex, totalSessions }) {
  if (maximizedIndex === null || maximizedIndex === undefined) {
    return { maximizedIndex: null, fullscreenAllMode, focusedIndex };
  }

  if (maximizedIndex === closedIndex) {
    if (fullscreenAllMode && totalSessions > 1) {
      const nextIdx = Math.min(closedIndex, totalSessions - 2);
      return { maximizedIndex: nextIdx, fullscreenAllMode: true, focusedIndex: nextIdx };
    }
    return { maximizedIndex: null, fullscreenAllMode: false, focusedIndex };
  }

  if (maximizedIndex > closedIndex) {
    return { maximizedIndex: maximizedIndex - 1, fullscreenAllMode, focusedIndex };
  }

  return { maximizedIndex, fullscreenAllMode, focusedIndex };
}

export function handleMinimize({ maximizedIndex, fullscreenAllMode, minimizedIndex, sessions }) {
  if (maximizedIndex !== minimizedIndex) {
    return { maximizedIndex, fullscreenAllMode };
  }

  if (!fullscreenAllMode) {
    return { maximizedIndex: null, fullscreenAllMode: false };
  }

  const n = sessions.length;
  for (let step = 1; step < n; step++) {
    const candidate = (minimizedIndex + step) % n;
    if (candidate === minimizedIndex) continue;
    if (!sessions[candidate].minimized) {
      return { maximizedIndex: candidate, fullscreenAllMode: true };
    }
  }

  return { maximizedIndex: null, fullscreenAllMode: false };
}
