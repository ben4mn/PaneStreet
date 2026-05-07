// Export / import the ps-* localStorage surface as a single JSON payload.
// Intentionally excludes API keys (those live in the macOS keyring via
// auth_manager.rs) and anything the caller supplies an exclude pattern for.

export const SETTINGS_EXPORT_VERSION = 1;
const PS_PREFIX = 'ps-';
const DEFAULT_EXCLUDES = [/api-?key/i, /token/i, /secret/i, /credential/i];

function resolveStorage(opts) {
  if (opts?.storage) return opts.storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function excluded(key, patterns) {
  for (const re of patterns) {
    if (re.test(key)) return true;
  }
  return false;
}

export function exportSettings(opts = {}) {
  const storage = resolveStorage(opts);
  const excludePatterns = [...DEFAULT_EXCLUDES, ...(opts.excludePatterns || [])];
  const collected = {};

  if (storage) {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(PS_PREFIX)) continue;
      if (excluded(key, excludePatterns)) continue;
      collected[key] = storage.getItem(key);
    }
  }

  return {
    version: SETTINGS_EXPORT_VERSION,
    exportedAt: Date.now(),
    localStorage: collected,
  };
}

export function parseSettingsPayload(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return { ok: false, reason: `Could not parse JSON: ${e.message}` };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'Payload must be an object' };
  }
  if (parsed.version !== SETTINGS_EXPORT_VERSION) {
    return { ok: false, reason: `Unsupported settings export version: ${parsed.version}` };
  }
  if (!parsed.localStorage || typeof parsed.localStorage !== 'object') {
    return { ok: false, reason: 'Payload is missing a localStorage object' };
  }
  return { ok: true, payload: parsed };
}

export function importSettings(payload, opts = {}) {
  const storage = resolveStorage(opts);
  if (!storage) {
    return { ok: false, reason: 'No storage available' };
  }
  if (!payload || payload.version !== SETTINGS_EXPORT_VERSION) {
    return { ok: false, reason: 'Payload version mismatch' };
  }
  if (!payload.localStorage || typeof payload.localStorage !== 'object') {
    return { ok: false, reason: 'Payload is missing a localStorage object' };
  }

  const mode = opts.mode || 'merge';
  if (mode === 'replace') {
    const keysToRemove = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(PS_PREFIX)) keysToRemove.push(key);
    }
    for (const k of keysToRemove) storage.removeItem(k);
  }

  let imported = 0;
  for (const [key, value] of Object.entries(payload.localStorage)) {
    if (!key.startsWith(PS_PREFIX)) continue;
    storage.setItem(key, value);
    imported++;
  }

  return { ok: true, imported, mode };
}
