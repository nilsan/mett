/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * API-level tests:
 *   1. Authorisation middleware — GETs are public, the player-action set
 *      (/census, /city-count, /military, /wonder, /adv) is public, every-
 *      thing else needs the admin cookie.
 *   2. POST /api/players/:id/rank sibling-clear + auto-resolve.
 *   3. Static civ scenario shapes (WEST/EAST/SETUP_RECOMMENDATIONS).
 *
 * Drives the Hono app in-process via app.request() — same pattern as
 * tests/auth.test.ts. No live server needed.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';

import { makeMinimalDb as makeDb, MIGRATIONS, REQ_ROWS } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { setAdminPassword } from '../src/db.js';
import api from '../src/routes/api.js';
import pages from '../src/routes/pages.js';
import { WEST_SCENARIOS, EAST_SCENARIOS, SETUP_RECOMMENDATIONS } from '../src/civs.js';

// ─── Hono app + helpers ──────────────────────────────────────────────────────

function makeApp(): Hono {
  // /api/* must be mounted because the middleware uses absolute paths
  // (`c.req.path` like `/api/state`) when checking the public-action whitelist.
  return new Hono().route('/', pages).route('/api', api);
}

function setUpDbForGameTests(): ReturnType<typeof makeDb> {
  const db = makeDb();
  // Tests in this file simulate a partially-set-up game: run migrations + AST
  // seed so /game/round/next and /players/:id/rank have sensible state to
  // operate on. (makeMinimalDb only ran schema.sql.)
  for (const sql of MIGRATIONS) {
    try { db.exec(sql); } catch (e: any) {
      if (!String(e?.message).includes('duplicate column name')) throw e;
    }
  }
  const stmt = db.prepare('UPDATE ast_levels SET basic_req_json=?, expert_req_json=? WHERE level=?');
  for (const [b, e, lvl] of REQ_ROWS) stmt.run(b, e, lvl);
  return db;
}

async function jsonReq(app: Hono, method: string, path: string, body?: object, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return app.request(path, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// ─── 1. Authorisation middleware ─────────────────────────────────────────────

describe('API authorisation middleware', () => {
  let app: Hono;
  beforeEach(async () => {
    const db = setUpDbForGameTests();
    _setTestDb(db);
    setAdminPassword('PASSWORD');
    app = makeApp();
    // Seed a single active game with one player so the public POSTs have a
    // valid player_id=1 to operate on. Otherwise the FK guard in /wonder
    // throws inside the handler — auth passed, but the request returns 500
    // and the assertion below (status !== 401) still passes, just noisily.
    await jsonReq(app, 'POST', '/api/game/start',
      { expert: 1, players: [{ civ_id: 1, name: 'Test', region: 'west' }] },
      'mett_admin=PASSWORD');
  });

  // GETs are unconditionally public
  it.each([
    '/api/state',
    '/api/civs',
    '/api/setup-recommendations',
  ])('GET %s is public (no cookie)', async (path) => {
    const res = await app.request(path);
    expect(res.status).toBe(200);
  });

  // Player-action POSTs are public (they may 4xx for game-state reasons but
  // never 401)
  it.each([
    ['/api/players/1/census',     { population: 27 }],
    ['/api/players/1/city-count', { city_count: 3 }],
    ['/api/players/1/military',   {}],
    ['/api/players/1/wonder',     {}],
    ['/api/players/1/adv',        { adv_1vp: 1 }],
  ])('POST %s is public (no cookie, never 401)', async (path, body) => {
    const res = await jsonReq(app, 'POST', path, body);
    expect(res.status).not.toBe(401);
  });

  // Admin-only POSTs return 401 without cookie
  it.each([
    ['/api/game/start',                      { expert: 1, players: [] }],
    ['/api/game/round/next',                 {}],
    ['/api/game/reset',                      { confirm: true }],
    ['/api/game/cities/clear',               {}],
    ['/api/census/reveal',                   {}],
    ['/api/players/1/ast',                   { level: 25 }],
    ['/api/players/1/name',                  { name: 'X' }],
    ['/api/players/1/rank',                  { rank_order: 1 }],
    ['/api/players/1/late-iron-age-bonus',   { grant: true }],
    ['/api/debug/simulate',                  {}],
    ['/api/debug/census',                    {}],
    ['/api/debug/cities',                    {}],
    ['/api/debug/advances',                  {}],
    ['/api/debug/set-round',                 { round: 1 }],
  ])('POST %s requires admin auth → 401 without cookie', async (path, body) => {
    const res = await jsonReq(app, 'POST', path, body);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('admin cookie unlocks a protected POST that fails without it', async () => {
    const without = await jsonReq(app, 'POST', '/api/players/1/name', { name: 'X' });
    expect(without.status).toBe(401);
    const withCookie = await jsonReq(app, 'POST', '/api/players/1/name', { name: 'X' }, 'mett_admin=PASSWORD');
    expect(withCookie.status).toBe(200);
  });
});

// ─── 2. /api/players/:id/rank sibling-clear + auto-resolve ───────────────────

describe('POST /api/players/:id/rank — tie resolution', () => {
  let app: Hono;
  let db: ReturnType<typeof makeDb>;
  let p1: number, p2: number, p3: number;

  beforeEach(async () => {
    db = setUpDbForGameTests();
    _setTestDb(db);
    setAdminPassword('PASSWORD');
    app = makeApp();
    // Set up an active game with 3 players in a tie group.
    await jsonReq(app, 'POST', '/api/game/start',
      { expert: 1, players: [
        { civ_id: 1, name: 'A', region: 'west' },
        { civ_id: 2, name: 'B', region: 'east' },
        { civ_id: 3, name: 'C', region: 'west' },
      ]},
      'mett_admin=PASSWORD');
    const ids = db.query<{ id: number }, []>('SELECT id FROM players ORDER BY id').all();
    [p1, p2, p3] = [ids[0]!.id, ids[1]!.id, ids[2]!.id];
  });

  function getRankOrders(): Record<number, number> {
    const rows = db.query<{ id: number; rank_order: number }, []>(
      'SELECT id, rank_order FROM players ORDER BY id'
    ).all();
    const out: Record<number, number> = {};
    for (const r of rows) out[r.id] = r.rank_order;
    return out;
  }

  it('setting rank for one player records it; others stay at 0', async () => {
    const res = await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 1, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      'mett_admin=PASSWORD');
    expect(res.status).toBe(200);
    expect(getRankOrders()).toEqual({ [p1]: 1, [p2]: 0, [p3]: 0 });
  });

  it('clears a sibling that was already holding the chosen position', async () => {
    // p1 is at rank 1
    await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 1, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      'mett_admin=PASSWORD');
    // Admin reassigns rank 1 to p2 — p1 should drop back to 0
    await jsonReq(app, 'POST', `/api/players/${p2}/rank`,
      { rank_order: 1, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      'mett_admin=PASSWORD');
    expect(getRankOrders()).toEqual({ [p1]: 0, [p2]: 1, [p3]: 0 });
  });

  it('auto-assigns the sole remaining position when the second-to-last rank is set', async () => {
    // p1 → 1, then p2 → 2; p3 has no choice but rank 3 — server auto-assigns it
    await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 1, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      'mett_admin=PASSWORD');
    await jsonReq(app, 'POST', `/api/players/${p2}/rank`,
      { rank_order: 2, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      'mett_admin=PASSWORD');
    expect(getRankOrders()).toEqual({ [p1]: 1, [p2]: 2, [p3]: 3 });
  });

  it('does not auto-assign when more than one position is unclaimed', async () => {
    // Only p1 set → p2 and p3 still ambiguous, server leaves them at 0
    await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 2, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      'mett_admin=PASSWORD');
    expect(getRankOrders()).toEqual({ [p1]: 2, [p2]: 0, [p3]: 0 });
  });

  it('rejects a non-numeric rank_order with 400', async () => {
    const res = await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 'bogus' as unknown as number },
      'mett_admin=PASSWORD');
    expect(res.status).toBe(400);
  });
});

// ─── 3. Civ scenario shape ───────────────────────────────────────────────────

describe('civ scenarios', () => {
  it('WEST_SCENARIOS covers player counts 3-9, civNumbers length matches the key, no duplicates', () => {
    for (let n = 3; n <= 9; n++) {
      const rec = WEST_SCENARIOS[n];
      expect(rec, `WEST_SCENARIOS[${n}] must exist`).toBeDefined();
      expect(rec!.civNumbers).toHaveLength(n);
      expect(new Set(rec!.civNumbers).size).toBe(n);  // no duplicates
    }
  });

  it('EAST_SCENARIOS covers player counts 3-9 with the same constraints', () => {
    for (let n = 3; n <= 9; n++) {
      const rec = EAST_SCENARIOS[n];
      expect(rec, `EAST_SCENARIOS[${n}] must exist`).toBeDefined();
      expect(rec!.civNumbers).toHaveLength(n);
      expect(new Set(rec!.civNumbers).size).toBe(n);
    }
  });

  it('SETUP_RECOMMENDATIONS covers player counts 10-18 with the same constraints', () => {
    for (let n = 10; n <= 18; n++) {
      const rec = SETUP_RECOMMENDATIONS[n];
      expect(rec, `SETUP_RECOMMENDATIONS[${n}] must exist`).toBeDefined();
      expect(rec!.civNumbers).toHaveLength(n);
      expect(new Set(rec!.civNumbers).size).toBe(n);
    }
  });

  it('every civNumber referenced is in 1..18 and every regionOverride key is in the recommendation', () => {
    const all = [
      ...Object.values(WEST_SCENARIOS),
      ...Object.values(EAST_SCENARIOS),
      ...Object.values(SETUP_RECOMMENDATIONS),
    ];
    for (const rec of all) {
      for (const num of rec.civNumbers) {
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(18);
      }
      for (const overrideKey of Object.keys(rec.regionOverrides)) {
        const num = Number(overrideKey);
        expect(rec.civNumbers).toContain(num);
      }
    }
  });
});
