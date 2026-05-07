// R/G TDD for secret redaction over hook payloads. Pure string in,
// string out — no I/O, no format assumptions beyond what the patterns
// match.

import { redactSecrets, redactPayload } from '../redact-secrets.js';

describe('redactSecrets on strings', () => {
  it('returns the same string when nothing sensitive is present', () => {
    const input = 'plain log line with no secrets';
    expect(redactSecrets(input)).toBe(input);
  });

  it('redacts Anthropic API keys', () => {
    const out = redactSecrets('key is sk-ant-api03-abcdefghijklmnop12345');
    expect(out).not.toContain('sk-ant-api03-abcdefghijklmnop12345');
    expect(out).toMatch(/\[REDACTED\]/);
  });

  it('redacts OpenAI-style keys', () => {
    const out = redactSecrets('oai token sk-abcdEFGHijkl1234MNOPqrst5678UVWXyz90');
    expect(out).not.toContain('sk-abcdEFGHijkl1234MNOPqrst5678UVWXyz90');
  });

  it('redacts GitHub personal access tokens', () => {
    const out = redactSecrets('GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(out).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('redacts bearer auth tokens in headers', () => {
    const out = redactSecrets('Authorization: Bearer eyJhbGc.payload.signature');
    expect(out).toMatch(/Bearer \[REDACTED\]/);
  });

  it('redacts AWS access key ids', () => {
    const out = redactSecrets('aws key AKIAIOSFODNN7EXAMPLE');
    expect(out).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('redacts Slack tokens', () => {
    const out = redactSecrets('xoxb-12345-67890-abcdefghij');
    expect(out).not.toContain('xoxb-12345-67890-abcdefghij');
  });

  it('is idempotent — redacting twice produces the same output as once', () => {
    const once = redactSecrets('sk-ant-api03-abcdefghijklmnop12345');
    const twice = redactSecrets(once);
    expect(twice).toBe(once);
  });

  it('handles empty / null / undefined defensively', () => {
    expect(redactSecrets('')).toBe('');
    expect(redactSecrets(null)).toBe('');
    expect(redactSecrets(undefined)).toBe('');
  });

  it('coerces non-string input to string before redacting', () => {
    const out = redactSecrets(42);
    expect(out).toBe('42');
  });
});

describe('redactPayload on objects', () => {
  it('redacts values in a flat object recursively', () => {
    const obj = { note: 'ok', key: 'sk-ant-api03-abcdefghijklmnop12345' };
    const out = redactPayload(obj);
    expect(out.note).toBe('ok');
    expect(out.key).not.toContain('sk-ant-api03');
  });

  it('redacts values inside nested objects and arrays', () => {
    const obj = {
      a: { b: { secret: 'AKIAIOSFODNN7EXAMPLE' } },
      tags: ['plain', 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxx'],
    };
    const out = redactPayload(obj);
    expect(out.a.b.secret).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(out.tags[0]).toBe('plain');
    expect(out.tags[1]).not.toContain('sk-ant-api03');
  });

  it('redacts the whole value for keys that smell like secrets', () => {
    const obj = { api_key: 'not-matching-any-pattern-but-still-a-key' };
    const out = redactPayload(obj);
    expect(out.api_key).toBe('[REDACTED]');
  });

  it('preserves non-string primitives (numbers, booleans)', () => {
    const obj = { count: 42, enabled: true };
    const out = redactPayload(obj);
    expect(out.count).toBe(42);
    expect(out.enabled).toBe(true);
  });

  it('returns a fresh object so the original is untouched', () => {
    const obj = { key: 'sk-ant-api03-abcdefghijklmnop12345' };
    const out = redactPayload(obj);
    expect(out).not.toBe(obj);
    expect(obj.key).toContain('sk-ant-api03');
  });
});
