import { defineConfig } from 'vitest/config';

// Server test runner. Tests live in `server/test/` (outside `src/`, so the
// production `tsc` build never sees them) and import modules from `../src/`.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts', 'src/mockData.ts'],
    },
  },
});
