import {
  addNotification,
  removeNotificationsForSession,
  updateSessionName,
  getNotifications,
  clearNotifications,
  getUnreadCount,
  markAllRead,
  resetNotificationManager,
  shouldSendOSNotification,
  getOSNotificationMessage,
  markSessionRead,
  canSendOSNotification,
  resetOSNotificationDebounce,
} from '../notification-manager.js';

describe('notification-manager', () => {
  beforeEach(() => resetNotificationManager());

  describe('addNotification', () => {
    it('stores sessionId, not sessionIndex', () => {
      addNotification('uuid-abc', 'Terminal 1', 'ClaudeFinished');
      const notifs = getNotifications();
      expect(notifs).toHaveLength(1);
      expect(notifs[0].sessionId).toBe('uuid-abc');
      expect(notifs[0].sessionIndex).toBeUndefined();
    });

    it('stores sessionName and status', () => {
      addNotification('uuid-1', 'My Terminal', 'Working');
      const n = getNotifications()[0];
      expect(n.sessionName).toBe('My Terminal');
      expect(n.status).toBe('Working');
    });

    it('adds timestamp', () => {
      addNotification('uuid-1', 'T1', 'Idle');
      expect(getNotifications()[0].timestamp).toBeGreaterThan(0);
    });

    it('prepends newest notifications (most recent first)', () => {
      addNotification('a', 'T1', 'Working');
      addNotification('b', 'T2', 'Idle');
      expect(getNotifications()[0].sessionId).toBe('b');
      expect(getNotifications()[1].sessionId).toBe('a');
    });

    it('caps at 100 entries, dropping oldest', () => {
      for (let i = 0; i < 101; i++) {
        addNotification(`id-${i}`, `T${i}`, 'ClaudeFinished');
      }
      const notifs = getNotifications();
      expect(notifs).toHaveLength(100);
      expect(notifs[notifs.length - 1].sessionId).toBe('id-1');
    });
  });

  describe('removeNotificationsForSession', () => {
    it('removes only that session\'s entries', () => {
      addNotification('uuid-a', 'T1', 'Working');
      addNotification('uuid-a', 'T1', 'Idle');
      addNotification('uuid-b', 'T2', 'Error');
      removeNotificationsForSession('uuid-a');
      const notifs = getNotifications();
      expect(notifs).toHaveLength(1);
      expect(notifs[0].sessionId).toBe('uuid-b');
    });

    it('is a no-op for unknown session', () => {
      addNotification('uuid-a', 'T1', 'Working');
      removeNotificationsForSession('uuid-z');
      expect(getNotifications()).toHaveLength(1);
    });
  });

  describe('updateSessionName', () => {
    it('updates all matching notifications', () => {
      addNotification('uuid-a', 'Terminal 1', 'Working');
      addNotification('uuid-a', 'Terminal 1', 'Idle');
      addNotification('uuid-b', 'Terminal 2', 'Error');
      updateSessionName('uuid-a', 'Renamed');
      const notifs = getNotifications();
      expect(notifs.filter(n => n.sessionName === 'Renamed')).toHaveLength(2);
      expect(notifs.find(n => n.sessionId === 'uuid-b').sessionName).toBe('Terminal 2');
    });
  });

  describe('clearNotifications', () => {
    it('empties everything', () => {
      addNotification('a', 'T1', 'Working');
      addNotification('b', 'T2', 'Idle');
      clearNotifications();
      expect(getNotifications()).toHaveLength(0);
    });
  });

  describe('unread tracking', () => {
    it('increments unread count on add', () => {
      addNotification('a', 'T1', 'Working');
      addNotification('b', 'T2', 'Idle');
      addNotification('c', 'T3', 'Error');
      expect(getUnreadCount()).toBe(3);
    });

    it('markAllRead resets unread count to zero', () => {
      addNotification('a', 'T1', 'Working');
      addNotification('b', 'T2', 'Idle');
      markAllRead();
      expect(getUnreadCount()).toBe(0);
    });

    it('new notifications after markAllRead still count', () => {
      addNotification('a', 'T1', 'Working');
      markAllRead();
      addNotification('b', 'T2', 'Idle');
      expect(getUnreadCount()).toBe(1);
    });

    it('unread count stays accurate after the history cap trims old entries', () => {
      // Pre-bug: unread was a bare counter that kept incrementing past MAX.
      for (let i = 0; i < 150; i++) addNotification(`id-${i}`, `T${i}`, 'ClaudeFinished');
      // History is capped at 100, so unread should at most equal remaining entries.
      expect(getUnreadCount()).toBeLessThanOrEqual(getNotifications().length);
    });

    it('markAllRead stamps entries so count recomputes correctly after re-add', () => {
      addNotification('a', 'T1', 'Working');
      markAllRead();
      // Adding a fresh one should put count back to 1, not carry over stale state.
      addNotification('b', 'T2', 'Idle');
      expect(getUnreadCount()).toBe(1);
      markAllRead();
      expect(getUnreadCount()).toBe(0);
    });

    it('markSessionRead clears unread only for the given session', () => {
      addNotification('a', 'T1', 'Working');
      addNotification('a', 'T1', 'Idle');
      addNotification('b', 'T2', 'Error');
      expect(getUnreadCount()).toBe(3);
      markSessionRead('a');
      expect(getUnreadCount()).toBe(1);
    });
  });

  describe('canSendOSNotification (debounce)', () => {
    beforeEach(() => resetOSNotificationDebounce());

    it('allows the first notification for a session', () => {
      expect(canSendOSNotification('s1', 1000)).toBe(true);
    });

    it('suppresses a second notification within the debounce window', () => {
      canSendOSNotification('s1', 1000);
      expect(canSendOSNotification('s1', 1500)).toBe(false);
    });

    it('allows again after the debounce window elapses', () => {
      canSendOSNotification('s1', 1000);
      expect(canSendOSNotification('s1', 3500)).toBe(true);
    });

    it('tracks different sessions independently', () => {
      canSendOSNotification('s1', 1000);
      expect(canSendOSNotification('s2', 1100)).toBe(true);
    });

    it('accepts a custom window in ms', () => {
      canSendOSNotification('s1', 1000, 500);
      expect(canSendOSNotification('s1', 1300, 500)).toBe(false);
      expect(canSendOSNotification('s1', 1600, 500)).toBe(true);
    });
  });

  describe('shouldSendOSNotification', () => {
    const enabled = { notifications: 'true', 'notify-waiting': 'true', 'notify-error': 'true', 'notify-exited': 'true', 'notify-claude-input': 'true', 'notify-claude-finished': 'true' };

    it('returns true for WaitingForInput when enabled', () => {
      expect(shouldSendOSNotification('WaitingForInput', enabled, false, false)).toBe(true);
    });

    it('returns false for WaitingForInput when toggled off', () => {
      const s = { ...enabled, 'notify-waiting': 'false' };
      expect(shouldSendOSNotification('WaitingForInput', s, false, false)).toBe(false);
    });

    it('returns true for Error when enabled', () => {
      expect(shouldSendOSNotification('Error', enabled, false, false)).toBe(true);
    });

    it('returns true for Exited when enabled', () => {
      expect(shouldSendOSNotification('Exited', enabled, false, false)).toBe(true);
    });

    it('returns true for ClaudeNeedsInput when enabled', () => {
      expect(shouldSendOSNotification('ClaudeNeedsInput', enabled, false, false)).toBe(true);
    });

    it('returns true for ClaudeFinished when enabled', () => {
      expect(shouldSendOSNotification('ClaudeFinished', enabled, false, false)).toBe(true);
    });

    it('returns false when master notifications disabled', () => {
      const s = { ...enabled, notifications: 'false' };
      expect(shouldSendOSNotification('ClaudeFinished', s, false, false)).toBe(false);
      expect(shouldSendOSNotification('Error', s, false, false)).toBe(false);
    });

    it('returns false when isActiveTab AND windowFocused', () => {
      expect(shouldSendOSNotification('ClaudeFinished', enabled, true, true)).toBe(false);
    });

    it('returns true when active tab but window NOT focused', () => {
      expect(shouldSendOSNotification('ClaudeFinished', enabled, true, false)).toBe(true);
    });

    it('returns false for Working (not an attention state)', () => {
      expect(shouldSendOSNotification('Working', enabled, false, false)).toBe(false);
    });

    it('returns false for Idle (not an attention state)', () => {
      expect(shouldSendOSNotification('Idle', enabled, false, false)).toBe(false);
    });
  });

  describe('getOSNotificationMessage', () => {
    it('returns message for each attention status', () => {
      expect(getOSNotificationMessage('WaitingForInput')).toBeTruthy();
      expect(getOSNotificationMessage('Error')).toBeTruthy();
      expect(getOSNotificationMessage('Exited')).toBeTruthy();
      expect(getOSNotificationMessage('ClaudeNeedsInput')).toBeTruthy();
      expect(getOSNotificationMessage('ClaudeFinished')).toBeTruthy();
    });

    it('returns empty string for non-attention statuses', () => {
      expect(getOSNotificationMessage('Working')).toBe('');
      expect(getOSNotificationMessage('Idle')).toBe('');
    });
  });
});
