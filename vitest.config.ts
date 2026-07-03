import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // The parity fixture imports the published package name; point it at src.
    alias: [
      { find: '@foony/translate/react', replacement: fileURLToPath(new URL('./src/react/index.ts', import.meta.url)) },
      { find: '@foony/translate', replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
    ],
  },
});
