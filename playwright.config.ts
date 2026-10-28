/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

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
    // The TV layout and the player page's one-line rows again with a wide
    // system font (DejaVu Sans): the board once fit Noto Sans but clipped with
    // DejaVu, the default on many Linux TV computers and on the CI runners.
    {
      name: 'chromium-wide-font',
      testMatch: /(layout|civ-oneline)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { env: { ...process.env, FONTCONFIG_FILE: resolve('tests/browser/wide-font.conf') } },
      },
    },
  ],
});
