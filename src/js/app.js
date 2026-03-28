import { TerminalSession } from './terminal.js';
import { togglePanel, hidePanel, isAnyPanelActive, setOnHide, loadSavedTheme } from './config-panels.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const sessions = [];
let focusedIndex = 0;
let maximizedIndex = null;
let contextMenu = null;
let sessionCounter = 0;
let windowFocused = true;
window.addEventListener('focus', () => { windowFocused = true; });
window.addEventListener('blur', () => { windowFocused = false; });

// --- Grid Layout ---

function updateGridLayout() {
  const grid = document.getElementById('pane-grid');

  // Remove all panes from grid (DOM re-parenting preserves xterm state)
  sessions.forEach(s => {
    if (s.pane.parentNode === grid) {
      grid.removeChild(s.pane);
    }
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
  }

  requestAnimationFrame(() => fitVisibleTerminals());
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

  focusedIndex = index;

  sessions.forEach((s, i) => {
    s.pane.classList.toggle('focused', i === index);
  });

  document.querySelectorAll('.session-card').forEach((c, i) => {
    c.classList.toggle('active', i === index);
  });

  sessions[index].terminal.focus();
  updateGitInfo();
  updateMascot(sessions[index].status || 'Idle');
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
  minimizeBtn.textContent = '_';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.onclick = (e) => {
    e.stopPropagation();
    const idx = sessions.findIndex(s => s.pane === pane);
    if (idx >= 0) minimizeSession(idx);
  };

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '\u00d7';
  closeBtn.title = 'Close';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    const idx = sessions.findIndex(s => s.pane === pane);
    if (idx >= 0) removeSession(idx);
  };

  controls.appendChild(minimizeBtn);
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

  pane.appendChild(header);
  pane.appendChild(body);

  // Click to focus
  pane.addEventListener('mousedown', () => {
    const idx = sessions.findIndex(s => s.pane === pane);
    if (idx >= 0) setFocus(idx);
  });

  return { pane, body, statusDot, title };
}

// --- Session Lifecycle ---

async function createSession(restoreCwd) {
  sessionCounter++;
  const sessionName = `Terminal ${sessionCounter}`;

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

  const sessionId = await terminal.connect(effectiveCwd);

  // Watch for /rename command output from Claude Code
  terminal.onOutput((chunk, buffer) => {
    // Claude Code /rename outputs the new conversation name
    // Look for patterns like "Renamed conversation to: xxx" or similar
    const renameMatch = buffer.match(/(?:Renamed (?:conversation )?to|Session renamed to)[:\s]+["']?([^\n"']+?)["']?\s*$/);
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
  };

  sessions.push(session);
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

// --- Minimize / Restore / Maximize ---

function minimizeSession(index) {
  if (index < 0 || index >= sessions.length) return;

  const visibleCount = sessions.filter(s => !s.minimized).length;
  if (visibleCount <= 1) return; // Don't minimize the last visible

  sessions[index].minimized = true;

  // Exit maximize mode if minimizing the maximized session
  if (maximizedIndex === index) {
    maximizedIndex = null;
  }

  // Move focus if we just minimized the focused session
  if (focusedIndex === index) {
    focusNextVisible(index, 1);
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

  updateGridLayout();
  updateFooterPills();
  setFocus(index);
  saveSessionState();
}

// --- Footer Pills ---

function updateFooterPills() {
  const container = document.getElementById('footer-pills');
  container.innerHTML = '';

  sessions.forEach((s, i) => {
    if (!s.minimized) return;

    const pill = document.createElement('button');
    pill.className = 'footer-pill';

    const dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.style.background = s.statusDot.style.background;

    const name = document.createElement('span');
    name.textContent = s.name;

    pill.appendChild(dot);
    pill.appendChild(name);
    pill.addEventListener('click', () => restoreSession(i));

    container.appendChild(pill);
  });
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

  // Shortcut badge (⌘1 through ⌘9)
  const shortcut = document.createElement('span');
  shortcut.className = 'session-shortcut';
  if (index < 9) {
    shortcut.textContent = `⌘${index + 1}`;
  }

  card.appendChild(dot);
  card.appendChild(nameEl);
  card.appendChild(shortcut);

  // Click to focus
  card.addEventListener('click', () => {
    const idx = parseInt(card.dataset.index);
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
  } catch {
    el.textContent = '';
    el.dataset.branch = '';
  }
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

// --- Config Panel Buttons ---

function setupConfigButtons() {
  document.getElementById('config-plugins-btn').onclick = () => togglePanel('plugins');
  document.getElementById('config-mcps-btn').onclick = () => togglePanel('mcps');
  document.getElementById('config-memory-btn').onclick = () => togglePanel('memory');
  document.getElementById('settings-btn').onclick = () => togglePanel('settings');

  // Re-fit terminals when panel is hidden
  setOnHide(() => {
    requestAnimationFrame(() => fitVisibleTerminals());
  });
}

// --- Keyboard Shortcuts ---

function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Escape — close config panel if active
    if (e.key === 'Escape' && isAnyPanelActive()) {
      e.preventDefault();
      hidePanel();
      return;
    }

    // Cmd+, — toggle settings (standard macOS)
    if (e.metaKey && e.key === ',') {
      e.preventDefault();
      togglePanel('settings');
      return;
    }

    // Cmd+N — new terminal (instant, no form)
    if (e.metaKey && !e.shiftKey && e.key === 'n') {
      e.preventDefault();
      createSession();
    }

    // Cmd+W — close focused
    if (e.metaKey && !e.shiftKey && e.key === 'w') {
      e.preventDefault();
      if (sessions.length > 0) removeSession(focusedIndex);
    }

    // Cmd+1-9 — focus by position (auto-restore if minimized)
    if (e.metaKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (idx < sessions.length) {
        if (sessions[idx].minimized) restoreSession(idx);
        else setFocus(idx);
      }
    }

    // Cmd+Shift+Enter — maximize/restore focused pane
    if (e.metaKey && e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      if (sessions.length > 0) toggleMaximize(focusedIndex);
    }

    // Cmd+Shift+[ — previous visible pane
    if (e.metaKey && e.shiftKey && e.key === '[') {
      e.preventDefault();
      focusNextVisible(focusedIndex, -1);
    }

    // Cmd+Shift+] — next visible pane
    if (e.metaKey && e.shiftKey && e.key === ']') {
      e.preventDefault();
      focusNextVisible(focusedIndex, 1);
    }
  });
}

// --- Status Detection ---

const STATUS_COLORS = {
  Working: 'var(--status-working)',
  Idle: 'var(--status-idle)',
  WaitingForInput: 'var(--status-waiting)',
  NeedsPermission: 'var(--status-permission)',
  Exited: 'var(--status-exited)',
};

function maybeNotify(session, status) {
  if (windowFocused) return;
  if (localStorage.getItem('ps-notifications') === 'false') return;

  const messages = {
    WaitingForInput: 'is waiting for your input',
    NeedsPermission: 'needs permission',
    Exited: 'has finished',
  };
  const msg = messages[status];
  if (!msg) return;

  if (Notification.permission === 'granted') {
    new Notification('PaneStreet', { body: `${session.name} ${msg}`, silent: false });
  }
}

function setupStatusListener() {
  listen('session-status-changed', (event) => {
    const { session_id, status } = event.payload;
    const session = sessions.find(s => s.id === session_id);
    if (!session) return;

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

    triggerMascotBounce();
    maybeNotify(session, status);
  });
}

// --- Robot Mascot (JS state machine) ---

const ACTIVITIES = [
  { name: 'stand',   cls: 'act-stand',   duration: [8, 15] },
  { name: 'look',    cls: 'act-look',    duration: [6, 10] },
  { name: 'wave',    cls: 'act-wave',    duration: [4, 6],  speech: 'Hi!' },
  { name: 'sleep',   cls: 'act-sleep',   duration: [12, 20] },
  { name: 'stretch', cls: 'act-stretch', duration: [5, 8] },
  { name: 'nod',     cls: 'act-nod',     duration: [4, 7] },
  { name: 'think',   cls: 'act-think',   duration: [8, 14] },
  { name: 'dance',   cls: 'act-dance',   duration: [5, 8] },
  { name: 'type',    cls: 'act-type',    duration: [6, 12] },
  { name: 'bounce',  cls: 'act-bounce',  duration: [4, 6] },
];

const SPEECH_WORKING = ['On it!', 'Working...', 'Processing...'];
const SPEECH_WAITING = ['Need input!', 'Your turn!', 'Waiting...'];
const SPEECH_DONE = ['Done!', 'All set!', 'Finished!'];
const SPEECH_CLICK = ['Hey!', 'What\'s up?', 'Beep!', 'Need something?', 'Hello!', '*waves*'];

let robotEl = null;
let robotTimer = null;
let robotFacingLeft = false;
let robotOverride = null; // status override (working/waiting/exited)
let lastActivityIndex = -1;

function robotInit() {
  robotEl = document.getElementById('footer-mascot');
  if (!robotEl) return;

  // Click interaction
  document.getElementById('footer-mascot-area')?.addEventListener('click', () => {
    showSpeech(SPEECH_CLICK[Math.floor(Math.random() * SPEECH_CLICK.length)]);
  });

  robotNext();
}

function robotNext() {
  if (!robotEl || robotOverride) return;
  // Alternate: walk somewhere → do an activity → walk → activity...
  if (Math.random() < 0.5) {
    robotWalk();
  } else {
    robotDoActivity();
  }
}

function robotWalk() {
  if (robotOverride) return;
  robotClearActivity();
  robotEl.classList.add('walking');

  // Pick a random destination
  const maxX = 125;
  const dest = Math.floor(Math.random() * maxX);
  const currentLeft = parseInt(robotEl.style.left) || 4;
  const distance = Math.abs(dest - currentLeft);
  const duration = Math.max(4, distance * 0.08); // ~0.08s per px, min 4s

  // Face the right direction
  robotFacingLeft = dest < currentLeft;
  robotEl.classList.toggle('face-left', robotFacingLeft);

  // Smooth move via CSS transition
  robotEl.style.transition = `left ${duration}s linear`;
  robotEl.style.left = dest + 'px';

  // After arriving, pause briefly then do an activity
  robotTimer = setTimeout(() => {
    robotEl.classList.remove('walking');
    // Brief pause (2-4s) standing still before activity
    robotTimer = setTimeout(() => robotDoActivity(), (2 + Math.random() * 2) * 1000);
  }, duration * 1000);
}

function robotDoActivity() {
  if (robotOverride) return;
  robotClearActivity();

  // Pick a random activity (avoid repeating the last one)
  let idx;
  do {
    idx = Math.floor(Math.random() * ACTIVITIES.length);
  } while (idx === lastActivityIndex && ACTIVITIES.length > 1);
  lastActivityIndex = idx;

  const act = ACTIVITIES[idx];
  robotEl.classList.add(act.cls);

  if (act.speech) {
    showSpeech(act.speech);
  }

  // Stay in this activity for its duration, then move on
  const dur = act.duration[0] + Math.random() * (act.duration[1] - act.duration[0]);
  robotTimer = setTimeout(() => {
    robotClearActivity();
    // 50/50: walk somewhere or do another activity
    robotNext();
  }, dur * 1000);
}

function robotClearActivity() {
  if (!robotEl) return;
  robotEl.classList.remove('walking', 'face-left');
  for (const act of ACTIVITIES) {
    robotEl.classList.remove(act.cls);
  }
  robotEl.style.transition = 'none';
}

function updateMascot(status) {
  if (!robotEl) return;

  // Clear previous override
  robotEl.classList.remove('working', 'waiting', 'exited');

  if (status === 'Working') {
    robotOverride = 'working';
    clearTimeout(robotTimer);
    robotClearActivity();
    robotEl.classList.add('working', 'walking');
    showSpeech(SPEECH_WORKING[Math.floor(Math.random() * SPEECH_WORKING.length)]);
  } else if (status === 'WaitingForInput' || status === 'NeedsPermission') {
    robotOverride = 'waiting';
    clearTimeout(robotTimer);
    robotClearActivity();
    robotEl.classList.add('waiting', 'act-look');
    showSpeech(SPEECH_WAITING[Math.floor(Math.random() * SPEECH_WAITING.length)]);
  } else if (status === 'Exited') {
    robotOverride = 'exited';
    clearTimeout(robotTimer);
    robotClearActivity();
    robotEl.classList.add('exited');
    showSpeech(SPEECH_DONE[Math.floor(Math.random() * SPEECH_DONE.length)]);
  } else {
    // Back to idle — resume autonomous behavior
    if (robotOverride) {
      robotOverride = null;
      robotNext();
    }
  }
}

function triggerMascotBounce() {
  // no-op now, status changes handled by updateMascot
}

function showSpeech(text) {
  const el = document.getElementById('mascot-speech');
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 3000);
}

function setupMascotSpeech() {
  robotInit();
}

// --- Session Persistence ---

function saveSessionState() {
  const data = {
    version: 1,
    sessions: sessions.map(s => ({
      name: s.name,
      cwd: s.cwd,
      minimized: s.minimized,
    })),
    focused_index: focusedIndex,
    session_counter: sessionCounter,
  };
  invoke('save_sessions', { json: JSON.stringify(data) }).catch(err => {
    console.warn('Failed to save session state:', err);
  });
}

// --- Init ---

document.addEventListener('DOMContentLoaded', async () => {
  setupNewSessionButton();
  setupShortcuts();
  setupGitInfoClick();
  setupConfigButtons();
  setupStatusListener();
  loadSavedTheme();

  // Listen for terminal theme changes from the theme designer
  window.addEventListener('theme-terminal-changed', (e) => {
    sessions.forEach(s => s.terminal.updateTheme(e.detail));
  });

  // Request notification permission
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Initialize mascot
  setupMascotSpeech();

  // Try to restore sessions
  let restored = false;
  try {
    const json = await invoke('load_sessions');
    if (json) {
      const data = JSON.parse(json);
      if (data.version === 1 && data.sessions?.length > 0) {
        sessionCounter = data.session_counter || 0;
        for (const saved of data.sessions) {
          await createSession(saved.cwd);
          const idx = sessions.length - 1;
          if (saved.minimized) {
            sessions[idx].minimized = true;
          }
        }
        rebuildSidebar();
        updateGridLayout();
        updateFooterPills();
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
    await createSession('Terminal 1');
  }

  setInterval(updateGitInfo, 5000);
});
