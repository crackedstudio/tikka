 /* global process */
import { defineConfig, devices } from "@playwright/test";

// @ts-expect-error - process is not defined in playwright config
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  fullyParallel: true,
  forbidOnly: isCI,
  workers: isCI ? 1 : undefined,
  use: {
    headless: true,
    actionTimeout: 15_000,
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "VITE_TEST_MODE=true npm run dev",
    port: 5173,
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
