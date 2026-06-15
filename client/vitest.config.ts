import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Client test runner: jsdom + React Testing Library. Tests live next to source
// under `src/**/__tests__/` and are excluded from the production `tsc` build via
// tsconfig.json.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.test.{ts,tsx}'],
    },
  },
});
