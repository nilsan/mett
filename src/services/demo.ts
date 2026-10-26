/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Demo mode (DEMO=1): a public instance anyone can try without setting up a
 * game. At boot and every night it starts over with the same mid-game table —
 * a 12-empire Expert game in round 7, census half in — so visitors can submit
 * a census, watch it reveal, enter cities and advance rounds. The admin
 * password is `demo` and cannot be changed; the login page says so.
 */

import * as db from '../db.js';
import { broadcastState } from '../ws.js';
import { useSeed, simulateGame } from './simulate.js';

export const DEMO_PASSWORD = 'demo';
/** Hour (UTC) of the nightly reset — the middle of the night in Europe. */
export const DEMO_RESET_HOUR_UTC = 3;
const SEED = 2026;

export function isDemo(): boolean {
  return process.env.DEMO === '1';
}

/** Put the demo table back to its starting position. */
export async function resetDemo(): Promise<void> {
  db.setAdminPassword(DEMO_PASSWORD);
  useSeed(SEED);
  await simulateGame({ expert: 1, playerCount: 12, rounds: 6 });
  useSeed(undefined);
  // Half the census is in: visitors can submit the rest and watch it reveal.
  const { current_round } = db.getGame();
  const players = db.getPlayers();
  players.slice(0, players.length / 2).forEach((p, i) => db.submitCensus(p.id, current_round, 18 + ((i * 7) % 23)));
  broadcastState();
}

/** Milliseconds from `now` to the next nightly reset. */
export function msUntilNextReset(now: Date): number {
  const next = new Date(now);
  next.setUTCHours(DEMO_RESET_HOUR_UTC, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** Reset now, then every night. */
export async function startDemo(): Promise<void> {
  await resetDemo();
  console.log(`${new Date().toISOString()} demo mode: table reset, next reset at ${DEMO_RESET_HOUR_UTC}:00 UTC`);
  const schedule = () => setTimeout(async () => {
    try {
      await resetDemo();
      console.log(`${new Date().toISOString()} demo mode: nightly reset`);
    } catch (err) {
      console.error(`${new Date().toISOString()} demo mode: reset failed`, err);
    }
    schedule();
  }, msUntilNextReset(new Date()));
  schedule();
}
