const MAX_NOTIFICATIONS = 100;

let notifications = [];
let unreadCount = 0;

export function addNotification(sessionId, sessionName, status) {
  notifications.unshift({
    sessionId,
    sessionName,
    status,
    timestamp: Date.now(),
  });
  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.length = MAX_NOTIFICATIONS;
  }
  unreadCount++;
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
  unreadCount = 0;
}

export function getUnreadCount() {
  return unreadCount;
}

export function markAllRead() {
  unreadCount = 0;
}

export function resetNotificationManager() {
  notifications = [];
  unreadCount = 0;
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
