/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Regenerate the README screenshots from a freshly-simulated mid-game.
 *
 *   bun run screenshots
 *
 * Requires the dev server on :3000. Captures three views into docs/img/:
 *   - screenshot-status.jpg   (1920×1080, JPEG q=85)  ─── status display
 *   - screenshot-admin.jpg    (1920×1080, JPEG q=85)  ─── admin / Players
 *   - screenshot-civ.png      (Pixel 8 viewport)      ─── single empire page
 *
 * Side effect: the simulate call resets the game on the dev DB, so don't run
 * this against an in-progress real session.
 */

import { chromium, devices, type Browser, type BrowserContext } from 'playwright';

const BASE = 'http://localhost:3000';
const ADMIN_PASSWORD = 'PASSWORD';
const OUT_DIR = 'docs/img';

async function loginAdmin(ctx: BrowserContext): Promise<void> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill('input[name=password]', ADMIN_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(`${BASE}/admin`);
  await page.close();
}

async function simulateMidGame(ctx: BrowserContext): Promise<void> {
  const page = await ctx.newPage();
  const res = await page.request.post(`${BASE}/api/debug/simulate`, {
    data: { expert: 1, player_count: 12, rounds: 6 },
  });
  if (!res.ok()) {
    throw new Error(`simulate failed: ${res.status()} ${await res.text()}`);
  }
  await page.close();
}

async function pickCivSlug(ctx: BrowserContext): Promise<string> {
  const page = await ctx.newPage();
  const res = await page.request.get(`${BASE}/api/state`);
  type Player = { name: string };
  type Civ = { id: number; slug: string; name: string };
  const state = (await res.json()) as { players: (Player & { civ_id: number })[] };
  // Grab any one — pick the first whose civ name we can map to a slug.
  const civsRes = await page.request.get(`${BASE}/api/civs`);
  const civs = (await civsRes.json()) as Civ[];
  const civById = new Map(civs.map(c => [c.id, c]));
  const first = state.players.find(p => civById.has(p.civ_id));
  if (!first) throw new Error('no players in simulated game');
  await page.close();
  return civById.get(first.civ_id)!.slug;
}

async function captureStatus(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: `${OUT_DIR}/screenshot-status.jpg`,
    type: 'jpeg',
    quality: 85,
    fullPage: false,
  });
  await ctx.close();
  console.log(`✓ ${OUT_DIR}/screenshot-status.jpg`);
}

async function captureAdmin(browser: Browser): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addCookies([
    { name: 'mett_admin', value: ADMIN_PASSWORD, url: BASE },
  ]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: `${OUT_DIR}/screenshot-admin.jpg`,
    type: 'jpeg',
    quality: 85,
    fullPage: false,
  });
  await ctx.close();
  console.log(`✓ ${OUT_DIR}/screenshot-admin.jpg`);
}

async function captureCiv(browser: Browser, slug: string): Promise<void> {
  const ctx = await browser.newContext({ ...devices['Pixel 8'] });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${slug}`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    path: `${OUT_DIR}/screenshot-civ.png`,
    fullPage: true,
  });
  await ctx.close();
  console.log(`✓ ${OUT_DIR}/screenshot-civ.png (slug=${slug})`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const setup = await browser.newContext();
    await loginAdmin(setup);
    await simulateMidGame(setup);
    const slug = await pickCivSlug(setup);
    await setup.close();

    await captureStatus(browser);
    await captureAdmin(browser);
    await captureCiv(browser, slug);
  } finally {
    await browser.close();
  }
}

await main();
