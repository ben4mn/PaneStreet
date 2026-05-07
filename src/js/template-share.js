// Portable share format for a single session template. Wraps the
// template in a versioned envelope, strips machine-local fields (id,
// timestamps) so the receiving machine gets fresh ones, and redacts
// obviously-secret env values before export.

import { validateSessionTemplate } from './session-templates.js';
import { redactPayload } from './redact-secrets.js';

export const TEMPLATE_SHARE_VERSION = 1;
const KIND = 'panestreet-session-template';

export function exportTemplate(template) {
  const check = validateSessionTemplate(template);
  if (!check.ok) throw new Error(`Invalid template: ${check.reason}`);

  const safeEnv = template.env ? redactPayload(template.env) : {};

  return {
    kind: KIND,
    version: TEMPLATE_SHARE_VERSION,
    exportedAt: Date.now(),
    template: {
      name: template.name.trim(),
      cwd: template.cwd || '',
      command: template.command,
      env: safeEnv,
    },
  };
}

export function parseTemplateImport(raw, opts = {}) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return { ok: false, reason: `Could not parse JSON: ${e.message}` };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, reason: 'Payload must be an object' };
  }
  if (parsed.kind !== KIND) {
    return { ok: false, reason: `Unexpected kind: ${parsed.kind || '(none)'}` };
  }
  if (parsed.version !== TEMPLATE_SHARE_VERSION) {
    return { ok: false, reason: `Unsupported template version: ${parsed.version}` };
  }
  if (!parsed.template || typeof parsed.template !== 'object') {
    return { ok: false, reason: 'Payload is missing a template object' };
  }

  const template = { ...parsed.template };
  if (opts.renameTo) template.name = opts.renameTo;

  const check = validateSessionTemplate(template);
  if (!check.ok) return { ok: false, reason: check.reason };

  return { ok: true, template };
}
