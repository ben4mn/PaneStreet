// R/G TDD for exporting and importing a single session template.

import { exportTemplate, parseTemplateImport, TEMPLATE_SHARE_VERSION } from '../template-share.js';

describe('exportTemplate', () => {
  it('wraps a template in a versioned envelope', () => {
    const tpl = { id: 'tpl-1', name: 'Bug Hunt', cwd: '~/proj', command: 'claude', env: { X: '1' } };
    const payload = exportTemplate(tpl);
    expect(payload.version).toBe(TEMPLATE_SHARE_VERSION);
    expect(payload.kind).toBe('panestreet-session-template');
    expect(payload.template.name).toBe('Bug Hunt');
    expect(payload.template.cwd).toBe('~/proj');
    expect(payload.template.command).toBe('claude');
    expect(payload.template.env).toEqual({ X: '1' });
  });

  it('strips local id + createdAt so imports on another machine get fresh ones', () => {
    const tpl = { id: 'tpl-1', createdAt: 123, name: 'X', command: 'claude' };
    const payload = exportTemplate(tpl);
    expect(payload.template.id).toBeUndefined();
    expect(payload.template.createdAt).toBeUndefined();
    expect(payload.template.updatedAt).toBeUndefined();
  });

  it('includes an exportedAt timestamp', () => {
    const payload = exportTemplate({ name: 'X', command: 'claude' });
    expect(payload.exportedAt).toBeTruthy();
  });

  it('redacts obviously-secret env values before exporting (safety)', () => {
    const tpl = { name: 'X', command: 'claude', env: { ANTHROPIC_API_KEY: 'sk-ant-api03-abcdefghijklmnop12345', COLOR: 'blue' } };
    const payload = exportTemplate(tpl);
    expect(payload.template.env.ANTHROPIC_API_KEY).toBe('[REDACTED]');
    expect(payload.template.env.COLOR).toBe('blue');
  });

  it('throws on an invalid template', () => {
    expect(() => exportTemplate({ name: '', command: 'claude' })).toThrow();
    expect(() => exportTemplate({ name: 'X' })).toThrow();
  });
});

describe('parseTemplateImport', () => {
  function validPayload(overrides = {}) {
    return {
      kind: 'panestreet-session-template',
      version: TEMPLATE_SHARE_VERSION,
      exportedAt: 123,
      template: { name: 'Bug Hunt', command: 'claude', cwd: '~/proj', env: {} },
      ...overrides,
    };
  }

  it('accepts a valid payload and returns a save-ready template', () => {
    const raw = JSON.stringify(validPayload());
    const result = parseTemplateImport(raw);
    expect(result.ok).toBe(true);
    expect(result.template.name).toBe('Bug Hunt');
    expect(result.template.command).toBe('claude');
  });

  it('rejects non-JSON', () => {
    const result = parseTemplateImport('not-json');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/json|parse/i);
  });

  it('rejects the wrong kind (e.g. a settings export)', () => {
    const payload = { ...validPayload(), kind: 'panestreet-settings' };
    const result = parseTemplateImport(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/kind|type/i);
  });

  it('rejects an unsupported version', () => {
    const payload = { ...validPayload(), version: 999 };
    const result = parseTemplateImport(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/version/i);
  });

  it('rejects a missing template field', () => {
    const payload = { ...validPayload(), template: undefined };
    const result = parseTemplateImport(JSON.stringify(payload));
    expect(result.ok).toBe(false);
  });

  it('rejects a template that would fail validation (missing command)', () => {
    const payload = validPayload();
    payload.template = { name: 'X' };
    const result = parseTemplateImport(JSON.stringify(payload));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/command/i);
  });

  it('accepts a pre-parsed object as well as a string', () => {
    const result = parseTemplateImport(validPayload());
    expect(result.ok).toBe(true);
  });

  it('allows an override name to avoid collision on import', () => {
    const result = parseTemplateImport(validPayload(), { renameTo: 'Bug Hunt (imported)' });
    expect(result.template.name).toBe('Bug Hunt (imported)');
  });
});
