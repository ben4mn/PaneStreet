import { correlateHookSession, buildHookNotification } from '../hook-utils.js';

describe('correlateHookSession', () => {
  it('returns matching index when sessionId found', () => {
    const sessions = [{ id: 'aaa' }, { id: 'bbb' }, { id: 'ccc' }];
    expect(correlateHookSession('bbb', sessions)).toBe(1);
  });

  it('returns 0 when only one session exists (regardless of ID)', () => {
    const sessions = [{ id: 'xyz' }];
    expect(correlateHookSession('nomatch', sessions)).toBe(0);
  });

  it('returns -1 when no match with multiple sessions', () => {
    const sessions = [{ id: 'aaa' }, { id: 'bbb' }];
    expect(correlateHookSession('zzz', sessions)).toBe(-1);
  });

  it('handles undefined sessionId', () => {
    const sessions = [{ id: 'aaa' }, { id: 'bbb' }];
    expect(correlateHookSession(undefined, sessions)).toBe(-1);
  });

  it('handles null sessionId', () => {
    const sessions = [{ id: 'aaa' }];
    expect(correlateHookSession(null, sessions)).toBe(0);
  });

  it('handles empty sessions array', () => {
    expect(correlateHookSession('abc', [])).toBe(-1);
  });
});

describe('buildHookNotification', () => {
  it('returns notification for Stop event', () => {
    const result = buildHookNotification('Stop', { session_id: 's1', last_message: 'done' });
    expect(result).not.toBeNull();
    expect(result.title).toBeTruthy();
    expect(result.body).toBeTruthy();
  });

  it('returns notification for StopFailure event', () => {
    const result = buildHookNotification('StopFailure', { session_id: 's1', error: 'timeout' });
    expect(result).not.toBeNull();
    expect(result.title).toBeTruthy();
  });

  it('returns null for CwdChanged (informational)', () => {
    expect(buildHookNotification('CwdChanged', { cwd: '/tmp' })).toBeNull();
  });

  it('returns notification for TaskCompleted', () => {
    const result = buildHookNotification('TaskCompleted', { task_name: 'build' });
    expect(result).not.toBeNull();
    expect(result.title).toBeTruthy();
  });

  it('returns null for PreToolUse (silent)', () => {
    expect(buildHookNotification('PreToolUse', { tool: 'bash' })).toBeNull();
  });

  it('returns null for UnknownEvent', () => {
    expect(buildHookNotification('SomeUnknownEvent', {})).toBeNull();
  });

  it('returns notification for Notification event', () => {
    const result = buildHookNotification('Notification', { type: 'permission_prompt', message: 'allow?' });
    expect(result).not.toBeNull();
    expect(result.title).toBeTruthy();
  });

  it('returns notification for SubagentStop event', () => {
    const result = buildHookNotification('SubagentStop', { session_id: 's1' });
    expect(result).not.toBeNull();
  });

  it('returns notification for SessionStart event', () => {
    const result = buildHookNotification('SessionStart', { session_id: 's1' });
    expect(result).not.toBeNull();
  });
});
