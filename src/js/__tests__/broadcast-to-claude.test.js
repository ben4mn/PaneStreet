// R/G TDD for broadcasting a prompt to all Claude-attached panes.
// Pure selection + dispatch logic — the actual terminal write happens via a
// callback the caller provides, so tests stay decoupled from Tauri/xterm.

import { selectBroadcastTargets, broadcastToClaudePanes } from '../broadcast-to-claude.js';

describe('selectBroadcastTargets', () => {
  it('returns empty array when no sessions exist', () => {
    expect(selectBroadcastTargets([])).toEqual([]);
  });

  it('includes only panes flagged as claudeAttached', () => {
    const sessions = [
      { id: 'a', claudeAttached: true, minimized: false },
      { id: 'b', claudeAttached: false, minimized: false },
      { id: 'c', claudeAttached: true, minimized: false },
    ];
    const targets = selectBroadcastTargets(sessions);
    expect(targets.map(s => s.id)).toEqual(['a', 'c']);
  });

  it('skips minimized panes by default', () => {
    const sessions = [
      { id: 'a', claudeAttached: true, minimized: false },
      { id: 'b', claudeAttached: true, minimized: true },
    ];
    expect(selectBroadcastTargets(sessions).map(s => s.id)).toEqual(['a']);
  });

  it('allows including minimized panes via opts.includeMinimized', () => {
    const sessions = [
      { id: 'a', claudeAttached: true, minimized: false },
      { id: 'b', claudeAttached: true, minimized: true },
    ];
    const targets = selectBroadcastTargets(sessions, { includeMinimized: true });
    expect(targets.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('excludes panes with a status in the exclude set', () => {
    const sessions = [
      { id: 'a', claudeAttached: true, minimized: false, status: 'Working' },
      { id: 'b', claudeAttached: true, minimized: false, status: 'Exited' },
      { id: 'c', claudeAttached: true, minimized: false, status: 'Error' },
    ];
    const targets = selectBroadcastTargets(sessions);
    expect(targets.map(s => s.id)).toEqual(['a']);
  });

  it('never includes a pane without an id (defensive)', () => {
    const sessions = [
      { claudeAttached: true, minimized: false },
      { id: 'b', claudeAttached: true, minimized: false },
    ];
    expect(selectBroadcastTargets(sessions).map(s => s.id)).toEqual(['b']);
  });
});

describe('broadcastToClaudePanes', () => {
  function mkSession(id, overrides = {}) {
    return { id, claudeAttached: true, minimized: false, status: 'Working', ...overrides };
  }

  it('invokes the write callback once per eligible target', async () => {
    const sessions = [mkSession('a'), mkSession('b', { claudeAttached: false }), mkSession('c')];
    const writes = [];
    const write = (sessionId, text) => { writes.push({ sessionId, text }); };
    await broadcastToClaudePanes(sessions, 'hello claude', write);
    expect(writes).toEqual([
      { sessionId: 'a', text: 'hello claude\r' },
      { sessionId: 'c', text: 'hello claude\r' },
    ]);
  });

  it('returns a summary with counts of targeted and skipped', async () => {
    const sessions = [mkSession('a'), mkSession('b', { claudeAttached: false })];
    const result = await broadcastToClaudePanes(sessions, 'x', () => {});
    expect(result.targeted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.targetIds).toEqual(['a']);
  });

  it('appends a newline so Claude actually submits the prompt', async () => {
    const writes = [];
    await broadcastToClaudePanes([mkSession('a')], 'hi', (id, t) => writes.push(t));
    expect(writes[0]).toBe('hi\r');
  });

  it('does not double-append newline if caller already included one', async () => {
    const writes = [];
    await broadcastToClaudePanes([mkSession('a')], 'hi\r', (id, t) => writes.push(t));
    expect(writes[0]).toBe('hi\r');
  });

  it('rejects empty or whitespace-only prompts without calling write', async () => {
    const writes = [];
    const result = await broadcastToClaudePanes([mkSession('a')], '   ', (id, t) => writes.push(t));
    expect(writes).toEqual([]);
    expect(result.targeted).toBe(0);
    expect(result.error).toBeTruthy();
  });

  it('continues broadcasting even if one write throws', async () => {
    const writes = [];
    const write = (id, t) => {
      if (id === 'a') throw new Error('boom');
      writes.push({ id, t });
    };
    const result = await broadcastToClaudePanes([mkSession('a'), mkSession('b')], 'hi', write);
    expect(writes).toEqual([{ id: 'b', t: 'hi\r' }]);
    expect(result.failed).toEqual(['a']);
  });
});
