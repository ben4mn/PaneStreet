// Command Palette — fuzzy-searchable action overlay

let paletteActions = [];
let paletteVisible = false;
let selectedIndex = 0;

/**
 * Fuzzy match query against a label. Returns { score } or null.
 */
export function fuzzyMatch(query, label) {
  if (!query || !label) return null;
  const q = query.toLowerCase();
  const l = label.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let li = 0; li < l.length && qi < q.length; li++) {
    if (l[li] === q[qi]) {
      // Consecutive match bonus
      if (lastMatchIndex === li - 1) score += 3;
      else score += 1;
      // Early position bonus
      if (li < 3) score += 1;
      lastMatchIndex = li;
      qi++;
    }
  }

  return qi === q.length ? { score } : null;
}

/**
 * Register an action in the palette.
 */
export function registerPaletteAction(id, label, shortcut, action) {
  const existing = paletteActions.findIndex(a => a.id === id);
  const entry = { id, label, shortcut, action };
  if (existing >= 0) paletteActions[existing] = entry;
  else paletteActions.push(entry);
}

/**
 * Get all registered palette actions.
 */
export function getPaletteActions() {
  return [...paletteActions];
}

/**
 * Reset the palette (for testing).
 */
export function resetPalette() {
  paletteActions = [];
}

/**
 * Show the command palette overlay.
 */
export function showCommandPalette() {
  if (paletteVisible) return;
  paletteVisible = true;
  selectedIndex = 0;

  const overlay = document.createElement('div');
  overlay.className = 'command-palette-overlay';
  overlay.id = 'command-palette-overlay';
  overlay.innerHTML = `
    <div class="command-palette">
      <input type="text" class="command-palette-input" placeholder="Type a command..." spellcheck="false" />
      <div class="command-palette-list"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector('.command-palette-input');
  const list = overlay.querySelector('.command-palette-list');

  const render = (query) => {
    let items = paletteActions;
    if (query) {
      items = items
        .map(a => ({ ...a, match: fuzzyMatch(query, a.label) }))
        .filter(a => a.match)
        .sort((a, b) => b.match.score - a.match.score);
    }
    selectedIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));

    list.innerHTML = items.map((a, i) => {
      const tip = a.shortcut ? `${a.label} (${a.shortcut})` : a.label;
      return `<div class="palette-item ${i === selectedIndex ? 'active' : ''}" data-index="${i}" title="${tip.replace(/"/g, '&quot;')}">
        <span class="palette-label">${a.label}</span>
        ${a.shortcut ? `<span class="palette-shortcut">${a.shortcut}</span>` : ''}
      </div>`;
    }).join('');

    // Click handlers
    list.querySelectorAll('.palette-item').forEach((el, i) => {
      el.addEventListener('click', () => {
        const item = items[i];
        hideCommandPalette();
        if (item?.action) item.action();
      });
    });

    return items;
  };

  render('');
  input.focus();

  let currentItems = paletteActions;

  input.addEventListener('input', () => {
    selectedIndex = 0;
    currentItems = render(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, currentItems.length - 1);
      render(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(0, selectedIndex - 1);
      render(input.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = currentItems[selectedIndex];
      hideCommandPalette();
      if (item?.action) item.action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideCommandPalette();
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideCommandPalette();
  });
}

/**
 * Hide the command palette overlay.
 */
export function hideCommandPalette() {
  paletteVisible = false;
  const overlay = document.getElementById('command-palette-overlay');
  if (overlay) overlay.remove();
}

/**
 * Initialize the command palette (called once on app startup).
 */
export function initCommandPalette() {
  // Palette is shown via the 'command-palette' shortcut action in app.js
}
