const MAX_NOTIFICATIONS = 100;
const DEFAULT_OS_DEBOUNCE_MS = 2000;

let notifications = [];
// Per-session timestamp of last successful OS notification, for debounce gating.
let lastOSNotificationAt = new Map();

export function addNotification(sessionId, sessionName, status) {
  notifications.unshift({
    sessionId,
    sessionName,
    status,
    timestamp: Date.now(),
    read: false,
  });
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.length = MAX_NOTIFICATIONS;
  }
}

export function removeNotificationsForSession(sessionId) {
  notifications = notifications.filter(n => n.sessionId !== sessionId);
}

export function updateSessionName(sessionId, newName) {
  for (const n of notifications) {
    if (n.sessionId === sessionId) n.sessionName = newName;
  }
}

export function getNotifications() {
  return notifications;
}

export function clearNotifications() {
  notifications = [];
}

export function getUnreadCount() {
  let n = 0;
  for (const entry of notifications) {
    if (!entry.read) n++;
  }
  return n;
}

export function markAllRead() {
  for (const entry of notifications) entry.read = true;
}

export function markSessionRead(sessionId) {
  for (const entry of notifications) {
    if (entry.sessionId === sessionId) entry.read = true;
  }
}

export function resetNotificationManager() {
  notifications = [];
  lastOSNotificationAt = new Map();
}

// Gate OS notifications on a per-session debounce so quick hook bursts
// (e.g. Stop immediately followed by Notification) collapse to one toast.
// Accepts the current timestamp so tests don't depend on wall-clock time.
export function canSendOSNotification(sessionId, now = Date.now(), windowMs = DEFAULT_OS_DEBOUNCE_MS) {
  const last = lastOSNotificationAt.get(sessionId);
  if (last !== undefined && now - last < windowMs) return false;
  lastOSNotificationAt.set(sessionId, now);
  return true;
}

export function resetOSNotificationDebounce() {
  lastOSNotificationAt = new Map();
}

const NOTIFICATION_STATUSES = {
  WaitingForInput:  { toggle: 'notify-waiting',         message: 'Needs your attention' },
  NeedsPermission:  { toggle: 'notify-waiting',         message: 'Needs permission' },
  ClaudeNeedsInput: { toggle: 'notify-claude-input',    message: 'Claude needs your input' },
  ClaudeFinished:   { toggle: 'notify-claude-finished',  message: 'Claude finished' },
  Error:            { toggle: 'notify-error',            message: 'Something went wrong' },
  Exited:           { toggle: 'notify-exited',           message: 'Session exited' },
};

export function shouldSendOSNotification(status, settings, isActiveTab, windowFocused) {
  if (settings.notifications === 'false') return false;
  if (isActiveTab && windowFocused) return false;
  const entry = NOTIFICATION_STATUSES[status];
  if (!entry) return false;
  if (settings[entry.toggle] === 'false') return false;
  return true;
}

export function getOSNotificationMessage(status) {
  return NOTIFICATION_STATUSES[status]?.message || '';
}
