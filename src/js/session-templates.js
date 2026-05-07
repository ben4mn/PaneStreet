// Named session templates — recipes for Claude panes (or any pane).
// Each template captures cwd, command, env; users launch one to create
// a pre-configured pane instead of typing the setup every time.
//
// Storage uses localStorage keyed by 'ps-session-templates' to match the
// pattern used by session-profiles and layout-snapshots.

const STORAGE_KEY = 'ps-session-templates';
const NAME_MAX = 60;

let cache = null;

function loadFromStorage() {
  if (cache !== null) return cache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    cache = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(cache)) cache = [];
  } catch {
    cache = [];
  }
  return cache;
}

function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Silently ignore quota / serialization errors in the store layer.
  }
}

export function resetSessionTemplates() {
  cache = [];
  persist();
}

export function getSessionTemplates() {
  return loadFromStorage().slice();
}

export function saveSessionTemplate(template) {
  const check = validateSessionTemplate(template);
  if (!check.ok) throw new Error(check.reason);

  loadFromStorage();
  const name = template.name.trim();
  const existingIdx = cache.findIndex(t => t.name === name);
  const entry = {
    id: existingIdx >= 0 ? cache[existingIdx].id : makeId(),
    name,
    cwd: template.cwd || '',
    command: template.command,
    env: template.env || {},
    createdAt: existingIdx >= 0 ? cache[existingIdx].createdAt : Date.now(),
    updatedAt: Date.now(),
  };

  if (existingIdx >= 0) {
    cache[existingIdx] = entry;
  } else {
    cache.push(entry);
  }
  persist();
  return entry;
}

export function deleteSessionTemplate(id) {
  loadFromStorage();
  const before = cache.length;
  cache = cache.filter(t => t.id !== id);
  if (cache.length !== before) persist();
}

export function validateSessionTemplate(template) {
  if (!template || typeof template !== 'object') {
    return { ok: false, reason: 'Template must be an object' };
  }
  const name = typeof template.name === 'string' ? template.name.trim() : '';
  if (!name) return { ok: false, reason: 'Name is required' };
  if (name.length > NAME_MAX) return { ok: false, reason: `Name must be ${NAME_MAX} chars or fewer` };

  if (typeof template.command !== 'string' || !template.command.trim()) {
    return { ok: false, reason: 'Command is required' };
  }

  if (template.env !== undefined && template.env !== null) {
    if (typeof template.env !== 'object' || Array.isArray(template.env)) {
      return { ok: false, reason: 'env must be a plain object' };
    }
  }

  return { ok: true };
}

export function resolveSessionTemplate(template, opts = {}) {
  const check = validateSessionTemplate(template);
  if (!check.ok) throw new Error(`Invalid template: ${check.reason}`);

  const homeDir = opts.homeDir || '';
  const defaultCwd = opts.defaultCwd || '';
  let cwd = template.cwd || defaultCwd;
  if (cwd.startsWith('~') && homeDir) {
    cwd = homeDir + cwd.slice(1);
  }

  return {
    name: template.name.trim(),
    cwd,
    command: template.command,
    env: template.env ? { ...template.env } : {},
  };
}

function makeId() {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
