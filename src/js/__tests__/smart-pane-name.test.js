// R/G TDD for smart pane naming — infer a helpful default from the
// working directory and, when known, the running command. The pure
// function sits behind app.js's default 'Terminal N' fallback.

import { smartPaneName, stripHome } from '../smart-pane-name.js';

describe('stripHome', () => {
  it('replaces the home prefix with ~', () => {
    expect(stripHome('/Users/ben/project', '/Users/ben')).toBe('~/project');
  });

  it('leaves a path alone when it has no home prefix', () => {
    expect(stripHome('/etc/config', '/Users/ben')).toBe('/etc/config');
  });

  it('handles the exact home dir', () => {
    expect(stripHome('/Users/ben', '/Users/ben')).toBe('~');
  });
});

describe('smartPaneName', () => {
  it('returns the cwd basename when no command is known', () => {
    expect(smartPaneName({ cwd: '/Users/ben/my-repo' })).toBe('my-repo');
  });

  it('includes a command annotation when a meaningful command is known', () => {
    expect(smartPaneName({ cwd: '/Users/ben/my-repo', command: 'claude' })).toBe('my-repo (claude)');
  });

  it('strips args from a compound command string', () => {
    expect(smartPaneName({ cwd: '/Users/ben/my-repo', command: 'npm run dev --watch' })).toBe('my-repo (npm)');
  });

  it('ignores noisy commands like bash / zsh', () => {
    expect(smartPaneName({ cwd: '/Users/ben/my-repo', command: 'bash' })).toBe('my-repo');
    expect(smartPaneName({ cwd: '/Users/ben/my-repo', command: 'zsh -l' })).toBe('my-repo');
  });

  it('falls back to the fallback name when cwd is empty', () => {
    expect(smartPaneName({ cwd: '', fallback: 'Terminal 1' })).toBe('Terminal 1');
  });

  it('falls back when cwd is home (avoids naming every pane "ben")', () => {
    expect(smartPaneName({ cwd: '/Users/ben', homeDir: '/Users/ben', fallback: 'Terminal 1' })).toBe('Terminal 1');
  });

  it('handles Windows-style paths defensively', () => {
    expect(smartPaneName({ cwd: 'C:\\Users\\ben\\my-repo' })).toBe('my-repo');
  });

  it('drops trailing slashes from cwd before picking the basename', () => {
    expect(smartPaneName({ cwd: '/Users/ben/my-repo/' })).toBe('my-repo');
  });

  it('caps the returned name at 40 chars', () => {
    const cwd = '/Users/ben/' + 'a'.repeat(100);
    const result = smartPaneName({ cwd });
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it('annotates Claude sessions when claudeAttached is true', () => {
    expect(smartPaneName({ cwd: '/Users/ben/my-repo', claudeAttached: true })).toBe('my-repo (claude)');
  });

  it('prefers explicit command over claudeAttached flag', () => {
    expect(smartPaneName({ cwd: '/Users/ben/my-repo', command: 'npm test', claudeAttached: true })).toBe('my-repo (npm)');
  });

  it('returns the fallback when given nothing at all', () => {
    expect(smartPaneName({ fallback: 'Terminal 3' })).toBe('Terminal 3');
  });
});
