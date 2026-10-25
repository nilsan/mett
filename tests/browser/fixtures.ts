/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test as base, expect, type APIRequestContext, type Page, type WebSocket } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

/** Log a request context in as admin. The session cookie lands in that
 *  context's cookie jar, so later calls through it are authenticated — for
 *  `page.context().request` that includes the browser page itself. */
export async function adminLogin(request: APIRequestContext): Promise<void> {
  const res = await request.post('/login', { form: { password: 'PASSWORD' }, maxRedirects: 0 });
  if (res.status() !== 302 || res.headers()['location'] !== '/admin') {
    throw new Error(`admin login failed: ${res.status()} → ${res.headers()['location']}`);
  }
}

// Every worker gets its own me[tt] instance — port 3100 + worker index, and
// its own throwaway DB (and backups) in a temp folder removed afterwards — so workers
// run in parallel without resetting each other's game. NODE_ENV=production
// keeps the server from writing the repo's .pid (that file belongs to the dev
// server on :3000, which the suite never touches).
export const test = base.extend<{ autoSeed: void }, { workerServer: string }>({
  workerServer: [async ({}, use, workerInfo) => {
    const port = 3100 + workerInfo.parallelIndex;
    const dir = mkdtempSync(join(tmpdir(), `mett-test-w${workerInfo.parallelIndex}-`));
    const db = join(dir, 'mett.db');
    // The Playwright runner is Node; the server it starts is Bun.
    const server = spawn('bun', ['run', 'src/index.ts'], {
      env: { ...process.env, PORT: String(port), DATABASE_PATH: db, ADMIN_PASSWORD: 'PASSWORD', NODE_ENV: 'production' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    const exited = new Promise(resolve => server.once('exit', resolve));
    const url = `http://localhost:${port}`;
    for (let i = 0; ; i++) {
      try { if ((await fetch(`${url}/healthz`)).ok) break; } catch { /* starting */ }
      if (i > 100) throw new Error(`test server on :${port} did not start`);
      await sleep(100);
    }
    await use(url);
    server.kill();
    await exited;
    rmSync(dir, { recursive: true, force: true });
  }, { scope: 'worker' }],

  // Point page.goto('/…') and request.*('/…') at this worker's instance.
  baseURL: async ({ workerServer }, use) => { await use(workerServer); },

  // Each test starts from a freshly seeded 18-player Expert game, so specs are
  // hermetic: no mutate-and-restore dance, no dependence on earlier tests.
  autoSeed: [async ({ request }, use) => {
    // /api/debug/simulate resets + starts the game and adds the 18-player
    // scenario (always includes Minoa, civ #1). It's an admin POST, so log the
    // test's request context in first (default password 'PASSWORD').
    await adminLogin(request);
    const res = await request.post('/api/debug/simulate', {
      data: { expert: 1, player_count: 18, rounds: 6 },
    });
    if (!res.ok()) {
      throw new Error(`seed failed: ${res.status()} ${await res.text()}`);
    }
    await use();
  }, { auto: true }],
});

export { expect };

/** Navigate to a civ page and return the state-feed WebSocket opened on load,
 *  so tests can deterministically await the next state_update frame instead of
 *  sleeping. Register the listener before goto() so the socket isn't missed. */
export async function gotoCiv(page: Page, slug: string): Promise<WebSocket> {
  const wsPromise = page.waitForEvent('websocket');
  await page.goto(`/${slug}`);
  return wsPromise;
}

/** Resolve when the next state_update frame arrives on a civ socket — the
 *  server broadcasts one whenever this player's state changes, which is what
 *  drives renderFromState on the client. mett sends no heartbeat frames, so a
 *  state_update frame after a triggered change is reliably the one we caused. */
export function nextStateFrame(ws: WebSocket) {
  return ws.waitForEvent('framereceived', {
    predicate: f => typeof f.payload === 'string' && f.payload.includes('state_update'),
  });
}
