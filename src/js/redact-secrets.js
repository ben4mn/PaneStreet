// Redact common secret patterns out of arbitrary strings and payload
// objects. Used before writing hook payloads to logs or the clipboard
// so a stray API key in a user's env never leaks into a shared log.

const REPLACEMENT = '[REDACTED]';

// Patterns are tuned to be specific enough that plain prose doesn't
// match, but broad enough to catch the common vendor key formats.
const PATTERNS = [
  // Anthropic API keys
  { re: /sk-ant-api03-[A-Za-z0-9\-_]{20,}/g, replacement: REPLACEMENT },
  // OpenAI-style keys (sk- prefix with 20+ alphanum chars)
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, replacement: REPLACEMENT },
  // GitHub PATs
  { re: /\bghp_[A-Za-z0-9]{20,}\b/g, replacement: REPLACEMENT },
  { re: /\bghs_[A-Za-z0-9]{20,}\b/g, replacement: REPLACEMENT },
  { re: /\bgho_[A-Za-z0-9]{20,}\b/g, replacement: REPLACEMENT },
  // Slack tokens
  { re: /\bxox[bpoas]-[A-Za-z0-9\-]{10,}\b/g, replacement: REPLACEMENT },
  // AWS access key ids
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replacement: REPLACEMENT },
  // Bearer tokens in headers
  { re: /(Bearer )[^\s]+/gi, replacement: `$1${REPLACEMENT}` },
];

const SENSITIVE_KEY_RE = /(api[_-]?key|secret|token|password|credential|auth)/i;

export function redactSecrets(input) {
  if (input === null || input === undefined) return '';
  let text = typeof input === 'string' ? input : String(input);
  for (const { re, replacement } of PATTERNS) {
    text = text.replace(re, replacement);
  }
  return text;
}

export function redactPayload(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(v => redactPayload(v));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && SENSITIVE_KEY_RE.test(k)) {
        out[k] = REPLACEMENT;
      } else {
        out[k] = redactPayload(v);
      }
    }
    return out;
  }
  if (typeof value === 'string') return redactSecrets(value);
  return value;
}
