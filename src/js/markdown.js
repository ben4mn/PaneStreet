// Shared markdown parser and utilities

export function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Tables - parse before headers since table rows start with |
  html = html.replace(/((?:^\|.+\|$\n?)+)/gm, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(r => r.trim());
    if (rows.length < 2) return tableBlock;

    // Check for separator row (second row with |---|---|)
    const sepRow = rows[1];
    if (!/^\|[\s:-]+\|/.test(sepRow)) return tableBlock;

    // Parse alignment from separator
    const alignCells = sepRow.split('|').filter(c => c.trim());
    const aligns = alignCells.map(c => {
      const t = c.trim();
      if (t.startsWith(':') && t.endsWith(':')) return 'center';
      if (t.endsWith(':')) return 'right';
      return 'left';
    });

    // Header row
    const headerCells = rows[0].split('|').filter(c => c.trim());
    let table = '<table><thead><tr>';
    headerCells.forEach((cell, i) => {
      const align = aligns[i] || 'left';
      table += `<th style="text-align:${align}">${cell.trim()}</th>`;
    });
    table += '</tr></thead><tbody>';

    // Body rows
    for (let r = 2; r < rows.length; r++) {
      const cells = rows[r].split('|').filter(c => c.trim());
      table += '<tr>';
      cells.forEach((cell, i) => {
        const align = aligns[i] || 'left';
        table += `<td style="text-align:${align}">${cell.trim()}</td>`;
      });
      table += '</tr>';
    }
    table += '</tbody></table>';
    return table;
  });

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr>');

  // Task lists (before regular lists)
  html = html.replace(/^[-*]\s+\[x\]\s+(.+)$/gm, '<li class="task-list-item"><input type="checkbox" checked disabled> $1</li>');
  html = html.replace(/^[-*]\s+\[ \]\s+(.+)$/gm, '<li class="task-list-item"><input type="checkbox" disabled> $1</li>');

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<oli>$1</oli>');

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Images (before links since ![...](...) contains [...](...))
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Paragraphs (double newlines)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs and paragraphs wrapping block elements
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<hr>)<\/p>/g, '$1');
  html = html.replace(/<p>(<table>)/g, '$1');
  html = html.replace(/(<\/table>)<\/p>/g, '$1');
  html = html.replace(/<p>(<img )/g, '$1');
  html = html.replace(/(>)<\/p>/g, '$1');

  // Wrap list items in proper list tags
  html = html.replace(/<p>(<li)/g, '<ul>$1');
  html = html.replace(/(<\/li>)<\/p>/g, '$1</ul>');
  html = html.replace(/<p>(<oli>)/g, '<ol><li>');
  html = html.replace(/(<\/oli>)<\/p>/g, '</li></ol>');

  // Convert oli tags to li
  html = html.replace(/<oli>/g, '<li>');
  html = html.replace(/<\/oli>/g, '</li>');

  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');

  return html;
}

/**
 * Post-process rendered markdown to initialize mermaid diagrams.
 * Call after inserting parseMarkdown output into the DOM.
 */
export function initMermaidBlocks(container) {
  if (typeof window === 'undefined' || !window.mermaid) return;
  container.querySelectorAll('pre > code.lang-mermaid').forEach(block => {
    const pre = block.parentElement;
    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid';
    wrapper.textContent = block.textContent;
    pre.replaceWith(wrapper);
  });
  try {
    window.mermaid.run({ nodes: container.querySelectorAll('.mermaid') });
  } catch {
    // mermaid rendering failed silently
  }
}
