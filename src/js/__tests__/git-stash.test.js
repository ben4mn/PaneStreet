// Tests for git stash UI — mock invoke calls

describe('git stash commands', () => {
  it('calls git_stash_list with cwd', async () => {
    mockInvoke.register('git_stash_list', ({ cwd }) => [
      { index: 0, message: 'WIP on main', date: '2024-01-01' },
    ]);

    const result = await globalThis.__TAURI__.core.invoke('git_stash_list', { cwd: '/project' });
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('WIP on main');
  });

  it('calls git_stash_push with message', async () => {
    let called = false;
    mockInvoke.register('git_stash_push', ({ cwd, message }) => {
      called = true;
      expect(cwd).toBe('/project');
      expect(message).toBe('test stash');
      return null;
    });

    await globalThis.__TAURI__.core.invoke('git_stash_push', { cwd: '/project', message: 'test stash' });
    expect(called).toBe(true);
  });

  it('calls git_stash_pop with index', async () => {
    let popIndex = -1;
    mockInvoke.register('git_stash_pop', ({ index }) => { popIndex = index; return null; });

    await globalThis.__TAURI__.core.invoke('git_stash_pop', { cwd: '/project', index: 2 });
    expect(popIndex).toBe(2);
  });

  it('calls git_stash_drop with index', async () => {
    let dropIndex = -1;
    mockInvoke.register('git_stash_drop', ({ index }) => { dropIndex = index; return null; });

    await globalThis.__TAURI__.core.invoke('git_stash_drop', { cwd: '/project', index: 1 });
    expect(dropIndex).toBe(1);
  });
});
