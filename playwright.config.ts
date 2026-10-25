import { defineConfig, devices } from '@playwright/test';

// Browser specs live under tests/browser/. Playwright starts its own dedicated
// me[tt] instance on :3100 with a throwaway DB (data/mett-test.db) — the suite
// is self-contained and never touches a `bun run dev` session on :3000. The
// seed fixture resets the game on each run, so the test DB is disposable.
const TEST_PORT = 3100;

export default defineConfig({
  testDir: 'tests/browser',
  // One worker: every spec shares the single :3100 instance and its DB, and
  // each test re-seeds the game first, so parallel workers would reset each
  // other's state mid-test (seen as rare, unreproducible failures).
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'bun run src/index.ts',
    url: `http://localhost:${TEST_PORT}`,
    env: {
      PORT: String(TEST_PORT),
      DATABASE_PATH: 'data/mett-test.db',
      ADMIN_PASSWORD: 'PASSWORD',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
