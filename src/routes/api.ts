/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as db from '../db.js';
import { broadcastState } from '../ws.js';
import { SETUP_RECOMMENDATIONS, WEST_SCENARIOS, EAST_SCENARIOS } from '../civs.js';
import { isAdminAuthed } from './pages.js';
import { isRegion } from '../types.js';
import { AST_LEVELS, LIA_THRESHOLD, MAX_POPULATION, MAX_CITIES } from '../models/ast.js';
import { takeBackup, listBackups, restoreBackup, backupBeforeAdvanceTo, type BackupReason } from '../services/backup.js';

const api = new Hono();

// JSON errors for everything under /api — HTTPExceptions thrown by the
// validation helpers below carry their status; anything else is a 500 that
// never leaks a stack trace. Registered on the sub-app so it applies however
// the router is mounted (index.ts, or the bare Hono apps in tests).
api.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(`${new Date().toISOString()} ERROR ${c.req.method} ${c.req.path}`);
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  return c.json({ error: 'Internal server error' }, 500);
});

// ─── Request validation helpers ───────────────────────────────────────────────

function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

/** Parse the JSON body as an object; 400 on malformed or non-object input.
 *  Fields are typed loosely on purpose — each handler validates what it uses. */
async function readJson(c: Context): Promise<Record<string, unknown>> {
  let body: unknown;
  try { body = await c.req.json(); } catch { badRequest('Invalid JSON body'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) badRequest('Expected a JSON object');
  return body as Record<string, unknown>;
}

/** `:id` route param as an existing player id; 404 otherwise. */
function playerParam(c: Context): number {
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id) || !db.playerExists(id)) throw new HTTPException(404, { message: 'Player not found' });
  return id;
}

/** Current game row; 409 when no game is running. */
function requireActiveGame() {
  const game = db.getGame();
  if (!game.active) throw new HTTPException(409, { message: 'No game in progress' });
  return game;
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Back up before a game-rewriting action. A failed backup is logged but
 *  never blocks the table — losing the safety net beats stopping the game. */
function safeBackup(reason: BackupReason): void {
  try { takeBackup(reason); } catch (err) {
    console.error(`${new Date().toISOString()} BACKUP FAILED (${reason}):`, err instanceof Error ? err.message : err);
  }
}

function requireAdmin(c: Context): void {
  if (!isAdminAuthed(c.req.raw)) throw new HTTPException(401, { message: 'Unauthorized' });
}

function expertFlag(v: unknown): 0 | 1 {
  if (v === 0 || v === 1 || v === true || v === false) return v ? 1 : 0;
  badRequest('expert must be 0 or 1');
}

// Player-facing POST endpoints — no auth required (players submit from their own civ page)
const PLAYER_PUBLIC = new Set(['/census', '/city-count', '/military', '/wonder', '/special', '/adv', '/move']);

// Protect all mutating API endpoints — read-only GETs and player actions are public
api.use('*', async (c, next) => {
  if (c.req.method === 'GET') return next();
  const path = c.req.path;  // e.g. /api/players/3/census
  const lastSegment = path.slice(path.lastIndexOf('/'));
  if (path.includes('/players/') && PLAYER_PUBLIC.has(lastSegment)) return next();
  if (!isAdminAuthed(c.req.raw)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return next();
});

// ─── Game ─────────────────────────────────────────────────────────────────────

api.get('/state', (c) => {
  return c.json(db.getFullState());
});

api.get('/civs', (c) => {
  return c.json(db.getAllCivs());
});

api.get('/setup-recommendations', (c) => {
  return c.json({ west: WEST_SCENARIOS, east: EAST_SCENARIOS, combined: SETUP_RECOMMENDATIONS });
});

api.post('/game/start', async (c) => {
  const body = await readJson(c);
  const expert = expertFlag(body.expert);
  const players = body.players;
  if (!Array.isArray(players) || !players.length) {
    return c.json({ error: 'At least one player required' }, 400);
  }

  // Validate at the boundary so PlayerRow.region can rely on the
  // 'west' | 'east' literal type everywhere downstream.
  const civIds = new Set(db.getAllCivs().map(cv => cv.id));
  const validated: Array<{ civ_id: number; name: string; region: 'west' | 'east' }> = [];
  for (const p of players as Array<Record<string, unknown>>) {
    if (typeof p?.civ_id !== 'number' || !civIds.has(p.civ_id)) {
      return c.json({ error: `Unknown civ: ${String(p?.civ_id)}` }, 400);
    }
    if (!isRegion(p.region)) {
      return c.json({ error: `Invalid region for civ ${p.civ_id}: ${String(p.region)}` }, 400);
    }
    const name = typeof p.name === 'string' ? p.name.trim() : '';
    validated.push({ civ_id: p.civ_id, name: name || '?', region: p.region });
  }

  safeBackup('before-start');
  db.startGame(expert);
  for (const p of validated) {
    db.addPlayer(p.civ_id, p.name, p.region);
  }
  broadcastState();
  return c.json({ ok: true });
});

api.post('/game/reset', async (c) => {
  const body = await readJson(c);
  if (body.confirm !== true) return c.json({ error: 'confirm required' }, 400);
  safeBackup('before-reset');
  db.resetGame();
  broadcastState();
  return c.json({ ok: true });
});

api.post('/game/round/next', (c) => {
  if (!db.allCitiesSubmitted(db.getGame().current_round)) {
    return c.json({ error: 'All empires must have a city count before advancing the round' }, 400);
  }
  // advanceRoundWithSummary captures a pre/post snapshot, computes the
  // round-transition summary, and pushes it onto the ring buffer that
  // surfaces through getFullState (admin page reads state.roundSummaries).
  safeBackup('before-round');
  const round = db.advanceRoundWithSummary();
  broadcastState();
  // round === null means game ended (basic hit 75, or expert final round completed)
  return c.json(round === null ? { ok: true, ended: true } : { ok: true, round });
});

// ─── Backups ──────────────────────────────────────────────────────────────────

api.get('/backups', (c) => {
  requireAdmin(c);
  const game = db.getGame();
  return c.json({ backups: listBackups(), undoRound: backupBeforeAdvanceTo(game.current_round)?.file ?? null });
});

api.post('/backups/restore', async (c) => {
  const body = await readJson(c);
  if (typeof body.file !== 'string') badRequest('file required');
  try {
    restoreBackup(body.file);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Restore failed';
    return c.json({ error: message }, message === 'Unknown backup' ? 404 : 409);
  }
  broadcastState();
  return c.json({ ok: true, round: db.getGame().current_round });
});

/** Undo the last round advance: restore the backup taken right before it. */
api.post('/game/round/undo', (c) => {
  const backup = backupBeforeAdvanceTo(db.getGame().current_round);
  if (!backup) return c.json({ error: 'No backup from before this round started' }, 409);
  restoreBackup(backup.file);
  broadcastState();
  return c.json({ ok: true, round: db.getGame().current_round });
});

api.post('/game/cities/clear', (c) => {
  const game = db.getGame();
  db.clearCityCount(game.current_round);
  broadcastState();
  return c.json({ ok: true });
});

api.post('/census/reveal', () => {
  db.revealCensus();
  broadcastState();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// ─── Players ──────────────────────────────────────────────────────────────────

api.post('/players/:id/census', async (c) => {
  const playerId = playerParam(c);
  const body = await readJson(c);
  const game = requireActiveGame();
  let pop = Number(body.population);
  if (pop < 0) pop = MAX_POPULATION + pop; // negative shorthand: -27 → 28 tokens remaining
  if (!Number.isInteger(pop) || pop < 1 || pop > MAX_POPULATION) {
    return c.json({ error: `Invalid population (must be 1–${MAX_POPULATION})` }, 400);
  }
  db.submitCensus(playerId, game.current_round, pop);

  // Auto-reveal if all submitted
  if (db.allPlayersSubmitted(game.current_round)) {
    db.revealCensus();
    broadcastState(); // global — reveal affects all players' move-order display
  } else {
    broadcastState(playerId);
  }
  return c.json({ ok: true });
});

api.post('/players/:id/city-count', async (c) => {
  const playerId = playerParam(c);
  const body = await readJson(c);
  const count = Number(body.city_count);
  if (!Number.isInteger(count) || count < 0 || count > MAX_CITIES) {
    return c.json({ error: `Invalid city count (must be 0–${MAX_CITIES})` }, 400);
  }
  const game = requireActiveGame();
  // Cities are counted after movement, which starts once the census is out.
  if (!game.census_revealed) {
    return c.json({ error: 'City counts open once the census is revealed' }, 409);
  }
  db.submitCityCount(playerId, game.current_round, count);
  broadcastState(playerId);
  return c.json({ ok: true });
});

api.post('/players/:id/military', (c) => {
  const playerId = playerParam(c);
  const next = db.toggleMilitary(playerId);
  broadcastState(playerId);
  return c.json({ ok: true, military: next });
});

api.post('/players/:id/move', (c) => {
  const playerId = playerParam(c);
  const game = requireActiveGame();
  const next = db.toggleMoved(playerId, game.current_round);
  // Targeted broadcast: the status display (non-civ socket) always receives it,
  // so neighbours see the signal on the shared TV; other civ pages are skipped.
  broadcastState(playerId);
  return c.json({ ok: true, moved: next });
});

api.post('/players/:id/wonder', (c) => {
  const playerId = playerParam(c);
  const next = db.toggleWonder(playerId);
  broadcastState(playerId);
  return c.json({ ok: true, wonder: next });
});

api.post('/players/:id/special', (c) => {
  const playerId = playerParam(c);
  const next = db.toggleSpecial(playerId);
  broadcastState(playerId);
  return c.json({ ok: true, special: next });
});

api.post('/players/:id/ast', async (c) => {
  const playerId = playerParam(c);
  const body = await readJson(c);
  const level = body.level;
  if (typeof level !== 'number' || !AST_LEVELS.includes(level)) {
    return c.json({ error: 'Invalid AST level' }, 400);
  }
  // setAstLevel may clear is_final_round; checkAndSetLateIronAgeBonus and
  // checkAndSetFinalRound then re-evaluate. Wrap so a partial failure can't
  // leave the game with the LIA bonus granted but the final-round flag wrong.
  db.getDb().transaction(() => {
    db.setAstLevel(playerId, level);
    db.checkAndSetLateIronAgeBonus();
    db.checkAndSetFinalRound();
  })();
  broadcastState();
  return c.json({ ok: true });
});

api.post('/players/:id/regress', (c) => {
  const playerId = playerParam(c);
  // Calamity regression: drop the empire one AST step and flag it so the status
  // board shows a red marker on that empire's token. Admin-only (not in
  // PLAYER_PUBLIC) — the GM applies this, not the player.
  const level = db.regressAst(playerId);
  broadcastState(); // global — the status board changes for everyone
  return c.json({ ok: true, ast_level: level });
});

api.post('/players/:id/adv', async (c) => {
  const playerId = playerParam(c);
  const body = await readJson(c);
  if (body.adv_1vp === undefined && body.adv_3vp === undefined && body.adv_6vp === undefined) {
    return c.json({ error: 'Provide adv_1vp, adv_3vp, and/or adv_6vp' }, 400);
  }
  const counts = [body.adv_1vp, body.adv_3vp, body.adv_6vp].map(v => Math.floor(Number(v ?? 0)));
  if (counts.some(n => !Number.isFinite(n))) {
    return c.json({ error: 'Advance counts must be numbers' }, 400);
  }
  const [v1, v3, v6] = counts.map(n => Math.max(0, n)) as [number, number, number];
  db.setAdvCards(playerId, v1, v3, v6);
  broadcastState(playerId);
  return c.json({ ok: true });
});

api.post('/players/:id/late-iron-age-bonus', async (c) => {
  const playerId = playerParam(c);
  const body = await readJson(c);
  if (typeof body.grant !== 'boolean') return c.json({ error: 'grant must be true or false' }, 400);
  if (body.grant) {
    const player = db.getPlayers().find(p => p.id === playerId);
    if (!player || player.ast_level < LIA_THRESHOLD) {
      return c.json({ error: 'LIA bonus can only be granted to empires that have reached Late Iron Age (AST ≥75)' }, 400);
    }
  }
  db.setLateIronAgeBonus(playerId, body.grant);
  broadcastState();
  return c.json({ ok: true });
});

api.post('/players/:id/rank', async (c) => {
  const playerId = playerParam(c);
  const raw = await readJson(c);
  if (!isNonNegInt(raw.rank_order)) return c.json({ error: 'Invalid rank_order' }, 400);
  const intList = (v: unknown) => (Array.isArray(v) && v.every(isNonNegInt) ? v : undefined);
  const body = {
    rank_order: raw.rank_order,
    group_players: intList(raw.group_players),
    group_positions: intList(raw.group_positions),
  };

  // Single fetch — both branches below need the player+civ join.
  const allPlayers = (body.group_players?.length) ? db.getPlayers() : null;

  // Clear any sibling already holding this position (allows admin to correct mistakes)
  if (allPlayers && body.group_players?.length) {
    for (const p of allPlayers) {
      if (body.group_players.includes(p.id) && p.id !== playerId && p.rank_order === body.rank_order) {
        db.setRankOrder(p.id, 0);
      }
    }
  }

  db.setRankOrder(playerId, body.rank_order);

  // Auto-assign the sole remaining position to any unresolved group member.
  // Re-read rank_order from the same allPlayers snapshot — the above sibling
  // clears wrote to the DB but allPlayers is in-memory; we apply the same
  // diff manually so the second pass sees consistent values.
  if (allPlayers && body.group_players?.length && body.group_positions?.length) {
    for (const p of allPlayers) {
      if (body.group_players.includes(p.id) && p.id !== playerId && p.rank_order === body.rank_order) {
        p.rank_order = 0;
      }
    }
    const others = allPlayers.filter(p => body.group_players!.includes(p.id) && p.id !== playerId);
    const claimed = new Set([body.rank_order]);
    const unresolved: typeof others = [];
    for (const p of others) {
      if (body.group_positions!.includes(p.rank_order)) claimed.add(p.rank_order);
      else unresolved.push(p);
    }
    const unclaimed = body.group_positions!.filter(pos => !claimed.has(pos));
    if (unresolved.length === 1 && unclaimed.length === 1) {
      db.setRankOrder(unresolved[0]!.id, unclaimed[0]!);
    }
  }

  broadcastState();
  return c.json({ ok: true });
});

api.post('/players/:id/name', async (c) => {
  const playerId = playerParam(c);
  const body = await readJson(c);
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return c.json({ error: 'Name required' }, 400);
  db.updatePlayerName(playerId, name);
  broadcastState();
  return c.json({ ok: true });
});

// ─── Debug / simulation ───────────────────────────────────────────────────────

// The debug endpoints draw from `random`. Normally Math.random; an optional
// numeric `seed` in the request body swaps in a seeded generator for that
// request, so tests (and screenshot baselines) get the same game every time.
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

/** Pick the generator for this request from an optional body `seed`. The
 *  body is optional on these endpoints, so a missing or empty one is fine. */
async function useSeedFrom(c: Context): Promise<Record<string, unknown>> {
  const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
  random = typeof body.seed === 'number' && Number.isFinite(body.seed) ? seededRandom(body.seed) : Math.random;
  return body ?? {};
}

function weightedRandom(min: number, max: number): number {
  // Triangle distribution — average of two uniforms gives bell-ish curve
  return Math.round(min + (random() + random()) / 2 * (max - min));
}

api.post('/debug/set-round', async (c) => {
  const body = await readJson(c);
  const round = Math.floor(Number(body.round));
  if (!Number.isFinite(round) || round < 1) return c.json({ error: 'round must be a positive integer' }, 400);
  db.setRound(round);
  broadcastState();
  return c.json({ ok: true, round });
});

api.post('/debug/census', async (c) => {
  await useSeedFrom(c);
  const game = db.getGame();
  const players = db.getPlayers();
  for (const p of players) {
    const pop = weightedRandom(1, 55);
    db.submitCensus(p.id, game.current_round, pop);
  }
  db.revealCensus();
  broadcastState();
  return c.json({ ok: true });
});

api.post('/debug/cities', async (c) => {
  await useSeedFrom(c);
  const game = db.getGame();
  const players = db.getPlayers();
  for (const p of players) {
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
  broadcastState();
  return c.json({ ok: true });
});

api.post('/debug/simulate', async (c) => {
  const body = await readJson(c);
  random = typeof body.seed === 'number' && Number.isFinite(body.seed) ? seededRandom(body.seed) : Math.random;
  const expert = expertFlag(body.expert);
  const player_count = Number(body.player_count);
  const rounds = Number(body.rounds);
  const delay_ms = body.delay_ms === undefined ? 0 : Number(body.delay_ms);
  if (!isNonNegInt(rounds) || !isNonNegInt(delay_ms)) {
    return c.json({ error: 'rounds and delay_ms must be non-negative integers' }, 400);
  }

  // Pick the correct scenario
  const allCivs = db.getAllCivs();
  const civMap = new Map(allCivs.map(c => [c.number, c]));
  let rec = player_count >= 10
    ? SETUP_RECOMMENDATIONS[player_count]
    : body.scenario === 'east'
      ? EAST_SCENARIOS[player_count]
      : WEST_SCENARIOS[player_count];
  if (!rec) return c.json({ error: `No scenario for ${player_count} players` }, 400);

  safeBackup('before-reset');
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

    // Broadcast with city counts visible so trade cards can be seen
    broadcastState();
    if (delay_ms > 0) await Bun.sleep(delay_ms);

    const result = db.advanceRound();
    roundsPlayed++;
    broadcastState();
    if (delay_ms > 0) await Bun.sleep(delay_ms);
    if (result === null) break; // game ended
  }

  return c.json({ ok: true, rounds_played: roundsPlayed });
});

api.post('/debug/advances', async (c) => {
  await useSeedFrom(c);
  const players = db.getPlayers();
  const game = db.getGame();
  const round = game.current_round;

  for (const p of players) {
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

  broadcastState();
  return c.json({ ok: true });
});

export default api;
