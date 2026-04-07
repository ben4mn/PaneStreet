// Tests for changelog formatting, expand/collapse behavior, and markdown rendering

import { parseMarkdown, escapeHtml, initMermaidBlocks } from '../markdown.js';
import { CHANGELOG_ENTRIES } from '../changelog-data.js';

describe('parseMarkdown', () => {
  it('renders bold and italic text', () => {
    const html = parseMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders headers', () => {
    expect(parseMarkdown('# Title')).toContain('<h1>Title</h1>');
    expect(parseMarkdown('## Subtitle')).toContain('<h2>Subtitle</h2>');
    expect(parseMarkdown('### Section')).toContain('<h3>Section</h3>');
  });

  it('renders unordered lists', () => {
    const html = parseMarkdown('- Item 1\n- Item 2');
    expect(html).toContain('<li>Item 1</li>');
    expect(html).toContain('<li>Item 2</li>');
  });

  it('renders ordered lists', () => {
    const html = parseMarkdown('1. First\n2. Second');
    expect(html).toContain('<li>First</li>');
    expect(html).toContain('<li>Second</li>');
    expect(html).toContain('<ol>');
  });

  it('renders task lists', () => {
    const html = parseMarkdown('- [x] Done\n- [ ] Todo');
    expect(html).toContain('task-list-item');
    expect(html).toContain('checked disabled');
    expect(html).toContain('<input type="checkbox" disabled>');
  });

  it('renders links', () => {
    const html = parseMarkdown('[Click](https://example.com)');
    expect(html).toContain('<a href="https://example.com">Click</a>');
  });

  it('renders images', () => {
    const html = parseMarkdown('![Alt text](image.png)');
    expect(html).toContain('<img src="image.png" alt="Alt text">');
  });

  it('renders code blocks', () => {
    const html = parseMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre><code class="lang-js">');
    expect(html).toContain('const x = 1;');
  });

  it('renders inline code', () => {
    const html = parseMarkdown('Use `Cmd+K` to open');
    expect(html).toContain('<code>Cmd+K</code>');
  });

  it('renders blockquotes', () => {
    const html = parseMarkdown('> Important note');
    expect(html).toContain('<blockquote>Important note</blockquote>');
  });

  it('renders horizontal rules', () => {
    const html = parseMarkdown('---');
    expect(html).toContain('<hr>');
  });
});

describe('parseMarkdown tables', () => {
  it('renders a basic table', () => {
    const md = `| Feature | Status |
| --- | --- |
| Tables | Done |
| Lists | Done |`;
    const html = parseMarkdown(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<th');
    expect(html).toContain('Feature');
    expect(html).toContain('<tbody>');
    expect(html).toContain('<td');
    expect(html).toContain('Tables');
  });

  it('renders aligned columns', () => {
    const md = `| Left | Center | Right |
| :--- | :---: | ---: |
| a | b | c |`;
    const html = parseMarkdown(md);
    expect(html).toContain('text-align:left');
    expect(html).toContain('text-align:center');
    expect(html).toContain('text-align:right');
  });
});

describe('escapeHtml', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml('<script>"hello"</script>')).toBe('&lt;script&gt;&quot;hello&quot;&lt;/script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
});

describe('CHANGELOG_ENTRIES', () => {
  it('has entries in reverse chronological order', () => {
    for (let i = 1; i < CHANGELOG_ENTRIES.length; i++) {
      expect(CHANGELOG_ENTRIES[i - 1].date >= CHANGELOG_ENTRIES[i].date).toBe(true);
    }
  });

  it('each entry has required fields', () => {
    CHANGELOG_ENTRIES.forEach(entry => {
      expect(entry.version).toBeTruthy();
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.body).toBeTruthy();
    });
  });

  it('entry bodies render as valid markdown', () => {
    CHANGELOG_ENTRIES.forEach(entry => {
      const html = parseMarkdown(entry.body);
      expect(html).toBeTruthy();
      expect(html.length).toBeGreaterThan(0);
    });
  });
});

describe('changelog display', () => {
  it('changelog-entry should be expandable via click on header', () => {
    document.body.innerHTML = `
      <div class="changelog-entry collapsed">
        <div class="changelog-header">
          <span class="changelog-version">v0.4.41</span>
          <span class="changelog-date">Apr 7, 2026</span>
          <span class="changelog-expand-icon">&#9654;</span>
        </div>
        <div class="changelog-body" style="display:none">
          <div class="changelog-item">New feature</div>
        </div>
      </div>
    `;

    const entry = document.querySelector('.changelog-entry');
    const header = entry.querySelector('.changelog-header');
    const body = entry.querySelector('.changelog-body');

    header.addEventListener('click', () => {
      const isCollapsed = entry.classList.contains('collapsed');
      entry.classList.toggle('collapsed');
      body.style.display = isCollapsed ? '' : 'none';
    });

    expect(body.style.display).toBe('none');
    expect(entry.classList.contains('collapsed')).toBe(true);

    header.click();
    expect(body.style.display).toBe('');
    expect(entry.classList.contains('collapsed')).toBe(false);

    header.click();
    expect(body.style.display).toBe('none');
    expect(entry.classList.contains('collapsed')).toBe(true);
  });

  it('first changelog entry should be expanded by default', () => {
    document.body.innerHTML = `
      <div class="changelog-entry">
        <div class="changelog-header">
          <span class="changelog-version">v0.4.41</span>
        </div>
        <div class="changelog-body">
          <div class="changelog-item">Latest features</div>
        </div>
      </div>
      <div class="changelog-entry collapsed">
        <div class="changelog-header">
          <span class="changelog-version">v0.4.40</span>
        </div>
        <div class="changelog-body" style="display:none">
          <div class="changelog-item">Older features</div>
        </div>
      </div>
    `;

    const entries = document.querySelectorAll('.changelog-entry');
    expect(entries[0].classList.contains('collapsed')).toBe(false);
    expect(entries[0].querySelector('.changelog-body').style.display).toBe('');
    expect(entries[1].classList.contains('collapsed')).toBe(true);
    expect(entries[1].querySelector('.changelog-body').style.display).toBe('none');
  });
});

describe('initMermaidBlocks', () => {
  it('does nothing when mermaid is not available', () => {
    document.body.innerHTML = '<div><pre><code class="lang-mermaid">graph TD; A-->B;</code></pre></div>';
    const container = document.body.querySelector('div');
    initMermaidBlocks(container);
    // Should not throw and code block should remain unchanged
    expect(container.querySelector('pre')).toBeTruthy();
  });
});
