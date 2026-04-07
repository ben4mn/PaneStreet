// Tests for terminal search — Cmd+F search bar

import { TerminalSession } from '../terminal.js';

describe('terminal search addon', () => {
  it('loads SearchAddon into the terminal', () => {
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    // The search addon should be loaded
    expect(session.searchAddon).toBeDefined();
    expect(session.term._addons).toContainEqual(session.searchAddon);
  });

  it('exposes findNext method', () => {
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    expect(typeof session.findNext).toBe('function');
  });

  it('exposes findPrevious method', () => {
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    expect(typeof session.findPrevious).toBe('function');
  });

  it('exposes clearSearch method', () => {
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    expect(typeof session.clearSearch).toBe('function');
  });

  it('findNext delegates to searchAddon', () => {
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    const spy = vi.spyOn(session.searchAddon, 'findNext');
    session.findNext('test');
    expect(spy).toHaveBeenCalledWith('test', undefined);
  });

  it('findPrevious delegates to searchAddon', () => {
    const container = document.createElement('div');
    const session = new TerminalSession(container);
    const spy = vi.spyOn(session.searchAddon, 'findPrevious');
    session.findPrevious('test');
    expect(spy).toHaveBeenCalledWith('test', undefined);
  });
});
