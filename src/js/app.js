import { TerminalSession } from './terminal.js';
import { togglePanel, hidePanel, isAnyPanelActive, setOnHide, loadSavedTheme, setFocusedCwd } from './config-panels.js';
import { initFileViewer, toggleFileViewer, updateFileViewerCwd, hideFileViewer, isFileViewerVisible, refreshDiffStats } from './file-viewer.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const sessions = [];
const closedSessionStack = []; // For Cmd+Z undo-close
const MAX_CLOSED_SESSIONS = 10;
let focusedIndex = 0;
let maximizedIndex = null;
let contextMenu = null;
let layoutMode = 'freeform'; // 'auto' | 'freeform'
let snapToGrid = true;
let freeformZCounter = 1;
const SNAP_INCREMENT = 20;
const PANE_MIN_WIDTH = 200;
const PANE_MIN_HEIGHT = 120;

// Grid split ratios — stored as percentages for columns and rows
// Reset when pane count changes; keyed by layout count
let gridSplitRatios = {};
function nextTerminalNumber() {
  const used = new Set();
  for (const s of sessions) {
    const m = s.name.match(/^Terminal (\d+)$/);
    if (m) used.add(parseInt(m[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return n;
}
let windowFocused = true;
let pendingTerminalSettings = null;
// Track app window focus via both JS and Tauri events for reliability
window.addEventListener('focus', () => { windowFocused = true; });
window.addEventListener('blur', () => { windowFocused = false; });
document.addEventListener('visibilitychange', () => {
  windowFocused = !document.hidden;
});
// Tauri native window focus events (most reliable for OS-level app switching)
let lastBlurTime = 0;
listen('tauri://focus', () => {
  windowFocused = true;
  const awayMs = Date.now() - lastBlurTime;
  if (lastBlurTime > 0 && awayMs > 2 * 60000 && Math.random() < 0.12) {
    setTimeout(() => {
      if (!robotEl || robotOverride || robotSpecialActive) return;
      const qs = ["Oh, you're back.", 'Welcome back.', 'There you are.', 'Back already?'];
      showSpeech(qs[Math.floor(Math.random() * qs.length)], 2500, true);
    }, 3000 + Math.random() * 4000);
  }
});
listen('tauri://blur', () => { windowFocused = false; lastBlurTime = Date.now(); });

// --- Grid Layout ---

function updateGridLayout() {
  const grid = document.getElementById('pane-grid');

  // Remove all panes and gutters from grid
  sessions.forEach(s => {
    if (s.pane.parentNode === grid) {
      grid.removeChild(s.pane);
    }
  });
  grid.querySelectorAll('.grid-gutter').forEach(g => g.remove());

  if (layoutMode === 'freeform') {
    applyFreeformLayout();
    return;
  }

  grid.classList.remove('freeform');
  grid.style.gridTemplateColumns = '';
  grid.style.gridTemplateRows = '';
  // Clear any inline freeform styles
  sessions.forEach(s => {
    s.pane.style.cssText = '';
    removeFreeformHandles(s.pane);
  });

  if (maximizedIndex !== null && maximizedIndex < sessions.length) {
    grid.className = 'layout-maximized';
    grid.appendChild(sessions[maximizedIndex].pane);
  } else {
    maximizedIndex = null;
    const visible = sessions.filter(s => !s.minimized);
    const count = Math.min(visible.length, 6);
    grid.className = count > 0 ? `layout-${count}` : '';
    visible.forEach(s => grid.appendChild(s.pane));

    // Apply saved split ratios if any
    if (gridSplitRatios[count]) {
      const r = gridSplitRatios[count];
      if (r.cols) grid.style.gridTemplateColumns = r.cols;
      if (r.rows) grid.style.gridTemplateRows = r.rows;
    }

    // Insert grid gutters for resizable splits (skip layout-5 — complex spanning)
    if (count >= 2 && count !== 5) {
      insertGridGutters(grid, count);
    }
  }

  requestAnimationFrame(() => fitVisibleTerminals());
}

// --- Grid Gutters (in-grid resize) ---

function getGridLayoutInfo(count) {
  // Returns { cols, rows } describing the grid structure
  switch (count) {
    case 2: return { cols: 2, rows: 1 };
    case 3: return { cols: 2, rows: 2 }; // triptych
    case 4: return { cols: 2, rows: 2 };
    case 5: return { cols: 3, rows: 2 }; // special: top 3, bottom 2
    case 6: return { cols: 3, rows: 2 };
    default: return { cols: 1, rows: 1 };
  }
}

function insertGridGutters(grid, count) {
  const info = getGridLayoutInfo(count);
  const gridRect = grid.getBoundingClientRect();
  const saved = gridSplitRatios[count];

  // Parse saved ratios to get gutter positions
  let colPositions = [];
  let rowPositions = [];
  if (saved?.cols) {
    const parts = parseGridTemplate(saved.cols, info.cols, gridRect.width);
    let cumulative = 0;
    for (let i = 0; i < parts.length - 1; i++) {
      cumulative += parts[i];
      colPositions.push(cumulative);
    }
  }
  if (saved?.rows) {
    const parts = parseGridTemplate(saved.rows, info.rows, gridRect.height);
    let cumulative = 0;
    for (let i = 0; i < parts.length - 1; i++) {
      cumulative += parts[i];
      rowPositions.push(cumulative);
    }
  }

  // Double-click any gutter to reset to equal splits
  function resetSplits() {
    grid.style.gridTemplateColumns = '';
    grid.style.gridTemplateRows = '';
    delete gridSplitRatios[count];
    fitVisibleTerminals();
    saveSessionState();
    // Reposition gutters
    grid.querySelectorAll('.grid-gutter-v').forEach((g, i) => {
      g.style.left = `${((i + 1) / info.cols) * 100}%`;
    });
    grid.querySelectorAll('.grid-gutter-h').forEach((g, i) => {
      g.style.top = `${((i + 1) / info.rows) * 100}%`;
    });
  }

  // Vertical gutter(s) — between columns
  if (info.cols >= 2) {
    for (let c = 1; c < info.cols; c++) {
      const gutter = document.createElement('div');
      gutter.className = 'grid-gutter grid-gutter-v';
      const pos = colPositions[c - 1] ?? (c / info.cols) * 100;
      gutter.style.left = `${pos}%`;
      gutter.dataset.col = c;
      gutter.dataset.totalCols = info.cols;
      gutter.dataset.count = count;
      gutter.addEventListener('dblclick', resetSplits);
      grid.appendChild(gutter);
    }
  }

  // Horizontal gutter(s) — between rows
  if (info.rows >= 2) {
    for (let r = 1; r < info.rows; r++) {
      const gutter = document.createElement('div');
      gutter.className = 'grid-gutter grid-gutter-h';
      const pos = rowPositions[r - 1] ?? (r / info.rows) * 100;
      gutter.style.top = `${pos}%`;
      gutter.dataset.row = r;
      gutter.dataset.totalRows = info.rows;
      gutter.dataset.count = count;
      gutter.addEventListener('dblclick', resetSplits);
      grid.appendChild(gutter);
    }
  }
}

function setupGridGutterDrag() {
  let dragging = null;

  function startGutterDrag(e, gutter) {
    e.preventDefault();
    const grid = document.getElementById('pane-grid');
    const gridRect = grid.getBoundingClientRect();
    const isVertical = gutter.classList.contains('grid-gutter-v');

    dragging = {
      gutter,
      grid,
      gridRect,
      isVertical,
      col: parseInt(gutter.dataset.col) || 0,
      row: parseInt(gutter.dataset.row) || 0,
      totalCols: parseInt(gutter.dataset.totalCols) || 1,
      totalRows: parseInt(gutter.dataset.totalRows) || 1,
      count: parseInt(gutter.dataset.count) || 2,
    };

    document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
    gutter.classList.add('active');
  }

  document.addEventListener('mousedown', (e) => {
    if (layoutMode !== 'auto') return;

    // Direct gutter click
    const gutter = e.target.closest('.grid-gutter');
    if (gutter) {
      startGutterDrag(e, gutter);
      return;
    }

    // Pane edge click → find nearest gutter
    const edge = e.target.closest('.pane-edge');
    if (edge && maximizedIndex === null) {
      const pane = edge.closest('.pane');
      const grid = document.getElementById('pane-grid');
      const paneRect = pane.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();

      let nearestGutter = null;
      let bestDist = Infinity;
      const isVEdge = edge.classList.contains('pane-edge-right') || edge.classList.contains('pane-edge-corner');
      const isHEdge = edge.classList.contains('pane-edge-bottom') || edge.classList.contains('pane-edge-corner');

      // Prefer vertical gutter if dragging a right edge
      if (isVEdge) {
        grid.querySelectorAll('.grid-gutter-v').forEach(g => {
          const gLeft = gridRect.left + (parseFloat(g.style.left) / 100) * gridRect.width;
          const dist = Math.abs(gLeft - paneRect.right);
          if (dist < bestDist) { bestDist = dist; nearestGutter = g; }
        });
      }
      // Prefer horizontal gutter if dragging a bottom edge
      if (isHEdge && (!nearestGutter || bestDist > 50)) {
        grid.querySelectorAll('.grid-gutter-h').forEach(g => {
          const gTop = gridRect.top + (parseFloat(g.style.top) / 100) * gridRect.height;
          const dist = Math.abs(gTop - paneRect.bottom);
          if (dist < bestDist) { bestDist = dist; nearestGutter = g; }
        });
      }

      if (nearestGutter && bestDist < 60) {
        startGutterDrag(e, nearestGutter);
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const { grid, gridRect, isVertical, col, row, totalCols, totalRows, count } = dragging;

    if (isVertical) {
      const pct = ((e.clientX - gridRect.left) / gridRect.width) * 100;
      const clamped = Math.max(15, Math.min(85, pct));
      // Build column template
      if (totalCols === 2) {
        grid.style.gridTemplateColumns = `${clamped}% ${100 - clamped}%`;
      } else if (totalCols === 3) {
        // For 3 columns, adjust the one being dragged
        const current = grid.style.gridTemplateColumns || '1fr 1fr 1fr';
        const parts = parseGridTemplate(current, totalCols, gridRect.width);
        if (col === 1) {
          const remaining = parts[1] + parts[2];
          parts[0] = clamped;
          const ratio = parts[2] / (parts[1] + parts[2]) || 0.5;
          parts[1] = (100 - clamped) * (1 - ratio);
          parts[2] = (100 - clamped) * ratio;
        } else {
          const beforeTotal = parts[0] + parts[1];
          parts[2] = 100 - clamped;
          const ratio = parts[0] / beforeTotal || 0.5;
          parts[0] = clamped * ratio;
          parts[1] = clamped * (1 - ratio);
        }
        grid.style.gridTemplateColumns = parts.map(p => `${Math.max(10, p)}%`).join(' ');
      }
      // Update gutter position
      dragging.gutter.style.left = clamped + '%';
    } else {
      const pct = ((e.clientY - gridRect.top) / gridRect.height) * 100;
      const clamped = Math.max(15, Math.min(85, pct));
      grid.style.gridTemplateRows = `${clamped}% ${100 - clamped}%`;
      dragging.gutter.style.top = clamped + '%';
    }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    document.body.style.cursor = '';
    dragging.gutter.classList.remove('active');

    // Save ratios
    const count = dragging.count;
    const grid = dragging.grid;
    gridSplitRatios[count] = {
      cols: grid.style.gridTemplateColumns || null,
      rows: grid.style.gridTemplateRows || null,
    };

    fitVisibleTerminals();
    saveSessionState();
    dragging = null;
  });
}

function parseGridTemplate(template, count, totalPx) {
  // Parse a grid template string into percentage values
  if (template.includes('fr')) {
    // Equal distribution
    const pct = 100 / count;
    return Array(count).fill(pct);
  }
  return template.split(/\s+/).map(v => {
    if (v.endsWith('%')) return parseFloat(v);
    if (v.endsWith('px')) return (parseFloat(v) / totalPx) * 100;
    return 100 / count;
  });
}

// --- Freeform Layout ---

function snapValue(v) {
  return snapToGrid ? Math.round(v / SNAP_INCREMENT) * SNAP_INCREMENT : v;
}

function snapshotCurrentPositions() {
  const grid = document.getElementById('pane-grid');
  const gridRect = grid.getBoundingClientRect();
  sessions.forEach(s => {
    if (s.minimized || !s.pane.parentNode) return;
    const r = s.pane.getBoundingClientRect();
    s.freeformRect = {
      x: r.left - gridRect.left,
      y: r.top - gridRect.top,
      width: r.width,
      height: r.height,
    };
  });
}

function applyFreeformLayout() {
  const grid = document.getElementById('pane-grid');
  grid.className = 'freeform';

  if (maximizedIndex !== null && maximizedIndex < sessions.length) {
    // Show only the maximized pane at full size
    const s = sessions[maximizedIndex];
    s.pane.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:9;';
    grid.appendChild(s.pane);
    addFreeformHandles(s.pane);
    requestAnimationFrame(() => fitVisibleTerminals());
    return;
  }

  const visible = sessions.filter(s => !s.minimized);
  const gridRect = grid.getBoundingClientRect();

  visible.forEach((s, i) => {
    // Assign a default rect if none exists — start small, cascaded
    if (!s.freeformRect) {
      const defaultW = Math.min(600, gridRect.width * 0.5);
      const defaultH = Math.min(450, gridRect.height * 0.55);
      const cascade = i * 30;
      const x = Math.min(cascade + 20, gridRect.width - defaultW);
      const y = Math.min(cascade + 20, gridRect.height - defaultH);
      s.freeformRect = { x, y, width: defaultW, height: defaultH };
    }

    const r = s.freeformRect;
    s.pane.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;z-index:${s === sessions[focusedIndex] ? freeformZCounter : 1};`;
    grid.appendChild(s.pane);
    addFreeformHandles(s.pane);
  });

  requestAnimationFrame(() => fitVisibleTerminals());
}

function addFreeformHandles(pane) {
  if (pane.querySelector('.pane-resize-handle')) return; // already has handles
  const directions = ['e', 's', 'se'];
  directions.forEach(dir => {
    const handle = document.createElement('div');
    handle.className = `pane-resize-handle pane-resize-${dir}`;
    handle.dataset.direction = dir;
    pane.appendChild(handle);
  });
  // Make header draggable
  const header = pane.querySelector('.pane-header');
  if (header) header.classList.add('pane-header-draggable');
}

function removeFreeformHandles(pane) {
  pane.querySelectorAll('.pane-resize-handle').forEach(h => h.remove());
  const header = pane.querySelector('.pane-header');
  if (header) header.classList.remove('pane-header-draggable');
}

function toggleLayoutMode() {
  const grid = document.getElementById('pane-grid');

  if (layoutMode === 'auto') {
    // Snapshot current positions before switching
    snapshotCurrentPositions();
    layoutMode = 'freeform';
  } else {
    layoutMode = 'auto';
    // Clear freeform rects so auto layout takes over
    sessions.forEach(s => { s.pane.style.cssText = ''; });
  }

  updateGridLayout();
  updateLayoutToggleUI();
  saveSessionState();
}

function toggleSnapToGrid() {
  snapToGrid = !snapToGrid;
  updateLayoutToggleUI();
  saveSessionState();
}

function updateLayoutToggleUI() {
  const toggle = document.getElementById('toolbar-layout-toggle');
  if (!toggle) return;

  const autoBtn = toggle.querySelector('[data-mode="auto"]');
  const freeBtn = toggle.querySelector('[data-mode="freeform"]');
  const snapBtn = toggle.querySelector('[data-mode="snap"]');
  const divider = toggle.querySelector('.mode-divider');

  if (autoBtn) autoBtn.classList.toggle('active', layoutMode === 'auto');
  if (freeBtn) freeBtn.classList.toggle('active', layoutMode === 'freeform');
  if (divider) divider.style.display = layoutMode === 'freeform' ? '' : 'none';
  if (snapBtn) {
    snapBtn.style.display = layoutMode === 'freeform' ? '' : 'none';
    snapBtn.classList.toggle('active', snapToGrid);
  }
}

function autoTile() {
  const grid = document.getElementById('pane-grid');
  if (!grid) return;
  const gridRect = grid.getBoundingClientRect();
  const visible = sessions.filter(s => !s.minimized);
  const count = visible.length;
  if (count === 0) return;

  // Switch to freeform if in auto mode
  if (layoutMode === 'auto') {
    toggleLayoutMode();
  }

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const gap = 4;
  const cellW = gridRect.width / cols;
  const cellH = gridRect.height / rows;

  visible.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rect = {
      x: col * cellW + gap,
      y: row * cellH + gap,
      width: cellW - gap * 2,
      height: cellH - gap * 2,
    };
    s.freeformRect = rect;
    s.pane.style.transition = 'left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease';
    s.pane.style.left = rect.x + 'px';
    s.pane.style.top = rect.y + 'px';
    s.pane.style.width = rect.width + 'px';
    s.pane.style.height = rect.height + 'px';
    setTimeout(() => { s.pane.style.transition = ''; }, 350);
  });

  setTimeout(() => fitVisibleTerminals(), 350);
  saveSessionState();
}

function createLayoutToggle() {
  const container = document.getElementById('toolbar-layout-toggle');
  if (!container) return;

  // SVG icons for each mode
  const gridSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="1.5" width="5" height="5" rx="1"/><rect x="9.5" y="1.5" width="5" height="5" rx="1"/><rect x="1.5" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/></svg>';
  const freeSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="2" width="7" height="6" rx="1"/><rect x="6" y="8" width="9" height="6" rx="1"/></svg>';
  const snapSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 4V1h3M13 1h2v3M1 12v3h3M15 13v2h-2"/><rect x="4" y="4" width="8" height="8" rx="1" stroke-dasharray="2 1.5"/></svg>';
  const tileSvg = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M8 3v10M3 8h10" stroke-dasharray="1.5 1.5"/></svg>';

  const autoBtn = document.createElement('button');
  autoBtn.className = 'mode-btn';
  autoBtn.dataset.mode = 'auto';
  autoBtn.innerHTML = gridSvg + '<span class="mode-label">Grid</span>';
  autoBtn.title = 'Auto grid layout (\u2318\u21E7G)';
  autoBtn.addEventListener('click', () => {
    if (layoutMode !== 'auto') toggleLayoutMode();
  });

  const freeBtn = document.createElement('button');
  freeBtn.className = 'mode-btn';
  freeBtn.dataset.mode = 'freeform';
  freeBtn.innerHTML = freeSvg + '<span class="mode-label">Free</span>';
  freeBtn.title = 'Free-form layout (\u2318\u21E7G)';
  freeBtn.addEventListener('click', () => {
    if (layoutMode !== 'freeform') toggleLayoutMode();
  });

  const divider = document.createElement('div');
  divider.className = 'mode-divider';

  const snapBtn = document.createElement('button');
  snapBtn.className = 'mode-btn';
  snapBtn.dataset.mode = 'snap';
  snapBtn.innerHTML = snapSvg + '<span class="mode-label">Snap</span>';
  snapBtn.title = 'Snap to grid when dragging';
  snapBtn.style.display = 'none';
  snapBtn.addEventListener('click', () => toggleSnapToGrid());

  const tileBtn = document.createElement('button');
  tileBtn.className = 'mode-btn';
  tileBtn.dataset.mode = 'tile';
  tileBtn.innerHTML = tileSvg + '<span class="mode-label">Tile</span>';
  tileBtn.title = 'Auto-tile all panes (\u2318\u21E7T)';
  tileBtn.addEventListener('click', () => autoTile());

  container.appendChild(autoBtn);
  container.appendChild(freeBtn);
  container.appendChild(divider);
  container.appendChild(snapBtn);
  container.appendChild(tileBtn);

  // Set initial active state
  updateLayoutToggleUI();
}

function setupFreeformDrag() {
  let dragging = null;
  let snapPreview = null;
  const SNAP_EDGE = 8; // px from edge to trigger snap zone

  function getSnapZone(x, y, gridRect, r) {
    // Returns a snap zone descriptor or null
    if (x <= SNAP_EDGE) {
      return { zone: 'left', x: 0, y: 0, width: gridRect.width / 2, height: gridRect.height };
    }
    if (x + r.width >= gridRect.width - SNAP_EDGE) {
      return { zone: 'right', x: gridRect.width / 2, y: 0, width: gridRect.width / 2, height: gridRect.height };
    }
    if (y <= SNAP_EDGE) {
      return { zone: 'top', x: 0, y: 0, width: gridRect.width, height: gridRect.height / 2 };
    }
    if (y + r.height >= gridRect.height - SNAP_EDGE) {
      return { zone: 'bottom', x: 0, y: gridRect.height / 2, width: gridRect.width, height: gridRect.height / 2 };
    }
    return null;
  }

  function showSnapPreview(snap, grid) {
    if (!snapPreview) {
      snapPreview = document.createElement('div');
      snapPreview.className = 'snap-preview';
      grid.appendChild(snapPreview);
    }
    snapPreview.style.left = snap.x + 'px';
    snapPreview.style.top = snap.y + 'px';
    snapPreview.style.width = snap.width + 'px';
    snapPreview.style.height = snap.height + 'px';
    snapPreview.style.display = '';
  }

  function hideSnapPreview() {
    if (snapPreview) {
      snapPreview.style.display = 'none';
    }
  }

  document.addEventListener('mousedown', (e) => {
    if (layoutMode !== 'freeform') return;
    if (maximizedIndex !== null) return;

    const header = e.target.closest('.pane-header-draggable');
    if (!header) return;
    if (e.target.closest('button')) return;

    const pane = header.closest('.pane');
    const session = sessions.find(s => s.pane === pane);
    if (!session || !session.freeformRect) return;

    e.preventDefault();
    dragging = {
      session,
      startX: e.clientX,
      startY: e.clientY,
      origX: session.freeformRect.x,
      origY: session.freeformRect.y,
      origWidth: session.freeformRect.width,
      origHeight: session.freeformRect.height,
      snapZone: null,
    };

    freeformZCounter++;
    pane.style.zIndex = freeformZCounter;
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;
    const r = dragging.session.freeformRect;
    const grid = document.getElementById('pane-grid');
    const gridRect = grid.getBoundingClientRect();

    let newX = snapValue(dragging.origX + dx);
    let newY = snapValue(dragging.origY + dy);

    newX = Math.max(0, Math.min(newX, gridRect.width - r.width));
    newY = Math.max(0, Math.min(newY, gridRect.height - r.height));

    r.x = newX;
    r.y = newY;
    dragging.session.pane.style.left = r.x + 'px';
    dragging.session.pane.style.top = r.y + 'px';

    // Check snap zones
    const snap = getSnapZone(newX, newY, gridRect, r);
    dragging.snapZone = snap;
    if (snap) {
      showSnapPreview(snap, grid);
    } else {
      hideSnapPreview();
    }
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;

    // Apply snap zone if active
    if (dragging.snapZone) {
      const snap = dragging.snapZone;
      const r = dragging.session.freeformRect;
      const PAD = 4;
      r.x = snap.x + PAD;
      r.y = snap.y + PAD;
      r.width = snap.width - PAD * 2;
      r.height = snap.height - PAD * 2;
      const pane = dragging.session.pane;
      pane.style.left = r.x + 'px';
      pane.style.top = r.y + 'px';
      pane.style.width = r.width + 'px';
      pane.style.height = r.height + 'px';
    }

    hideSnapPreview();
    fitVisibleTerminals();
    saveSessionState();
    dragging = null;
  });
}

function findAdjacentPanes(session, direction) {
  // Find panes whose edges are close to this pane's resize edge
  const r = session.freeformRect;
  const PROXIMITY = 20;
  const neighbors = [];

  sessions.forEach(s => {
    if (s === session || s.minimized || !s.freeformRect) return;
    const sr = s.freeformRect;

    if (direction.includes('e')) {
      // Right edge of session near left edge of neighbor
      if (Math.abs((r.x + r.width) - sr.x) < PROXIMITY) {
        // Vertically overlapping
        if (r.y < sr.y + sr.height && r.y + r.height > sr.y) {
          neighbors.push({ session: s, axis: 'h', origX: sr.x, origWidth: sr.width });
        }
      }
    }
    if (direction.includes('s')) {
      // Bottom edge of session near top edge of neighbor
      if (Math.abs((r.y + r.height) - sr.y) < PROXIMITY) {
        // Horizontally overlapping
        if (r.x < sr.x + sr.width && r.x + r.width > sr.x) {
          neighbors.push({ session: s, axis: 'v', origY: sr.y, origHeight: sr.height });
        }
      }
    }
  });
  return neighbors;
}

function setupFreeformResize() {
  let resizing = null;

  document.addEventListener('mousedown', (e) => {
    if (layoutMode !== 'freeform') return;

    const handle = e.target.closest('.pane-resize-handle');
    if (!handle) return;

    const pane = handle.closest('.pane');
    const session = sessions.find(s => s.pane === pane);
    if (!session || !session.freeformRect) return;

    e.preventDefault();
    const r = session.freeformRect;
    const dir = handle.dataset.direction;

    resizing = {
      session,
      direction: dir,
      startX: e.clientX,
      startY: e.clientY,
      origWidth: r.width,
      origHeight: r.height,
      origX: r.x,
      origY: r.y,
      neighbors: findAdjacentPanes(session, dir),
    };

    freeformZCounter++;
    pane.style.zIndex = freeformZCounter;
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;
    const dx = e.clientX - resizing.startX;
    const dy = e.clientY - resizing.startY;
    const r = resizing.session.freeformRect;
    const dir = resizing.direction;
    const grid = document.getElementById('pane-grid');
    const gridRect = grid.getBoundingClientRect();

    if (dir.includes('e')) {
      const maxW = gridRect.width - r.x;
      const newW = Math.max(PANE_MIN_WIDTH, Math.min(maxW, snapValue(resizing.origWidth + dx)));
      const delta = newW - resizing.origWidth;
      r.width = newW;

      // Push adjacent panes
      resizing.neighbors.forEach(n => {
        if (n.axis === 'h') {
          const nr = n.session.freeformRect;
          nr.x = n.origX + delta;
          nr.width = Math.max(PANE_MIN_WIDTH, n.origWidth - delta);
          n.session.pane.style.left = nr.x + 'px';
          n.session.pane.style.width = nr.width + 'px';
        }
      });
    }
    if (dir.includes('s')) {
      const maxH = gridRect.height - r.y;
      const newH = Math.max(PANE_MIN_HEIGHT, Math.min(maxH, snapValue(resizing.origHeight + dy)));
      const delta = newH - resizing.origHeight;
      r.height = newH;

      // Push adjacent panes
      resizing.neighbors.forEach(n => {
        if (n.axis === 'v') {
          const nr = n.session.freeformRect;
          nr.y = n.origY + delta;
          nr.height = Math.max(PANE_MIN_HEIGHT, n.origHeight - delta);
          n.session.pane.style.top = nr.y + 'px';
          n.session.pane.style.height = nr.height + 'px';
        }
      });
    }

    resizing.session.pane.style.width = r.width + 'px';
    resizing.session.pane.style.height = r.height + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!resizing) return;
    // Refit all affected terminals
    resizing.session.terminal.fit();
    resizing.neighbors.forEach(n => n.session.terminal.fit());
    saveSessionState();
    resizing = null;
  });
}

function fitVisibleTerminals() {
  if (maximizedIndex !== null && maximizedIndex < sessions.length) {
    sessions[maximizedIndex].terminal.fit();
  } else {
    sessions.filter(s => !s.minimized).forEach(s => s.terminal.fit());
  }
}

// --- Focus ---

function setFocus(index) {
  if (index < 0 || index >= sessions.length) return;
  if (sessions[index].minimized) return;

  // If a different pane is maximized, switch maximize to the new target
  if (maximizedIndex !== null && maximizedIndex !== index) {
    maximizedIndex = index;
    // Update maximize button icons
    sessions.forEach((s, i) => {
      const btn = s.pane.querySelector('.pane-maximize-btn');
      if (btn) {
        btn.innerHTML = (maximizedIndex === i) ? '\u29C9' : '\u25A1';
        btn.title = (maximizedIndex === i) ? 'Restore (\u2318\u21E7Enter)' : 'Maximize (\u2318\u21E7Enter)';
      }
    });
    updateGridLayout();
  }

  focusedIndex = index;

  sessions.forEach((s, i) => {
    s.pane.classList.toggle('focused', i === index);
    // Dismiss notification ring on the newly focused pane
    if (i === index) {
      s.pane.classList.remove('notify-ring');
    }
  });

  // Z-index management in freeform mode
  if (layoutMode === 'freeform') {
    freeformZCounter++;
    sessions[index].pane.style.zIndex = freeformZCounter;
  }

  document.querySelectorAll('.session-card').forEach((c, i) => {
    c.classList.toggle('active', i === index);
    if (i === index) c.classList.remove('notify-badge');
  });

  sessions[index].terminal.focus();
  updateGitInfo();
  updateMascot(sessions[index].status || 'Idle', Math.random() > 0.2);
  updateFileViewerCwd(sessions[index].cwd);
  setFocusedCwd(sessions[index].cwd);
}

function navigateDirection(direction) {
  if (sessions.length <= 1) return;
  if (maximizedIndex !== null) return;

  const visible = sessions.filter(s => !s.minimized);
  if (visible.length <= 1) return;

  const current = sessions[focusedIndex];
  if (!current) return;

  const currentRect = current.pane.getBoundingClientRect();
  const cx = currentRect.left + currentRect.width / 2;
  const cy = currentRect.top + currentRect.height / 2;

  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = 0; i < sessions.length; i++) {
    if (i === focusedIndex || sessions[i].minimized) continue;

    const rect = sessions[i].pane.getBoundingClientRect();
    const px = rect.left + rect.width / 2;
    const py = rect.top + rect.height / 2;
    const dx = px - cx;
    const dy = py - cy;

    // Check if this pane is in the correct direction
    let valid = false;
    switch (direction) {
      case 'up':    valid = dy < -10; break;
      case 'down':  valid = dy > 10;  break;
      case 'left':  valid = dx < -10; break;
      case 'right': valid = dx > 10;  break;
    }
    if (!valid) continue;

    // Use weighted distance: primary axis is more important
    let dist;
    if (direction === 'up' || direction === 'down') {
      dist = Math.abs(dy) + Math.abs(dx) * 2; // Penalize off-axis
    } else {
      dist = Math.abs(dx) + Math.abs(dy) * 2;
    }

    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0) {
    setFocus(bestIdx);
  }
}

function focusNextVisible(fromIndex, direction) {
  if (sessions.length === 0) return;
  const len = sessions.length;
  for (let i = 1; i <= len; i++) {
    const idx = (fromIndex + direction * i + len) % len;
    if (!sessions[idx].minimized) {
      setFocus(idx);
      return;
    }
  }
}

// --- Pane Creation ---

function createPane(name) {
  const pane = document.createElement('div');
  pane.className = 'pane';
  pane.dataset.status = 'Idle';

  const header = document.createElement('div');
  header.className = 'pane-header';

  const statusDot = document.createElement('span');
  statusDot.className = 'status-dot';
  statusDot.style.background = 'var(--status-idle)';

  const title = document.createElement('span');
  title.className = 'pane-title';
  title.textContent = name;

  const controls = document.createElement('span');
  controls.className = 'pane-controls';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'pane-minimize-btn';
  minimizeBtn.innerHTML = '\u2013'; // en dash
  minimizeBtn.title = 'Minimize (⌘M)';
  minimizeBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const idx = sessions.findIndex(s => s.pane === pane);
    if (idx >= 0) minimizeSession(idx);
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'pane-close-btn';
  closeBtn.innerHTML = '\u00d7';
  closeBtn.title = 'Close (⌘W)';
  closeBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const idx = sessions.findIndex(s => s.pane === pane);
    if (idx >= 0) removeSession(idx);
  });

  const maximizeBtn = document.createElement('button');
  maximizeBtn.className = 'pane-maximize-btn';
  maximizeBtn.innerHTML = '\u25A1'; // □ square
  maximizeBtn.title = 'Maximize (⌘⇧Enter)';
  maximizeBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const idx = sessions.findIndex(s => s.pane === pane);
    if (idx >= 0) toggleMaximize(idx);
  });

  controls.appendChild(minimizeBtn);
  controls.appendChild(maximizeBtn);
  controls.appendChild(closeBtn);
  header.appendChild(statusDot);
  header.appendChild(title);
  header.appendChild(controls);

  // Double-click header to maximize/restore
  header.addEventListener('dblclick', () => {
    const idx = sessions.findIndex(s => s.pane === pane);
    if (idx >= 0) toggleMaximize(idx);
  });

  const body = document.createElement('div');
  body.className = 'pane-body';

  // Edge resize zones (for grid gutter interaction)
  const edgeRight = document.createElement('div');
  edgeRight.className = 'pane-edge pane-edge-right';
  const edgeBottom = document.createElement('div');
  edgeBottom.className = 'pane-edge pane-edge-bottom';
  const edgeCorner = document.createElement('div');
  edgeCorner.className = 'pane-edge pane-edge-corner';

  pane.appendChild(header);
  pane.appendChild(body);
  pane.appendChild(edgeRight);
  pane.appendChild(edgeBottom);
  pane.appendChild(edgeCorner);

  // Click to focus
  pane.addEventListener('mousedown', () => {
    const idx = sessions.findIndex(s => s.pane === pane);
    if (idx >= 0) setFocus(idx);
  });

  return { pane, body, statusDot, title };
}

// --- Session Lifecycle ---

async function createSession(restoreCwd, restoreScrollback) {
  const sessionName = `Terminal ${nextTerminalNumber()}`;

  // Cap at 6 visible — auto-minimize oldest visible if needed
  const visibleCount = sessions.filter(s => !s.minimized).length;
  if (visibleCount >= 6) {
    const oldestVisible = sessions.findIndex(s => !s.minimized);
    if (oldestVisible >= 0) {
      sessions[oldestVisible].minimized = true;
    }
  }

  const { pane, body, statusDot, title } = createPane(sessionName);

  const terminal = new TerminalSession(body);
  terminal.open();

  const effectiveCwd = restoreCwd || localStorage.getItem('ps-default-dir') || null;

  // Restore scrollback content before connecting PTY
  if (restoreScrollback) {
    terminal.restoreScrollback(restoreScrollback);
  }

  const sessionId = await terminal.connect(effectiveCwd);

  // Watch for /rename command output from Claude Code
  terminal.onOutput((chunk, buffer) => {
    // Claude Code /rename outputs "Session renamed to: <name>" with ANSI styling
    const clean = buffer.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    const renameMatch = clean.match(/(?:Renamed (?:conversation )?to|Session renamed to)[:\s]+["']?([^\n"']+?)["']?\s*$/);
    if (renameMatch) {
      const newName = renameMatch[1].trim();
      if (newName && newName !== session.name) {
        session.name = newName;
        session.pane.querySelector('.pane-title').textContent = newName;
        rebuildSidebar();
        updateFooterPills();
        saveSessionState();
        terminal._outputBuffer = ''; // Clear to avoid re-matching
      }
    }
  });

  const session = {
    id: sessionId,
    name: sessionName,
    terminal,
    pane,
    statusDot,
    minimized: false,
    cwd: effectiveCwd || null,
    freeformRect: null,
  };

  sessions.push(session);

  // Terminal count reaction — once per session at 5 terminals
  if (sessions.length === 5 && !sessionCountReacted) {
    sessionCountReacted = true;
    setTimeout(() => { if (robotEl && !robotOverride) showSpeech("You've got a lot going on.", 3000); }, 1500);
  }

  rebuildSidebar();

  // Exit maximize mode when adding a new session
  maximizedIndex = null;

  updateGridLayout();
  updateFooterPills();
  saveSessionState();

  requestAnimationFrame(() => {
    setFocus(sessions.length - 1);
  });

  return session;
}

async function removeSession(index) {
  if (index < 0 || index >= sessions.length) return;

  const session = sessions[index];

  // Save session info for undo-close (Cmd+Z)
  try {
    const scrollback = session.terminal.getScrollback(500);
    // Detect if this was a Claude Code session
    const cleanScrollback = scrollback.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    const wasClaude = cleanScrollback.includes('Claude Code') || cleanScrollback.includes('Total cost:') || cleanScrollback.includes('claude-opus') || cleanScrollback.includes('claude-sonnet');
    closedSessionStack.push({
      name: session.name,
      cwd: session.cwd,
      scrollback,
      wasClaude,
      closedAt: Date.now(),
    });
    if (closedSessionStack.length > MAX_CLOSED_SESSIONS) closedSessionStack.shift();
  } catch {}

  // Handle maximize state
  if (maximizedIndex === index) {
    maximizedIndex = null;
  } else if (maximizedIndex !== null && maximizedIndex > index) {
    maximizedIndex--;
  }

  await session.terminal.destroy();
  if (session.pane.parentNode) session.pane.remove();
  sessions.splice(index, 1);

  rebuildSidebar();
  updateGridLayout();
  updateFooterPills();
  updateGitInfo();
  saveSessionState();

  if (sessions.length > 0) {
    // Find nearest visible session for focus
    let target = Math.min(index, sessions.length - 1);
    if (sessions[target].minimized) {
      target = sessions.findIndex(s => !s.minimized);
      if (target < 0) {
        // All remaining minimized — restore the first one
        sessions[0].minimized = false;
        target = 0;
        updateGridLayout();
        updateFooterPills();
      }
    }
    requestAnimationFrame(() => setFocus(target));
  }
}

async function reopenLastClosed() {
  if (closedSessionStack.length === 0) return;
  const closed = closedSessionStack.pop();
  await createSession(closed.cwd, closed.scrollback);
  // Rename the new session to the old name
  const newSession = sessions[sessions.length - 1];
  if (newSession && closed.name) {
    newSession.name = closed.name;
    newSession.pane.querySelector('.pane-title').textContent = closed.name;
    rebuildSidebar();
    updateFooterPills();
  }
  setFocus(sessions.length - 1);
  // Auto-resume Claude Code session with conversation name
  if (closed.wasClaude && newSession) {
    setTimeout(() => {
      const encoder = new TextEncoder();
      // Use session name as conversation name (set by /rename in Claude Code)
      const isDefaultName = /^Terminal \d+$/.test(closed.name);
      const cmd = isDefaultName ? 'claude --resume\n' : `claude --resume "${closed.name}"\n`;
      invoke('write_to_pty', {
        sessionId: newSession.id,
        data: Array.from(encoder.encode(cmd)),
      });
    }, 500);
  }
}

// --- Minimize / Restore / Maximize ---

function minimizeSession(index) {
  if (index < 0 || index >= sessions.length) return;

  sessions[index].minimized = true;

  // Exit maximize mode if minimizing the maximized session
  if (maximizedIndex === index) {
    maximizedIndex = null;
  }

  // Move focus to next visible, or leave unfocused if all minimized
  if (focusedIndex === index) {
    const nextVisible = sessions.findIndex((s, i) => i !== index && !s.minimized);
    if (nextVisible >= 0) {
      focusNextVisible(index, 1);
    }
  }

  rebuildSidebar();
  updateGridLayout();
  updateFooterPills();
  saveSessionState();
}

function restoreSession(index) {
  if (index < 0 || index >= sessions.length) return;
  sessions[index].minimized = false;

  // Exit maximize mode when restoring
  maximizedIndex = null;

  rebuildSidebar();
  updateGridLayout();
  updateFooterPills();
  setFocus(index);
  saveSessionState();
}

function toggleMaximize(index) {
  if (index < 0 || index >= sessions.length) return;

  if (maximizedIndex === index) {
    maximizedIndex = null;
  } else {
    sessions[index].minimized = false;
    maximizedIndex = index;
  }

  // Update all maximize button icons
  sessions.forEach((s, i) => {
    const btn = s.pane.querySelector('.pane-maximize-btn');
    if (btn) {
      btn.innerHTML = (maximizedIndex === i) ? '\u29C9' : '\u25A1'; // ⧉ vs □
      btn.title = (maximizedIndex === i) ? 'Restore (⌘⇧Enter)' : 'Maximize (⌘⇧Enter)';
    }
  });

  updateGridLayout();
  updateFooterPills();
  setFocus(index);
  saveSessionState();
}

// --- Footer Pills ---

function restoreAllSessions() {
  sessions.forEach(s => { s.minimized = false; });
  maximizedIndex = null;
  rebuildSidebar();
  updateGridLayout();
  updateFooterPills();
  saveSessionState();
}

function updateFooterPills() {
  const container = document.getElementById('footer-pills');
  const footer = document.getElementById('footer');
  const robot = document.getElementById('robot-overlay');
  container.innerHTML = '';

  const minimized = sessions.filter(s => s.minimized);

  if (minimized.length > 0) {
    // Count label
    const countLabel = document.createElement('span');
    countLabel.className = 'minimized-count';
    countLabel.textContent = `${minimized.length} minimized`;
    container.appendChild(countLabel);
  }

  minimized.forEach((s) => {
    const i = sessions.indexOf(s);
    const pill = document.createElement('button');
    pill.className = 'footer-pill';
    // Status-colored left border
    if (s.statusDot.style.background) {
      pill.style.borderLeftColor = s.statusDot.style.background;
    }

    const dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.style.background = s.statusDot.style.background;

    const name = document.createElement('span');
    name.textContent = s.name;

    const restore = document.createElement('span');
    restore.className = 'pill-restore';
    restore.textContent = '\u2191';

    pill.appendChild(dot);
    pill.appendChild(name);
    pill.appendChild(restore);
    pill.title = `Restore ${s.name}`;
    pill.addEventListener('click', () => restoreSession(i));

    container.appendChild(pill);
  });

  // Restore all button when multiple minimized
  if (minimized.length > 1) {
    const restoreAll = document.createElement('button');
    restoreAll.className = 'restore-all-btn';
    restoreAll.textContent = 'Restore all';
    restoreAll.addEventListener('click', () => restoreAllSessions());
    container.appendChild(restoreAll);
  }

  // Collapse footer only when no pills AND no git info
  updateFooterVisibility();
}

function updateFooterVisibility() {
  const footer = document.getElementById('footer');
  const robot = document.getElementById('robot-overlay');
  const hasGit = !!document.getElementById('footer-git')?.textContent;
  const hasPills = sessions.some(s => s.minimized);
  const isExpanded = footer.classList.contains('expanded');
  const isEmpty = !hasGit && !hasPills && !isExpanded;
  footer.classList.toggle('empty', isEmpty);
  if (robot) {
    if (isExpanded) {
      const footerEl = document.getElementById('footer');
      robot.style.bottom = footerEl.getBoundingClientRect().height + 'px';
    } else {
      robot.style.bottom = isEmpty ? '0' : 'var(--footer-height)';
    }
  }
}

// --- Sidebar ---

function rebuildSidebar() {
  const list = document.getElementById('session-list');
  list.innerHTML = '';
  sessions.forEach((s, i) => addSessionToSidebar(s.name, i, s.minimized));
}

function addSessionToSidebar(name, index, minimized) {
  const list = document.getElementById('session-list');

  const card = document.createElement('div');
  card.className = 'session-card';
  if (minimized) card.classList.add('minimized-card');
  if (index === focusedIndex) card.classList.add('active');
  card.dataset.index = index;
  card.dataset.status = sessions[index]?.status || 'Idle';
  card.draggable = true;

  const dot = document.createElement('span');
  dot.className = 'status-dot';
  dot.style.background = sessions[index]
    ? sessions[index].statusDot.style.background
    : 'var(--status-idle)';

  const nameEl = document.createElement('span');
  nameEl.className = 'session-name';
  nameEl.textContent = name;

  // Metadata container (CWD, ports, PR)
  const meta = document.createElement('div');
  meta.className = 'session-meta';
  meta.appendChild(nameEl);

  // CWD row
  const session = sessions[index];
  if (session?.cwd) {
    const cwdRow = document.createElement('div');
    cwdRow.className = 'session-meta-row session-cwd';
    const parts = session.cwd.replace(/\/$/, '').split('/');
    const short = parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : session.cwd;
    cwdRow.textContent = short;
    cwdRow.title = session.cwd;
    meta.appendChild(cwdRow);
  }

  // Ports row (populated async)
  const portsRow = document.createElement('div');
  portsRow.className = 'session-meta-row session-ports';
  portsRow.style.display = 'none';
  meta.appendChild(portsRow);

  // PR status row (populated async)
  const prRow = document.createElement('div');
  prRow.className = 'session-meta-row session-pr';
  prRow.style.display = 'none';
  meta.appendChild(prRow);

  // Shortcut badge (⌘1 through ⌘9)
  const shortcut = document.createElement('span');
  shortcut.className = 'session-shortcut';
  if (index < 9) {
    shortcut.textContent = `⌘${index + 1}`;
  }

  const badge = document.createElement('span');
  badge.className = 'session-badge';
  badge.textContent = index + 1;

  card.appendChild(dot);
  card.appendChild(meta);
  card.appendChild(shortcut);
  card.appendChild(badge);

  // Click to focus
  card.addEventListener('click', () => {
    const idx = parseInt(card.dataset.index);
    if (isAnyPanelActive()) hidePanel();
    if (sessions[idx].minimized) {
      restoreSession(idx);
    } else {
      setFocus(idx);
    }
  });

  // Double-click to rename
  card.addEventListener('dblclick', (e) => {
    e.preventDefault();
    promptRename(parseInt(card.dataset.index));
  });

  // Right-click context menu
  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, parseInt(card.dataset.index));
  });

  // Drag-and-drop reordering
  card.addEventListener('dragstart', (e) => {
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.dataset.index);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.session-card').forEach(c => c.classList.remove('drag-over'));
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', () => {
    card.classList.remove('drag-over');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
    const toIdx = parseInt(card.dataset.index);
    if (fromIdx !== toIdx) {
      reorderSession(fromIdx, toIdx);
    }
  });

  list.appendChild(card);
}

function reorderSession(fromIdx, toIdx) {
  const [session] = sessions.splice(fromIdx, 1);
  sessions.splice(toIdx, 0, session);

  // Adjust focusedIndex
  if (focusedIndex === fromIdx) {
    focusedIndex = toIdx;
  } else if (fromIdx < focusedIndex && toIdx >= focusedIndex) {
    focusedIndex--;
  } else if (fromIdx > focusedIndex && toIdx <= focusedIndex) {
    focusedIndex++;
  }

  // Adjust maximizedIndex
  if (maximizedIndex !== null) {
    if (maximizedIndex === fromIdx) {
      maximizedIndex = toIdx;
    } else if (fromIdx < maximizedIndex && toIdx >= maximizedIndex) {
      maximizedIndex--;
    } else if (fromIdx > maximizedIndex && toIdx <= maximizedIndex) {
      maximizedIndex++;
    }
  }

  rebuildSidebar();
  updateGridLayout();
  updateFooterPills();
  saveSessionState();
}

function updateSidebarMeta() {
  const cards = document.querySelectorAll('.session-card');
  sessions.forEach((s, i) => {
    const card = cards[i];
    if (!card) return;

    // Update CWD
    const cwdEl = card.querySelector('.session-cwd');
    if (cwdEl && s.cwd) {
      const parts = s.cwd.replace(/\/$/, '').split('/');
      const short = parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : s.cwd;
      cwdEl.textContent = short;
      cwdEl.title = s.cwd;
      cwdEl.style.display = '';
    } else if (cwdEl) {
      cwdEl.style.display = 'none';
    }

    // Update ports
    const portsEl = card.querySelector('.session-ports');
    if (portsEl) {
      const ports = s._ports || [];
      if (ports.length > 0) {
        portsEl.innerHTML = ports.map(p => `<span class="session-port-badge">:${p}</span>`).join(' ');
        portsEl.style.display = '';
      } else {
        portsEl.style.display = 'none';
      }
    }

    // Update PR status
    const prEl = card.querySelector('.session-pr');
    if (prEl) {
      const pr = s._pr;
      if (pr) {
        const state = pr.state || '';
        const num = pr.number || '';
        const cls = state === 'MERGED' ? 'pr-merged' : state === 'CLOSED' ? 'pr-closed' : '';
        prEl.innerHTML = `<span class="session-pr-badge ${cls}">#${num} ${state.toLowerCase()}</span>`;
        prEl.style.display = '';
      } else {
        prEl.style.display = 'none';
      }
    }
  });
}

// --- New Session ---

function setupNewSessionButton() {
  document.getElementById('new-session-btn').addEventListener('click', () => {
    createSession();
  });
}

// --- Context Menu ---

function showContextMenu(x, y, sessionIndex) {
  hideContextMenu();

  contextMenu = document.createElement('div');
  contextMenu.className = 'context-menu';
  contextMenu.innerHTML = `
    <div class="context-item" data-action="rename">Rename</div>
    <div class="context-item" data-action="minimize">Minimize</div>
    <div class="context-item" data-action="close">Close</div>
  `;

  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  document.body.appendChild(contextMenu);

  contextMenu.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (action === 'rename') promptRename(sessionIndex);
    else if (action === 'minimize') minimizeSession(sessionIndex);
    else if (action === 'close') removeSession(sessionIndex);
    hideContextMenu();
  });

  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 0);
}

function hideContextMenu() {
  if (contextMenu) {
    contextMenu.remove();
    contextMenu = null;
  }
}

function promptRename(index) {
  const session = sessions[index];
  const cards = document.querySelectorAll('.session-card');
  if (!cards[index]) return;

  const nameEl = cards[index].querySelector('.session-name');

  const input = document.createElement('input');
  input.className = 'form-input';
  input.value = session.name;
  input.style.width = '100%';
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim() || session.name;
    session.name = newName;

    const span = document.createElement('span');
    span.className = 'session-name';
    span.textContent = newName;
    input.replaceWith(span);

    // Update pane header
    session.pane.querySelector('.pane-title').textContent = newName;
    updateFooterPills();
    saveSessionState();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { commit(); e.preventDefault(); }
    if (e.key === 'Escape') { input.value = session.name; commit(); }
  });
}

// --- Git Info ---

async function updateGitInfo() {
  const el = document.getElementById('footer-git');
  if (sessions.length === 0 || focusedIndex >= sessions.length) {
    el.textContent = '';
    el.dataset.branch = '';
    return;
  }

  const session = sessions[focusedIndex];
  const cwd = session.cwd;
  if (!cwd) {
    // No CWD tracked — can't detect git info
    el.textContent = '';
    el.dataset.branch = '';
    return;
  }

  try {
    const showBranch = localStorage.getItem('ps-git-show-branch') !== 'false';
    const showWorktree = localStorage.getItem('ps-git-show-worktree') !== 'false';

    if (!showBranch) {
      el.textContent = '';
      el.dataset.branch = '';
      return;
    }

    const summary = await invoke('get_git_info', { cwd });
    if (!summary) {
      el.textContent = '';
      el.dataset.branch = '';
      return;
    }

    let text = `git: ${summary.info.branch}`;
    if (summary.info.is_worktree) {
      text += ' (worktree)';
    }
    if (showWorktree && summary.active_worktree_count > 0) {
      text += ` | worktrees: ${summary.active_worktree_count}`;
    }

    el.textContent = text;
    el.dataset.branch = summary.info.branch;

    // Show chevron when git info is available
    document.getElementById('footer-expand-toggle').style.display = '';
  } catch {
    el.textContent = '';
    el.dataset.branch = '';
    document.getElementById('footer-expand-toggle').style.display = 'none';
  }
  updateFooterVisibility();
}

function setupGitInfoClick() {
  document.getElementById('footer-git').addEventListener('click', () => {
    const branch = document.getElementById('footer-git').dataset.branch;
    if (branch) {
      navigator.clipboard.writeText(branch);
      const el = document.getElementById('footer-git');
      const original = el.textContent;
      el.textContent = 'Copied!';
      setTimeout(() => { el.textContent = original; }, 1000);
    }
  });
}

// --- Footer Expand / Branch Graph ---

let branchGraphCache = null;
let footerExpandedHeight = null; // user-dragged height, persisted in localStorage

function setupFooterExpand() {
  document.getElementById('footer-expand-toggle').addEventListener('click', toggleFooterExpand);
  setupFooterResize();

  // Restore saved height
  const saved = localStorage.getItem('ps-footer-expanded-height');
  if (saved) footerExpandedHeight = parseInt(saved, 10);
}

function setupFooterResize() {
  const footer = document.getElementById('footer');
  const handle = document.getElementById('footer-resize-handle');
  if (!handle) return;

  let startY, startHeight;

  handle.addEventListener('mousedown', (e) => {
    if (!footer.classList.contains('expanded')) return;
    e.preventDefault();
    startY = e.clientY;
    startHeight = footer.getBoundingClientRect().height;
    handle.classList.add('active');
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const delta = startY - e.clientY; // dragging up = positive
      const minH = 60;
      const maxH = Math.floor(window.innerHeight * 0.6);
      const newHeight = Math.max(minH, Math.min(maxH, startHeight + delta));
      footer.style.height = newHeight + 'px';
      footer.style.minHeight = newHeight + 'px';
      footerExpandedHeight = newHeight;
      updateFooterVisibility();
      fitVisibleTerminals();
    }

    function onUp() {
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (footerExpandedHeight) {
        localStorage.setItem('ps-footer-expanded-height', String(footerExpandedHeight));
      }
      fitVisibleTerminals();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

async function toggleFooterExpand() {
  const footer = document.getElementById('footer');
  const graph = document.getElementById('footer-branch-graph');
  const isExpanded = footer.classList.contains('expanded');

  if (isExpanded) {
    footer.classList.remove('expanded');
    footer.style.height = '';
    footer.style.minHeight = '';
    graph.style.display = 'none';
    graph.innerHTML = '';
    branchGraphCache = null;
    updateFooterVisibility();
    fitVisibleTerminals();
    return;
  }

  // Expand and fetch data
  footer.classList.add('expanded');
  if (footerExpandedHeight) {
    footer.style.height = footerExpandedHeight + 'px';
    footer.style.minHeight = footerExpandedHeight + 'px';
  }
  graph.style.display = '';
  graph.innerHTML = '<span class="branch-graph-loading">Loading...</span>';
  updateFooterVisibility();
  fitVisibleTerminals();

  try {
    const session = sessions[focusedIndex];
    if (!session?.cwd) return;
    const data = await invoke('get_branch_graph', { cwd: session.cwd });
    if (!data) {
      graph.innerHTML = '<span class="branch-graph-empty">Not a git repository</span>';
      return;
    }
    branchGraphCache = data;
    renderBranchGraph(data, data.branches.find(b => b.is_current)?.name);
  } catch {
    graph.innerHTML = '<span class="branch-graph-empty">Failed to load branch data</span>';
  }
}

function renderBranchGraph(data, selectedBranch) {
  const graph = document.getElementById('footer-branch-graph');
  graph.innerHTML = '';

  // Left: branch list
  const branchList = document.createElement('div');
  branchList.className = 'branch-list';

  for (const branch of data.branches) {
    const node = document.createElement('div');
    node.className = 'branch-node' + (branch.name === selectedBranch ? ' current' : '');

    const dot = document.createElement('span');
    dot.className = 'branch-dot';

    const label = document.createElement('span');
    label.className = 'branch-label';
    label.textContent = branch.name;

    const badges = document.createElement('span');
    badges.className = 'branch-badges';
    if (branch.ahead > 0) {
      const ahead = document.createElement('span');
      ahead.className = 'branch-badge badge-ahead';
      ahead.textContent = `+${branch.ahead}`;
      badges.appendChild(ahead);
    }
    if (branch.behind > 0) {
      const behind = document.createElement('span');
      behind.className = 'branch-badge badge-behind';
      behind.textContent = `-${branch.behind}`;
      badges.appendChild(behind);
    }

    node.appendChild(dot);
    node.appendChild(label);
    node.appendChild(badges);

    node.addEventListener('click', async (e) => {
      e.stopPropagation();
      // Fetch commits for this branch and re-render
      if (branchGraphCache) {
        renderBranchGraph(branchGraphCache, branch.name);
      }
    });

    branchList.appendChild(node);
  }

  // Right: commit timeline for selected branch
  const timeline = document.createElement('div');
  timeline.className = 'commit-timeline';

  // Find the selected branch's commits — if it's the current branch, use recent_commits
  // Otherwise show just the tip commit info
  const selectedBranchData = data.branches.find(b => b.name === selectedBranch);
  const isCurrentBranch = selectedBranchData?.is_current;

  const commits = isCurrentBranch
    ? data.recent_commits
    : selectedBranchData
      ? [{
          sha: selectedBranchData.commit_sha,
          message: selectedBranchData.commit_message,
          author: selectedBranchData.commit_author,
          time: selectedBranchData.commit_time,
        }]
      : [];

  // Draw the connecting line
  const line = document.createElement('div');
  line.className = 'timeline-line';
  timeline.appendChild(line);

  const now = Math.floor(Date.now() / 1000);

  for (const commit of commits) {
    const dot = document.createElement('div');
    dot.className = 'commit-dot';
    dot.title = `${commit.sha} — ${commit.message}`;

    const timeLabel = document.createElement('span');
    timeLabel.className = 'commit-time';
    timeLabel.textContent = formatRelativeTime(commit.time, now);

    const msgLabel = document.createElement('span');
    msgLabel.className = 'commit-msg';
    msgLabel.textContent = commit.message.length > 20 ? commit.message.slice(0, 20) + '...' : commit.message;

    dot.appendChild(timeLabel);
    dot.appendChild(msgLabel);

    // Click to show tooltip then collapse
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      // Toggle tooltip
      const existing = dot.querySelector('.commit-tooltip');
      if (existing) {
        existing.remove();
        return;
      }
      // Remove other tooltips
      graph.querySelectorAll('.commit-tooltip').forEach(t => t.remove());

      const tooltip = document.createElement('div');
      tooltip.className = 'commit-tooltip';
      tooltip.innerHTML = `<strong>${commit.sha}</strong><br>${escapeHtml(commit.message)}<br><span class="commit-tooltip-meta">${escapeHtml(commit.author)} · ${formatRelativeTime(commit.time, now)}</span>`;
      dot.appendChild(tooltip);
    });

    timeline.appendChild(dot);
  }

  graph.appendChild(branchList);
  graph.appendChild(timeline);
}

function formatRelativeTime(unixSec, nowSec) {
  const diff = nowSec - unixSec;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return `${Math.floor(diff / 604800)}w`;
}

function escapeHtml(text) {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

// --- Config Panel Buttons ---

function setupConfigButtons() {
  document.getElementById('config-scheduled-btn').onclick = () => togglePanel('scheduled');
  document.getElementById('config-plugins-btn').onclick = () => togglePanel('plugins');
  document.getElementById('config-mcps-btn').onclick = () => togglePanel('mcps');
  document.getElementById('config-memory-btn').onclick = () => togglePanel('memory');
  document.getElementById('settings-btn').onclick = () => togglePanel('settings');

  // Re-fit terminals when panel is hidden
  setOnHide(() => {
    requestAnimationFrame(() => fitVisibleTerminals());
  });
}

// --- Sidebar Toggle ---

function setupSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');

  const robotOverlay = document.getElementById('robot-overlay');

  // Restore from localStorage
  if (localStorage.getItem('ps-sidebar-collapsed') === 'true') {
    sidebar.classList.add('collapsed');
    robotOverlay?.classList.add('sidebar-collapsed');
  }

  toggleBtn.addEventListener('click', () => {
    const isCollapsing = !sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed');
    robotOverlay?.classList.toggle('sidebar-collapsed', isCollapsing);
    if (isCollapsing && Math.random() < 0.2 && Date.now() - sidebarReactCooldown > 10 * 60000) {
      sidebarReactCooldown = Date.now();
      setTimeout(() => { if (robotEl && !robotOverride) showSpeech('More room.', 2000); }, 600);
    }
    // Clear inline width so CSS class takes effect
    if (isCollapsing) {
      sidebar._savedWidth = sidebar.style.width || '';
      sidebar.style.width = '';
    } else {
      // Restore dragged width if there was one
      if (sidebar._savedWidth) {
        sidebar.style.width = sidebar._savedWidth;
      }
    }
    localStorage.setItem('ps-sidebar-collapsed', isCollapsing);
  });

  // Re-fit terminals after sidebar transition completes
  sidebar.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'width') {
      fitVisibleTerminals();
    }
  });
}

// --- Keyboard Shortcuts ---

function getShortcutBindings() {
  const saved = localStorage.getItem('ps-shortcuts');
  if (!saved) return null;
  try {
    const arr = JSON.parse(saved);
    const map = {};
    arr.forEach(s => { map[s.id] = s; });
    return map;
  } catch { return null; }
}

function matchesShortcut(e, id, bindings) {
  const b = bindings?.[id];
  if (!b) return false;
  const keyLower = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return keyLower === b.key && e.metaKey === b.meta && e.shiftKey === b.shift;
}

function setupShortcuts() {
  // Capture-phase handler for Shift+Enter — fires BEFORE xterm.js sees the event.
  // Sends CSI u escape sequence so Claude Code interprets it as a newline.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const session = sessions[focusedIndex];
      if (session?.terminal?.sessionId) {
        e.preventDefault();
        e.stopPropagation();
        const encoder = new TextEncoder();
        invoke('write_to_pty', {
          sessionId: session.terminal.sessionId,
          data: Array.from(encoder.encode('\x1b[13;2u')),
        });
      }
    }
  }, true); // capture phase

  // Default bindings (used as fallback)
  const DEFAULTS = {
    'close-panel':    { key: 'Escape',  meta: false, shift: false },
    'settings':       { key: ',',       meta: true,  shift: false },
    'sidebar-toggle': { key: 'b',       meta: true,  shift: false },
    'file-viewer':    { key: 'e',       meta: true,  shift: true  },
    'new-terminal':   { key: 'n',       meta: true,  shift: false },
    'close-terminal': { key: 'w',       meta: true,  shift: false },
    'reopen-closed':  { key: 'z',       meta: true,  shift: true  },
    'maximize':       { key: 'Enter',   meta: true,  shift: true  },
    'minimize':       { key: 'm',       meta: true,  shift: false },
    'restore-all':    { key: 'm',       meta: true,  shift: true  },
    'layout-mode':    { key: 'g',       meta: true,  shift: true  },
    'auto-tile':      { key: 't',       meta: true,  shift: true  },
    'prev-pane':      { key: '[',       meta: true,  shift: true  },
    'next-pane':      { key: ']',       meta: true,  shift: true  },
    'notifications':  { key: 'i',       meta: true,  shift: false },
    'nav-up':         { key: 'ArrowUp',    meta: true,  shift: false, alt: true },
    'nav-down':       { key: 'ArrowDown',  meta: true,  shift: false, alt: true },
    'nav-left':       { key: 'ArrowLeft',  meta: true,  shift: false, alt: true },
    'nav-right':      { key: 'ArrowRight', meta: true,  shift: false, alt: true },
  };

  const ACTIONS = {
    'close-panel':    () => { if (notifPanelVisible) { hideNotificationPanel(); return true; } if (isAnyPanelActive()) hidePanel(); else if (isFileViewerVisible()) hideFileViewer(); else return false; return true; },
    'settings':       () => { togglePanel('settings'); return true; },
    'sidebar-toggle': () => { document.getElementById('sidebar-toggle').click(); return true; },
    'file-viewer':    () => { toggleFileViewer(sessions[focusedIndex]?.cwd); return true; },
    'new-terminal':   () => { createSession(); return true; },
    'close-terminal': () => { if (sessions.length > 0) removeSession(focusedIndex); return true; },
    'reopen-closed':  () => { reopenLastClosed(); return true; },
    'maximize':       () => { if (sessions.length > 0) toggleMaximize(focusedIndex); return true; },
    'minimize':       () => { if (sessions.length > 0) minimizeSession(focusedIndex); return true; },
    'restore-all':    () => { restoreAllSessions(); return true; },
    'layout-mode':    () => { toggleLayoutMode(); return true; },
    'auto-tile':      () => { autoTile(); return true; },
    'prev-pane':      () => { if (isAnyPanelActive()) hidePanel(); focusNextVisible(focusedIndex, -1); return true; },
    'next-pane':      () => { if (isAnyPanelActive()) hidePanel(); focusNextVisible(focusedIndex, 1); return true; },
    'notifications':  () => { toggleNotificationPanel(); return true; },
    'nav-up':         () => { navigateDirection('up'); return true; },
    'nav-down':       () => { navigateDirection('down'); return true; },
    'nav-left':       () => { navigateDirection('left'); return true; },
    'nav-right':      () => { navigateDirection('right'); return true; },
  };

  document.addEventListener('keydown', (e) => {
    const bindings = getShortcutBindings() || DEFAULTS;

    // Cmd+1-9 — always hardcoded (can't rebind per-number)
    if (e.metaKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (idx < sessions.length) {
        // Close any open panel first to return to terminal view
        if (isAnyPanelActive()) hidePanel();
        if (sessions[idx].minimized) restoreSession(idx);
        else setFocus(idx);
      }
      return;
    }

    // Check all configurable shortcuts
    for (const [id, action] of Object.entries(ACTIONS)) {
      const binding = bindings[id] || DEFAULTS[id];
      if (!binding) continue;
      const keyLower = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const altMatch = binding.alt ? e.altKey : !e.altKey;
      if (keyLower === binding.key && e.metaKey === binding.meta && e.shiftKey === binding.shift && altMatch) {
        e.preventDefault();
        if (action() !== false) return;
      }
    }
  });

  // Reload when shortcuts change from settings
  window.addEventListener('shortcuts-changed', () => {
    // Bindings are read fresh on each keydown, so no action needed
  });
}

// --- Notification History ---

const notificationHistory = [];
let unreadNotificationCount = 0;

function addNotification(sessionName, status, sessionIndex) {
  notificationHistory.unshift({
    sessionName,
    status,
    sessionIndex,
    timestamp: Date.now(),
  });
  // Cap at 100 entries
  if (notificationHistory.length > 100) notificationHistory.length = 100;
  unreadNotificationCount++;
  updateNotificationBadge();
}

function updateNotificationBadge() {
  const badge = document.getElementById('notification-count-badge');
  if (!badge) return;
  if (unreadNotificationCount > 0) {
    badge.textContent = unreadNotificationCount > 99 ? '99+' : unreadNotificationCount;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

let notifPanelVisible = false;

function renderNotificationPanel() {
  const content = document.getElementById('notif-content');
  if (!content) return;

  if (notificationHistory.length === 0) {
    content.innerHTML = '<p style="color:var(--text-muted);font-size:var(--font-size-sm);padding:4px;">No notifications yet. Alerts appear here when terminals need attention.</p>';
    return;
  }

  const items = notificationHistory.map((n, i) => {
    const time = new Date(n.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const statusClass = n.status.startsWith('OSC:') ? 'WaitingForInput' : n.status;
    const statusLabel = n.status.startsWith('OSC:') ? n.status : {
      WaitingForInput: 'Needs attention',
      NeedsPermission: 'Needs approval',
      Exited: 'Finished',
      CommandCompleted: 'Command done',
      Error: 'Something went wrong',
      ClaudeFinished: 'Claude is done',
    }[n.status] || n.status;
    const dotColorMap = { WaitingForInput: 'waiting', NeedsPermission: 'waiting', ClaudeNeedsInput: 'waiting', Exited: 'exited', Error: 'exited', ClaudeFinished: 'idle', CommandCompleted: 'idle' };
    const dotColor = dotColorMap[statusClass] || 'working';
    return `<div class="notif-item" data-index="${n.sessionIndex}">
      <span class="notif-dot" style="background:var(--status-${dotColor})"></span>
      <span class="notif-session">${n.sessionName}</span>
      <span class="notif-status">${statusLabel}</span>
      <span class="notif-time">${timeStr}</span>
    </div>`;
  }).join('');

  content.innerHTML = `<div class="notif-list">${items}</div>`;

  // Click to jump to session
  content.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.index);
      if (idx >= 0 && idx < sessions.length) {
        hideNotificationPanel();
        if (sessions[idx].minimized) restoreSession(idx);
        else setFocus(idx);
      }
    });
  });
}

function showNotificationPanel() {
  const panel = document.getElementById('notification-panel');
  panel.classList.add('closing');
  panel.style.display = 'flex';
  panel.offsetHeight; // force reflow
  panel.classList.remove('closing');
  notifPanelVisible = true;
  document.getElementById('notification-toggle-btn').classList.add('active');
  unreadNotificationCount = 0;
  updateNotificationBadge();
  renderNotificationPanel();
}

function hideNotificationPanel() {
  const panel = document.getElementById('notification-panel');
  notifPanelVisible = false;
  document.getElementById('notification-toggle-btn').classList.remove('active');
  panel.classList.add('closing');
  const onEnd = () => {
    panel.removeEventListener('transitionend', onEnd);
    if (!notifPanelVisible) panel.style.display = 'none';
  };
  panel.addEventListener('transitionend', onEnd);
  setTimeout(() => { if (!notifPanelVisible) panel.style.display = 'none'; }, 300);
}

function toggleNotificationPanel() {
  if (notifPanelVisible) { hideNotificationPanel(); return; }
  if (isFileViewerVisible()) hideFileViewer();
  showNotificationPanel();
}

// --- Status Detection ---

const STATUS_COLORS = {
  Working: 'var(--status-working)',
  Idle: 'var(--status-idle)',
  WaitingForInput: 'var(--status-waiting)',
  NeedsPermission: 'var(--status-permission)',
  ClaudeNeedsInput: 'var(--status-waiting)',
  Error: 'var(--status-exited)',
  ClaudeFinished: 'var(--status-idle)',
  Exited: 'var(--status-exited)',
};

async function maybeNotify(session, status) {
  const idx = sessions.indexOf(session);
  const isActiveTab = idx >= 0 && idx === focusedIndex;

  // Mascot speech relay for in-app, different tab (Claude events only)
  if (windowFocused && !isActiveTab && localStorage.getItem('ps-robot-enabled') !== 'false') {
    const friendlyStatus = {
      ClaudeNeedsInput: 'needs your input',
      ClaudeFinished: 'Claude is done',
    }[status];
    if (friendlyStatus) {
      showSpeech(`${session.name}: ${friendlyStatus}`, 4000, true);
      if (robotEl?.classList.contains('act-sleep')) robotStartle();
    }
  }

  // Only send native push notifications for Claude-specific events
  if (!['ClaudeNeedsInput', 'ClaudeFinished'].includes(status)) return;

  // Skip if this is the active tab and window is focused
  if (isActiveTab && windowFocused) return;

  if (localStorage.getItem('ps-notifications') === 'false') return;

  // Per-status opt-out toggles
  const statusToggleMap = {
    ClaudeNeedsInput: 'ps-notify-claude-input',
    ClaudeFinished: 'ps-notify-claude-finished',
  };
  const toggleKey = statusToggleMap[status];
  if (toggleKey && localStorage.getItem(toggleKey) === 'false') return;

  const messages = {
    ClaudeNeedsInput: 'Claude needs your input',
    ClaudeFinished: 'Claude finished working',
  };
  const msg = messages[status];
  if (!msg) return;

  try {
    let granted = await invoke('plugin:notification|is_permission_granted');
    if (!granted) {
      const result = await invoke('plugin:notification|request_permission');
      granted = result === 'granted';
    }
    if (granted) {
      const options = { title: 'PaneStreet', body: `${session.name} ${msg}` };
      if (localStorage.getItem('ps-notify-sound') !== 'false') options.sound = 'default';
      await invoke('plugin:notification|notify', { options });
      console.log('[notify] Sent native notification');
    } else {
      console.log('[notify] Permission not granted');
    }
  } catch (err) {
    console.warn('[notify] Failed:', err);
  }
}

function setupStatusListener() {
  listen('session-status-changed', (event) => {
    const { session_id, status } = event.payload;
    const session = sessions.find(s => s.id === session_id);
    if (!session) return;

    const previousStatus = session.status || 'Idle';
    session.status = status;
    const color = STATUS_COLORS[status] || 'var(--status-idle)';

    // Update pane header dot + border
    session.statusDot.style.background = color;
    session.pane.dataset.status = status;

    // Update sidebar card dot + border
    const cards = document.querySelectorAll('.session-card');
    const idx = sessions.indexOf(session);
    if (cards[idx]) {
      const dot = cards[idx].querySelector('.status-dot');
      if (dot) dot.style.background = color;
      cards[idx].dataset.status = status;
    }

    // Update mascot if this is the focused session
    if (sessions.indexOf(session) === focusedIndex) {
      updateMascot(status);
    }

    // Apply pending terminal settings when session becomes idle
    if (pendingTerminalSettings && (status === 'Idle' || status === 'WaitingForInput')) {
      session.terminal.applySettings(pendingTerminalSettings);
    }

    // Visual ring on unfocused panes (all attention states — non-intrusive)
    const needsAttention = ['WaitingForInput', 'NeedsPermission', 'ClaudeNeedsInput', 'Exited', 'Error', 'ClaudeFinished'].includes(status);
    if (needsAttention && idx !== focusedIndex) {
      session.pane.classList.add('notify-ring');
      const card = document.querySelectorAll('.session-card')[idx];
      if (card) card.classList.add('notify-badge');
    } else if (!needsAttention) {
      session.pane.classList.remove('notify-ring');
      const card = document.querySelectorAll('.session-card')[idx];
      if (card) card.classList.remove('notify-badge');
    }

    // Native push notifications + history: Claude events only
    const isClaudeEvent = ['ClaudeNeedsInput', 'ClaudeFinished'].includes(status);
    if (isClaudeEvent) {
      addNotification(session.name, status, idx);
      maybeNotify(session, status);
    }

    triggerMascotBounce();
  });
}

// --- Update Helpers ---

// Shared download+install+restart flow used by both startup banner and Settings page
async function downloadAndInstallUpdate(update, { onProgress, onFinished, onError, onRestart } = {}) {
  const channel = new window.__TAURI__.core.Channel();
  channel.onmessage = (event) => {
    if (event.event === 'Started' && onProgress) onProgress(0, event.data.contentLength || 0);
    else if (event.event === 'Progress' && onProgress) onProgress(event.data.chunkLength, 0);
    else if (event.event === 'Finished' && onFinished) onFinished();
  };

  await invoke('plugin:updater|download_and_install', { rid: update.rid, onEvent: channel });

  setTimeout(async () => {
    try { await invoke('plugin:process|restart'); }
    catch (e) { if (onRestart) onRestart(e); }
  }, 1500);
}

// Make available to config-panels.js
window.__panestreet = window.__panestreet || {};
window.__panestreet.downloadAndInstallUpdate = downloadAndInstallUpdate;

async function checkForUpdateOnStartup() {
  try {
    const update = await invoke('plugin:updater|check', {});
    if (!update) return;

    const dismissed = localStorage.getItem('ps-update-dismissed');
    if (dismissed === update.version) return;

    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.innerHTML = `
      <span>Version ${update.version} is available.</span>
      <button id="update-banner-install">Update now</button>
      <button id="update-banner-dismiss">&times;</button>
    `;
    const main = document.getElementById('main');
    main.insertBefore(banner, main.children[1]);

    banner.querySelector('#update-banner-dismiss').addEventListener('click', () => {
      localStorage.setItem('ps-update-dismissed', update.version);
      banner.remove();
    });

    banner.querySelector('#update-banner-install').addEventListener('click', async () => {
      const installBtn = banner.querySelector('#update-banner-install');
      installBtn.disabled = true;
      installBtn.textContent = 'Downloading...';

      try {
        await downloadAndInstallUpdate(update, {
          onFinished: () => { installBtn.textContent = 'Restarting...'; },
          onRestart: () => { installBtn.textContent = 'Restart manually'; },
        });
      } catch (err) {
        console.warn('[update] Install failed:', err);
        installBtn.textContent = 'Failed — try Settings';
        installBtn.disabled = false;
      }
    });
  } catch (err) {
    console.log('[update] Startup check skipped:', err);
  }
}

// --- Robot Mascot (JS state machine) ---

const ACTIVITIES = [
  { name: 'stand',   cls: 'act-stand',   duration: [20, 40] },
  { name: 'look',    cls: 'act-look',    duration: [8, 14] },
  { name: 'wave',    cls: 'act-wave',    duration: [4, 6],  speech: 'Hey.' },
  { name: 'sleep',   cls: 'act-sleep',   duration: [30, 60] },
  { name: 'stretch', cls: 'act-stretch', duration: [5, 8] },
  { name: 'nod',     cls: 'act-nod',     duration: [4, 6] },
  { name: 'think',   cls: 'act-think',   duration: [15, 25] },
  { name: 'dance',   cls: 'act-dance',   duration: [4, 7] },
  { name: 'type',    cls: 'act-type',    duration: [10, 18] },
  { name: 'bounce',  cls: 'act-bounce',  duration: [3, 5] },
  { name: 'sweep',   cls: 'act-sweep',   duration: [8, 14],  speech: 'Just a little maintenance.' },
  { name: 'phone',   cls: 'act-phone',   duration: [10, 20], speech: 'Mhm... yeah... mhm.' },
  { name: 'code',         cls: 'act-code',         duration: [12, 22], speech: 'Don\'t mind me.' },
  { name: 'mop',          cls: 'act-mop',          duration: [8, 14] },
  { name: 'shimmy',       cls: 'act-shimmy',       duration: [3, 5] },
  { name: 'antenna-fix',  cls: 'act-antenna-fix',  duration: [2, 3] },
];

const APP_TIPS = [
  'Cmd+N drops a fresh terminal. You\'re welcome.',
  'Cmd+1-9 jumps straight to a session.',
  'Double-click a header to go full-screen.',
  'Cmd+Shift+E opens the file viewer.',
  'Cmd+, opens settings. You probably knew that.',
  'Drag sidebar cards to reorder them.',
  'Right-click a session tab to rename it.',
  'Up to 6 terminals visible at once.',
  'Drag me anywhere. I don\'t mind. Much.',
  'Minimize sessions to the footer — they\'ll wait.',
  'File viewer follows your terminal\'s directory.',
  'Theme picker is in Settings > Theme.',
  'Cmd+I opens the notification panel.',
  'Cmd+Opt+Arrows moves between panes.',
  'You can mute me in Settings. I\'ll be fine. Probably.',
  'Hold-click me for a surprise.',
  'Cmd+W closes the focused terminal.',
  'Hold Cmd and click a link to open it in the browser.',
  'I keep an eye on your terminal output. It\'s part of the job.',
];

const SPEECH_WORKING = ['On it.', 'Working...', 'Give me a sec.', 'Processing...', 'Crunching...', 'On the case.'];
const SPEECH_WAITING = ['Your move.', 'Over to you.', 'Whenever you\'re ready.', 'I\'m patient.', 'Your turn.'];
const SPEECH_DONE = ['Done.', 'There you go.', 'All set.', 'Finished.', 'Easy.', 'That\'s a wrap.'];
const SPEECH_CLICK = ['Hey.', 'Oh, hi.', 'You need something?', 'I\'m here.', 'What\'s the word?', 'In the flesh. Mostly.', 'Ready when you are.', 'Mm?', 'Right here.', 'As you were.', 'Still here.', 'Yep?'];

// Contextual quips based on terminal output patterns
const CONTEXTUAL_QUIPS = [
  { patterns: [/npm install|npm i |yarn add|pnpm add/i], quips: ['Package time.', 'Dependencies inbound.', 'npm doing its thing.', 'Grabbing packages...'] },
  { patterns: [/npm run build|cargo build|vite build|webpack/i], quips: ['Building...', 'Compiling.', 'Build in progress.', 'Fingers crossed.'] },
  { patterns: [/npm test|pytest|cargo test|vitest|jest/i], quips: ['Running tests...', 'Here we go.', 'Let\'s see how this goes.', 'Tests incoming.'] },
  { patterns: [/git push/i], quips: ['Sending it.', 'Up she goes.', 'Shipped.', 'Off it goes.'] },
  { patterns: [/git commit/i], quips: ['Committing to the bit.', 'History is being made.', 'Saved.', 'Good commit.'] },
  { patterns: [/git merge|git rebase/i], quips: ['Merging...', 'Here we go.', 'May the conflicts be few.'] },
  { patterns: [/git pull|git fetch/i], quips: ['Pulling latest.', 'Syncing up.', 'What\'d I miss?'] },
  { patterns: [/docker compose|docker build|docker run/i], quips: ['Containers, containers everywhere.', 'Docker time.', 'Spinning up...'] },
  { patterns: [/pip install|poetry add/i], quips: ['Python packages incoming.', 'pip doing its thing.'] },
  { patterns: [/Total cost:|Total tokens:/i], quips: ["I'd have asked Claude too.", 'Claude delivered.', 'Nice work, Claude.', 'Tokens well spent.'] },
  { patterns: [/error\[|Error:|SyntaxError|TypeError|panic:/i], quips: ['Oof.', 'That\'s not ideal.', 'We\'ve seen worse.', 'Hmm.'] },
  { patterns: [/✓ built|Successfully compiled|Build succeeded|Tests passed/i], quips: ['Green across the board.', 'Clean build.', 'Ship it.', 'Looking good.'] },
  { patterns: [/Downloading|downloading/], quips: ['Downloading...', 'Fetching...'] },
  { patterns: [/deploy|Deploy|DEPLOY/], quips: ['Going live.', 'Launch sequence.', 'Deploying...'] },
  { patterns: [/lint|eslint|prettier/i], quips: ['Keeping it clean.', 'Linting...'] },
  { patterns: [/migration|migrate/i], quips: ['Schema changes incoming.', 'Migrating...'] },
  { patterns: [/claude |Claude /], quips: ['Let Claude cook.', 'AI at work.', 'Claude\'s on it.'] },
  { patterns: [/warning|Warning/], quips: ['Heads up.', 'Worth a look.', 'A warning or two.'] },
  { patterns: [/fatal|FATAL|killed|Killed/i], quips: ['Yikes.', 'That\'s not great.', 'F.'] },
];

// Animation frequency settings: [idlePauseMin, idlePauseMax, contextInterval, walkChance]
const FREQUENCY_SETTINGS = {
  low:    { idleMin: 200, idleMax: 300, contextInterval: 60000, walkChance: 0.1 },
  medium: { idleMin: 40,  idleMax: 70,  contextInterval: 35000, walkChance: 0.45 },
  high:   { idleMin: 30,  idleMax: 60,  contextInterval: 20000, walkChance: 0.3 },
};

let robotEl = null;
let robotTimer = null;
let robotFacingLeft = false;
let robotOverride = null; // status override (working/waiting/exited)
let lastActivityIndex = -1;
let robotSpecialActive = false;
let robotSpecialName = null;
let specialClickCount = 0;
let specialEventScheduleTimer = null;
let lastContextQuip = '';
let contextScanTimer = null;
let longWorkingTimer = null;
let sessionCountReacted = false;
let sidebarReactCooldown = 0;
let staredBackCooldown = 0;
let startledCooldown = 0;
let hiccupTimer = null;

// Boredom tracking
let robotLastInteraction = Date.now();
function touchInteraction() { robotLastInteraction = Date.now(); }
function idleMs() { return Date.now() - robotLastInteraction; }
const BOREDOM_IDLE_QUIPS = ['Still here.', 'Just vibing.', '...', 'Hello?', 'Anybody home?', 'Waiting patiently.'];
const BOREDOM_WALK_QUIPS = ['Right. Going for a walk.', 'Stretching my legs.', 'Be right back.'];

// Hold-to-secret
const SECRET_REACTIONS = [
  () => { robotEl.classList.add('act-dance'); showSpeech('You found me.', 4000, true); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 5000); },
  () => { robotEl.classList.add('act-wave'); showSpeech('This is between us.', 4000, true); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 4000); },
  () => { robotEl.classList.add('act-bounce'); showSpeech("I wasn't expecting that.", 4000, true); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 4000); },
  () => { robotEl.classList.add('act-think'); showSpeech("Nobody's ever held on that long before.", 5000, true); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 6000); },
  () => { robotEl.classList.add('act-sleep'); showSpeech('Zzz...', 1200, true); robotTimer = setTimeout(() => { robotClearActivity(); showSpeech("I wasn't sleeping.", 3000, true); robotNext(); }, 2200); },
  () => { robotEl.classList.add('act-stretch'); showSpeech('Okay fine, you caught me.', 4000, true); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 5000); },
];
let lastSecretIndex = -1;
function triggerSecretReaction() {
  clearTimeout(robotTimer);
  robotClearActivity();
  let idx;
  do { idx = Math.floor(Math.random() * SECRET_REACTIONS.length); } while (idx === lastSecretIndex && SECRET_REACTIONS.length > 1);
  lastSecretIndex = idx;
  SECRET_REACTIONS[idx]();
}

function triggerPetReaction() {
  clearTimeout(robotTimer);
  robotClearActivity();
  robotEl.classList.add('act-bounce');
  const qs = ['Oh! Hi.', 'Hey there.', '...thanks.', 'That tickles.', 'Hello!'];
  showSpeech(qs[Math.floor(Math.random() * qs.length)], 2000, true);
  robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 1500);
}

function robotStartle() {
  if (!robotEl || robotOverride || robotSpecialActive) return;
  if (Date.now() - startledCooldown < 3 * 60000) return;
  startledCooldown = Date.now();
  const wasSleeping = robotEl.classList.contains('act-sleep');
  clearTimeout(robotTimer);
  robotClearActivity();
  robotEl.classList.add('act-startled');
  if (wasSleeping) showSpeech('Wha—', 1500, true);
  setTimeout(() => { robotEl.classList.remove('act-startled'); robotNext(); }, 600);
}

function robotHiccup() {
  if (!robotEl || robotOverride || robotSpecialActive) return;
  if (['act-sleep', 'act-code', 'act-type'].some(c => robotEl.classList.contains(c))) return;
  robotEl.classList.add('act-hiccup');
  setTimeout(() => robotEl.classList.remove('act-hiccup'), 350);
}

function scheduleHiccup() {
  const delay = (20 + Math.random() * 30) * 60000;
  hiccupTimer = setTimeout(() => {
    if (localStorage.getItem('ps-robot-enabled') !== 'false') robotHiccup();
    scheduleHiccup();
  }, delay);
}

function triggerYawnBeforeSleep(callback) {
  robotEl.classList.add('act-yawn');
  setTimeout(() => { robotEl.classList.remove('act-yawn'); callback(); }, 2000);
}

function setupCaughtWatching() {
  let hoverTimer = null;
  const overlay = document.getElementById('robot-overlay');
  overlay?.addEventListener('mousemove', (e) => {
    if (!robotEl) return;
    const rect = robotEl.getBoundingClientRect();
    const inZone = Math.abs(e.clientX - (rect.left + rect.width / 2)) < 40 &&
                   Math.abs(e.clientY - (rect.top + rect.height / 2)) < 50;
    if (inZone) {
      if (!hoverTimer) hoverTimer = setTimeout(() => {
        hoverTimer = null;
        if (Date.now() - staredBackCooldown < 5 * 60000) return;
        if (robotOverride || robotSpecialActive) return;
        staredBackCooldown = Date.now();
        const qs = ["I see you.", "Something I can help with?", "...hi.", "I can feel you staring."];
        showSpeech(qs[Math.floor(Math.random() * qs.length)], 3000, true);
        robotEl.classList.add('act-look');
        setTimeout(() => robotEl.classList.remove('act-look'), 3000);
      }, 5000);
    } else {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  });
}

function applyTimeOfDay() {
  const h = new Date().getHours();
  const overlay = document.getElementById('robot-overlay');
  const isLate = h >= 23 || h < 4;
  const isMorning = h >= 5 && h < 9;
  overlay?.classList.toggle('time-late', isLate);
  const tod = isLate ? 'late' : isMorning ? 'morning' : '';
  if (!tod) return;
  const key = 'ps-time-' + new Date().toDateString() + '-' + tod;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  const delay = 6000 + Math.random() * 4000;
  if (isLate) setTimeout(() => { if (robotEl && !robotOverride) showSpeech("It's late.", 3000); }, delay);
  else if (isMorning) setTimeout(() => { if (robotEl && !robotOverride) showSpeech('Morning.', 2500); }, delay);
}

// Theme reaction cooldown
let themeReactionCooldown = 0;

// Speech cooldown — non-priority speech is throttled to once per ~55s
let lastSpeechTime = 0;
const SPEECH_COOLDOWN_MS = 55000;

function getFrequency() {
  return FREQUENCY_SETTINGS[localStorage.getItem('ps-robot-frequency') || 'medium'];
}

function robotInit() {
  robotEl = document.getElementById('footer-mascot');
  if (!robotEl) return;

  const overlay = document.getElementById('robot-overlay');

  // Check saved preference
  if (localStorage.getItem('ps-robot-enabled') === 'false') {
    overlay?.classList.add('hidden');
    return;
  }

  // Start at a random spot — disable transition so it doesn't slide from default position
  robotEl.style.transition = 'none';
  const overlayWidth = overlay ? overlay.clientWidth : 400;
  robotEl.style.left = Math.floor(4 + Math.random() * Math.max(100, overlayWidth - 80)) + 'px';
  // Force layout before re-enabling transition
  void robotEl.offsetLeft;

  // --- Drag handling (pick up above line, drop back down) ---
  let isDragging = false;
  let hasDragged = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let holdTimer = null;
  let petTimer = null;
  let secretFired = false;
  let petFired = false;

  overlay?.addEventListener('mousedown', (e) => {
    const rect = robotEl.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.abs(dx) > 40 || Math.abs(dy) > 50) return;

    if (robotSpecialActive) cancelSpecialEvent();
    isDragging = true;
    hasDragged = false;
    secretFired = false;
    petFired = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartLeft = parseInt(robotEl.style.left) || 0;

    clearTimeout(robotTimer);
    robotClearActivity();
    robotEl.style.transition = 'none';
    robotEl.style.bottom = '0px';
    robotEl.classList.add('dragging');
    e.preventDefault();

    // 1s hold = pet reaction
    petTimer = setTimeout(() => {
      if (!hasDragged && !secretFired) {
        petFired = true;
        isDragging = false;
        robotEl.classList.remove('dragging');
        triggerPetReaction();
      }
    }, 1000);

    // 2s hold = secret surprise
    holdTimer = setTimeout(() => {
      if (!hasDragged) {
        secretFired = true;
        petFired = false;
        isDragging = false;
        robotEl.classList.remove('dragging');
        triggerSecretReaction();
      }
    }, 2000);
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX;
    const deltaY = dragStartY - e.clientY; // up = positive
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      hasDragged = true;
      // Cancel hold timers once the user starts dragging
      if (petTimer)  { clearTimeout(petTimer);  petTimer = null; }
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    }
    const ow = overlay ? overlay.clientWidth : window.innerWidth;
    const newLeft = Math.max(4, Math.min(ow - 72, dragStartLeft + deltaX));
    robotEl.style.left = newLeft + 'px';
    // Allow picking up above the bottom line
    const liftY = Math.max(0, deltaY);
    robotEl.style.bottom = liftY + 'px';
  });

  const DROP_QUOTES = [
    'AAAAAH!', 'Not again!', 'I can fly! ...nope.', 'Mayday!',
    'Wheeeee!', 'Put me down!', 'I regret everything!', 'Gravity wins again.',
    'My antenna!', 'Told you I\'d land it.', 'Stuck the landing!', '10/10 landing.',
    'That was fun!', 'Do NOT do that again.', 'I think I left my stomach up there.',
  ];

  document.addEventListener('mouseup', () => {
    if (petTimer)  { clearTimeout(petTimer);  petTimer = null; }
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (!isDragging) return;
    isDragging = false;
    robotEl.classList.remove('dragging');
    touchInteraction();
    const currentBottom = parseInt(robotEl.style.bottom) || 0;
    if (currentBottom > 20) {
      // Falling! Wave arms and speak
      robotEl.classList.add('act-falling');
      const fallDuration = Math.min(2.2, 0.9 + currentBottom * 0.006);
      robotEl.style.transition = `bottom ${fallDuration}s cubic-bezier(0.33, 0, 0.66, 1)`;
      robotEl.style.bottom = '0px';
      showSpeech(DROP_QUOTES[Math.floor(Math.random() * DROP_QUOTES.length)], 2500, true);
      setTimeout(() => {
        robotEl.style.transition = '';
        robotEl.classList.remove('act-falling');
        robotEl.classList.add('act-bounce');
        setTimeout(() => { robotEl.classList.remove('act-bounce'); if (!robotOverride) robotNext(); }, 600);
      }, fallDuration * 1000);
    } else if (currentBottom > 0) {
      robotEl.style.transition = 'bottom 0.3s ease-out';
      robotEl.style.bottom = '0px';
      setTimeout(() => { robotEl.style.transition = ''; }, 350);
      if (hasDragged) {
        showSpeech(['New spot, nice.', 'I like it here.', 'Cozy.', 'Good enough.'][Math.floor(Math.random() * 4)], 2000);
        setTimeout(() => { if (!robotOverride) robotNext(); }, 2000);
      } else {
        if (!robotOverride) robotNext();
      }
    } else {
      if (hasDragged) {
        showSpeech(['New spot, nice.', 'I like it here.', 'Fine by me.', 'This works.'][Math.floor(Math.random() * 4)], 2000);
        setTimeout(() => { if (!robotOverride) robotNext(); }, 2000);
      } else {
        if (!robotOverride) robotNext();
      }
    }
  });

  // Click interaction — easter egg on rapid clicks
  let clickCount = 0;
  let clickResetTimer = null;

  overlay?.addEventListener('click', (e) => {
    if (robotSpecialActive) {
      specialClickCount++;
      if (specialClickCount >= 2) {
        cancelSpecialEvent();
      } else {
        const quipMap = {
          desk:      ["I'm in the zone.", 'One sec...', 'Almost done.'],
          broom:     ["I'm sweeping here.", 'Can it wait?', 'One more pass.'],
          cartwheel: ['Woo!', 'Did you see that?', 'Nailed it.'],
        };
        const quips = quipMap[robotSpecialName] || ['One moment.'];
        showSpeech(quips[Math.floor(Math.random() * quips.length)], 2500, true);
      }
      return;
    }
    if (hasDragged || secretFired) { hasDragged = false; secretFired = false; return; }
    touchInteraction();
    const rect = robotEl.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.abs(dx) > 40 || Math.abs(dy) > 50) return;

    clickCount++;
    clearTimeout(clickResetTimer);
    clickResetTimer = setTimeout(() => { clickCount = 0; }, 1500);

    if (clickCount >= 8) {
      clickCount = 0;
      clearTimeout(robotTimer);
      robotClearActivity();
      // Exasperated tier
      const reactions = [
        () => { showSpeech('I\'m filing a complaint.', 4000); robotWalk(); },
        () => { showSpeech('Fine. You win.', 3000); robotWalk(); },
        () => { showSpeech('I need a vacation.', 4000); robotEl.classList.add('act-sleep'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 8000); },
        () => { showSpeech('I know a union guy.', 4000); robotWalk(); },
        () => { showSpeech('I\'ve accepted my fate.', 4000); robotEl.classList.add('act-stand'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 5000); },
        () => { showSpeech('Fine. I\'m going to sleep.', 4000); robotEl.classList.add('act-sleep'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 10000); },
      ];
      reactions[Math.floor(Math.random() * reactions.length)]();
    } else if (clickCount >= 5) {
      clearTimeout(robotTimer);
      robotClearActivity();
      // Animated tier
      const reactions = [
        () => { showSpeech('You\'re really going for it.', 3500); robotEl.classList.add('act-dance'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 5000); },
        () => { showSpeech('I\'m not a button, you know.', 4000); robotEl.classList.add('act-bounce'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 4000); },
        () => { showSpeech('Careful. I bite.', 3000); robotEl.classList.add('act-look'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 4000); },
        () => { showSpeech('Okay, sure. Just click away.', 3500); robotDoActivity(); },
        () => { showSpeech('I\'m logging this.', 3500); robotEl.classList.add('act-type'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 4000); },
      ];
      reactions[Math.floor(Math.random() * reactions.length)]();
    } else if (clickCount >= 3) {
      clearTimeout(robotTimer);
      robotClearActivity();
      // Mild annoyance tier
      const reactions = [
        () => { showSpeech('Hey, that tickles.', 3000); robotEl.classList.add('act-bounce'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 4000); },
        () => { showSpeech('I\'m working here.', 3000); robotEl.classList.add('act-type'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 4000); },
        () => { showSpeech('Personal space, please.', 3000); robotWalk(); },
        () => { showSpeech('Alright, dance break I guess.', 4000); robotEl.classList.add('act-dance'); robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, 5000); },
        () => { showSpeech('Do you need something?', 3000); robotDoActivity(); },
        () => { showSpeech('...', 2500); robotDoActivity(); },
      ];
      reactions[Math.floor(Math.random() * reactions.length)]();
    } else {
      showSpeech(SPEECH_CLICK[Math.floor(Math.random() * SPEECH_CLICK.length)]);
    }
  });

  // --- Eye tracking — lazy glances toward cursor, not constant following ---
  let eyeGlanceTimer = null;
  let eyeCurrentOX = 0, eyeCurrentOY = 0;
  let eyeTargetOX = 0, eyeTargetOY = 0;
  let eyeMouseX = 0, eyeMouseY = 0;
  let eyeGlancing = false;

  document.addEventListener('mousemove', (e) => {
    eyeMouseX = e.clientX;
    eyeMouseY = e.clientY;
  });

  function scheduleNextGlance() {
    // Glance every 4-10 seconds — feels natural, not robotic
    const delay = (4 + Math.random() * 6) * 1000;
    eyeGlanceTimer = setTimeout(() => {
      if (!robotEl || localStorage.getItem('ps-robot-enabled') === 'false' ||
          ['act-look','act-code','act-dance','act-bounce','act-wave','act-sleep'].some(c => robotEl.classList.contains(c))) {
        scheduleNextGlance();
        return;
      }
      // Compute target offset toward cursor
      const rect = robotEl.getBoundingClientRect();
      const headCX = rect.left + rect.width * 0.5;
      const headCY = rect.top + rect.height * 0.32;
      const dx = eyeMouseX - headCX;
      const dy = eyeMouseY - headCY;
      const scaleX = 36 / rect.width;
      const scaleY = 38 / rect.height;
      eyeTargetOX = Math.max(-1.3, Math.min(1.3, dx * scaleX * 0.12));
      eyeTargetOY = Math.max(-0.7, Math.min(0.7, dy * scaleY * 0.08));
      eyeGlancing = true;

      // Hold the glance for 1.5-3s, then drift back to neutral
      setTimeout(() => {
        eyeTargetOX = 0;
        eyeTargetOY = 0;
        eyeGlancing = false;
        scheduleNextGlance();
      }, 1500 + Math.random() * 1500);

      applyEyeTransform();
    }, delay);
  }

  function applyEyeTransform() {
    if (!robotEl) return;
    const eyes = robotEl.querySelector('.robot-eyes');
    if (!eyes) return;
    // Smooth lerp toward target
    eyeCurrentOX += (eyeTargetOX - eyeCurrentOX) * 0.18;
    eyeCurrentOY += (eyeTargetOY - eyeCurrentOY) * 0.18;
    eyes.setAttribute('transform', `translate(${eyeCurrentOX.toFixed(2)},${eyeCurrentOY.toFixed(2)})`);
    // Keep animating until we're settled
    if (Math.abs(eyeCurrentOX - eyeTargetOX) > 0.02 || Math.abs(eyeCurrentOY - eyeTargetOY) > 0.02) {
      requestAnimationFrame(applyEyeTransform);
    }
  }

  scheduleNextGlance();

  // If window resizes and robot is off-screen, walk back into view
  window.addEventListener('resize', () => {
    if (!robotEl || !overlay) return;
    const overlayWidth = overlay.clientWidth;
    const currentLeft = parseInt(robotEl.style.left) || 0;
    if (currentLeft > overlayWidth - 60) {
      // Robot is off-screen — walk back in
      clearTimeout(robotTimer);
      robotClearActivity();
      const dest = Math.floor(overlayWidth * 0.5 + Math.random() * (overlayWidth * 0.3));
      const safeDest = Math.min(dest, overlayWidth - 80);
      robotFacingLeft = true;
      robotEl.classList.add('face-left');
      robotEl.classList.add('walking');
      const duration = Math.max(2, (currentLeft - safeDest) * 0.04);
      robotEl.style.transition = `left ${duration}s linear`;
      robotEl.style.left = safeDest + 'px';
      robotTimer = setTimeout(() => {
        robotEl.classList.remove('walking', 'face-left');
        robotNext();
      }, duration * 1000);
    }
  });

  // --- Environment Detection ---

  // Online / offline
  window.addEventListener('offline', () => {
    if (robotEl && localStorage.getItem('ps-robot-enabled') !== 'false') showSpeech('We lost the connection.', 4000, true);
  });
  window.addEventListener('online', () => {
    if (robotEl && localStorage.getItem('ps-robot-enabled') !== 'false') showSpeech('Back online.', 3000, true);
  });

  // Window focus / blur — comment on long absences
  let blurTime = null;
  window.addEventListener('blur', () => { blurTime = Date.now(); });
  window.addEventListener('focus', () => {
    if (!blurTime) return;
    const away = Date.now() - blurTime;
    blurTime = null;
    touchInteraction(); // reset boredom clock when user returns
    if (away > 5 * 60 * 1000 && robotEl && localStorage.getItem('ps-robot-enabled') !== 'false') {
      const msgs = ['Welcome back.', 'Oh, you\'re back.', 'Miss me?', 'There you are.', 'I waited.'];
      setTimeout(() => showSpeech(msgs[Math.floor(Math.random() * msgs.length)], 3500, true), 600);
    }
  });

  // Battery (where supported)
  if ('getBattery' in navigator) {
    navigator.getBattery().then(battery => {
      let batteryAlertSent = false;
      const checkBattery = () => {
        if (!batteryAlertSent && battery.level < 0.2 && !battery.charging && robotEl && localStorage.getItem('ps-robot-enabled') !== 'false') {
          batteryAlertSent = true;
          showSpeech('Low battery. Save your work.', 5000, true);
        }
      };
      checkBattery();
      battery.addEventListener('levelchange', checkBattery);
      battery.addEventListener('chargingchange', () => { if (battery.charging) batteryAlertSent = false; });
    }).catch(() => {});
  }

  // Theme changes
  window.addEventListener('theme-changed', () => {
    if (!robotEl || localStorage.getItem('ps-robot-enabled') === 'false') return;
    if (Date.now() - themeReactionCooldown < 30000) return;
    themeReactionCooldown = Date.now();
    const msgs = ['New look.', 'Nice theme.', 'Bold choice.', 'I like it.', 'Stylish.'];
    setTimeout(() => showSpeech(msgs[Math.floor(Math.random() * msgs.length)], 3000), 500);
  });

  // Just stand still on startup — the idle hover animation handles the rest
  // First real action after a long pause
  robotNext();
  startContextScanning();
}

function toggleRobot(enabled) {
  const overlay = document.getElementById('robot-overlay');
  if (!overlay) return;
  if (enabled) {
    overlay.classList.remove('hidden');
    localStorage.setItem('ps-robot-enabled', 'true');
    if (!robotOverride) robotNext();
  } else {
    overlay.classList.add('hidden');
    localStorage.setItem('ps-robot-enabled', 'false');
    clearTimeout(robotTimer);
  }
}

function walkTo(destX, callback, clamp = true) {
  const overlay = document.getElementById('robot-overlay');
  const overlayWidth = overlay ? overlay.clientWidth : window.innerWidth;
  const dest = clamp ? Math.max(4, Math.min(overlayWidth - 80, destX)) : destX;
  const currentLeft = parseInt(robotEl.style.left) || 4;
  const distance = Math.abs(dest - currentLeft);
  const duration = Math.max(1, distance * 0.05);
  robotFacingLeft = dest < currentLeft;
  robotEl.classList.toggle('face-left', robotFacingLeft);
  robotEl.classList.add('walk-anticipate');
  setTimeout(() => {
    robotEl.classList.remove('walk-anticipate');
    robotEl.classList.add('walking');
    robotEl.style.transition = `left ${duration}s linear`;
    robotEl.style.left = dest + 'px';
    setTimeout(() => {
      robotEl.classList.remove('walking');
      robotEl.style.transition = 'none';
      robotEl.classList.add('walk-arrive');
      setTimeout(() => { robotEl.classList.remove('walk-arrive'); if (callback) callback(); }, 300);
    }, duration * 1000);
  }, 200);
}

function scheduleSpecialEvent() {
  clearTimeout(specialEventScheduleTimer);
  const delay = (4 + Math.random() * 2) * 60 * 1000; // 4-6 min
  specialEventScheduleTimer = setTimeout(() => {
    if (!robotEl || robotOverride || localStorage.getItem('ps-robot-enabled') === 'false') {
      scheduleSpecialEvent(); return;
    }
    clearTimeout(robotTimer);
    robotClearActivity();
    const events = [triggerDeskEvent, triggerBroomEvent, triggerCartwheelEvent];
    events[Math.floor(Math.random() * events.length)]();
  }, delay);
}

function cancelSpecialEvent() {
  if (!robotSpecialActive) return;
  robotSpecialActive = false;
  robotSpecialName = null;
  specialClickCount = 0;
  clearTimeout(robotTimer);
  robotClearActivity();
  robotEl.classList.remove('act-special-broom', 'act-special-cartwheel');
  const deskProp = document.getElementById('robot-prop-desk');
  if (deskProp) { deskProp.style.transition = 'none'; deskProp.style.right = '-200px'; }
  showSpeech('Fine, fine.', 2000, true);
  setTimeout(() => { robotNext(); scheduleSpecialEvent(); }, 1200);
}

function triggerDeskEvent() {
  robotSpecialActive = true; robotSpecialName = 'desk'; specialClickCount = 0;
  const overlay = document.getElementById('robot-overlay');
  const ow = overlay ? overlay.clientWidth : 800;
  const deskProp = document.getElementById('robot-prop-desk');
  const deskWidth = 160, deskRightGap = 20;

  // Slide desk in from right
  if (deskProp) { deskProp.style.transition = ''; deskProp.style.right = deskRightGap + 'px'; }

  // Walk robot to be centered behind the desk
  const robotDest = ow - deskRightGap - deskWidth + deskWidth / 2 - 34;
  setTimeout(() => {
    walkTo(robotDest, () => {
      showSpeech('Time to get some work done.', 3500, true);
      setTimeout(() => {
        robotEl.classList.add('act-code');
        const workDur = 14000 + Math.random() * 6000;
        robotTimer = setTimeout(() => {
          robotEl.classList.remove('act-code');
          showSpeech('Good session.', 2500, true);
          if (deskProp) { deskProp.style.transition = ''; deskProp.style.right = '-200px'; }
          setTimeout(() => {
            if (!robotSpecialActive) return; // already cancelled
            robotSpecialActive = false; robotSpecialName = null;
            robotNext(); scheduleSpecialEvent();
          }, 1200);
        }, workDur);
      }, 500);
    });
  }, 900);
}

function triggerBroomEvent() {
  robotSpecialActive = true; robotSpecialName = 'broom'; specialClickCount = 0;
  const overlay = document.getElementById('robot-overlay');
  const ow = overlay ? overlay.clientWidth : 800;

  // Phase 1: Walk to left edge
  walkTo(4, () => {
    robotEl.style.transition = 'left 0.5s ease-in';
    robotEl.style.left = '-80px';
    setTimeout(() => {
      // Phase 2: Reappear on right with broom
      robotEl.style.transition = 'none';
      robotEl.style.left = (ow + 10) + 'px';
      robotFacingLeft = true;
      robotEl.classList.add('face-left', 'act-special-broom');
      showSpeech('Tidying up.', 3000, true);
      // Phase 3: Sweep across to left
      setTimeout(() => {
        const sweepDur = Math.max(4, ow * 0.006);
        robotEl.style.transition = `left ${sweepDur}s linear`;
        robotEl.style.left = '-80px';
        robotTimer = setTimeout(() => {
          if (!robotSpecialActive) return;
          // Phase 4: Remove broom, re-enter from left
          robotEl.classList.remove('act-special-broom');
          robotFacingLeft = false;
          robotEl.classList.remove('face-left');
          robotEl.style.transition = 'none';
          const returnDest = Math.floor(ow * 0.25 + Math.random() * ow * 0.35);
          const returnDur = Math.max(2, returnDest * 0.05);
          robotEl.classList.add('walking');
          robotEl.style.transition = `left ${returnDur}s linear`;
          robotEl.style.left = returnDest + 'px';
          robotTimer = setTimeout(() => {
            if (!robotSpecialActive) return;
            robotEl.classList.remove('walking');
            robotEl.style.transition = 'none';
            showSpeech('All clean.', 2500, true);
            setTimeout(() => {
              robotSpecialActive = false; robotSpecialName = null;
              robotNext(); scheduleSpecialEvent();
            }, 1500);
          }, returnDur * 1000);
        }, sweepDur * 1000);
      }, 400);
    }, 600);
  });
}

function triggerCartwheelEvent() {
  robotSpecialActive = true; robotSpecialName = 'cartwheel'; specialClickCount = 0;
  const overlay = document.getElementById('robot-overlay');
  const ow = overlay ? overlay.clientWidth : 800;

  const startX = Math.floor(ow * 0.2 + Math.random() * ow * 0.2);
  walkTo(startX, () => {
    showSpeech('Watch this.', 2000, true);
    setTimeout(() => {
      if (!robotSpecialActive) return;
      const dir = Math.random() < 0.5 ? 1 : -1;
      const distance = 160 + Math.random() * 80;
      const destX = Math.max(4, Math.min(ow - 80, startX + dir * distance));
      robotFacingLeft = dir < 0;
      robotEl.classList.toggle('face-left', robotFacingLeft);

      const wheelDur = 1.8;
      robotEl.classList.add('act-special-cartwheel');
      robotEl.style.transition = `left ${wheelDur}s linear`;
      robotEl.style.left = destX + 'px';

      robotTimer = setTimeout(() => {
        if (!robotSpecialActive) return;
        robotEl.classList.remove('act-special-cartwheel');
        robotEl.style.transition = 'none';
        const reactions = ['Nailed it.', 'Still got it.', '...that was harder than it looks.', 'Ta-da.'];
        showSpeech(reactions[Math.floor(Math.random() * reactions.length)], 2500, true);
        setTimeout(() => {
          robotSpecialActive = false; robotSpecialName = null;
          robotNext(); scheduleSpecialEvent();
        }, 1500);
      }, wheelDur * 1000 + 100);
    }, 2200);
  });
}

function robotNext() {
  if (!robotEl || robotOverride) return;
  const freq = getFrequency();
  const idlePause = (freq.idleMin + Math.random() * (freq.idleMax - freq.idleMin)) * 1000;
  robotTimer = setTimeout(() => {
    if (!robotEl || robotOverride) return;
    if (Math.random() < freq.walkChance) {
      robotWalk();
    } else {
      robotDoActivity();
    }
  }, idlePause);
}

function robotWalk() {
  if (robotOverride) return;
  robotClearActivity();

  // Pick a random destination within the overlay (which starts after sidebar)
  const overlay = document.getElementById('robot-overlay');
  const overlayWidth = overlay ? overlay.clientWidth : window.innerWidth;
  const minX = 4;
  const maxX = Math.max(minX + 100, overlayWidth - 80);
  const dest = Math.floor(minX + Math.random() * (maxX - minX));
  const currentLeft = parseInt(robotEl.style.left) || 4;
  const distance = Math.abs(dest - currentLeft);
  const duration = Math.max(4, distance * 0.08); // ~0.08s per px, min 4s

  // Moonwalk ~5% of the time
  const isMoonwalk = !robotSpecialActive && Math.random() < 0.05;

  // Face the right direction (moonwalk faces backwards)
  robotFacingLeft = dest < currentLeft;
  robotEl.classList.toggle('face-left', isMoonwalk ? !robotFacingLeft : robotFacingLeft);
  if (isMoonwalk) robotEl.classList.add('moonwalk');

  // Anticipation crouch before walking
  robotEl.classList.add('walk-anticipate');
  robotTimer = setTimeout(() => {
    robotEl.classList.remove('walk-anticipate');

    // Start walking
    robotEl.classList.add('walking');
    robotEl.style.transition = `left ${duration}s linear`;
    robotEl.style.left = dest + 'px';

    // After arriving, settle then do an activity
    robotTimer = setTimeout(() => {
      robotEl.classList.remove('walking', 'moonwalk');
      robotEl.classList.toggle('face-left', robotFacingLeft);

      // Occasional stumble on arrival (~8% chance)
      if (Math.random() < 0.08) {
        robotEl.classList.add('act-stumble');
        setTimeout(() => robotEl.classList.remove('act-stumble'), 500);
      }

      // Follow-through settle animation
      robotEl.classList.add('walk-arrive');
      robotTimer = setTimeout(() => {
        robotEl.classList.remove('walk-arrive');
        // Rest after walking (respects frequency)
        const f = getFrequency();
        robotTimer = setTimeout(() => robotNext(), (f.idleMin + Math.random() * (f.idleMax - f.idleMin)) * 1000);
      }, 300);
    }, duration * 1000);
  }, 200);
}

function robotDoActivity() {
  if (robotOverride) return;
  robotClearActivity();

  const idle = idleMs();
  const boredLevel = idle > 12 * 60000 ? 3 : idle > 8 * 60000 ? 2 : idle > 3 * 60000 ? 1 : 0;

  // Boredom level 3 (12+ min idle): force sleep
  if (boredLevel >= 3) {
    const sleepAct = ACTIVITIES.find(a => a.name === 'sleep');
    const dur = sleepAct.duration[0] + Math.random() * (sleepAct.duration[1] - sleepAct.duration[0]);
    triggerYawnBeforeSleep(() => {
      robotEl.classList.add(sleepAct.cls);
      showSpeech('Zzz...', 5000);
      robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, dur * 1000);
    });
    return;
  }

  // Boredom level 2 (8+ min idle): 40% chance to wander with quip
  if (boredLevel >= 2 && Math.random() < 0.4) {
    showSpeech(BOREDOM_WALK_QUIPS[Math.floor(Math.random() * BOREDOM_WALK_QUIPS.length)], 2500);
    setTimeout(() => robotWalk(), 500);
    return;
  }

  // Pick activity — bias toward boring ones when idle
  let idx;
  const boringNames = ['stand', 'look', 'nod', 'think'];
  if (boredLevel >= 1 && Math.random() < 0.65) {
    const boringActs = ACTIVITIES.filter(a => boringNames.includes(a.name));
    const candidate = boringActs[Math.floor(Math.random() * boringActs.length)];
    idx = ACTIVITIES.indexOf(candidate);
  } else {
    do {
      idx = Math.floor(Math.random() * ACTIVITIES.length);
    } while (idx === lastActivityIndex && ACTIVITIES.length > 1);
  }
  lastActivityIndex = idx;

  const act = ACTIVITIES[idx];
  const dur = act.duration[0] + Math.random() * (act.duration[1] - act.duration[0]);

  // Yawn before sleep
  if (act.name === 'sleep') {
    triggerYawnBeforeSleep(() => {
      robotEl.classList.add(act.cls);
      showSpeech('Zzz...');
      robotTimer = setTimeout(() => { robotClearActivity(); robotNext(); }, dur * 1000);
    });
    return;
  }

  robotEl.classList.add(act.cls);

  if (act.speech) {
    showSpeech(act.speech);
  }

  // Occasional boredom quip while doing a boring activity
  if (boredLevel >= 1 && boringNames.includes(act.name) && Math.random() < 0.3) {
    setTimeout(() => {
      if (!robotOverride) showSpeech(BOREDOM_IDLE_QUIPS[Math.floor(Math.random() * BOREDOM_IDLE_QUIPS.length)], 3000);
    }, (dur * 0.5) * 1000);
  }

  // Stay in this activity for its duration, then move on
  robotTimer = setTimeout(() => {
    robotClearActivity();
    robotNext();
  }, dur * 1000);
}

function robotClearActivity() {
  if (!robotEl) return;
  robotEl.classList.remove('walking', 'face-left', 'walk-anticipate', 'walk-arrive', 'moonwalk');
  robotEl.classList.remove('act-stumble', 'act-hiccup', 'act-startled', 'act-double-take', 'act-yawn');
  for (const act of ACTIVITIES) {
    robotEl.classList.remove(act.cls);
  }
  // Clean up any active special event state
  if (robotSpecialActive) {
    robotSpecialActive = false;
    robotSpecialName = null;
    specialClickCount = 0;
    robotEl.classList.remove('act-special-broom', 'act-special-cartwheel');
    const deskProp = document.getElementById('robot-prop-desk');
    if (deskProp) { deskProp.style.transition = 'none'; deskProp.style.right = '-200px'; }
  }
  robotEl.style.transition = 'none';
}

// --- Contextual Terminal Awareness ---

function sampleTerminalContext() {
  if (!robotEl || robotOverride) return;
  if (localStorage.getItem('ps-robot-enabled') === 'false') return;
  if (sessions.length === 0) return;

  // Sample the focused session's output buffer
  const session = sessions[focusedIndex];
  if (!session?.terminal?._outputBuffer) return;

  const buffer = session.terminal._outputBuffer;
  // Only look at the last 300 chars (recent output)
  const tail = buffer.slice(-300);

  for (const entry of CONTEXTUAL_QUIPS) {
    for (const pattern of entry.patterns) {
      if (pattern.test(tail)) {
        const quip = entry.quips[Math.floor(Math.random() * entry.quips.length)];
        // Don't repeat the same quip
        if (quip === lastContextQuip) continue;
        lastContextQuip = quip;
        // Double-take on fatal/error patterns (~30% chance)
        if (/fatal|FATAL|killed|Killed|error\[|SyntaxError|TypeError|panic:/i.test(tail) && Math.random() < 0.3 && !robotOverride) {
          robotEl.classList.add('act-double-take');
          setTimeout(() => robotEl.classList.remove('act-double-take'), 450);
        }
        showSpeech(quip, 4000);
        return;
      }
    }
  }

  // Fallback: check multi-session awareness
  const workingCount = sessions.filter(s => s.status === 'Working').length;
  if (workingCount >= 3 && Math.random() < 0.3) {
    const multi = ['Busy day.', 'All hands on deck.', 'Full steam ahead.', `${workingCount} sessions cooking...`];
    const q = multi[Math.floor(Math.random() * multi.length)];
    if (q !== lastContextQuip) { lastContextQuip = q; showSpeech(q, 4000); }
    return;
  }

  // Long idle — suggest a break
  const idleSessions = sessions.filter(s => s.status === 'Idle').length;
  if (idleSessions === sessions.length && sessions.length > 0 && Math.random() < 0.15) {
    const idle = ['Coffee break?', 'All quiet.', 'Nice and calm.', 'Taking it easy...'];
    const q = idle[Math.floor(Math.random() * idle.length)];
    if (q !== lastContextQuip) { lastContextQuip = q; showSpeech(q, 3500); }
  }
}

function startContextScanning() {
  if (contextScanTimer) clearInterval(contextScanTimer);
  const freq = getFrequency();
  contextScanTimer = setInterval(sampleTerminalContext, freq.contextInterval);
}

function updateMascot(status, silent = false) {
  if (!robotEl) return;

  // Clear previous override
  robotEl.classList.remove('working', 'waiting', 'exited');

  if (status === 'Working') {
    robotOverride = 'working';
    clearTimeout(robotTimer);
    clearTimeout(longWorkingTimer);
    robotClearActivity();
    robotEl.classList.add('working');
    if (!silent) showSpeech(SPEECH_WORKING[Math.floor(Math.random() * SPEECH_WORKING.length)], 3000, true);
    longWorkingTimer = setTimeout(() => {
      if (robotOverride === 'working') {
        const patience = ["Still at it...", "Taking a minute.", "Patience...", "Almost probably."];
        showSpeech(patience[Math.floor(Math.random() * patience.length)], 3000, true);
      }
    }, 45000);
  } else if (status === 'WaitingForInput' || status === 'NeedsPermission' || status === 'ClaudeNeedsInput') {
    robotOverride = 'waiting';
    clearTimeout(robotTimer);
    robotClearActivity();
    robotEl.classList.add('waiting', 'act-look');
    // Always speak for attention-needed statuses, even on tab switch
    showSpeech(SPEECH_WAITING[Math.floor(Math.random() * SPEECH_WAITING.length)], 3000, true);
  } else if (status === 'Exited') {
    robotOverride = 'exited';
    clearTimeout(robotTimer);
    robotClearActivity();
    robotEl.classList.add('exited');
    if (!silent) showSpeech(SPEECH_DONE[Math.floor(Math.random() * SPEECH_DONE.length)], 3000, true);
  } else {
    // Back to idle — resume autonomous behavior
    clearTimeout(longWorkingTimer);
    if (robotOverride) {
      robotOverride = null;
      robotNext();
    }
  }
}

function triggerMascotBounce() {
  // no-op now, status changes handled by updateMascot
}

function showSpeech(text, duration = 3000, priority = false) {
  const el = document.getElementById('mascot-speech');
  if (!el) return;
  const now = Date.now();
  if (!priority && now - lastSpeechTime < SPEECH_COOLDOWN_MS) return;
  lastSpeechTime = now;
  el.textContent = text;
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  el.classList.add('visible');
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    if (rect.left < 8) {
      el.style.left = `calc(50% + ${8 - rect.left}px)`;
    } else if (rect.right > window.innerWidth - 8) {
      el.style.left = `calc(50% - ${rect.right - window.innerWidth + 8}px)`;
    }
  });
  setTimeout(() => el.classList.remove('visible'), duration);
}

function setupMascotSpeech() {
  robotInit();
  startTipTimer();
  scheduleSpecialEvent();
  scheduleHiccup();
  setupCaughtWatching();
  applyTimeOfDay();
}

let lastTipIndex = -1;

function startTipTimer() {
  // Show a tip every 3-5 minutes
  function scheduleTip() {
    const delay = (3 + Math.random() * 2) * 60 * 1000; // 3-5 min
    setTimeout(() => {
      if (localStorage.getItem('ps-robot-enabled') === 'false') {
        scheduleTip();
        return;
      }
      // Pick a random tip, avoid repeating the last one
      let idx;
      do {
        idx = Math.floor(Math.random() * APP_TIPS.length);
      } while (idx === lastTipIndex && APP_TIPS.length > 1);
      lastTipIndex = idx;

      showSpeech('Tip: ' + APP_TIPS[idx], 6000);
      scheduleTip();
    }, delay);
  }
  scheduleTip();
}

// --- Welcome Message ---

async function showWelcomeMessage() {
  if (localStorage.getItem('ps-robot-enabled') === 'false') return;

  // Get the focused session's CWD for project context
  const session = sessions[focusedIndex];
  const cwd = session?.cwd;

  let projectName = null;
  let hint = null;

  if (cwd) {
    // Extract project name from path
    const parts = cwd.replace(/\/$/, '').split('/');
    projectName = parts[parts.length - 1];

    // Try to read Claude memories for this project
    try {
      const config = await invoke('read_claude_config', { projectPath: cwd });
      if (config.project_memory) {
        hint = extractHint(config.project_memory, projectName);
      }
    } catch {}
  }

  // Time and day awareness
  const hour = new Date().getHours();
  const day = new Date().getDay();
  let timeGreeting = null;
  if (hour >= 0 && hour < 5) {
    timeGreeting = ['Working this late? Respect.', 'Night owl mode.', 'Still at it.'][Math.floor(Math.random() * 3)];
  } else if (hour < 9) {
    timeGreeting = ['Good morning.', 'Early start.', 'Rise and code.'][Math.floor(Math.random() * 3)];
  } else if (hour >= 20) {
    timeGreeting = ['Burning the midnight oil.', 'Late session.', 'Still going.'][Math.floor(Math.random() * 3)];
  } else if (hour >= 17) {
    timeGreeting = ['Evening shift.', 'Almost done for the day.'][Math.floor(Math.random() * 2)];
  }

  let dayGreeting = null;
  if (day === 1) dayGreeting = 'Monday. Let\'s get it.';
  else if (day === 5) dayGreeting = 'Friday. Finish strong.';
  else if (day === 0 || day === 6) dayGreeting = 'Weekend dev? Dedication.';

  // Build the welcome message
  if (timeGreeting) {
    showSpeech(timeGreeting, 4000, true);
  } else if (dayGreeting) {
    showSpeech(dayGreeting, 4000, true);
  } else if (hint) {
    showSpeech(hint, 6000, true);
  } else if (projectName && projectName !== '~') {
    showSpeech(`Welcome back to ${projectName}.`, 4000, true);
  } else {
    const greetings = ['Ready to code.', 'Let\'s build something.', 'Standing by.', 'At your service.'];
    showSpeech(greetings[Math.floor(Math.random() * greetings.length)], 4000, true);
  }
}

function extractHint(memoryContent, projectName) {
  // Look for actionable context in the memory content
  const lines = memoryContent.split('\n').filter(l => l.trim());

  // Look for project description or current work items
  for (const line of lines) {
    const trimmed = line.replace(/^[-*#>\s]+/, '').trim();
    if (!trimmed || trimmed.length < 10 || trimmed.length > 80) continue;

    // Skip metadata lines, links, and headers that are just titles
    if (/^(name:|description:|type:|---|\[.*\]\(.*\))/.test(trimmed)) continue;

    // Look for lines that describe the project or current work
    if (/stack|built with|uses|running|deploy|TODO|current|working on/i.test(trimmed)) {
      return trimmed.length > 60 ? trimmed.slice(0, 57) + '...' : trimmed;
    }
  }

  // Fall back to first meaningful content line
  for (const line of lines) {
    const trimmed = line.replace(/^[-*#>\s]+/, '').trim();
    if (trimmed.length >= 15 && trimmed.length <= 70 &&
        !/^(name:|description:|type:|---|\[.*\]\(.*\)|```|#{1,3}\s)/.test(trimmed)) {
      return trimmed;
    }
  }

  return projectName ? `Working on ${projectName}` : null;
}

// --- Session Persistence ---

// --- Resizable Panels ---

function setupResizeHandles() {
  setupResize('sidebar-resize', document.getElementById('sidebar'), 'right');
  setupResize('fv-resize', document.getElementById('file-viewer'), 'left');
}

function setupResize(handleId, panel, side) {
  const handle = document.getElementById(handleId);
  if (!handle || !panel) return;

  let startX, startWidth;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(e) {
      const delta = side === 'right' ? e.clientX - startX : startX - e.clientX;
      const newWidth = Math.max(140, Math.min(700, startWidth + delta));
      panel.style.width = newWidth + 'px';
      // Re-fit terminals as panel resizes
      fitVisibleTerminals();
    }

    function onUp() {
      handle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      fitVisibleTerminals();
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function saveSessionState() {
  const data = {
    version: 3,
    layoutMode,
    snapToGrid,
    gridSplitRatios,
    sessions: sessions.map(s => ({
      name: s.name,
      cwd: s.cwd,
      minimized: s.minimized,
      freeformRect: s.freeformRect,
      scrollback: s.terminal.getScrollback(500), // Save last 500 lines
    })),
    focused_index: focusedIndex,
  };
  invoke('save_sessions', { json: JSON.stringify(data) }).catch(err => {
    console.warn('Failed to save session state:', err);
  });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  setupNewSessionButton();
  setupShortcuts();
  setupResizeHandles();
  setupSidebarToggle();
  setupGitInfoClick();
  setupFooterExpand();
  setupConfigButtons();
  setupStatusListener();
  initFileViewer();
  loadSavedTheme();
  setupFreeformDrag();
  setupFreeformResize();
  setupGridGutterDrag();
  createLayoutToggle();

  // Listen for terminal theme changes from the theme designer
  window.addEventListener('theme-terminal-changed', (e) => {
    sessions.forEach(s => s.terminal.updateTheme(e.detail));
  });

  // Re-fit terminals when file viewer opens/closes
  window.addEventListener('file-viewer-changed', () => {
    requestAnimationFrame(() => fitVisibleTerminals());
  });

  // Refit terminals on app window resize
  window.addEventListener('resize', () => {
    if (layoutMode === 'freeform' && maximizedIndex === null) {
      const grid = document.getElementById('pane-grid');
      const gridRect = grid.getBoundingClientRect();
      sessions.forEach(s => {
        if (s.minimized || !s.freeformRect) return;
        const r = s.freeformRect;
        // Clamp position within grid bounds
        r.x = Math.max(0, Math.min(r.x, gridRect.width - r.width));
        r.y = Math.max(0, Math.min(r.y, gridRect.height - r.height));
        // If pane is larger than grid, shrink it
        if (r.width > gridRect.width) r.width = gridRect.width;
        if (r.height > gridRect.height) r.height = gridRect.height;
        s.pane.style.left = r.x + 'px';
        s.pane.style.top = r.y + 'px';
        s.pane.style.width = r.width + 'px';
        s.pane.style.height = r.height + 'px';
      });
    }
    // Always refit all visible terminals regardless of mode
    requestAnimationFrame(() => fitVisibleTerminals());
  });

  // When file viewer opens, push fresh CWD immediately
  window.addEventListener('file-viewer-opened', async () => {
    const session = sessions[focusedIndex];
    if (!session?.id) return;
    try {
      const cwd = await invoke('get_process_cwd', { sessionId: session.id });
      if (cwd) {
        session.cwd = cwd;
        updateFileViewerCwd(cwd);
      }
    } catch (err) {
      console.warn('CWD fetch on viewer open:', err);
      // Fall back to session's stored CWD
      if (session.cwd) updateFileViewerCwd(session.cwd);
    }
  });

  // Listen for settings changes and apply to idle terminals
  window.addEventListener('settings-changed', (e) => {
    pendingTerminalSettings = e.detail;
    sessions.forEach(s => {
      if (s.status === 'Idle' || s.status === 'WaitingForInput' || !s.status) {
        s.terminal.applySettings(pendingTerminalSettings);
      }
    });
  });

  // Listen for robot toggle from settings
  window.addEventListener('robot-toggle', (e) => toggleRobot(e.detail));

  // Notification permission is handled by tauri-plugin-notification on first use

  // Socket API events
  listen('socket-notification', (event) => {
    const { title, body } = event.payload;
    addNotification(title || 'External', body || '', -1);
    // Also send desktop notification
    if (!windowFocused && localStorage.getItem('ps-notifications') !== 'false') {
      invoke('plugin:notification|is_permission_granted').then(granted => {
        if (granted) {
          const options = { title: title || 'PaneStreet', body: body || '' };
          if (localStorage.getItem('ps-notify-sound') !== 'false') options.sound = 'default';
          invoke('plugin:notification|notify', { options });
        }
      }).catch(() => {});
    }
  });

  listen('socket-focus', (event) => {
    const { session_id } = event.payload;
    const idx = sessions.findIndex(s => s.id === session_id);
    if (idx >= 0) {
      if (sessions[idx].minimized) restoreSession(idx);
      else setFocus(idx);
    }
  });

  // Window drag via Tauri startDragging — skip interactive elements only
  document.getElementById('toolbar').addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('a')) return;
    e.preventDefault();
    invoke('plugin:window|start_dragging');
  });

  // Close notification panel when file viewer opens
  window.addEventListener('panel-opening', (e) => {
    if (e.detail === 'file-viewer' && notifPanelVisible) hideNotificationPanel();
  });

  // Notification panel toggle
  document.getElementById('notification-toggle-btn').addEventListener('click', () => {
    toggleNotificationPanel();
  });
  document.getElementById('notif-close-btn').addEventListener('click', () => {
    hideNotificationPanel();
  });
  document.getElementById('notif-clear-btn').addEventListener('click', () => {
    notificationHistory.length = 0;
    unreadNotificationCount = 0;
    updateNotificationBadge();
    renderNotificationPanel();
  });

  // Listen for OSC terminal notifications (OSC 9/99/777)
  window.addEventListener('terminal-notification', (e) => {
    const { sessionId, title, body } = e.detail;
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;
    const idx = sessions.indexOf(session);

    // Add notification ring if not focused
    if (idx !== focusedIndex) {
      session.pane.classList.add('notify-ring');
      const card = document.querySelectorAll('.session-card')[idx];
      if (card) card.classList.add('notify-badge');
    }

    // Add to notification history
    addNotification(session.name, `OSC: ${body}`, idx);

    // Send desktop notification if window not focused
    if (!windowFocused && localStorage.getItem('ps-notifications') !== 'false') {
      invoke('plugin:notification|is_permission_granted').then(granted => {
        if (granted) {
          const options = { title: title || 'PaneStreet', body: `${session.name}: ${body}` };
          if (localStorage.getItem('ps-notify-sound') !== 'false') options.sound = 'default';
          invoke('plugin:notification|notify', { options });
        }
      }).catch(() => {});
    }
  });

  // Initialize mascot
  setupMascotSpeech();

  // Try to restore sessions
  let restored = false;
  try {
    const json = await invoke('load_sessions');
    if (json) {
      const data = JSON.parse(json);
      if ((data.version === 1 || data.version === 2 || data.version === 3) && data.sessions?.length > 0) {
        // Restore layout mode from v2+ data
        if (data.version >= 2) {
          layoutMode = data.layoutMode || 'auto';
          snapToGrid = data.snapToGrid !== false;
          if (data.gridSplitRatios) gridSplitRatios = data.gridSplitRatios;
        }

        for (const saved of data.sessions) {
          // Restore scrollback before creating session
          const scrollback = saved.scrollback || null;
          await createSession(saved.cwd, scrollback);
          const idx = sessions.length - 1;
          if (saved.name) {
            sessions[idx].name = saved.name;
            sessions[idx].pane.querySelector('.pane-title').textContent = saved.name;
          }
          if (saved.minimized) {
            sessions[idx].minimized = true;
          }
          if (saved.freeformRect) {
            sessions[idx].freeformRect = saved.freeformRect;
          }
        }
        rebuildSidebar();
        updateGridLayout();
        updateFooterPills();
        updateLayoutToggleUI();
        if (data.focused_index >= 0 && data.focused_index < sessions.length) {
          setFocus(data.focused_index);
        }
        restored = true;
      }
    }
  } catch (err) {
    console.warn('Session restore failed:', err);
  }

  if (!restored) {
    await createSession();
  }

  // Welcome message after a brief delay (let CWD resolve)
  setTimeout(() => showWelcomeMessage(), 1500);

  // Check for updates on startup (non-blocking, dismissible)
  setTimeout(() => checkForUpdateOnStartup(), 3000);

  setInterval(() => {
    updateGitInfo();
    if (isFileViewerVisible()) {
      const session = sessions[focusedIndex];
      if (session?.cwd) refreshDiffStats(session.cwd);
    }
  }, 5000);

  // Poll CWD for the focused session
  setInterval(async () => {
    if (sessions.length === 0) return;
    const session = sessions[focusedIndex];
    if (!session?.id) return;
    try {
      const cwd = await invoke('get_process_cwd', { sessionId: session.id });
      if (cwd && cwd !== session.cwd) {
        session.cwd = cwd;
        updateFileViewerCwd(cwd);
        setFocusedCwd(cwd);
        updateGitInfo();
        updateSidebarMeta();
      }
    } catch (err) {
      console.warn('CWD poll error:', err);
    }
  }, 2000);

  // Poll listening ports for all sessions (less frequent)
  setInterval(async () => {
    for (const session of sessions) {
      if (!session?.id) continue;
      try {
        const ports = await invoke('get_listening_ports', { sessionId: session.id });
        session._ports = ports || [];
      } catch {
        session._ports = [];
      }
    }
    updateSidebarMeta();
  }, 5000);

  // Poll PR status for focused session (infrequent, uses gh CLI)
  setInterval(async () => {
    const session = sessions[focusedIndex];
    if (!session?.cwd) return;
    try {
      const pr = await invoke('get_pr_status', { cwd: session.cwd });
      session._pr = pr;
    } catch {
      session._pr = null;
    }
    updateSidebarMeta();
  }, 30000); // Every 30s — gh CLI is slow

  // Initial PR fetch after a delay
  setTimeout(async () => {
    const session = sessions[focusedIndex];
    if (!session?.cwd) return;
    try {
      const pr = await invoke('get_pr_status', { cwd: session.cwd });
      session._pr = pr;
      updateSidebarMeta();
    } catch {}
  }, 3000);
});
