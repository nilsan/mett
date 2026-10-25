/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import { test, expect, adminLogin } from './fixtures';

// The GM can run a whole round from the admin page when players can't reach
// their own pages: enter a census value, set city counts from the dropdowns,
// move to the calamities recount, advance the round — and undo the advance.
test('GM drives a round from the admin page, then undoes the advance', async ({ context, request }) => {
  await adminLogin(context.request);

  // The admin page reloads itself on phase changes; a fresh tab per step keeps
  // that reload from racing the next navigation. Old tabs are left open
  // (closing one mid-reload races Chromium's target bookkeeping); the context
  // closes them all when the test ends.
  const admin = async (): Promise<Page> => {
    const page = await context.newPage();
    page.on('dialog', d => d.accept());
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/admin');
    return page;
  };

  const state = async () => (await (await request.get('/api/state')).json()) as {
    game: { current_round: number; census_revealed: number; cities_phase: number };
    players: Array<{ id: number }>;
  };
  const start = await state();
  const round = start.game.current_round;
  const [first, ...rest] = start.players;

  // Census: everyone but one empire is in; the GM types the last one in.
  for (const p of rest) await request.post(`/api/players/${p.id}/census`, { data: { population: 10 } });
  const census = (await admin()).locator(`input.census-admin-input[data-player-id="${first!.id}"]`);
  await census.fill('12');
  await census.press('Enter');
  await expect.poll(async () => (await state()).game.census_revealed).toBe(1);

  // Trade: city counts from the admin dropdowns, then "Trading done".
  const setAllCities = async (count: string): Promise<Page> => {
    const pg = await admin();
    for (const p of start.players) {
      const posted = pg.waitForResponse(r => r.url().endsWith(`/api/players/${p.id}/city-count`));
      await pg.selectOption(`select.city-admin-select[data-player-id="${p.id}"]`, count);
      await posted;
    }
    return admin();
  };
  await (await setAllCities('4')).locator('#prepare-ast').click();
  await expect.poll(async () => (await state()).game.cities_phase).toBe(1);

  // Calamities recount, then advance.
  await (await setAllCities('5')).locator('#advance-round').click();
  await expect.poll(async () => (await state()).game.current_round).toBe(round + 1);

  // Undo puts the game back exactly where it was before the advance.
  await (await admin()).locator('#undo-round').click();
  await expect.poll(async () => (await state()).game).toMatchObject({ current_round: round, cities_phase: 1, census_revealed: 1 });
});
