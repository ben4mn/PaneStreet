// Pick a sensible default name for a pane: "repo (claude)" is worth
// more than "Terminal 3" every time. Falls back to the caller's
// provided fallback when we can't infer anything useful.

const MAX_LEN = 40;
const NOISY_COMMANDS = new Set(['bash', 'zsh', 'sh', 'fish', 'tmux', 'screen', 'nu']);

export function stripHome(path, homeDir) {
  if (!path || !homeDir) return path || '';
  if (path === homeDir) return '~';
  if (path.startsWith(homeDir + '/')) return '~' + path.slice(homeDir.length);
  return path;
}

function basename(path) {
  if (!path) return '';
  let cleaned = path.replace(/\\/g, '/');
  while (cleaned.endsWith('/') && cleaned.length > 1) cleaned = cleaned.slice(0, -1);
  const idx = cleaned.lastIndexOf('/');
  return idx === -1 ? cleaned : cleaned.slice(idx + 1);
}

function commandAnnotation(command) {
  if (!command) return '';
  const head = String(command).trim().split(/\s+/)[0];
  if (!head) return '';
  const bare = head.replace(/^.*\//, '');
  if (NOISY_COMMANDS.has(bare)) return '';
  return bare;
}

function truncate(s) {
  if (!s) return '';
  return s.length > MAX_LEN ? s.slice(0, MAX_LEN - 1) + '…' : s;
}

export function smartPaneName({ cwd = '', command = '', claudeAttached = false, homeDir = '', fallback = 'Terminal' } = {}) {
  const base = basename(cwd);
  if (!base || base === basename(homeDir) && cwd === homeDir) {
    return fallback;
  }

  let annotation = commandAnnotation(command);
  if (!annotation && claudeAttached) annotation = 'claude';

  const combined = annotation ? `${base} (${annotation})` : base;
  return truncate(combined);
}
