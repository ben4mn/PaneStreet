import { correlateHookSession, buildHookNotification, snippet } from '../hook-utils.js';

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

describe('snippet', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(snippet(null)).toBe('');
    expect(snippet(undefined)).toBe('');
    expect(snippet('')).toBe('');
  });

  it('returns the full text when shorter than max', () => {
    expect(snippet('short reply')).toBe('short reply');
  });

  it('splits on the first sentence-ending punctuation', () => {
    expect(snippet('All done. Ready for more.')).toBe('All done');
    expect(snippet('Wait! I see a problem.')).toBe('Wait');
    expect(snippet('Is that right? Let me check.')).toBe('Is that right');
  });

  it('truncates with an ellipsis past the max length', () => {
    const long = 'a'.repeat(80);
    const out = snippet(long, 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith('…')).toBe(true);
  });

  it('trims surrounding whitespace', () => {
    expect(snippet('   padded text   ')).toBe('padded text');
  });

  it('coerces non-string input to string safely', () => {
    expect(snippet(42)).toBe('42');
  });
});

describe('mascotQuip propagation', () => {
  it('uses Claude last_message snippet as mascotQuip on Stop', () => {
    const result = buildHookNotification('Stop', { last_message: 'Refactored the file tree. Tests green.' });
    expect(result.mascotQuip).toBe('Refactored the file tree');
  });

  it('falls back to default quip when last_message is empty', () => {
    const result = buildHookNotification('Stop', { last_message: '' });
    expect(result.mascotQuip).toBe('All done.');
  });

  it('uses message snippet on Notification event', () => {
    const result = buildHookNotification('Notification', { message: 'Allow access to file?' });
    expect(result.mascotQuip).toBe('Allow access to file');
  });

  it('falls back to permission-prompt quip when message empty', () => {
    const result = buildHookNotification('Notification', { type: 'permission_prompt', message: '' });
    expect(result.mascotQuip).toBe('Approval needed.');
  });

  it('uses error snippet on StopFailure', () => {
    const result = buildHookNotification('StopFailure', { error: 'Out of context window. Consider /compact.' });
    expect(result.mascotQuip).toBe('Out of context window');
  });
});
