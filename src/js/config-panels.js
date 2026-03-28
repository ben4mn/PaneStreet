const { invoke } = window.__TAURI__.core;

let activePanel = null;
let onHideCallback = null;

// --- Panel Switching ---

export function setOnHide(callback) {
  onHideCallback = callback;
}

export function showPanel(panelName) {
  document.getElementById('pane-grid').style.display = 'none';
  document.getElementById('file-viewer').style.display = 'none';
  document.querySelectorAll('.config-panel').forEach(p => p.style.display = 'none');

  const panel = document.getElementById(`${panelName}-panel`);
  if (panel) panel.style.display = '';

  // Highlight active button
  document.querySelectorAll('#sidebar-actions button').forEach(b => b.classList.remove('panel-active'));
  const btnMap = { settings: 'settings-btn', plugins: 'config-plugins-btn', mcps: 'config-mcps-btn', memory: 'config-memory-btn' };
  document.getElementById(btnMap[panelName])?.classList.add('panel-active');

  activePanel = panelName;

  // Render panel content
  if (panelName === 'settings') renderSettingsPanel();
  else if (panelName === 'plugins') renderPluginsPanel();
  else if (panelName === 'mcps') renderMcpsPanel();
  else if (panelName === 'memory') renderMemoryPanel();
}

export function hidePanel() {
  document.querySelectorAll('.config-panel').forEach(p => p.style.display = 'none');
  document.getElementById('pane-grid').style.display = '';
  // Restore file viewer if it was visible
  if (document.getElementById('fv-toggle-btn')?.classList.contains('active')) {
    document.getElementById('file-viewer').style.display = 'flex';
  }
  document.querySelectorAll('#sidebar-actions button').forEach(b => b.classList.remove('panel-active'));
  activePanel = null;
  if (onHideCallback) onHideCallback();
}

export function togglePanel(panelName) {
  if (activePanel === panelName) hidePanel();
  else showPanel(panelName);
}

export function isAnyPanelActive() {
  return activePanel !== null;
}

// --- Settings Panel ---

let currentSettingsTab = 'general';

async function renderSettingsPanel() {
  const panel = document.getElementById('settings-panel');
  panel.innerHTML = `
    <div class="config-panel-header">
      <button class="config-back-btn" id="settings-back">\u2190 Back</button>
      <h1>Settings</h1>
    </div>
    <div class="settings-tabs">
      <button class="settings-tab ${currentSettingsTab === 'general' ? 'active' : ''}" data-tab="general">General</button>
      <button class="settings-tab ${currentSettingsTab === 'theme' ? 'active' : ''}" data-tab="theme">Theme</button>
      <button class="settings-tab ${currentSettingsTab === 'auth' ? 'active' : ''}" data-tab="auth">Auth</button>
      <button class="settings-tab ${currentSettingsTab === 'about' ? 'active' : ''}" data-tab="about">About</button>
    </div>
    <div id="settings-tab-content"></div>
  `;

  panel.querySelector('#settings-back').onclick = hidePanel;

  panel.querySelectorAll('.settings-tab').forEach(tab => {
    tab.onclick = () => {
      currentSettingsTab = tab.dataset.tab;
      panel.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderSettingsTab(currentSettingsTab);
    };
  });

  renderSettingsTab(currentSettingsTab);
}

async function renderSettingsTab(tab) {
  const container = document.getElementById('settings-tab-content');
  if (!container) return;

  if (tab === 'general') {
    const fontSize = localStorage.getItem('ps-font-size') || '14';
    const shell = localStorage.getItem('ps-shell') || '';
    const defaultDir = localStorage.getItem('ps-default-dir') || '';
    const gitShowBranch = localStorage.getItem('ps-git-show-branch') !== 'false';
    const gitShowWorktree = localStorage.getItem('ps-git-show-worktree') !== 'false';
    const gitShowDirty = localStorage.getItem('ps-git-show-dirty') !== 'false';
    const gitPollInterval = localStorage.getItem('ps-git-poll') || '5';
    const notificationsEnabled = localStorage.getItem('ps-notifications') !== 'false';
    const robotEnabled = localStorage.getItem('ps-robot-enabled') !== 'false';

    container.innerHTML = `
      <div class="settings-group">
        <div class="setting-row-stacked">
          <div class="setting-label">Terminal Font Size</div>
          <div class="setting-description">Size in pixels for terminal text</div>
          <div class="setting-control">
            <input type="range" id="pref-font-size" min="10" max="24" value="${fontSize}" class="setting-range" />
            <span class="setting-range-value" id="font-size-value">${fontSize}px</span>
          </div>
          <div class="font-preview" id="font-preview" style="font-size:${fontSize}px">
            The quick brown fox jumps over the lazy dog<br>
            $ claude --help &nbsp; 0123456789
          </div>
        </div>

        <div class="setting-row-stacked">
          <div class="setting-label">Default Shell</div>
          <div class="setting-description">Leave empty to use system default ($SHELL)</div>
          <input type="text" class="form-input setting-input-full" id="pref-shell" value="${shell}" placeholder="/bin/zsh" />
        </div>

        <div class="setting-row-stacked">
          <div class="setting-label">Default Directory</div>
          <div class="setting-description">New terminals open here. Leave empty for home directory.</div>
          <div class="setting-browse-row">
            <input type="text" class="form-input" id="pref-default-dir" value="${defaultDir}" placeholder="~/Projects" style="flex:1" />
            <button class="setting-browse-btn" id="browse-dir">Browse</button>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="setting-section-title">Git Display</div>

        <div class="setting-row-stacked">
          <div class="setting-row-inline">
            <div>
              <div class="setting-label">Show branch name</div>
              <div class="setting-description">Display current git branch in the footer</div>
            </div>
            <label class="setting-switch">
              <input type="checkbox" id="pref-git-branch" ${gitShowBranch ? 'checked' : ''} />
              <span class="setting-switch-slider"></span>
            </label>
          </div>
        </div>

        <div class="setting-row-stacked">
          <div class="setting-row-inline">
            <div>
              <div class="setting-label">Show worktree info</div>
              <div class="setting-description">Show active worktree count when in a git repo</div>
            </div>
            <label class="setting-switch">
              <input type="checkbox" id="pref-git-worktree" ${gitShowWorktree ? 'checked' : ''} />
              <span class="setting-switch-slider"></span>
            </label>
          </div>
        </div>

        <div class="setting-row-stacked">
          <div class="setting-row-inline">
            <div>
              <div class="setting-label">Show dirty indicator</div>
              <div class="setting-description">Show * next to branch name when there are uncommitted changes</div>
            </div>
            <label class="setting-switch">
              <input type="checkbox" id="pref-git-dirty" ${gitShowDirty ? 'checked' : ''} />
              <span class="setting-switch-slider"></span>
            </label>
          </div>
        </div>

        <div class="setting-row-stacked">
          <div class="setting-label">Poll interval</div>
          <div class="setting-description">How often to refresh git info (seconds)</div>
          <div class="setting-control">
            <input type="range" id="pref-git-poll" min="2" max="30" value="${gitPollInterval}" class="setting-range" />
            <span class="setting-range-value" id="git-poll-value">${gitPollInterval}s</span>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="setting-section-title">Notifications</div>
        <div class="setting-row-stacked">
          <div class="setting-row-inline">
            <div>
              <div class="setting-label">Desktop notifications</div>
              <div class="setting-description">Notify when a session needs input, permission, or finishes</div>
            </div>
            <label class="setting-switch">
              <input type="checkbox" id="pref-notifications" ${notificationsEnabled ? 'checked' : ''} />
              <span class="setting-switch-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="setting-section-title">Mascot</div>
        <div class="setting-row-stacked">
          <div class="setting-row-inline">
            <div>
              <div class="setting-label">Show robot mascot</div>
              <div class="setting-description">Toggle the animated robot companion that walks across your screen</div>
            </div>
            <label class="setting-switch">
              <input type="checkbox" id="pref-robot" ${robotEnabled ? 'checked' : ''} />
              <span class="setting-switch-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <button class="settings-save-btn" id="general-save">Save &amp; Apply</button>
      <span class="settings-save-msg" id="general-msg"></span>
    `;

    // Font size range with live preview
    const rangeEl = container.querySelector('#pref-font-size');
    const valueEl = container.querySelector('#font-size-value');
    const previewEl = container.querySelector('#font-preview');
    rangeEl.addEventListener('input', () => {
      valueEl.textContent = rangeEl.value + 'px';
      previewEl.style.fontSize = rangeEl.value + 'px';
    });

    // Git poll interval range
    const gitPollEl = container.querySelector('#pref-git-poll');
    const gitPollValueEl = container.querySelector('#git-poll-value');
    gitPollEl.addEventListener('input', () => {
      gitPollValueEl.textContent = gitPollEl.value + 's';
    });

    // Browse button for default directory
    container.querySelector('#browse-dir').onclick = async () => {
      try {
        const result = await invoke('plugin:dialog|open', {
          directory: true,
          multiple: false,
          title: 'Choose Default Directory',
        });
        if (result) {
          container.querySelector('#pref-default-dir').value = result;
        }
      } catch (err) {
        console.warn('Folder picker failed:', err);
      }
    };

    // Save button
    container.querySelector('#general-save').onclick = () => {
      localStorage.setItem('ps-font-size', rangeEl.value);
      localStorage.setItem('ps-shell', container.querySelector('#pref-shell').value);
      localStorage.setItem('ps-default-dir', container.querySelector('#pref-default-dir').value);
      localStorage.setItem('ps-git-show-branch', container.querySelector('#pref-git-branch').checked);
      localStorage.setItem('ps-git-show-worktree', container.querySelector('#pref-git-worktree').checked);
      localStorage.setItem('ps-git-show-dirty', container.querySelector('#pref-git-dirty').checked);
      localStorage.setItem('ps-git-poll', gitPollEl.value);
      localStorage.setItem('ps-notifications', container.querySelector('#pref-notifications').checked);
      const robotChecked = container.querySelector('#pref-robot').checked;
      localStorage.setItem('ps-robot-enabled', robotChecked);
      window.dispatchEvent(new CustomEvent('robot-toggle', { detail: robotChecked }));
      const msg = container.querySelector('#general-msg');
      msg.textContent = 'Saved! Settings applied.';
      msg.style.color = 'var(--status-idle)';
      setTimeout(() => { msg.textContent = ''; }, 3000);
    };

  } else if (tab === 'auth') {
    container.innerHTML = '<div class="empty-state">Loading...</div>';

    try {
      const status = await invoke('get_auth_status');

      if (status.has_key) {
        container.innerHTML = `
          <div class="auth-status">
            <span class="status-dot" style="background:var(--status-idle)"></span>
            <span class="setting-label">API key configured</span>
          </div>
          <div class="setting-description" style="margin-bottom:12px">Key: ${status.key_hint}</div>
          <div class="api-key-row">
            <input type="password" class="form-input" id="auth-new-key" placeholder="Replace with new key..." />
            <button class="save-btn" id="auth-save">Save</button>
            <button class="delete-btn" id="auth-delete">Delete</button>
          </div>
          <div id="auth-message" style="margin-top:8px;font-size:var(--font-size-xs)"></div>
        `;
      } else {
        container.innerHTML = `
          <div class="auth-status">
            <span class="status-dot" style="background:var(--text-muted)"></span>
            <span class="setting-label">No API key configured</span>
          </div>
          <div class="setting-description" style="margin-bottom:12px">Enter your Anthropic API key to use with Claude sessions.</div>
          <div class="api-key-row">
            <input type="password" class="form-input" id="auth-new-key" placeholder="sk-ant-..." />
            <button class="save-btn" id="auth-save">Save</button>
          </div>
          <div id="auth-message" style="margin-top:8px;font-size:var(--font-size-xs)"></div>
        `;
      }

      container.querySelector('#auth-save').onclick = async () => {
        const key = container.querySelector('#auth-new-key').value.trim();
        const msg = container.querySelector('#auth-message');
        if (!key) { msg.textContent = 'Please enter a key.'; msg.style.color = 'var(--status-exited)'; return; }
        try {
          await invoke('save_api_key', { key });
          msg.textContent = 'Key saved to Keychain.';
          msg.style.color = 'var(--status-idle)';
          setTimeout(() => renderSettingsTab('auth'), 1000);
        } catch (err) {
          msg.textContent = `Error: ${err}`;
          msg.style.color = 'var(--status-exited)';
        }
      };

      const deleteBtn = container.querySelector('#auth-delete');
      if (deleteBtn) {
        deleteBtn.onclick = async () => {
          const msg = container.querySelector('#auth-message');
          try {
            await invoke('delete_api_key');
            msg.textContent = 'Key deleted.';
            msg.style.color = 'var(--status-idle)';
            setTimeout(() => renderSettingsTab('auth'), 1000);
          } catch (err) {
            msg.textContent = `Error: ${err}`;
            msg.style.color = 'var(--status-exited)';
          }
        };
      }

    } catch (err) {
      container.innerHTML = `<div class="empty-state">Failed to check auth status: ${err}</div>`;
    }

  } else if (tab === 'theme') {
    renderThemeTab(container);

  } else if (tab === 'about') {
    let version = '0.1.0';
    try {
      const app = window.__TAURI__.app;
      if (app?.getVersion) version = await app.getVersion();
    } catch {}

    container.innerHTML = `
      <div class="setting-row">
        <div class="setting-label">Version</div>
        <div class="setting-value">${version}</div>
      </div>
      <div class="setting-row">
        <div class="setting-label">Platform</div>
        <div class="setting-value">macOS</div>
      </div>
      <div style="margin-top:20px">
        <div class="setting-description">Pane Street — Multi-session Claude Code terminal manager</div>
      </div>
    `;
  }
}

// --- Theme System ---

const PRESET_THEMES = {
  dark: {
    name: 'Dark',
    colors: {
      '--bg-app': '#1a1a1a', '--bg-sidebar': '#1e1e1e', '--bg-pane': '#111111', '--bg-header': '#1a1a1a',
      '--bg-footer': '#1a1a1a', '--bg-card': '#2a2a2a', '--text-primary': '#cccccc', '--text-secondary': '#888888',
      '--text-bright': '#ffffff', '--text-muted': '#555555', '--accent': '#2a6df0', '--accent-light': '#a8c8ff',
    },
    terminal: {
      background: '#111111', foreground: '#cccccc', cursor: '#cccccc',
      black: '#1a1a1a', red: '#ef4444', green: '#4ade80', yellow: '#f59e0b',
      blue: '#2a6df0', magenta: '#c084fc', cyan: '#22d3ee', white: '#cccccc',
      brightBlack: '#555555', brightRed: '#f87171', brightGreen: '#86efac', brightYellow: '#fbbf24',
      brightBlue: '#60a5fa', brightMagenta: '#d8b4fe', brightCyan: '#67e8f9', brightWhite: '#ffffff',
    },
  },
  midnight: {
    name: 'Midnight Blue',
    colors: {
      '--bg-app': '#0d1117', '--bg-sidebar': '#0f1419', '--bg-pane': '#0a0e14', '--bg-header': '#0d1117',
      '--bg-footer': '#0d1117', '--bg-card': '#161b22', '--text-primary': '#c9d1d9', '--text-secondary': '#8b949e',
      '--text-bright': '#f0f6fc', '--text-muted': '#484f58', '--accent': '#58a6ff', '--accent-light': '#79c0ff',
    },
    terminal: {
      background: '#0a0e14', foreground: '#c9d1d9', cursor: '#58a6ff',
      black: '#0d1117', red: '#ff7b72', green: '#7ee787', yellow: '#ffa657',
      blue: '#58a6ff', magenta: '#d2a8ff', cyan: '#79c0ff', white: '#c9d1d9',
      brightBlack: '#484f58', brightRed: '#ffa198', brightGreen: '#aff5b4', brightYellow: '#ffdf5d',
      brightBlue: '#a5d6ff', brightMagenta: '#e2c5ff', brightCyan: '#a5d6ff', brightWhite: '#f0f6fc',
    },
  },
  dracula: {
    name: 'Dracula',
    colors: {
      '--bg-app': '#282a36', '--bg-sidebar': '#21222c', '--bg-pane': '#1e1f29', '--bg-header': '#282a36',
      '--bg-footer': '#282a36', '--bg-card': '#343746', '--text-primary': '#f8f8f2', '--text-secondary': '#6272a4',
      '--text-bright': '#ffffff', '--text-muted': '#44475a', '--accent': '#bd93f9', '--accent-light': '#d6bcfa',
    },
    terminal: {
      background: '#1e1f29', foreground: '#f8f8f2', cursor: '#f8f8f2',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
      brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff',
    },
  },
  nord: {
    name: 'Nord',
    colors: {
      '--bg-app': '#2e3440', '--bg-sidebar': '#2b303b', '--bg-pane': '#272c36', '--bg-header': '#2e3440',
      '--bg-footer': '#2e3440', '--bg-card': '#3b4252', '--text-primary': '#d8dee9', '--text-secondary': '#81a1c1',
      '--text-bright': '#eceff4', '--text-muted': '#4c566a', '--accent': '#88c0d0', '--accent-light': '#8fbcbb',
    },
    terminal: {
      background: '#272c36', foreground: '#d8dee9', cursor: '#d8dee9',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#d08770', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
  },
  solarized: {
    name: 'Solarized Dark',
    colors: {
      '--bg-app': '#002b36', '--bg-sidebar': '#003440', '--bg-pane': '#001e26', '--bg-header': '#002b36',
      '--bg-footer': '#002b36', '--bg-card': '#073642', '--text-primary': '#839496', '--text-secondary': '#657b83',
      '--text-bright': '#fdf6e3', '--text-muted': '#586e75', '--accent': '#268bd2', '--accent-light': '#2aa198',
    },
    terminal: {
      background: '#001e26', foreground: '#839496', cursor: '#839496',
      black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
      blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
      brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#859900', brightYellow: '#b58900',
      brightBlue: '#268bd2', brightMagenta: '#6c71c4', brightCyan: '#2aa198', brightWhite: '#fdf6e3',
    },
  },
  gruvbox: {
    name: 'Gruvbox Dark',
    colors: {
      '--bg-app': '#282828', '--bg-sidebar': '#1d2021', '--bg-pane': '#1d2021', '--bg-header': '#282828',
      '--bg-footer': '#282828', '--bg-card': '#3c3836', '--text-primary': '#ebdbb2', '--text-secondary': '#a89984',
      '--text-bright': '#fbf1c7', '--text-muted': '#665c54', '--accent': '#fe8019', '--accent-light': '#fabd2f',
    },
    terminal: {
      background: '#1d2021', foreground: '#ebdbb2', cursor: '#ebdbb2',
      black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
      blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
      brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
      brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
    },
  },
  tokyoNight: {
    name: 'Tokyo Night',
    colors: {
      '--bg-app': '#1a1b26', '--bg-sidebar': '#16161e', '--bg-pane': '#13131a', '--bg-header': '#1a1b26',
      '--bg-footer': '#1a1b26', '--bg-card': '#24283b', '--text-primary': '#a9b1d6', '--text-secondary': '#565f89',
      '--text-bright': '#c0caf5', '--text-muted': '#3b4261', '--accent': '#7aa2f7', '--accent-light': '#bb9af7',
    },
    terminal: {
      background: '#13131a', foreground: '#a9b1d6', cursor: '#c0caf5',
      black: '#1a1b26', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
      blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a', brightYellow: '#e0af68',
      brightBlue: '#7aa2f7', brightMagenta: '#bb9af7', brightCyan: '#7dcfff', brightWhite: '#c0caf5',
    },
  },
  oneDark: {
    name: 'One Dark',
    colors: {
      '--bg-app': '#282c34', '--bg-sidebar': '#21252b', '--bg-pane': '#1e2127', '--bg-header': '#282c34',
      '--bg-footer': '#282c34', '--bg-card': '#2c313c', '--text-primary': '#abb2bf', '--text-secondary': '#5c6370',
      '--text-bright': '#d7dae0', '--text-muted': '#4b5263', '--accent': '#61afef', '--accent-light': '#56b6c2',
    },
    terminal: {
      background: '#1e2127', foreground: '#abb2bf', cursor: '#528bff',
      black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
      blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#be5046', brightGreen: '#98c379', brightYellow: '#d19a66',
      brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#d7dae0',
    },
  },
  catppuccin: {
    name: 'Catppuccin Mocha',
    colors: {
      '--bg-app': '#1e1e2e', '--bg-sidebar': '#181825', '--bg-pane': '#11111b', '--bg-header': '#1e1e2e',
      '--bg-footer': '#1e1e2e', '--bg-card': '#313244', '--text-primary': '#cdd6f4', '--text-secondary': '#a6adc8',
      '--text-bright': '#ffffff', '--text-muted': '#585b70', '--accent': '#cba6f7', '--accent-light': '#f5c2e7',
    },
    terminal: {
      background: '#11111b', foreground: '#cdd6f4', cursor: '#f5e0dc',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1', brightYellow: '#f9e2af',
      brightBlue: '#89b4fa', brightMagenta: '#f5c2e7', brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    },
  },
  rosePine: {
    name: 'Rose Pine',
    colors: {
      '--bg-app': '#191724', '--bg-sidebar': '#1f1d2e', '--bg-pane': '#13111e', '--bg-header': '#191724',
      '--bg-footer': '#191724', '--bg-card': '#26233a', '--text-primary': '#e0def4', '--text-secondary': '#908caa',
      '--text-bright': '#ffffff', '--text-muted': '#6e6a86', '--accent': '#ebbcba', '--accent-light': '#f6c177',
    },
    terminal: {
      background: '#13111e', foreground: '#e0def4', cursor: '#524f67',
      black: '#26233a', red: '#eb6f92', green: '#31748f', yellow: '#f6c177',
      blue: '#9ccfd8', magenta: '#c4a7e7', cyan: '#ebbcba', white: '#e0def4',
      brightBlack: '#6e6a86', brightRed: '#eb6f92', brightGreen: '#31748f', brightYellow: '#f6c177',
      brightBlue: '#9ccfd8', brightMagenta: '#c4a7e7', brightCyan: '#ebbcba', brightWhite: '#e0def4',
    },
  },
};

let saveThemeTimeout = null;

function getCurrentTheme() {
  try {
    const saved = localStorage.getItem('ps-theme');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { ...PRESET_THEMES.dark, name: 'dark' };
}

export function applyTheme(themeData) {
  // Apply CSS variables
  if (themeData.colors) {
    for (const [prop, value] of Object.entries(themeData.colors)) {
      document.documentElement.style.setProperty(prop, value);
    }
  }
  // Dispatch terminal theme update event
  if (themeData.terminal) {
    window.dispatchEvent(new CustomEvent('theme-terminal-changed', { detail: themeData.terminal }));
  }
}

export function loadSavedTheme() {
  const theme = getCurrentTheme();
  if (theme.name !== 'dark') {
    applyTheme(theme);
  }
}

function saveTheme(themeData) {
  clearTimeout(saveThemeTimeout);
  saveThemeTimeout = setTimeout(() => {
    localStorage.setItem('ps-theme', JSON.stringify(themeData));
  }, 200);
}

function renderThemeTab(container) {
  const theme = getCurrentTheme();

  const colorRow = (label, prop, value) =>
    `<div class="theme-color-item">
      <input type="color" value="${value}" data-prop="${prop}" />
      <label>${label}</label>
    </div>`;

  const termColorRow = (label, key, value) =>
    `<div class="theme-color-item">
      <input type="color" value="${value}" data-term="${key}" />
      <label>${label}</label>
    </div>`;

  const currentPreset = PRESET_THEMES[theme.name];
  const currentLabel = currentPreset ? currentPreset.name : 'Custom';

  container.innerHTML = `
    <div class="theme-selector">
      <div class="theme-selector-current" id="theme-selector-toggle">
        <div class="theme-preview-swatch" style="background: linear-gradient(135deg, ${theme.colors['--bg-app']} 50%, ${theme.colors['--accent']} 50%)"></div>
        <span class="theme-selector-name">${currentLabel}</span>
        <span class="theme-selector-arrow">&#9662;</span>
      </div>
      <div class="theme-selector-dropdown" id="theme-dropdown">
        ${Object.entries(PRESET_THEMES).map(([key, p]) =>
          `<div class="theme-option ${theme.name === key ? 'active' : ''}" data-preset="${key}">
            <div class="theme-preview-swatch" style="background: linear-gradient(135deg, ${p.colors['--bg-app']} 50%, ${p.colors['--accent']} 50%)"></div>
            <span class="theme-option-name">${p.name}</span>
          </div>`
        ).join('')}
      </div>
    </div>

    <div class="theme-section">
      <h3>App Colors</h3>
      <div class="theme-color-grid">
        ${colorRow('Background', '--bg-app', theme.colors['--bg-app'])}
        ${colorRow('Sidebar', '--bg-sidebar', theme.colors['--bg-sidebar'])}
        ${colorRow('Pane', '--bg-pane', theme.colors['--bg-pane'])}
        ${colorRow('Header', '--bg-header', theme.colors['--bg-header'])}
        ${colorRow('Card', '--bg-card', theme.colors['--bg-card'])}
      </div>
    </div>

    <div class="theme-section">
      <h3>Text Colors</h3>
      <div class="theme-color-grid">
        ${colorRow('Primary', '--text-primary', theme.colors['--text-primary'])}
        ${colorRow('Secondary', '--text-secondary', theme.colors['--text-secondary'])}
        ${colorRow('Bright', '--text-bright', theme.colors['--text-bright'])}
      </div>
    </div>

    <div class="theme-section">
      <h3>Accent</h3>
      <div class="theme-color-grid">
        ${colorRow('Accent', '--accent', theme.colors['--accent'])}
        ${colorRow('Accent Light', '--accent-light', theme.colors['--accent-light'])}
      </div>
    </div>

    <div class="theme-section">
      <h3>Terminal — Background &amp; Text</h3>
      <div class="theme-color-grid">
        ${termColorRow('Background', 'background', theme.terminal.background)}
        ${termColorRow('Foreground', 'foreground', theme.terminal.foreground)}
        ${termColorRow('Cursor', 'cursor', theme.terminal.cursor)}
        ${termColorRow('Selection', 'selectionBackground', theme.terminal.selectionBackground || '#2a6df044')}
      </div>
    </div>

    <div class="theme-section">
      <h3>Terminal — Normal Colors (0-7)</h3>
      <div class="theme-color-grid">
        ${termColorRow('Black', 'black', theme.terminal.black)}
        ${termColorRow('Red', 'red', theme.terminal.red)}
        ${termColorRow('Green', 'green', theme.terminal.green)}
        ${termColorRow('Yellow', 'yellow', theme.terminal.yellow)}
        ${termColorRow('Blue', 'blue', theme.terminal.blue)}
        ${termColorRow('Magenta', 'magenta', theme.terminal.magenta)}
        ${termColorRow('Cyan', 'cyan', theme.terminal.cyan)}
        ${termColorRow('White', 'white', theme.terminal.white)}
      </div>
    </div>

    <div class="theme-section">
      <h3>Terminal — Bright Colors (8-15)</h3>
      <div class="theme-color-grid">
        ${termColorRow('Bright Black', 'brightBlack', theme.terminal.brightBlack)}
        ${termColorRow('Bright Red', 'brightRed', theme.terminal.brightRed)}
        ${termColorRow('Bright Green', 'brightGreen', theme.terminal.brightGreen)}
        ${termColorRow('Bright Yellow', 'brightYellow', theme.terminal.brightYellow)}
        ${termColorRow('Bright Blue', 'brightBlue', theme.terminal.brightBlue)}
        ${termColorRow('Bright Magenta', 'brightMagenta', theme.terminal.brightMagenta)}
        ${termColorRow('Bright Cyan', 'brightCyan', theme.terminal.brightCyan)}
        ${termColorRow('Bright White', 'brightWhite', theme.terminal.brightWhite)}
      </div>
    </div>

    <button class="theme-reset-btn" id="theme-reset">Reset to Default</button>
  `;

  // Theme dropdown
  const toggle = container.querySelector('#theme-selector-toggle');
  const dropdown = container.querySelector('#theme-dropdown');

  toggle.onclick = (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  };

  // Close dropdown on outside click
  const closeDropdown = (e) => {
    if (!dropdown.contains(e.target) && !toggle.contains(e.target)) {
      dropdown.classList.remove('open');
      document.removeEventListener('click', closeDropdown);
    }
  };
  document.addEventListener('click', closeDropdown);

  container.querySelectorAll('.theme-option').forEach(opt => {
    opt.onclick = () => {
      const preset = PRESET_THEMES[opt.dataset.preset];
      const newTheme = { ...preset, name: opt.dataset.preset };
      applyTheme(newTheme);
      localStorage.setItem('ps-theme', JSON.stringify(newTheme));
      dropdown.classList.remove('open');
      renderThemeTab(container);
    };
  });

  // CSS variable color pickers (live preview)
  container.querySelectorAll('input[data-prop]').forEach(input => {
    input.addEventListener('input', () => {
      const prop = input.dataset.prop;
      document.documentElement.style.setProperty(prop, input.value);
      const theme = getCurrentTheme();
      theme.colors[prop] = input.value;
      theme.name = 'custom';
      saveTheme(theme);
    });
  });

  // Terminal color pickers (live preview)
  container.querySelectorAll('input[data-term]').forEach(input => {
    input.addEventListener('input', () => {
      const key = input.dataset.term;
      const theme = getCurrentTheme();
      theme.terminal[key] = input.value;
      theme.name = 'custom';
      saveTheme(theme);
      window.dispatchEvent(new CustomEvent('theme-terminal-changed', { detail: theme.terminal }));
    });
  });

  // Reset button
  container.querySelector('#theme-reset').onclick = () => {
    const defaultTheme = { ...PRESET_THEMES.dark, name: 'dark' };
    // Clear inline styles to restore CSS defaults
    for (const prop of Object.keys(defaultTheme.colors)) {
      document.documentElement.style.removeProperty(prop);
    }
    applyTheme(defaultTheme);
    localStorage.removeItem('ps-theme');
    renderThemeTab(container);
  };
}

// --- Plugins Panel ---

async function renderPluginsPanel() {
  const panel = document.getElementById('plugins-panel');
  panel.innerHTML = `
    <div class="config-panel-header">
      <button class="config-back-btn">\u2190 Back</button>
      <h1>Plugins</h1>
    </div>
    <div id="plugins-list"><div class="empty-state">Loading...</div></div>
  `;

  panel.querySelector('.config-back-btn').onclick = hidePanel;

  try {
    const config = await invoke('read_claude_config', { projectPath: null });
    const list = panel.querySelector('#plugins-list');

    if (config.plugins.length === 0) {
      list.innerHTML = '<div class="empty-state">No plugins installed.</div>';
      return;
    }

    list.innerHTML = config.plugins.map(p => `
      <div class="plugin-card" data-plugin="${p.name}">
        <div>
          <div class="plugin-name">${p.name.split('@')[0]}</div>
          <div class="plugin-meta">${p.scope} \u00b7 v${p.version}</div>
        </div>
        <label class="form-toggle">
          <input type="checkbox" ${p.enabled ? 'checked' : ''} />
          <span>${p.enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>
    `).join('');

    // Wire toggle handlers
    list.querySelectorAll('.plugin-card input[type="checkbox"]').forEach(checkbox => {
      checkbox.onchange = async () => {
        const card = checkbox.closest('.plugin-card');
        const pluginName = card.dataset.plugin;
        const enabled = checkbox.checked;
        const label = card.querySelector('.form-toggle span');
        label.textContent = enabled ? 'Enabled' : 'Disabled';

        // Patch settings.json
        try {
          const config = await invoke('read_claude_config', { projectPath: null });
          const settings = config.settings_raw;
          if (!settings.enabledPlugins) settings.enabledPlugins = {};
          settings.enabledPlugins[pluginName] = enabled;
          await invoke('save_claude_settings', { settingsJson: JSON.stringify(settings, null, 2) });
        } catch (err) {
          console.error('Failed to save plugin toggle:', err);
          checkbox.checked = !enabled;
          label.textContent = !enabled ? 'Enabled' : 'Disabled';
        }
      };
    });

  } catch (err) {
    panel.querySelector('#plugins-list').innerHTML = `<div class="empty-state">Failed to load: ${err}</div>`;
  }
}

// --- MCPs Panel ---

async function renderMcpsPanel() {
  const panel = document.getElementById('mcps-panel');
  panel.innerHTML = `
    <div class="config-panel-header">
      <button class="config-back-btn">\u2190 Back</button>
      <h1>MCP Servers</h1>
    </div>
    <div id="mcps-list"><div class="empty-state">Loading...</div></div>
  `;

  panel.querySelector('.config-back-btn').onclick = hidePanel;

  try {
    const config = await invoke('read_claude_config', { projectPath: null });
    const list = panel.querySelector('#mcps-list');

    if (config.mcp_servers.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          No MCP servers configured.<br>
          <span class="setting-description">Add servers in ~/.claude/settings.json under the "mcpServers" key.</span>
        </div>
      `;
      return;
    }

    list.innerHTML = config.mcp_servers.map(s => `
      <div class="mcp-card">
        <div>
          <div class="plugin-name">${s.name}</div>
          <div class="plugin-meta">${s.command} ${s.args.join(' ')}</div>
        </div>
      </div>
    `).join('');

  } catch (err) {
    panel.querySelector('#mcps-list').innerHTML = `<div class="empty-state">Failed to load: ${err}</div>`;
  }
}

// --- Memory Panel ---

async function renderMemoryPanel() {
  const panel = document.getElementById('memory-panel');
  panel.innerHTML = `
    <div class="config-panel-header">
      <button class="config-back-btn">\u2190 Back</button>
      <h1>Memory</h1>
    </div>
    <div id="memory-content"><div class="empty-state">Loading...</div></div>
  `;

  panel.querySelector('.config-back-btn').onclick = hidePanel;

  try {
    const config = await invoke('read_claude_config', { projectPath: null });
    const content = panel.querySelector('#memory-content');

    content.innerHTML = `
      <div class="memory-section">
        <h3>Global CLAUDE.md</h3>
        <textarea class="memory-editor" id="memory-global" placeholder="No global CLAUDE.md found. Content saved here will be written to ~/.claude/CLAUDE.md">${config.global_memory || ''}</textarea>
        <button class="memory-save-btn" id="memory-save-global">Save Global</button>
      </div>
      <div class="memory-section">
        <h3>Project CLAUDE.md</h3>
        <textarea class="memory-editor" id="memory-project" placeholder="No project CLAUDE.md found for the focused session.">${config.project_memory || ''}</textarea>
        <div class="setting-description" style="margin-top:4px">Project memory is determined by the focused session's working directory.</div>
      </div>
    `;

    // Save global memory
    content.querySelector('#memory-save-global').onclick = async () => {
      const text = content.querySelector('#memory-global').value;
      try {
        const homePath = '~/.claude/CLAUDE.md';
        // We need the actual path — use dirs on backend
        // For now, construct it client-side
        await invoke('save_memory_file', {
          path: (await getHomePath()) + '/.claude/CLAUDE.md',
          content: text,
        });
        const btn = content.querySelector('#memory-save-global');
        btn.textContent = 'Saved!';
        setTimeout(() => btn.textContent = 'Save Global', 1500);
      } catch (err) {
        console.error('Failed to save memory:', err);
      }
    };

  } catch (err) {
    panel.querySelector('#memory-content').innerHTML = `<div class="empty-state">Failed to load: ${err}</div>`;
  }
}

// Helper to get home path (we'll derive from known paths)
async function getHomePath() {
  // Use the Tauri path API if available, otherwise infer from settings location
  try {
    const path = window.__TAURI__.path;
    if (path?.homeDir) return await path.homeDir();
  } catch {}
  // Fallback: most macOS systems
  return '/Users/' + (await invoke('read_claude_config', { projectPath: null })).settings_raw?.env?.USER || 'user';
}
