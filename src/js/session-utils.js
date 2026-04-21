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
