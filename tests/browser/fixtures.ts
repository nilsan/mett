/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test as base, expect, type Page, type WebSocket } from '@playwright/test';

// Every browser test runs against a freshly-seeded 18-player Expert game on the
// dedicated :3100 test instance (see playwright.config.ts). Seeding per-test
// keeps the specs hermetic: each test starts from a known state, so there's no
// mutate-and-restore dance and no dependence on whatever the DB happened to hold.
export const test = base.extend<{ autoSeed: void }>({
  autoSeed: [async ({ request }, use) => {
    // /api/debug/simulate resets + starts the game and adds the 18-player
    // scenario (always includes Minoa, civ #1). It's an admin POST; the
    // mett_admin cookie value is the plaintext password (default 'PASSWORD').
    const res = await request.post('/api/debug/simulate', {
      headers: { cookie: 'mett_admin=PASSWORD' },
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
