// Tests for notification grouping logic

// The groupNotifications function will be extracted to a shared module
import { groupNotifications } from '../notification-utils.js';

describe('groupNotifications', () => {
  it('returns empty array for empty input', () => {
    expect(groupNotifications([])).toEqual([]);
  });

  it('does not group single notification', () => {
    const result = groupNotifications([
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 1000 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
  });

  it('groups consecutive same-session same-status notifications', () => {
    const result = groupNotifications([
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 1000 },
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 1001 },
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 1002 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].timestamps).toEqual([1000, 1001, 1002]);
  });

  it('does not group different statuses', () => {
    const result = groupNotifications([
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 1000 },
      { sessionName: 'T1', status: 'WaitingForInput', sessionId: 0, timestamp: 1001 },
    ]);
    expect(result).toHaveLength(2);
  });

  it('does not group different sessions', () => {
    const result = groupNotifications([
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 1000 },
      { sessionName: 'T2', status: 'ClaudeFinished', sessionId: 1, timestamp: 1001 },
    ]);
    expect(result).toHaveLength(2);
  });

  it('handles mixed groups correctly', () => {
    const result = groupNotifications([
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 1 },
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 2 },
      { sessionName: 'T2', status: 'WaitingForInput', sessionId: 1, timestamp: 3 },
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 4 },
      { sessionName: 'T1', status: 'ClaudeFinished', sessionId: 0, timestamp: 5 },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].count).toBe(2);
    expect(result[1].count).toBe(1);
    expect(result[2].count).toBe(2);
  });
});
