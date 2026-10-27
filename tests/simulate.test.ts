/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * End-to-end game simulations: whole games played over the HTTP API, the way
 * the admin page and the player pages drive them, from setup to game over.
 * The unit suites test each rule on its own; these check that the rules hold
 * together across a full game, round after round:
 *
 *   1. Seeded random games (Expert and Basic, West / East / combined setups
 *      from /api/setup-recommendations). Every round: census → reveal →
 *      city counts → "trading done" → calamities (regressions, recount) →
 *      buying advance cards → advance. After every advance the invariants
 *      below are checked.
 *   2. Scripted endings: the Late Iron Age bonus for a lone arrival, no bonus
 *      when several arrive together, a late arrival after the bonus is taken,
 *      and Basic ending the moment an empire reaches Late Iron Age.
 *
 * Invariants checked after every advance:
 *   - each empire's A.S.T. moved exactly as /api/state predicted before the
 *     advance (astStatus: advance / stay / regress) — what players see on
 *     their page is what happens;
 *   - at most one empire ever holds the Late Iron Age bonus, and it never moves;
 *   - Expert: the first Late Iron Age arrival announces the final round and
 *     the game ends one round later; Basic: the game ends on arrival;
 *   - census history keeps only the previous and the current round;
 *   - the cards on the server are exactly the ones each player bought, in
 *     the round they bought them, with their colour choices; tier counts, VP
 *     and the Military / Wonder / special flags follow from the cards.
 *
 * Buying (phase 12) goes through the player endpoint without the admin
 * session, the way a player page sends it. Each empire has a trade budget
 * that grows with its cities and pays the price after credits from cards
 * bought in earlier rounds. Every round also checks the player-side guards:
 * no buying before calamities, no unticking a card from an earlier round, and
 * the player page's running total equals what the empire paid.
 *   - the status board, admin page and a player page all render.
 *
 * Mid-game, one advance is undone and replayed: the undo must restore the
 * state exactly (the round's cards unlock again), and the replay must produce
 * exactly the same round.
 *
 * Runs in-process through app.request() (no server, no ports), so it is part
 * of `bun run test` and CI.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { makeMinimalDb } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { createAdminSession } from '../src/db.js';
import { _setBackupDir } from '../src/services/backup.js';
import { LIA_THRESHOLD, MAX_CITIES, MAX_POPULATION } from '../src/models/ast.js';
import api from '../src/routes/api.js';
import {
  ADVANCES, ADVANCE_BY_ID, ADVANCE_GROUPS, MILITARY_ID, WONDER_ID, advanceCost, advanceFlags, advanceTotals,
  type CreditChoice, type HeldAdvance,
} from '../src/shared/advances.js';
import pages from '../src/routes/pages.js';
import type { Database } from 'bun:sqlite';
import type { FullState } from '../src/types.js';

const app = new Hono().route('/', pages).route('/api', api);
let db: Database;
let ADMIN = '';
let backups = '';

beforeEach(() => {
  db = makeMinimalDb();
  _setTestDb(db);
  ADMIN = `mett_admin=${createAdminSession()}`;
  backups = mkdtempSync(join(tmpdir(), 'mett-sim-backups-'));
  _setBackupDir(backups);
});

afterEach(() => {
  _setBackupDir(null);
  rmSync(backups, { recursive: true, force: true });
});

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function call(method: string, path: string, body?: object, asPlayer = false): Promise<Response> {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(asPlayer ? {} : { cookie: ADMIN }) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** POST that must succeed (as the GM, or as a player without the session). */
async function post(path: string, body: object = {}, asPlayer = false): Promise<unknown> {
  const res = await call('POST', path, body, asPlayer);
  if (res.status !== 200) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function state(): Promise<FullState> {
  return (await call('GET', '/api/state')).json() as Promise<FullState>;
}

/** Every page a table uses renders without an error. */
async function pagesRender(s: FullState): Promise<void> {
  const slug = s.players[0]!.civ_slug;
  for (const path of ['/', '/admin', `/${slug}`]) {
    const res = await call('GET', path);
    expect(res.status, `GET ${path} in round ${s.game.current_round}`).toBe(200);
  }
}

// ─── Setup ───────────────────────────────────────────────────────────────────

interface Setup { civNumbers: number[]; regionOverrides: Record<number, 'west' | 'east'> }

/** Start a game with an official setup, the way the admin setup wizard does. */
async function startGame(expert: boolean, setup: Setup): Promise<FullState> {
  const civs = (await (await call('GET', '/api/civs')).json()) as Array<{ id: number; number: number; name: string; def_region: string }>;
  const players = setup.civNumbers.map(n => {
    const civ = civs.find(c => c.number === n)!;
    return { civ_id: civ.id, name: `${civ.name} player`, region: setup.regionOverrides[n] ?? civ.def_region };
  });
  await post('/api/game/start', { expert: expert ? 1 : 0, players });
  return state();
}

async function recommendation(kind: 'west' | 'east' | 'combined', players: number): Promise<Setup> {
  const recs = (await (await call('GET', '/api/setup-recommendations')).json()) as Record<string, Record<number, Setup>>;
  return recs[kind]![players]!;
}

// ─── Seeded players ──────────────────────────────────────────────────────────

/** mulberry32 — the same small generator the debug endpoints use. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Empire {
  id: number; slug: string; skill: number; cities: number;
  /** Trade cards left over from earlier rounds. */
  treasury: number;
  /** The cards as the player bought them — what the server must hold. */
  held: HeldAdvance[];
  /** What the cards bought this round cost. */
  spent: number;
}

/** A plausible table: empires grow at different speeds, buy cheap advances
 *  early and dearer ones later, lose cities to calamities now and then. */
function makeEmpires(s: FullState, random: () => number): Empire[] {
  return s.players.map(p => ({ id: p.id, slug: p.civ_slug, skill: 0.7 + random() * 0.6, cities: 0, treasury: 0, held: [], spent: 0 }));
}

/** A random split of a card's flexible credits, in steps of 5. */
function randomChoice(total: number, random: () => number): CreditChoice {
  const choice: CreditChoice = {};
  for (let left = total; left > 0; left -= 5) {
    const g = ADVANCE_GROUPS[Math.floor(random() * ADVANCE_GROUPS.length)]!;
    choice[g] = (choice[g] ?? 0) + 5;
  }
  return choice;
}

/** Phase 12: each empire spends this round's trade (plus what it saved) on
 *  cards, at the price after credits, as a player would from their page. */
async function buyCards(empires: Empire[], random: () => number, round: number): Promise<void> {
  for (const [i, e] of empires.entries()) {
    let budget = e.treasury + Math.round(e.skill * (20 + e.cities * 15 + random() * 50));
    e.spent = 0;
    const before = e.held.slice();
    const price = (id: string) => advanceCost(id, before, round);
    for (;;) {
      const owned = new Set(e.held.map(h => h.id));
      const affordable = ADVANCES.filter(c => !owned.has(c.id) && price(c.id) <= budget);
      if (!affordable.length) break;
      // Military now and then, the first empire's Wonder once it can afford
      // it; otherwise good value (price per VP), with some taste mixed in.
      const want = affordable.find(c => c.id === MILITARY_ID && random() < 0.08)
        ?? affordable.find(c => c.id === WONDER_ID && i === 0 && round >= 8)
        ?? affordable.map(c => ({ c, score: (price(c.id) / c.vp) * (0.6 + random() * 0.8) }))
          .sort((a, b) => a.score - b.score)[0]!.c;
      budget -= price(want.id);
      e.spent += price(want.id);
      e.held.push({ id: want.id, round });
      if (random() < 0.3) break; // saving up
    }
    e.treasury = Math.round(budget * 0.5);
    if (e.held.length === before.length) continue;
    await post(`/api/players/${e.id}/advances`, { ids: e.held.map(h => h.id) }, true);
    for (const h of e.held.filter(h => h.round === round && ADVANCE_BY_ID.get(h.id)!.choiceCredits)) {
      h.choice = randomChoice(ADVANCE_BY_ID.get(h.id)!.choiceCredits!, random);
      await post(`/api/players/${e.id}/advances/${h.id}/choice`, { choice: h.choice }, true);
    }
  }
  // The running total on a buyer's page is what the empire paid.
  const buyer = empires.find(e => e.spent > 0);
  if (buyer) {
    const html = await (await call('GET', `/${buyer.slug}`)).text();
    expect(html.match(/adv-basket-cost">(\d+)</)?.[1], `basket for ${buyer.slug} in round ${round}`).toBe(String(buyer.spent));
  }
}

/** The server holds exactly the cards each empire bought, and the player
 *  rows (tiers, VP, Military / Wonder / special) follow from them. */
function checkCards(s: FullState, empires: Empire[]): void {
  for (const e of empires) {
    const norm = (list: readonly HeldAdvance[]) => list.map(h => ({ id: h.id, round: h.round, choice: h.choice ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(norm((s.advances[e.id] ?? []) as HeldAdvance[]), `cards of ${e.slug}`).toEqual(norm(e.held));
    const ids = e.held.map(h => h.id);
    const p = s.players.find(q => q.id === e.id)!;
    expect({ adv_1vp: p.adv_1vp, adv_3vp: p.adv_3vp, adv_6vp: p.adv_6vp, adv_points: p.adv_points }).toEqual(advanceTotals(ids));
    expect({ military: p.military, wonder: p.wonder, special: p.special }).toEqual(advanceFlags(ids));
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

// ─── One round ───────────────────────────────────────────────────────────────

type Snapshot = Omit<FullState, 'roundSummaries'>;
const snapshot = ({ roundSummaries: _, ...rest }: FullState): Snapshot => rest;

/** Play one round up to (not including) the advance. */
async function playRound(empires: Empire[], random: () => number, round: number, checkGuards: boolean): Promise<void> {
  // Census. Everyone but the last submits; the census stays hidden until the
  // last one is in, then reveals itself.
  for (const [i, e] of empires.entries()) {
    const population = clamp(round * 3.2 * e.skill + random() * 6 - 3, 1, MAX_POPULATION);
    if (i === empires.length - 1) {
      expect((await state()).game.census_revealed).toBe(0);
      if (checkGuards) {
        // City counts only open once the census is out.
        expect((await call('POST', `/api/players/${e.id}/city-count`, { city_count: 1 })).status).toBe(409);
      }
    }
    await post(`/api/players/${e.id}/census`, { population });
  }
  expect((await state()).game.census_revealed).toBe(1);

  // Movement and trade: empires mark their units moved and report cities
  // for the trade cards.
  for (const e of empires) {
    if (random() < 0.5) await post(`/api/players/${e.id}/move`);
    e.cities = clamp(e.cities + (random() * 2.6 - 0.5) * e.skill, 0, MAX_CITIES);
    await post(`/api/players/${e.id}/city-count`, { city_count: e.cities });
  }
  // Cards are bought after calamities: a player can't buy during trade, and
  // can't untick a card bought in an earlier round.
  const probe = empires[round % empires.length]!;
  const unheld = ADVANCES.find(c => !probe.held.some(h => h.id === c.id))!;
  const early = await call('POST', `/api/players/${probe.id}/advances`, { ids: [...probe.held.map(h => h.id), unheld.id] }, true);
  expect(early.status, 'buying before calamities').toBe(409);
  const locked = probe.held.find(h => h.round < round);
  if (locked) {
    const res = await call('POST', `/api/players/${probe.id}/advances`, { ids: probe.held.filter(h => h !== locked).map(h => h.id) }, true);
    expect(res.status, `unticking ${locked.id} from round ${locked.round}`).toBe(409);
  }

  // "Trading done": city counts are cleared for the calamities recount.
  await post('/api/game/cities/clear');
  const cleared = await state();
  expect(cleared.game.cities_phase).toBe(1);
  expect(cleared.census.every(c => c.city_count === null)).toBe(true);

  // Calamities: some empires lose cities, a few are knocked back a step.
  for (const e of empires) {
    if (random() < 0.2) e.cities = clamp(e.cities - 1 - random() * 3, 0, MAX_CITIES);
    if (random() < 0.04) await post(`/api/players/${e.id}/regress`);
  }
  // The round can't advance while a recount is missing.
  for (const [i, e] of empires.entries()) {
    if (checkGuards && i === empires.length - 1) {
      expect((await call('POST', '/api/game/round/next')).status).toBe(400);
    }
    await post(`/api/players/${e.id}/city-count`, { city_count: e.cities });
  }

  await buyCards(empires, random, round);
  checkCards(await state(), empires);
}

/** Advance the round and check every invariant against the state before. */
async function advanceAndCheck(before: FullState, bonusHolder: { id: number | null }, empires: Empire[]): Promise<FullState> {
  const expert = before.game.expert === 1;
  await post('/api/game/round/next');
  const after = await state();

  // A.S.T. moved exactly as predicted on the players' pages.
  const step = { advance: 5, stay: 0, regress: -5 } as const;
  for (const p of before.players) {
    const status = before.astStatus[p.id];
    expect(status === 'advance' || status === 'stay' || status === 'regress', `status for ${p.civ_name}`).toBe(true);
    const now = after.players.find(q => q.id === p.id)!;
    expect(now.ast_level, `${p.civ_name} in round ${before.game.current_round}`).toBe(p.ast_level + step[status as keyof typeof step]);
  }

  // Late Iron Age bonus: at most one holder, never moves, only to a lone
  // first arrival.
  const holders = after.players.filter(p => p.late_iron_age_bonus === 1).map(p => p.id);
  expect(holders.length).toBeLessThanOrEqual(1);
  const atLia = after.players.filter(p => p.ast_level >= LIA_THRESHOLD);
  if (bonusHolder.id !== null) {
    expect(holders).toEqual([bonusHolder.id]);
  } else if (atLia.length === 1) {
    expect(holders).toEqual([atLia[0]!.id]);
    bonusHolder.id = atLia[0]!.id;
  } else {
    expect(holders).toEqual([]);
  }

  // Ending rules.
  if (!expert) {
    expect(after.game.active).toBe(atLia.length > 0 ? 0 : 1);
  } else if (before.game.is_final_round) {
    expect(after.game.active).toBe(0);
  } else {
    expect(after.game.active).toBe(1);
    expect(after.game.is_final_round).toBe(atLia.length > 0 ? 1 : 0);
  }

  if (after.game.active) {
    const round = before.game.current_round + 1;
    expect(after.game).toMatchObject({ current_round: round, census_revealed: 0, cities_phase: 0 });
    expect(after.players.every(p => p.regressed === 0)).toBe(true);
    const rounds = db.query<{ round: number }, []>('SELECT DISTINCT round FROM census ORDER BY round').all().map(r => r.round);
    expect(rounds).toEqual([round - 1]);
  } else {
    expect(after.game.current_round).toBe(before.game.current_round);
  }
  checkCards(after, empires);
  await pagesRender(after);
  return after;
}

/** Play a whole game; returns the number of rounds played. */
async function playGame(seed: number, undoInRound: number): Promise<{ rounds: number; final: FullState }> {
  const random = rng(seed);
  const empires = makeEmpires(await state(), random);
  const bonusHolder = { id: null as number | null };
  let s = await state();
  await pagesRender(s);
  while (s.game.active) {
    const round = s.game.current_round;
    expect(round, 'the game must end').toBeLessThan(40);
    await playRound(empires, random, round, round === 1);
    const before = await state();

    if (round === undoInRound) {
      // Advance, undo, and replay: undo restores the round exactly, and the
      // replay lands on exactly the same next round.
      await post('/api/game/round/next');
      const first = snapshot(await state());
      await post('/api/game/round/undo');
      expect(snapshot(await state())).toEqual(snapshot(before));
      // Back in phase 12 of the round, so its cards can be unticked again.
      const buyer = empires.find(e => e.held.some(h => h.round === round && !ADVANCE_BY_ID.get(h.id)!.choiceCredits));
      if (buyer) {
        const ids = buyer.held.map(h => h.id);
        const last = buyer.held.filter(h => h.round === round && !ADVANCE_BY_ID.get(h.id)!.choiceCredits).at(-1)!;
        await post(`/api/players/${buyer.id}/advances`, { ids: ids.filter(id => id !== last.id) }, true);
        await post(`/api/players/${buyer.id}/advances`, { ids }, true);
        checkCards(await state(), empires);
      }
      s = await advanceAndCheck(before, bonusHolder, empires);
      expect(snapshot(s)).toEqual(first);
    } else {
      s = await advanceAndCheck(before, bonusHolder, empires);
    }
  }
  return { rounds: s.game.current_round, final: s };
}

// ─── 1. Seeded random games ──────────────────────────────────────────────────

describe('full games over the API', () => {
  const games: Array<{ name: string; expert: boolean; kind: 'west' | 'east' | 'combined'; players: number; seed: number }> = [
    { name: 'Expert, 18 empires (combined)', expert: true, kind: 'combined', players: 18, seed: 1 },
    { name: 'Expert, 12 empires (combined)', expert: true, kind: 'combined', players: 12, seed: 2 },
    { name: 'Expert, 6 empires (West)', expert: true, kind: 'west', players: 6, seed: 3 },
    { name: 'Expert, 9 empires (East)', expert: true, kind: 'east', players: 9, seed: 4 },
    { name: 'Basic, 5 empires (West)', expert: false, kind: 'west', players: 5, seed: 5 },
    { name: 'Basic, 7 empires (East)', expert: false, kind: 'east', players: 7, seed: 6 },
    { name: 'Basic, 14 empires (combined)', expert: false, kind: 'combined', players: 14, seed: 7 },
  ];

  for (const g of games) {
    it(`${g.name} plays to the end`, async () => {
      await startGame(g.expert, await recommendation(g.kind, g.players));
      const { rounds, final } = await playGame(g.seed, 4);
      expect(final.game.active).toBe(0);
      expect(final.players).toHaveLength(g.players);
      expect(final.players.some(p => p.ast_level >= LIA_THRESHOLD)).toBe(true);
      // A real game lasts roughly 15–20 rounds; the seeded tables should too.
      expect(rounds).toBeGreaterThanOrEqual(12);
      expect(rounds).toBeLessThanOrEqual(25);
    }, 30_000);
  }
});

// ─── 2. Scripted endings ─────────────────────────────────────────────────────

describe('Late Iron Age endings', () => {
  /** Three West empires at 70; `ready` ones meet the Late Iron Age requirement
   *  (Expert: 6 cities, 17 cheap advances, 56 advance VP; Basic: 5 cities,
   *  3 expensive advances). The GM enters the cards: every 1 VP card, five
   *  3 VP and four 6 VP ones (17 + 15 + 24 = 56 VP), no Wonder or Military. */
  const LATE_GAME_CARDS = [
    ...ADVANCES.filter(c => c.vp === 1),
    ...ADVANCES.filter(c => c.vp === 3 && c.id !== MILITARY_ID).slice(0, 5),
    ...ADVANCES.filter(c => c.vp === 6 && c.id !== WONDER_ID).slice(0, 4),
  ].map(c => c.id);

  async function nearTheEnd(expert: boolean): Promise<number[]> {
    const s = await startGame(expert, await recommendation('west', 3));
    for (const p of s.players) {
      await post(`/api/players/${p.id}/ast`, { level: 70 });
      await post(`/api/players/${p.id}/advances`, { ids: LATE_GAME_CARDS });
    }
    expect((await state()).players.map(p => [p.adv_1vp, p.adv_points])).toEqual(s.players.map(() => [17, 56]));
    return s.players.map(p => p.id);
  }

  /** One round where `ready` empires end on enough cities and the rest don't. */
  async function round(ids: number[], ready: number[]): Promise<FullState> {
    for (const id of ids) await post(`/api/players/${id}/census`, { population: 30 });
    await post('/api/game/cities/clear');
    for (const id of ids) await post(`/api/players/${id}/city-count`, { city_count: ready.includes(id) ? 7 : 3 });
    await post('/api/game/round/next');
    return state();
  }

  const player = (s: FullState, id: number) => s.players.find(p => p.id === id)!;

  it('Expert: a lone arrival takes the bonus, a later one does not; the game ends a round later', async () => {
    const [a, b, c] = await nearTheEnd(true);
    let s = await round([a!, b!, c!], [a!]);
    expect(player(s, a!)).toMatchObject({ ast_level: 75, late_iron_age_bonus: 1 });
    expect(s.game).toMatchObject({ active: 1, is_final_round: 1 });
    expect(s.roundSummaries.at(-1)).toMatchObject({ finalRoundTriggered: true, gameEnded: false });

    s = await round([a!, b!, c!], [a!, b!]);
    expect(player(s, a!)).toMatchObject({ ast_level: 80, late_iron_age_bonus: 1 });
    expect(player(s, b!)).toMatchObject({ ast_level: 75, late_iron_age_bonus: 0 });
    expect(player(s, c!).ast_level).toBe(70);
    expect(s.game.active).toBe(0);
    expect(s.roundSummaries.at(-1)).toMatchObject({ gameEnded: true, toRound: null });
    await pagesRender(s);
  });

  it('Expert: two arriving together both miss the bonus', async () => {
    const [a, b, c] = await nearTheEnd(true);
    const s = await round([a!, b!, c!], [a!, b!]);
    expect([player(s, a!).ast_level, player(s, b!).ast_level]).toEqual([75, 75]);
    expect(s.players.every(p => p.late_iron_age_bonus === 0)).toBe(true);
    expect(s.game).toMatchObject({ active: 1, is_final_round: 1 });
    expect(s.roundSummaries.at(-1)).toMatchObject({ liaBonusBlocked: true });
  });

  it('Expert: a calamity knocking the only Late Iron Age empire back cancels the final round', async () => {
    const [a, b, c] = await nearTheEnd(true);
    let s = await round([a!, b!, c!], [a!]);
    expect(s.game.is_final_round).toBe(1);
    await post(`/api/players/${a}/regress`);
    s = await state();
    expect(player(s, a!).ast_level).toBe(70);
    expect(s.game.is_final_round).toBe(0);
  });

  it('Basic: the game ends the moment an empire reaches Late Iron Age', async () => {
    const [a, b, c] = await nearTheEnd(false);
    const s = await round([a!, b!, c!], [a!]);
    expect(player(s, a!)).toMatchObject({ ast_level: 75, late_iron_age_bonus: 1 });
    expect(s.game).toMatchObject({ active: 0, is_final_round: 0 });
    await pagesRender(s);
  });
});
