// R/G TDD for settings export / import. The export collects all
// ps-* localStorage keys plus a few explicit state structures; import
// round-trips them back with a version check and merge/replace policy.
// No Tauri, no DOM — pure serialization.

import {
  exportSettings,
  importSettings,
  parseSettingsPayload,
  SETTINGS_EXPORT_VERSION,
} from '../settings-io.js';

describe('exportSettings', () => {
  function mkStorage(entries) {
    return {
      length: entries.length,
      key(i) { return entries[i]?.[0]; },
      getItem(k) { const e = entries.find(x => x[0] === k); return e ? e[1] : null; },
    };
  }

  it('captures ps-* keys from localStorage', () => {
    const store = mkStorage([
      ['ps-theme', 'nord'],
      ['other-app-key', 'ignore'],
      ['ps-notifications', 'true'],
    ]);
    const payload = exportSettings({ storage: store });
    expect(payload.localStorage['ps-theme']).toBe('nord');
    expect(payload.localStorage['ps-notifications']).toBe('true');
    expect(payload.localStorage['other-app-key']).toBeUndefined();
  });

  it('always includes a version and exportedAt', () => {
    const store = mkStorage([]);
    const payload = exportSettings({ storage: store });
    expect(payload.version).toBe(SETTINGS_EXPORT_VERSION);
    expect(payload.exportedAt).toBeTruthy();
  });

  it('does not export API keys even if stored under a ps- prefix (safety)', () => {
    const store = mkStorage([
      ['ps-api-key', 'sk-secret'],
      ['ps-theme', 'nord'],
    ]);
    const payload = exportSettings({ storage: store });
    expect(payload.localStorage['ps-api-key']).toBeUndefined();
    expect(payload.localStorage['ps-theme']).toBe('nord');
  });

  it('excludes keys matched by custom excludePatterns', () => {
    const store = mkStorage([
      ['ps-internal-cache', 'x'],
      ['ps-theme', 'nord'],
    ]);
    const payload = exportSettings({ storage: store, excludePatterns: [/cache/i] });
    expect(payload.localStorage['ps-internal-cache']).toBeUndefined();
    expect(payload.localStorage['ps-theme']).toBe('nord');
  });
});

describe('parseSettingsPayload', () => {
  it('accepts a valid payload', () => {
    const payload = { version: SETTINGS_EXPORT_VERSION, exportedAt: 123, localStorage: { 'ps-theme': 'nord' } };
    const result = parseSettingsPayload(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    expect(result.payload.localStorage['ps-theme']).toBe('nord');
  });

  it('rejects non-JSON input with a useful reason', () => {
    const result = parseSettingsPayload('not-json {');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/parse|json/i);
  });

  it('rejects an unknown version', () => {
    const payload = { version: 999, localStorage: {} };
    const result = parseSettingsPayload(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/version/i);
  });

  it('rejects missing localStorage field', () => {
    const payload = { version: SETTINGS_EXPORT_VERSION };
    const result = parseSettingsPayload(JSON.stringify(payload));
    expect(result.ok).toBe(false);
  });
});

describe('importSettings', () => {
  function mkWriteStorage() {
    const map = new Map();
    return {
      map,
      getItem(k) { return map.has(k) ? map.get(k) : null; },
      setItem(k, v) { map.set(k, v); },
      removeItem(k) { map.delete(k); },
      get length() { return map.size; },
      key(i) { return Array.from(map.keys())[i]; },
    };
  }

  it('writes every entry from the payload to storage in merge mode', () => {
    const store = mkWriteStorage();
    store.setItem('ps-existing', 'keep');
    const payload = { version: SETTINGS_EXPORT_VERSION, localStorage: { 'ps-theme': 'nord', 'ps-sound': 'on' } };
    const result = importSettings(payload, { storage: store, mode: 'merge' });
    expect(result.ok).toBe(true);
    expect(store.getItem('ps-theme')).toBe('nord');
    expect(store.getItem('ps-sound')).toBe('on');
    expect(store.getItem('ps-existing')).toBe('keep');
  });

  it('removes existing ps-* keys before writing in replace mode', () => {
    const store = mkWriteStorage();
    store.setItem('ps-existing', 'remove-me');
    store.setItem('other-app', 'untouched');
    const payload = { version: SETTINGS_EXPORT_VERSION, localStorage: { 'ps-theme': 'nord' } };
    importSettings(payload, { storage: store, mode: 'replace' });
    expect(store.getItem('ps-existing')).toBe(null);
    expect(store.getItem('other-app')).toBe('untouched');
    expect(store.getItem('ps-theme')).toBe('nord');
  });

  it('reports count of keys imported', () => {
    const store = mkWriteStorage();
    const payload = { version: SETTINGS_EXPORT_VERSION, localStorage: { 'ps-a': '1', 'ps-b': '2' } };
    const result = importSettings(payload, { storage: store });
    expect(result.imported).toBe(2);
  });

  it('fails on a payload with wrong version', () => {
    const store = mkWriteStorage();
    const payload = { version: 999, localStorage: { 'ps-theme': 'nord' } };
    const result = importSettings(payload, { storage: store });
    expect(result.ok).toBe(false);
  });
});
