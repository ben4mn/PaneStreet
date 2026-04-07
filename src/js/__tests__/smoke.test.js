// Smoke test — verifies test infrastructure works

describe('test infrastructure', () => {
  it('has mocked localStorage', () => {
    localStorage.setItem('ps-test', 'hello');
    expect(localStorage.getItem('ps-test')).toBe('hello');
  });

  it('has mocked Tauri invoke', async () => {
    mockInvoke.register('test_cmd', (args) => ({ ok: true, ...args }));
    const result = await globalThis.__TAURI__.core.invoke('test_cmd', { foo: 'bar' });
    expect(result).toEqual({ ok: true, foo: 'bar' });
  });

  it('clears state between tests', () => {
    // localStorage was cleared by beforeEach
    expect(localStorage.getItem('ps-test')).toBeNull();
  });
});
