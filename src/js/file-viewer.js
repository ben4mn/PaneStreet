const { invoke } = window.__TAURI__.core;

let currentPath = null;
let expandedDirs = new Set();
let viewerVisible = false;
let selectedFile = null;
let rawMode = false;

// --- Public API ---

export function initFileViewer() {
  document.getElementById('fv-close').addEventListener('click', hideFileViewer);
  document.getElementById('fv-finder').addEventListener('click', () => {
    if (currentPath) invoke('open_in_finder', { path: currentPath });
  });
  document.getElementById('fv-back').addEventListener('click', navigateUp);
  document.getElementById('fv-toggle-view').addEventListener('click', toggleRawMode);
  document.getElementById('fv-toggle-btn').addEventListener('click', toggleFileViewer);
}

export function toggleFileViewer() {
  if (viewerVisible) hideFileViewer();
  else showFileViewer(currentPath);
}

export function showFileViewer(cwd) {
  const viewer = document.getElementById('file-viewer');
  viewer.style.display = 'flex';
  viewerVisible = true;
  document.getElementById('fv-toggle-btn').classList.add('active');

  if (cwd && cwd !== currentPath) {
    currentPath = cwd;
    selectedFile = null;
    showTree();
  } else if (!currentPath) {
    currentPath = cwd || null;
    if (currentPath) showTree();
  }

  // Re-fit terminals after layout change
  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('file-viewer-changed'));
  });
}

export function hideFileViewer() {
  const viewer = document.getElementById('file-viewer');
  viewer.style.display = 'none';
  viewerVisible = false;
  document.getElementById('fv-toggle-btn').classList.remove('active');

  requestAnimationFrame(() => {
    window.dispatchEvent(new CustomEvent('file-viewer-changed'));
  });
}

export function updateFileViewerCwd(cwd) {
  if (!viewerVisible) {
    currentPath = cwd;
    return;
  }
  if (cwd && cwd !== currentPath) {
    currentPath = cwd;
    selectedFile = null;
    expandedDirs.clear();
    showTree();
  }
}

export function isFileViewerVisible() {
  return viewerVisible;
}

// --- Navigation ---

function navigateUp() {
  if (!currentPath) return;
  const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
  if (parent !== currentPath) {
    currentPath = parent;
    selectedFile = null;
    expandedDirs.clear();
    showTree();
  }
}

function showTree() {
  const tree = document.getElementById('fv-tree');
  const content = document.getElementById('fv-content');
  tree.style.display = '';
  content.style.display = 'none';
  document.getElementById('fv-toggle-view').style.display = 'none';
  updatePathDisplay();
  renderDirectory(currentPath, tree, 0);
}

function updatePathDisplay() {
  const pathEl = document.getElementById('fv-path');
  if (!currentPath) {
    pathEl.textContent = '';
    return;
  }
  // Show abbreviated path
  const home = currentPath.replace(/^\/Users\/[^/]+/, '~');
  pathEl.textContent = home;
  pathEl.title = currentPath;
}

// --- Directory Tree ---

async function renderDirectory(path, container, depth) {
  container.innerHTML = '<div class="fv-loading">Loading...</div>';

  try {
    const entries = await invoke('read_directory', { path });
    container.innerHTML = '';

    if (entries.length === 0) {
      container.innerHTML = '<div class="fv-empty">Empty directory</div>';
      return;
    }

    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'fv-entry' + (entry.is_dir ? ' fv-dir' : ' fv-file');
      if (selectedFile === entry.path) row.classList.add('selected');
      row.style.paddingLeft = (8 + depth * 16) + 'px';

      const icon = document.createElement('span');
      icon.className = 'fv-entry-icon';

      if (entry.is_dir) {
        const isExpanded = expandedDirs.has(entry.path);
        icon.textContent = isExpanded ? '\u25BE' : '\u25B8';
      } else {
        icon.textContent = getFileIcon(entry.extension);
      }

      const name = document.createElement('span');
      name.className = 'fv-entry-name';
      name.textContent = entry.name;

      if (entry.is_symlink) {
        name.style.fontStyle = 'italic';
      }

      row.appendChild(icon);
      row.appendChild(name);

      if (entry.is_dir) {
        const childContainer = document.createElement('div');
        childContainer.className = 'fv-subtree';

        if (expandedDirs.has(entry.path)) {
          renderDirectory(entry.path, childContainer, depth + 1);
        }

        row.addEventListener('click', (e) => {
          e.stopPropagation();
          if (expandedDirs.has(entry.path)) {
            expandedDirs.delete(entry.path);
            icon.textContent = '\u25B8';
            childContainer.innerHTML = '';
          } else {
            expandedDirs.add(entry.path);
            icon.textContent = '\u25BE';
            renderDirectory(entry.path, childContainer, depth + 1);
          }
        });

        // Double-click to navigate into directory
        row.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          currentPath = entry.path;
          selectedFile = null;
          expandedDirs.clear();
          showTree();
        });

        container.appendChild(row);
        container.appendChild(childContainer);
      } else {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedFile = entry.path;
          // Update selection styling
          container.closest('#fv-tree').querySelectorAll('.fv-entry').forEach(el => el.classList.remove('selected'));
          row.classList.add('selected');
          loadFileContent(entry.path, entry.extension);
        });

        container.appendChild(row);
      }
    }
  } catch (err) {
    container.innerHTML = `<div class="fv-error">Error: ${err}</div>`;
  }
}

function getFileIcon(ext) {
  if (!ext) return '\u25A1'; // empty square
  const icons = {
    js: '\u25C9', ts: '\u25C9', jsx: '\u25C9', tsx: '\u25C9',
    rs: '\u25C8', go: '\u25C8', py: '\u25C8', rb: '\u25C8',
    md: '\u25C7', mdx: '\u25C7', txt: '\u25C7',
    json: '\u25CB', yaml: '\u25CB', yml: '\u25CB', toml: '\u25CB',
    css: '\u25CA', html: '\u25CA', svg: '\u25CA',
    png: '\u25A3', jpg: '\u25A3', gif: '\u25A3', ico: '\u25A3',
    lock: '\u25A0',
  };
  return icons[ext.toLowerCase()] || '\u25A1';
}

// --- File Content ---

async function loadFileContent(filePath, ext) {
  const tree = document.getElementById('fv-tree');
  const content = document.getElementById('fv-content');
  const toggleBtn = document.getElementById('fv-toggle-view');

  try {
    const result = await invoke('read_file_content', { path: filePath });

    if (result.is_binary) {
      content.innerHTML = `<div class="fv-binary">${result.content}</div>`;
      content.style.display = '';
      tree.style.display = 'none';
      toggleBtn.style.display = 'none';
      return;
    }

    const extension = ext || filePath.split('.').pop() || '';
    rawMode = false;

    if (isMarkdown(extension)) {
      toggleBtn.style.display = '';
      toggleBtn.textContent = 'Raw';
      renderMarkdownContent(result.content, content);
    } else {
      toggleBtn.style.display = 'none';
      renderCodeContent(result.content, extension, content);
    }

    content.style.display = '';
    tree.style.display = 'none';
  } catch (err) {
    content.innerHTML = `<div class="fv-error">Failed to load: ${err}</div>`;
    content.style.display = '';
    tree.style.display = 'none';
    toggleBtn.style.display = 'none';
  }
}

function toggleRawMode() {
  if (!selectedFile) return;
  rawMode = !rawMode;

  const content = document.getElementById('fv-content');
  const toggleBtn = document.getElementById('fv-toggle-view');

  if (rawMode) {
    toggleBtn.textContent = 'Rendered';
    // Re-load as raw code
    invoke('read_file_content', { path: selectedFile }).then(result => {
      renderCodeContent(result.content, 'md', content);
    });
  } else {
    toggleBtn.textContent = 'Raw';
    invoke('read_file_content', { path: selectedFile }).then(result => {
      renderMarkdownContent(result.content, content);
    });
  }
}

function isMarkdown(ext) {
  return ['md', 'mdx', 'markdown'].includes((ext || '').toLowerCase());
}

// --- Renderers ---

function renderCodeContent(text, ext, container) {
  const pre = document.createElement('pre');
  pre.className = 'fv-code-view';

  const lines = text.split('\n');
  const gutterWidth = String(lines.length).length;

  let html = '';
  for (let i = 0; i < lines.length; i++) {
    const lineNum = String(i + 1).padStart(gutterWidth, ' ');
    const escapedLine = escapeHtml(lines[i]);
    html += `<span class="fv-line"><span class="fv-line-num">${lineNum}</span>${escapedLine}\n</span>`;
  }

  pre.innerHTML = html;

  // Apply basic syntax coloring via CSS classes based on extension
  pre.dataset.lang = (ext || '').toLowerCase();

  container.innerHTML = '';
  container.appendChild(pre);
}

function renderMarkdownContent(text, container) {
  container.innerHTML = '';

  const rendered = document.createElement('div');
  rendered.className = 'fv-markdown-view';

  // Simple markdown parser (no external deps)
  rendered.innerHTML = parseMarkdown(text);

  // Find and render mermaid blocks
  rendered.querySelectorAll('pre > code.lang-mermaid').forEach(block => {
    const wrapper = document.createElement('div');
    wrapper.className = 'fv-mermaid';
    wrapper.textContent = 'Mermaid diagram (rendering not available without mermaid.js)';
    wrapper.style.color = 'var(--text-muted)';
    wrapper.style.fontStyle = 'italic';
    wrapper.style.padding = '12px';
    wrapper.style.background = 'var(--bg-pane)';
    wrapper.style.borderRadius = 'var(--radius-sm)';
    block.parentElement.replaceWith(wrapper);
  });

  container.appendChild(rendered);

  // Add back-to-tree button
  const backBtn = document.createElement('button');
  backBtn.className = 'fv-back-to-tree';
  backBtn.textContent = '\u2190 Back to files';
  backBtn.addEventListener('click', () => {
    selectedFile = null;
    showTree();
  });
  container.prepend(backBtn);
}

// Lightweight markdown parser
function parseMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

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

  // Unordered lists
  html = html.replace(/^[\-\*]\s+(.+)$/gm, '<li>$1</li>');

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

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
  html = html.replace(/<p>(<li>)/g, '<ul>$1');
  html = html.replace(/(<\/li>)<\/p>/g, '$1</ul>');
  html = html.replace(/<p>(<blockquote>)/g, '$1');
  html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');

  return html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
