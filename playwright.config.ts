import { defineConfig, devices } from '@playwright/test';

// Browser specs live under tests/browser/. Each worker starts its own me[tt]
// instance (port 3100 + worker index, throwaway DB in a temp folder) from
// the workerServer fixture in tests/browser/fixtures.ts, so specs run in
// parallel without sharing game state, and the :3000 dev server is never
// touched.
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
