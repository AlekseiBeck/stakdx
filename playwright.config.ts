import { defineConfig, devices } from '@playwright/test';

// E2E runs against the client dev server in demo mode (no API keys needed for
// the landing page). The signed-in spec is env-gated (E2E_EMAIL/E2E_PASSWORD)
// and skips when creds aren't provided, keeping the default run self-contained.
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    colorScheme: 'light',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev:client',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
