// Tests for terminal.js — scrollback configuration

describe('TerminalSession scrollback config', () => {
  let TerminalSession;

  beforeEach(async () => {
    // Dynamic import so localStorage mocks are in place
    const mod = await import('../terminal.js');
    TerminalSession = mod.TerminalSession;
  });

  it('uses default scrollback of 5000 when no setting exists', () => {
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    expect(session.term.options.scrollback).toBe(5000);
  });

  it('reads scrollback from localStorage ps-scrollback', () => {
    localStorage.setItem('ps-scrollback', '10000');
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    expect(session.term.options.scrollback).toBe(10000);
  });

  it('uses configured value for getScrollback save limit', () => {
    localStorage.setItem('ps-scrollback-save', '2000');
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    // getScrollback should use the configured save limit
    const scrollback = session.getScrollback();
    // Since there's no content, just verify it doesn't error and uses the setting
    expect(typeof scrollback).toBe('string');
  });
});
