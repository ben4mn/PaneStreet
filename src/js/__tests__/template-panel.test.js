// R/G TDD for the pure markup helper that renders template cards in
// the settings panel. DOM logic (click handlers) lives in config-panels
// and is covered by the smoke test; here we just verify the markup is
// shaped correctly.

import { renderTemplateCardsHTML, escapeAttr } from '../template-panel.js';

describe('escapeAttr', () => {
  it('escapes embedded double quotes', () => {
    expect(escapeAttr('he said "hi"')).toBe('he said &quot;hi&quot;');
  });

  it('escapes angle brackets and ampersands', () => {
    expect(escapeAttr('<script>&')).toBe('&lt;script&gt;&amp;');
  });

  it('coerces non-strings', () => {
    expect(escapeAttr(null)).toBe('');
    expect(escapeAttr(undefined)).toBe('');
    expect(escapeAttr(42)).toBe('42');
  });
});

describe('renderTemplateCardsHTML', () => {
  it('returns an empty-state placeholder when no templates', () => {
    const html = renderTemplateCardsHTML([]);
    expect(html).toMatch(/no templates/i);
  });

  it('renders a card per template with name + command + cwd', () => {
    const html = renderTemplateCardsHTML([
      { id: 't1', name: 'Bug Hunt', cwd: '~/proj', command: 'claude' },
      { id: 't2', name: 'Docs',      cwd: '',       command: 'npm run docs' },
    ]);
    expect(html).toMatch(/Bug Hunt/);
    expect(html).toMatch(/Docs/);
    expect(html).toMatch(/claude/);
    expect(html).toMatch(/npm run docs/);
  });

  it('shows "Default dir" when cwd is blank', () => {
    const html = renderTemplateCardsHTML([{ id: 't', name: 'X', cwd: '', command: 'claude' }]);
    expect(html).toMatch(/default dir/i);
  });

  it('includes launch / share / delete buttons with the template id', () => {
    const html = renderTemplateCardsHTML([{ id: 't-abc', name: 'X', cwd: '', command: 'claude' }]);
    expect(html).toMatch(/data-id="t-abc"/);
    expect(html).toMatch(/template-launch-btn/);
    expect(html).toMatch(/template-share-btn/);
    expect(html).toMatch(/template-delete-btn/);
  });

  it('escapes user-provided template names to prevent HTML injection', () => {
    const html = renderTemplateCardsHTML([{ id: 't', name: '<script>alert(1)</script>', cwd: '', command: 'claude' }]);
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });
});
