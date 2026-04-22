import { Hono } from 'hono';
import * as db from '../db.js';
import { broadcastState } from '../ws.js';
import { SETUP_RECOMMENDATIONS, WEST_SCENARIOS, EAST_SCENARIOS } from '../civs.js';
import { isAdminAuthed } from './pages.js';
import { LIA_THRESHOLD } from '../models/ast.js';

const api = new Hono();

// Player-facing POST endpoints — no auth required (players submit from their own civ page)
const PLAYER_PUBLIC = new Set(['/census', '/city-count', '/military', '/wonder', '/adv']);

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
  const body = await c.req.json<{
    expert: number;
    players: Array<{ civ_id: number; name: string; region: string }>;
  }>();

  if (!body.players?.length) {
    return c.json({ error: 'At least one player required' }, 400);
  }

  db.startGame(body.expert);
  for (const p of body.players) {
    db.addPlayer(p.civ_id, p.name.trim() || '?', p.region);
  }
  broadcastState();
  return c.json({ ok: true });
});

api.post('/game/reset', async (c) => {
  const body = await c.req.json<{ confirm: boolean }>();
  if (!body.confirm) return c.json({ error: 'confirm required' }, 400);
  db.resetGame();
  broadcastState();
  return c.json({ ok: true });
});

api.post('/game/round/next', (c) => {
  if (!db.allCitiesSubmitted(db.getGame().current_round)) {
    return c.json({ error: 'All empires must have a city count before advancing the round' }, 400);
  }
  const round = db.advanceRound();
  broadcastState();
  // round === null means game ended (basic hit 75, or expert final round completed)
  return c.json(round === null ? { ok: true, ended: true } : { ok: true, round });
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
  const playerId = Number(c.req.param('id'));
  const body = await c.req.json<{ population: number }>();
  let pop = Number(body.population);
  if (pop < 0) pop = 55 + pop; // negative shorthand: -27 → 28 tokens remaining
  if (!Number.isInteger(pop) || pop < 1 || pop > 55) {
    return c.json({ error: 'Invalid population (must be 1–55)' }, 400);
  }
  const game = db.getGame();
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
  const playerId = Number(c.req.param('id'));
  const body = await c.req.json<{ city_count: number }>();
  const count = Number(body.city_count);
  if (!Number.isInteger(count) || count < 0 || count > 9) {
    return c.json({ error: 'Invalid city count (must be 0–9)' }, 400);
  }
  const game = db.getGame();
  db.submitCityCount(playerId, game.current_round, count);
  broadcastState(playerId);
  return c.json({ ok: true });
});

api.post('/players/:id/military', (c) => {
  const playerId = Number(c.req.param('id'));
  const next = db.toggleMilitary(playerId);
  broadcastState(playerId);
  return c.json({ ok: true, military: next });
});

api.post('/players/:id/wonder', (c) => {
  const playerId = Number(c.req.param('id'));
  const next = db.toggleWonder(playerId);
  broadcastState(playerId);
  return c.json({ ok: true, wonder: next });
});

api.post('/players/:id/ast', async (c) => {
  const playerId = Number(c.req.param('id'));
  const body = await c.req.json<{ level: number }>();
  const validLevels = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
  if (!validLevels.includes(body.level)) {
    return c.json({ error: 'Invalid AST level' }, 400);
  }
  db.setAstLevel(playerId, body.level);
  db.checkAndSetLateIronAgeBonus();
  db.checkAndSetFinalRound();
  broadcastState();
  return c.json({ ok: true });
});

api.post('/players/:id/adv', async (c) => {
  const playerId = Number(c.req.param('id'));
  const body = await c.req.json<{ adv_1vp?: number; adv_3vp?: number; adv_6vp?: number }>();
  if (body.adv_1vp === undefined && body.adv_3vp === undefined && body.adv_6vp === undefined) {
    return c.json({ error: 'Provide adv_1vp, adv_3vp, and/or adv_6vp' }, 400);
  }
  const v1 = Math.max(0, Math.floor(Number(body.adv_1vp ?? 0)));
  const v3 = Math.max(0, Math.floor(Number(body.adv_3vp ?? 0)));
  const v6 = Math.max(0, Math.floor(Number(body.adv_6vp ?? 0)));
  db.setAdvCards(playerId, v1, v3, v6);
  broadcastState(playerId);
  return c.json({ ok: true });
});

api.post('/players/:id/late-iron-age-bonus', async (c) => {
  const playerId = Number(c.req.param('id'));
  const body = await c.req.json<{ grant: boolean }>();
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
  const playerId = Number(c.req.param('id'));
  const body = await c.req.json<{ rank_order: number; group_players?: number[]; group_positions?: number[] }>();
  if (isNaN(body.rank_order)) return c.json({ error: 'Invalid rank_order' }, 400);

  // Clear any sibling already holding this position (allows admin to correct mistakes)
  if (body.group_players?.length) {
    const allPlayers = db.getPlayers();
    for (const p of allPlayers) {
      if (body.group_players.includes(p.id) && p.id !== playerId && p.rank_order === body.rank_order) {
        db.setRankOrder(p.id, 0);
      }
    }
  }

  db.setRankOrder(playerId, body.rank_order);

  // Auto-assign the sole remaining position to any unresolved group member
  if (body.group_players?.length && body.group_positions?.length) {
    const allPlayers = db.getPlayers();
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
  const playerId = Number(c.req.param('id'));
  const body = await c.req.json<{ name: string }>();
  if (!body.name?.trim()) return c.json({ error: 'Name required' }, 400);
  db.updatePlayerName(playerId, body.name.trim());
  broadcastState();
  return c.json({ ok: true });
});

// ─── Debug / simulation ───────────────────────────────────────────────────────

function weightedRandom(min: number, max: number): number {
  // Triangle distribution — average of two uniforms gives bell-ish curve
  return Math.round(min + (Math.random() + Math.random()) / 2 * (max - min));
}

api.post('/debug/set-round', async (c) => {
  const body = await c.req.json<{ round: number }>();
  const round = Math.max(1, Math.floor(Number(body.round)));
  db.setRound(round);
  broadcastState();
  return c.json({ ok: true, round });
});

api.post('/debug/census', (c) => {
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

api.post('/debug/cities', (c) => {
  const game = db.getGame();
  const players = db.getPlayers();
  for (const p of players) {
    const base = Math.min(9, Math.max(1, Math.round(p.ast_level / 10) + 1));
    let count: number;
    if (Math.random() < 0.15) {
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

api.post('/debug/advances', (c) => {
  const players = db.getPlayers();
  const game = db.getGame();
  const round = game.current_round;

  for (const p of players) {
    // Probability of buying anything this round increases over time
    const buyChance = round <= 4 ? 0.5 : round <= 8 ? 0.75 : 0.85;
    if (Math.random() > buyChance) continue;

    // How many purchases this turn (1-3, more likely 1-2)
    const purchases = Math.ceil(Math.random() * (round <= 6 ? 2 : 3));

    let v1 = p.adv_1vp, v3 = p.adv_3vp, v6 = p.adv_6vp;

    for (let i = 0; i < purchases; i++) {
      // Priority: push toward 3VP advances early (age requirements need 5VP total)
      // Later: mix in 1VP (tech breadth) and some 6VP
      const need3vp = v3 * 3 < 5 && round <= 10; // trying to hit 5VP threshold
      const roll = Math.random();

      if (need3vp || (round <= 8 && roll < 0.55)) {
        if (v3 < 17) v3++;
      } else if (round >= 9 && roll < 0.20) {
        if (v6 < 11) v6++;
      } else {
        // 1VP cards — buy more of these in later rounds (tech breadth bonuses)
        if (v1 < 17) v1 += round >= 10 ? (Math.random() < 0.4 ? 2 : 1) : 1;
        if (v1 > 17) v1 = 17;
      }
    }

    db.setAdvCards(p.id, v1, v3, v6);
  }

  broadcastState();
  return c.json({ ok: true });
});

export default api;
