import { Terminal } from '../vendor/xterm/xterm.mjs';
import { FitAddon } from '../vendor/xterm/addon-fit.mjs';
import { WebLinksAddon } from '../vendor/xterm/addon-web-links.mjs';
import { SearchAddon } from '../vendor/xterm/addon-search.mjs';

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

    this._textDecoder = new TextDecoder('utf-8', { fatal: false });

    this.term = new Terminal({
      cursorBlink: true,
      fontSize: parseInt(localStorage.getItem('ps-font-size') || '14'),
      fontFamily: '"SF Mono", "Cascadia Code", "JetBrains Mono", "Menlo", monospace',
      lineHeight: 1.1,
      scrollback: parseInt(localStorage.getItem('ps-scrollback') || '5000'),
      theme: getSavedTerminalTheme(),
    });

    this.fitAddon = new FitAddon();
    this.term.loadAddon(this.fitAddon);
    // Web links: Cmd+click opens URLs via Tauri opener
    this.term.loadAddon(new WebLinksAddon((event, url) => {
      if (event.metaKey || event.ctrlKey) {
        try { window.__TAURI__.opener.openUrl(url); } catch (err) { console.warn('Failed to open URL:', err); }
      }
    }));

    // Search addon
    this.searchAddon = new SearchAddon();
    this.term.loadAddon(this.searchAddon);

    // File path links: Cmd+click opens local files/directories
    const filePathRegex = /(?:^|\s)((?:\/[\w.@-]+)+(?:\.[\w]+)?(?::(\d+)(?::(\d+))?)?)/g;
    this.term.registerLinkProvider({
      provideLinks: (lineNumber, callback) => {
        const line = this.term.buffer.active.getLine(lineNumber - 1);
        if (!line) return callback([]);
        const text = line.translateToString(true);
        const links = [];
        let match;
        const re = new RegExp(filePathRegex.source, 'g');
        while ((match = re.exec(text)) !== null) {
          const fullMatch = match[1];
          const startX = match.index + (match[0].length - match[1].length) + 1;
          links.push({
            range: { start: { x: startX, y: lineNumber }, end: { x: startX + fullMatch.length - 1, y: lineNumber } },
            text: fullMatch,
            activate: (event, linkText) => {
              if (event.metaKey || event.ctrlKey) {
                // Extract file path (strip :line:col)
                const filePath = linkText.replace(/:\d+(:\d+)?$/, '');
                try { window.__TAURI__.opener.openPath(filePath); } catch (err) { console.warn('Failed to open path:', err); }
              }
            },
          });
        }
        callback(links);
      },
    });

    // Kitty keyboard protocol support — Claude Code queries this on startup
    // to decide whether Shift+Enter (and other modified keys) are supported.
    this._kittyKeyboardFlags = 0;
    this._kittyKeyboardStack = [];

    // Query: CSI ? u — respond with current flags so Claude Code knows we support it
    this.term.parser.registerCsiHandler({ prefix: '?', final: 'u' }, (params) => {
      if (this.sessionId) {
        const encoder = new TextEncoder();
        invoke('write_to_pty', {
          sessionId: this.sessionId,
          data: Array.from(encoder.encode(`\x1b[?${this._kittyKeyboardFlags}u`)),
        });
      }
      return true;
    });

    // Enable/push: CSI > flags u — application requests enhanced keyboard mode
    this.term.parser.registerCsiHandler({ prefix: '>', final: 'u' }, (params) => {
      this._kittyKeyboardStack.push(this._kittyKeyboardFlags);
      this._kittyKeyboardFlags = params.length ? params[0] : 0;
      return true;
    });

    // Disable/pop: CSI < u — application reverts keyboard mode
    this.term.parser.registerCsiHandler({ prefix: '<', final: 'u' }, (params) => {
      const count = (params.length && params[0]) ? params[0] : 1;
      for (let i = 0; i < count && this._kittyKeyboardStack.length; i++) {
        this._kittyKeyboardFlags = this._kittyKeyboardStack.pop();
      }
      if (!this._kittyKeyboardStack.length) this._kittyKeyboardFlags = 0;
      return true;
    });

    // Note: Shift+Enter is handled by the capture-phase document keydown handler
    // in app.js, which fires before xterm sees the event. This ensures the CSI u
    // sequence reaches the PTY without xterm's default \r handling interfering.

    // Register OSC handlers for terminal notifications (OSC 9, 99, 777)
    // OSC 9: iTerm2-style growl notification
    this.term.parser.registerOscHandler(9, (data) => {
      window.dispatchEvent(new CustomEvent('terminal-notification', {
        detail: { title: 'Terminal', body: data, sessionId: this.sessionId }
      }));
      return true;
    });
    // OSC 99: kitty notification protocol
    this.term.parser.registerOscHandler(99, (data) => {
      // kitty format: key=value;key=value pairs, 'body' or 'p' for payload
      let body = data;
      const parts = data.split(';');
      for (const part of parts) {
        const [key, ...rest] = part.split('=');
        if (key === 'body' || key === 'p' || key === 'd') {
          body = rest.join('=');
          break;
        }
      }
      window.dispatchEvent(new CustomEvent('terminal-notification', {
        detail: { title: 'Terminal', body, sessionId: this.sessionId }
      }));
      return true;
    });
    // OSC 777: rxvt-unicode notification
    this.term.parser.registerOscHandler(777, (data) => {
      // Format: notify;title;body
      const parts = data.split(';');
      const title = parts[1] || 'Terminal';
      const body = parts.slice(2).join(';') || parts[1] || data;
      window.dispatchEvent(new CustomEvent('terminal-notification', {
        detail: { title, body, sessionId: this.sessionId }
      }));
      return true;
    });

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
          const text = this._textDecoder.decode(bytes, { stream: true });
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

  findNext(query, opts) {
    return this.searchAddon.findNext(query, opts);
  }

  findPrevious(query, opts) {
    return this.searchAddon.findPrevious(query, opts);
  }

  clearSearch() {
    this.searchAddon.clearDecorations();
  }

  /**
   * Serialize the terminal scrollback buffer (last N lines) as plain text.
   * Used for session persistence across restarts.
   */
  getScrollback(maxLines) {
    if (maxLines === undefined) {
      maxLines = parseInt(localStorage.getItem('ps-scrollback-save') || '1000');
    }
    const buffer = this.term.buffer.active;
    const totalLines = buffer.length;
    const startLine = Math.max(0, totalLines - maxLines);
    const lines = [];
    for (let i = startLine; i < totalLines; i++) {
      const line = buffer.getLine(i);
      if (line) {
        const text = line.translateToString(true);
        // Skip trailing empty lines
        lines.push(text);
      }
    }
    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    return lines.join('\n');
  }

  /**
   * Write saved scrollback content into the terminal before connecting PTY.
   */
  restoreScrollback(content) {
    if (!content) return;
    // Write the content with newlines so it appears as previous output
    this.term.write(content.replace(/\n/g, '\r\n') + '\r\n');
  }

  async destroy() {
    this.resizeObserver.disconnect();
    if (this.sessionId) {
      await invoke('kill_pty', { sessionId: this.sessionId });
    }
    this.term.dispose();
  }
}
