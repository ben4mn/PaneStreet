import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

const mockXterm = resolve('./src/js/__tests__/mocks/xterm.js');
const mockTauri = resolve('./src/js/__tests__/mocks/tauri-api.js');

export default defineConfig({
  resolve: {
    alias: [
      { find: /.*\/vendor\/xterm\/xterm\.mjs$/, replacement: mockXterm },
      { find: /.*\/vendor\/xterm\/addon-fit\.mjs$/, replacement: mockXterm },
      { find: /.*\/vendor\/xterm\/addon-web-links\.mjs$/, replacement: mockXterm },
      { find: /.*\/vendor\/xterm\/addon-search\.mjs$/, replacement: mockXterm },
      { find: /.*\/vendor\/tauri-api\/tray\.js$/, replacement: mockTauri },
      { find: /.*\/vendor\/tauri-api\/image\.js$/, replacement: mockTauri },
    ],
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/js/__tests__/setup.js'],
    include: ['src/js/__tests__/**/*.test.js'],
  },
});
