// Mock xterm.js Terminal and addons for testing

export class Terminal {
  constructor(options = {}) {
    this.options = options;
    this._addons = [];
    this._data = [];
    this.buffer = {
      active: {
        length: 0,
        getLine: () => null,
      },
    };
    this.parser = {
      registerOscHandler: vi.fn(),
      registerCsiHandler: vi.fn(),
    };
    this.onData = vi.fn(() => ({ dispose: vi.fn() }));
    this.onResize = vi.fn(() => ({ dispose: vi.fn() }));
    this.onTitleChange = vi.fn(() => ({ dispose: vi.fn() }));
  }

  open() {}
  write(data) { this._data.push(data); }
  dispose() {}
  focus() {}
  clear() {}
  reset() {}

  loadAddon(addon) {
    this._addons.push(addon);
    if (addon.activate) addon.activate(this);
  }

  registerLinkProvider() {}
}

export class FitAddon {
  activate() {}
  fit() {}
  proposeDimensions() { return { cols: 80, rows: 24 }; }
}

export class WebLinksAddon {
  constructor() {}
  activate() {}
}

export class SearchAddon {
  activate() {}
  findNext(query, opts) { return false; }
  findPrevious(query, opts) { return false; }
  clearDecorations() {}
}
