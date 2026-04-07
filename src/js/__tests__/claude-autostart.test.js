// Tests for Claude auto-start setting

describe('Claude auto-start', () => {
  it('ps-claude-autostart defaults to not set', () => {
    expect(localStorage.getItem('ps-claude-autostart')).toBeNull();
  });

  it('stores setting in localStorage', () => {
    localStorage.setItem('ps-claude-autostart', 'true');
    expect(localStorage.getItem('ps-claude-autostart')).toBe('true');
  });

  it('can be disabled', () => {
    localStorage.setItem('ps-claude-autostart', 'false');
    expect(localStorage.getItem('ps-claude-autostart')).toBe('false');
  });
});
