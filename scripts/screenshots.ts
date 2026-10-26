/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Regenerate the README screenshots (docs/img/) from the demo table.
 *
 *   bun run screenshots
 *
 * Starts its own me[tt] instance in demo mode on a throwaway database (never
 * touches the dev server or its data) — the same 12-empire round-7 table as
 * demo.mett.games — then fills in the census and city counts (seeded) so the
 * board shows move order and trade cards, and captures:
 *   - screenshot-status.jpg   (1920×1080, JPEG q=85)  ─── status display
 *   - screenshot-admin.jpg    (1920×1080, JPEG q=85)  ─── admin page
 *   - screenshot-civ.png      (Pixel 7, full page)    ─── one empire's page
 */

import { chromium, devices, type Browser } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3302;
const BASE = `http://localhost:${PORT}`;
const OUT_DIR = 'docs/img';
const TV = { viewport: { width: 1920, height: 1080 } };

const dir = mkdtempSync(join(tmpdir(), 'mett-screenshots-'));
const server = Bun.spawn(['bun', 'run', 'src/index.ts'], {
  env: { ...process.env, PORT: String(PORT), DATABASE_PATH: join(dir, 'm.db'), DEMO: '1', NODE_ENV: 'production' },
  stdout: 'ignore', stderr: 'inherit',
});

async function shoot(browser: Browser, path: string, file: string, opts: { admin?: string; phone?: boolean } = {}): Promise<void> {
  const ctx = await browser.newContext(opts.phone ? { ...devices['Pixel 7'] } : TV);
  if (opts.admin) await ctx.addCookies([{ name: 'mett_admin', value: opts.admin, url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  const out = `${OUT_DIR}/${file}`;
  await page.screenshot(file.endsWith('.jpg') ? { path: out, type: 'jpeg', quality: 85 } : { path: out, fullPage: true });
  await ctx.close();
  console.log(`✓ ${out}`);
}

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/healthz')).ok) break; } catch { /* starting */ }
    if (i > 50) throw new Error('server did not start');
    await Bun.sleep(100);
  }
  const login = await fetch(BASE + '/login', { method: 'POST', body: new URLSearchParams({ password: 'demo' }), redirect: 'manual' });
  const token = login.headers.get('set-cookie')!.split(';')[0]!.split('=')[1]!;
  const post = (path: string, body: object) => fetch(BASE + path, {
    method: 'POST', headers: { cookie: `mett_admin=${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  // Census in and revealed, city counts in: move order and trade cards show.
  await post('/api/debug/census', { seed: 7 });
  await post('/api/debug/cities', { seed: 7 });
  const state = await (await fetch(BASE + '/api/state')).json() as { players: Array<{ civ_slug: string }> };

  const browser = await chromium.launch();
  try {
    await shoot(browser, '/', 'screenshot-status.jpg');
    await shoot(browser, '/admin', 'screenshot-admin.jpg', { admin: token });
    await shoot(browser, `/${state.players[0]!.civ_slug}`, 'screenshot-civ.png', { phone: true });
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  await server.exited;
  rmSync(dir, { recursive: true, force: true });
}
