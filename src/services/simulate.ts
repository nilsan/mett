/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Fake game data: the generators behind the /api/debug/* endpoints and the
 * demo instance's nightly game (services/demo.ts).
 *
 * Everything draws from `random`: Math.random normally, or a seeded generator
 * after useSeed(n), so tests, screenshot baselines and the demo get the same
 * game every time. The draw order is part of that contract — reordering calls
 * here changes every seeded game (and the screenshot baselines).
 */

import * as db from '../db.js';
import { SETUP_RECOMMENDATIONS, WEST_SCENARIOS, EAST_SCENARIOS, type SetupRecommendation } from '../civs.js';

let random: () => number = Math.random;

/** mulberry32 — tiny, fast, good enough for fake game data. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed the generator with a number, or go back to Math.random for anything else. */
export function useSeed(seed: unknown): void {
  random = typeof seed === 'number' && Number.isFinite(seed) ? seededRandom(seed) : Math.random;
}

function weightedRandom(min: number, max: number): number {
  // Triangle distribution — average of two uniforms gives bell-ish curve
  return Math.round(min + (random() + random()) / 2 * (max - min));
}

/** The official setup for a player count: combined for 10+, else West or East. */
export function scenarioFor(playerCount: number, scenario: unknown): SetupRecommendation | undefined {
  return playerCount >= 10
    ? SETUP_RECOMMENDATIONS[playerCount]
    : scenario === 'east'
      ? EAST_SCENARIOS[playerCount]
      : WEST_SCENARIOS[playerCount];
}

/** Random census for every empire, then reveal. */
export function fakeCensus(): void {
  const game = db.getGame();
  for (const p of db.getPlayers()) {
    db.submitCensus(p.id, game.current_round, weightedRandom(1, 55));
  }
  db.revealCensus();
}

/** Plausible city counts for every empire, scaled by A.S.T. position. */
export function fakeCities(): void {
  const game = db.getGame();
  for (const p of db.getPlayers()) {
    const base = Math.min(9, Math.max(1, Math.round(p.ast_level / 10) + 1));
    let count: number;
    if (random() < 0.15) {
      // ~1 in 7 empires hit by calamities — can drop to 0-3 regardless of AST level
      count = weightedRandom(0, 3);
    } else {
      // Normal: ±3 spread around expected, so a late-game empire can still land on 2-3
      count = weightedRandom(Math.max(0, base - 3), Math.min(9, base + 3));
    }
    db.submitCityCount(p.id, game.current_round, count);
  }
}

export interface SimulateOptions {
  expert: 0 | 1;
  playerCount: number;
  rounds: number;
  scenario?: unknown;
  /** Called after each round's city counts and after each advance. */
  onStep?: () => Promise<void> | void;
}

/** Start a fresh game with the official setup and play `rounds` rounds of it.
 *  Returns the number of rounds played (fewer if the game ended). */
export async function simulateGame({ expert, playerCount, rounds, scenario, onStep }: SimulateOptions): Promise<number> {
  const rec = scenarioFor(playerCount, scenario);
  if (!rec) throw new Error(`No scenario for ${playerCount} players`);

  const allCivs = db.getAllCivs();
  const civMap = new Map(allCivs.map(c => [c.number, c]));

  db.resetGame();
  db.startGame(expert);

  for (const num of rec.civNumbers) {
    const civ = civMap.get(num);
    if (!civ) continue;
    // Both sides of the ?? are already typed as Region (from civs.ts +
    // CivRefRow), so no cast or runtime check needed.
    const region = rec.regionOverrides[num] ?? civ.def_region;
    db.addPlayer(civ.id, civ.name, region);
  }

  // Assign each player a speed factor [0.5, 1.5] to produce variety
  const players = db.getPlayers();
  const speedFactors = players.map(() => 0.5 + random());

  // Randomly assign wonder to 1 player and military to ~1 in 5 players
  const wonderIdx = Math.floor(random() * players.length);
  for (let i = 0; i < players.length; i++) {
    if (i === wonderIdx) db.toggleWonder(players[i]!.id);
    if (random() < 0.2) db.toggleMilitary(players[i]!.id);
  }

  let roundsPlayed = 0;
  for (let r = 0; r < rounds; r++) {
    const game = db.getGame();
    const roundNum = game.current_round;
    const cur = db.getPlayers();

    // Census — random populations
    for (const p of cur) {
      db.submitCensus(p.id, roundNum, weightedRandom(1, 55));
    }
    db.revealCensus();

    // Cities + advance accumulation
    for (let i = 0; i < cur.length; i++) {
      const p = cur[i]!;
      const sf = speedFactors[i] ?? 1;

      // City count: scale expected value by speed factor, with calamity chance
      const base = Math.min(9, Math.max(0, Math.round(p.ast_level / 10) + 1));
      let count: number;
      if (random() < 0.12) {
        count = weightedRandom(0, 3);
      } else {
        const scaled = Math.round(base * sf);
        count = Math.min(9, Math.max(0, weightedRandom(Math.max(0, scaled - 2), Math.min(9, scaled + 2))));
      }
      db.submitCityCount(p.id, roundNum, count);

      // Advance purchases — faster players accumulate more per round
      const buyChance = Math.min(1, (r <= 3 ? 0.5 : r <= 8 ? 0.75 : 0.9) * sf);
      if (random() < buyChance) {
        const purchases = Math.ceil(random() * (r <= 5 ? 2 : 3));
        let v1 = p.adv_1vp, v3 = p.adv_3vp, v6 = p.adv_6vp;
        for (let j = 0; j < purchases; j++) {
          const roll = random();
          if (r >= 9 && roll < 0.15) { if (v6 < 11) v6++; }
          else if (roll < 0.5)        { if (v3 < 17) v3++; }
          else {
            v1 = Math.min(17, v1 + (r >= 8 && random() < 0.3 ? 2 : 1));
          }
        }
        db.setAdvCards(p.id, v1, v3, v6);
      }
    }

    // City counts are visible at this step, so trade cards can be seen
    await onStep?.();

    const result = db.advanceRound();
    roundsPlayed++;
    await onStep?.();
    if (result === null) break; // game ended
  }
  return roundsPlayed;
}

/** One round of advance purchases for every empire. */
export function fakeAdvances(): void {
  const round = db.getGame().current_round;

  for (const p of db.getPlayers()) {
    // Probability of buying anything this round increases over time
    const buyChance = round <= 4 ? 0.5 : round <= 8 ? 0.75 : 0.85;
    if (random() > buyChance) continue;

    // How many purchases this turn (1-3, more likely 1-2)
    const purchases = Math.ceil(random() * (round <= 6 ? 2 : 3));

    let v1 = p.adv_1vp, v3 = p.adv_3vp, v6 = p.adv_6vp;

    for (let i = 0; i < purchases; i++) {
      // Priority: push toward 3VP advances early (age requirements need 5VP total)
      // Later: mix in 1VP (tech breadth) and some 6VP
      const need3vp = v3 * 3 < 5 && round <= 10; // trying to hit 5VP threshold
      const roll = random();

      if (need3vp || (round <= 8 && roll < 0.55)) {
        if (v3 < 17) v3++;
      } else if (round >= 9 && roll < 0.20) {
        if (v6 < 11) v6++;
      } else {
        // 1VP cards — buy more of these in later rounds (tech breadth bonuses)
        if (v1 < 17) v1 += round >= 10 ? (random() < 0.4 ? 2 : 1) : 1;
        if (v1 > 17) v1 = 17;
      }
    }

    db.setAdvCards(p.id, v1, v3, v6);
  }
}
