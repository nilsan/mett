/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, adminLogin } from './fixtures';

// Screenshot regression tests: a seeded 18-player game rendered on the status
// board (1080p, 4K), the admin page and a player page on a phone, compared
// pixel by pixel against committed baselines. Any visual change fails here —
// intended ones are accepted with:
//
//   bunx playwright test tests/browser/visual.spec.ts --update-snapshots
//
// Local only: the baselines come from the maintainer's machine, and CI runners
// render the system font differently, so they would never match there.
test.skip(!!process.env.CI, 'screenshot baselines are machine-specific (fonts)');

// Exact comparison: rendering on one machine is deterministic, and the default
// per-pixel tolerance (0.2) lets subtle colour changes — a stripe or grey a
// few levels off — slip through.
const EXACT = { threshold: 0, maxDiffPixels: 0 } as const;

const SEED = 42;

/** The same game every time: seeded simulation, census and city counts. */
async function seededGame(request: APIRequestContext): Promise<void> {
  const ok = async (path: string, data: object) => expect((await request.post(path, { data })).ok()).toBe(true);
  await ok('/api/debug/simulate', { expert: 1, player_count: 18, rounds: 6, seed: SEED });
  await ok('/api/debug/census', { seed: SEED });
  await ok('/api/debug/cities', { seed: SEED });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

// Things that legitimately change between runs.
const volatile = (page: Page) => [page.locator('.mett-version'), page.locator('.backup-section')];

test.beforeEach(async ({ request }) => { await seededGame(request); });

for (const vp of [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
  test(`status board ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/');
    await settle(page);
    await expect(page).toHaveScreenshot(`status-${vp.width}.png`, { ...EXACT, mask: volatile(page) });
  });
}

test('admin page 1920×1080', async ({ page }) => {
  await adminLogin(page.context().request);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/admin');
  await settle(page);
  await expect(page).toHaveScreenshot('admin-1920.png', { ...EXACT, fullPage: true, mask: volatile(page) });
});

test('player page on a phone', async ({ page, request }) => {
  const state = await (await request.get('/api/state')).json();
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(`/${state.players[0].civ_slug}`);
  await settle(page);
  await expect(page).toHaveScreenshot('player-412.png', { ...EXACT, fullPage: true, mask: volatile(page) });
});
