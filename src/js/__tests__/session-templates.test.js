// R/G TDD for session templates — named recipes for Claude panes.
// Stores in localStorage via the same pattern as layout-snapshots and
// session-profiles, but adds validation, defaults resolution, and a
// resolve step that turns a template into a session-config the runtime
// can launch.

import {
  resetSessionTemplates,
  getSessionTemplates,
  saveSessionTemplate,
  deleteSessionTemplate,
  resolveSessionTemplate,
  validateSessionTemplate,
} from '../session-templates.js';

describe('session templates store', () => {
  beforeEach(() => resetSessionTemplates());

  it('starts empty', () => {
    expect(getSessionTemplates()).toEqual([]);
  });

  it('saves a template with name, cwd, command, and env', () => {
    saveSessionTemplate({
      name: 'Bug Hunt',
      cwd: '~/project',
      command: 'claude',
      env: { CLAUDE_CODE_EFFORT_LEVEL: 'max' },
    });
    const templates = getSessionTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('Bug Hunt');
    expect(templates[0].cwd).toBe('~/project');
  });

  it('assigns an id and createdAt stamp', () => {
    saveSessionTemplate({ name: 'X', command: 'claude' });
    const t = getSessionTemplates()[0];
    expect(t.id).toBeTruthy();
    expect(t.createdAt).toBeTruthy();
  });

  it('overwrites by name (not by id)', () => {
    saveSessionTemplate({ name: 'Same', command: 'claude' });
    saveSessionTemplate({ name: 'Same', command: 'claude --verbose' });
    const all = getSessionTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].command).toBe('claude --verbose');
  });

  it('deletes by id', () => {
    saveSessionTemplate({ name: 'A', command: 'claude' });
    saveSessionTemplate({ name: 'B', command: 'claude' });
    const first = getSessionTemplates()[0];
    deleteSessionTemplate(first.id);
    expect(getSessionTemplates()).toHaveLength(1);
    expect(getSessionTemplates()[0].name).toBe('B');
  });

  it('deleting an unknown id is a no-op', () => {
    saveSessionTemplate({ name: 'A', command: 'claude' });
    deleteSessionTemplate('nonexistent');
    expect(getSessionTemplates()).toHaveLength(1);
  });
});

describe('validateSessionTemplate', () => {
  it('requires a non-empty name', () => {
    expect(validateSessionTemplate({ name: '', command: 'claude' }).ok).toBe(false);
    expect(validateSessionTemplate({ command: 'claude' }).ok).toBe(false);
  });

  it('requires a command', () => {
    expect(validateSessionTemplate({ name: 'x' }).ok).toBe(false);
    expect(validateSessionTemplate({ name: 'x', command: '' }).ok).toBe(false);
  });

  it('trims surrounding whitespace on name before checking', () => {
    expect(validateSessionTemplate({ name: '   ', command: 'claude' }).ok).toBe(false);
  });

  it('caps name length at 60 to keep the UI sane', () => {
    const long = 'x'.repeat(200);
    expect(validateSessionTemplate({ name: long, command: 'claude' }).ok).toBe(false);
  });

  it('accepts a minimal valid template', () => {
    expect(validateSessionTemplate({ name: 'Test', command: 'claude' }).ok).toBe(true);
  });

  it('returns a reason when invalid', () => {
    const r = validateSessionTemplate({ name: '', command: 'claude' });
    expect(r.reason).toBeTruthy();
  });

  it('rejects env that is not a plain object', () => {
    expect(validateSessionTemplate({ name: 'x', command: 'claude', env: 'bad' }).ok).toBe(false);
    expect(validateSessionTemplate({ name: 'x', command: 'claude', env: [1, 2] }).ok).toBe(false);
  });

  it('accepts a template with a well-formed env object', () => {
    expect(validateSessionTemplate({ name: 'x', command: 'claude', env: { FOO: 'bar' } }).ok).toBe(true);
  });
});

describe('resolveSessionTemplate', () => {
  it('returns a session-config with cwd, command, and env', () => {
    const t = { name: 'T', cwd: '/abs/path', command: 'claude --model opus', env: { A: '1' } };
    const cfg = resolveSessionTemplate(t);
    expect(cfg.cwd).toBe('/abs/path');
    expect(cfg.command).toBe('claude --model opus');
    expect(cfg.env).toEqual({ A: '1' });
  });

  it('falls back to provided defaults when cwd is missing', () => {
    const t = { name: 'T', command: 'claude' };
    const cfg = resolveSessionTemplate(t, { defaultCwd: '/home/user' });
    expect(cfg.cwd).toBe('/home/user');
  });

  it('infers a session name from the template name', () => {
    const t = { name: 'Bug Hunt', command: 'claude' };
    const cfg = resolveSessionTemplate(t);
    expect(cfg.name).toBe('Bug Hunt');
  });

  it('expands leading ~ in cwd using provided homeDir', () => {
    const t = { name: 'T', cwd: '~/project', command: 'claude' };
    const cfg = resolveSessionTemplate(t, { homeDir: '/Users/ben' });
    expect(cfg.cwd).toBe('/Users/ben/project');
  });

  it('leaves absolute cwd untouched even when homeDir is provided', () => {
    const t = { name: 'T', cwd: '/etc', command: 'claude' };
    const cfg = resolveSessionTemplate(t, { homeDir: '/Users/ben' });
    expect(cfg.cwd).toBe('/etc');
  });

  it('defaults env to an empty object when template omits it', () => {
    const cfg = resolveSessionTemplate({ name: 'T', command: 'claude' });
    expect(cfg.env).toEqual({});
  });

  it('throws on an invalid template so callers fail loud', () => {
    expect(() => resolveSessionTemplate({ name: '', command: 'claude' })).toThrow();
  });
});
