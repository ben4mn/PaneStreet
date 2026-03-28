import { Terminal } from '../vendor/xterm/xterm.mjs';
import { FitAddon } from '../vendor/xterm/addon-fit.mjs';
import { WebLinksAddon } from '../vendor/xterm/addon-web-links.mjs';

const { invoke, Channel } = window.__TAURI__.core;

const DEFAULT_TERMINAL_THEME = {
  background: '#111111',
  foreground: '#cccccc',
  cursor: '#cccccc',
  selectionBackground: '#2a6df044',
  black: '#1a1a1a',
  red: '#ef4444',
  green: '#4ade80',
  yellow: '#f59e0b',
  blue: '#2a6df0',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#cccccc',
  brightBlack: '#555555',
  brightRed: '#f87171',
  brightGreen: '#86efac',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
};

function getSavedTerminalTheme() {
  try {
    const saved = localStorage.getItem('ps-theme');
    if (saved) {
      const data = JSON.parse(saved);
      if (data.terminal) return { ...DEFAULT_TERMINAL_THEME, ...data.terminal };
    }
  } catch {}
  return DEFAULT_TERMINAL_THEME;
}

export class TerminalSession {
  constructor(container) {
    this.container = container;
    this.sessionId = null;
    this.onOutputCallback = null;
    this._outputBuffer = '';

    this.term = new Terminal({
      cursorBlink: true,
      fontSize: parseInt(localStorage.getItem('ps-font-size') || '14'),
      fontFamily: '"SF Mono", "Cascadia Code", "JetBrains Mono", "Menlo", monospace',
      lineHeight: 1.1,
      theme: getSavedTerminalTheme(),
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new WebLinksAddon());

    // Observe container resize
    this.resizeObserver = new ResizeObserver(() => {
      this.fit();
    });
  }

  open() {
    this.term.open(this.container);
    this.resizeObserver.observe(this.container);
    requestAnimationFrame(() => this.fit());
  }

  fit() {
    try {
      this.fitAddon.fit();
    } catch (_) {}
  }

  updateTheme(themeColors) {
    this.term.options.theme = { ...this.term.options.theme, ...themeColors };
  }

  applySettings(settings) {
    if (settings.fontSize !== undefined) {
      this.term.options.fontSize = settings.fontSize;
    }
    this.fit();
  }

  onOutput(callback) {
    this.onOutputCallback = callback;
  }

  async connect(cwd, sessionId = null) {
    const channel = new Channel();
    channel.onmessage = (msg) => {
      const bytes = new Uint8Array(msg.data);
      this.term.write(bytes);

      // Scan output for patterns (e.g., /rename command)
      if (this.onOutputCallback) {
        try {
          const text = new TextDecoder().decode(bytes);
          this._outputBuffer += text;
          // Keep buffer manageable
          if (this._outputBuffer.length > 2000) {
            this._outputBuffer = this._outputBuffer.slice(-1000);
          }
          this.onOutputCallback(text, this._outputBuffer);
        } catch {}
      }
    };

    this.sessionId = await invoke('spawn_pty', {
      rows: this.term.rows,
      cols: this.term.cols,
      cwd: cwd || null,
      sessionId: sessionId || null,
      onData: channel,
    });

    this.term.onData((data) => {
      const encoder = new TextEncoder();
      invoke('write_to_pty', {
        sessionId: this.sessionId,
        data: Array.from(encoder.encode(data)),
      });
    });

    this.term.onResize(({ rows, cols }) => {
      invoke('resize_pty', {
        sessionId: this.sessionId,
        rows,
        cols,
      });
    });

    return this.sessionId;
  }

  focus() {
    this.term.focus();
  }

  async destroy() {
    this.resizeObserver.disconnect();
    if (this.sessionId) {
      await invoke('kill_pty', { sessionId: this.sessionId });
    }
    this.term.dispose();
  }
}
