// Global test setup — mocks Tauri APIs, localStorage, and browser globals

const store = {};

// Mock localStorage
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: vi.fn((key) => store[key] ?? null),
    setItem: vi.fn((key, val) => { store[key] = String(val); }),
    removeItem: vi.fn((key) => { delete store[key]; }),
    clear: vi.fn(() => { for (const k in store) delete store[k]; }),
  },
  writable: true,
});

// Mock Tauri APIs on window.__TAURI__
const invokeHandlers = {};

globalThis.__TAURI__ = {
  core: {
    invoke: vi.fn((cmd, args) => {
      if (invokeHandlers[cmd]) return Promise.resolve(invokeHandlers[cmd](args));
      return Promise.resolve(null);
    }),
    Channel: class { onmessage = null; },
  },
  event: {
    listen: vi.fn(() => Promise.resolve(() => {})),
  },
  opener: {
    openUrl: vi.fn(),
    openPath: vi.fn(),
  },
};

// Also set on window for modules that use window.__TAURI__
if (typeof window !== 'undefined') {
  window.__TAURI__ = globalThis.__TAURI__;
}

// Helper: register mock invoke handlers per test
globalThis.mockInvoke = {
  register(cmd, handler) { invokeHandlers[cmd] = handler; },
  reset() { for (const k in invokeHandlers) delete invokeHandlers[k]; },
};

// Reset state between tests
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockInvoke.reset();
});
