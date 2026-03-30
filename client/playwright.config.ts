import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless: true,
    actionTimeout: 15_000,
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'VITE_TEST_MODE=true npm run dev',
    port: 5173,
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
