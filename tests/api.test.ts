/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * API-level tests:
 *   1. Authorisation middleware — GETs are public, the player-action set
 *      (/census, /city-count, /military, /wonder, /special, /adv) is public, every-
 *      thing else needs the admin cookie.
 *   2. POST /api/players/:id/rank sibling-clear + auto-resolve.
 *   3. Static civ scenario shapes (WEST/EAST/SETUP_RECOMMENDATIONS).
 *
 * Drives the Hono app in-process via app.request() — same pattern as
 * tests/auth.test.ts. No live server needed.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';

import { makeMinimalDb as makeDb } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { setAdminPassword, createAdminSession } from '../src/db.js';
import type { Database } from 'bun:sqlite';
import api from '../src/routes/api.js';
import pages from '../src/routes/pages.js';
import { WEST_SCENARIOS, EAST_SCENARIOS, SETUP_RECOMMENDATIONS } from '../src/civs.js';

// ─── Hono app + helpers ──────────────────────────────────────────────────────

function makeApp(): Hono {
  // /api/* must be mounted because the middleware uses absolute paths
  // (`c.req.path` like `/api/state`) when checking the public-action whitelist.
  return new Hono().route('/', pages).route('/api', api);
}

/** Admin session cookie for the current test DB — set by setUpDbForGameTests. */
let ADMIN = '';

function setUpDbForGameTests(): ReturnType<typeof makeDb> {
  const db = makeDb();
  _setTestDb(db);
  ADMIN = `mett_admin=${createAdminSession()}`;
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
      ADMIN);
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
    ['/api/players/1/special',    {}],
    ['/api/players/1/adv',        { adv_1vp: 1 }],
    ['/api/players/1/move',       {}],
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
    ['/api/players/1/regress',               {}],
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
    const withCookie = await jsonReq(app, 'POST', '/api/players/1/name', { name: 'X' }, ADMIN);
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
      ADMIN);
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
      ADMIN);
    expect(res.status).toBe(200);
    expect(getRankOrders()).toEqual({ [p1]: 1, [p2]: 0, [p3]: 0 });
  });

  it('clears a sibling that was already holding the chosen position', async () => {
    // p1 is at rank 1
    await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 1, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      ADMIN);
    // Admin reassigns rank 1 to p2 — p1 should drop back to 0
    await jsonReq(app, 'POST', `/api/players/${p2}/rank`,
      { rank_order: 1, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      ADMIN);
    expect(getRankOrders()).toEqual({ [p1]: 0, [p2]: 1, [p3]: 0 });
  });

  it('auto-assigns the sole remaining position when the second-to-last rank is set', async () => {
    // p1 → 1, then p2 → 2; p3 has no choice but rank 3 — server auto-assigns it
    await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 1, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      ADMIN);
    await jsonReq(app, 'POST', `/api/players/${p2}/rank`,
      { rank_order: 2, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      ADMIN);
    expect(getRankOrders()).toEqual({ [p1]: 1, [p2]: 2, [p3]: 3 });
  });

  it('does not auto-assign when more than one position is unclaimed', async () => {
    // Only p1 set → p2 and p3 still ambiguous, server leaves them at 0
    await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 2, group_players: [p1, p2, p3], group_positions: [1, 2, 3] },
      ADMIN);
    expect(getRankOrders()).toEqual({ [p1]: 2, [p2]: 0, [p3]: 0 });
  });

  it('rejects a non-numeric rank_order with 400', async () => {
    const res = await jsonReq(app, 'POST', `/api/players/${p1}/rank`,
      { rank_order: 'bogus' as unknown as number },
      ADMIN);
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

// ─── 4. Status page: special-dim in AST order column ─────────────────────────

describe('status page: special-dim rendering in AST order', () => {
  let app: Hono;
  let db: Database;

  beforeEach(async () => {
    db = setUpDbForGameTests();
    _setTestDb(db);
    setAdminPassword('PASSWORD');
    app = makeApp();
    await jsonReq(app, 'POST', '/api/game/start',
      { expert: 0, players: [
        { civ_id: 1, name: 'Alpha', region: 'west' },
        { civ_id: 2, name: 'Beta',  region: 'west' },
      ]},
      ADMIN);
  });

  async function getStatusHtml(): Promise<string> {
    const res = await app.request('/', { headers: { 'HX-Request': 'true' } });
    return res.text();
  }

  it('dims non-special players in AST order whenever any player holds special ability', async () => {
    // Player 1 gets special ability; player 2 does not — dim is phase-independent
    await jsonReq(app, 'POST', '/api/players/1/special', {});

    const html = await getStatusHtml();
    // Exactly 1 row should carry the dim class (player 2)
    const dims = html.match(/class="[^"]*special-dim[^"]*"/g) ?? [];
    expect(dims.length).toBe(1);
  });

  it('does not dim any players when no player has special ability', async () => {
    // No special toggles — no one should be dimmed
    const html = await getStatusHtml();
    expect(html).not.toContain('special-dim');
  });

  it('does not dim any players when all players have special ability', async () => {
    await jsonReq(app, 'POST', '/api/players/1/special', {});
    await jsonReq(app, 'POST', '/api/players/2/special', {});

    const html = await getStatusHtml();
    expect(html).not.toContain('special-dim');
  });
});

// ─── 5. MOV: units-moved readiness signal ────────────────────────────────────

describe('POST /api/players/:id/move — units-moved readiness toggle', () => {
  let app: Hono;
  let db: Database;
  let p1: number, p2: number;

  beforeEach(async () => {
    db = setUpDbForGameTests();
    _setTestDb(db);
    setAdminPassword('PASSWORD');
    app = makeApp();
    await jsonReq(app, 'POST', '/api/game/start',
      { expert: 0, players: [
        { civ_id: 1, name: 'Alpha', region: 'west' },
        { civ_id: 2, name: 'Beta',  region: 'west' },
      ]},
      ADMIN);
    const ids = db.query<{ id: number }, []>('SELECT id FROM players ORDER BY id').all();
    [p1, p2] = [ids[0]!.id, ids[1]!.id];
  });

  function movedValue(playerId: number): number {
    const row = db.query<{ moved: number }, [number]>(
      'SELECT moved FROM census WHERE player_id=? AND round=1'
    ).get(playerId);
    return row?.moved ?? 0;
  }

  it('toggles a player\'s moved flag on and back off, returning the new value', async () => {
    const on = await jsonReq(app, 'POST', `/api/players/${p1}/move`, {});
    expect(on.status).toBe(200);
    expect(await on.json()).toEqual({ ok: true, moved: 1 });
    expect(movedValue(p1)).toBe(1);

    const off = await jsonReq(app, 'POST', `/api/players/${p1}/move`, {});
    expect(await off.json()).toEqual({ ok: true, moved: 0 });
    expect(movedValue(p1)).toBe(0);
  });

  it('only affects the targeted player', async () => {
    await jsonReq(app, 'POST', `/api/players/${p1}/move`, {});
    expect(movedValue(p1)).toBe(1);
    expect(movedValue(p2)).toBe(0);
  });

  it('upserts a census row when the player has not submitted a population yet', async () => {
    // No census submitted for round 1 — the toggle must still work.
    const res = await jsonReq(app, 'POST', `/api/players/${p2}/move`, {});
    expect(res.status).toBe(200);
    const row = db.query<{ population: number | null; moved: number }, [number]>(
      'SELECT population, moved FROM census WHERE player_id=? AND round=1'
    ).get(p2);
    expect(row?.moved).toBe(1);
    expect(row?.population).toBeNull();
  });

  it('does not block advancing the round (optional signal)', async () => {
    // Submit city counts so the round can advance, but leave moved unset.
    await jsonReq(app, 'POST', '/api/census/reveal', {}, ADMIN);
    await jsonReq(app, 'POST', `/api/players/${p1}/city-count`, { city_count: 2 }, ADMIN);
    await jsonReq(app, 'POST', `/api/players/${p2}/city-count`, { city_count: 2 }, ADMIN);
    const res = await jsonReq(app, 'POST', '/api/game/round/next', {}, ADMIN);
    expect(res.status).toBe(200);
    expect(db.query<{ current_round: number }, []>('SELECT current_round FROM game WHERE id=1').get()!.current_round).toBe(2);
  });

  it('renders a MOV column with a checkmark once census is revealed', async () => {
    await jsonReq(app, 'POST', '/api/census/reveal', {}, ADMIN);
    await jsonReq(app, 'POST', `/api/players/${p1}/move`, {});
    const res = await app.request('/', { headers: { 'HX-Request': 'true' } });
    const html = await res.text();
    expect(html).toContain('mov-col');
    expect(html).toContain('mov-check');
  });

  async function civHtml(): Promise<string> {
    const res = await app.request('/minoa', { headers: { 'HX-Request': 'true' } });
    return res.text();
  }

  it('civ page: census open and MOV visible before the cities phase', async () => {
    await jsonReq(app, 'POST', '/api/census/reveal', {}, ADMIN);
    const html = await civHtml();
    expect(html).not.toMatch(/id="pop-input"[^>]*disabled/);
    expect(html).not.toMatch(/id="submit-census"[^>]*disabled/);
    expect(html).not.toMatch(/mov-row" hidden/);
  });

  it('civ page: recount (cities phase) locks the census submit and hides MOV', async () => {
    await jsonReq(app, 'POST', '/api/census/reveal', {}, ADMIN);
    // Admin "recount" → cities_phase = 1
    await jsonReq(app, 'POST', '/api/game/cities/clear', {}, ADMIN);
    const html = await civHtml();
    expect(html).toMatch(/id="pop-input"[^>]*disabled/);
    expect(html).toMatch(/id="submit-census"[^>]*disabled/);
    expect(html).toMatch(/mov-row" hidden/);
  });

  it('civ page: advancing to a new round reopens the census and MOV', async () => {
    await jsonReq(app, 'POST', '/api/census/reveal', {}, ADMIN);
    await jsonReq(app, 'POST', '/api/game/cities/clear', {}, ADMIN);
    // City counts in (post-calamity) so the round can advance.
    await jsonReq(app, 'POST', `/api/players/${p1}/city-count`, { city_count: 2 });
    await jsonReq(app, 'POST', `/api/players/${p2}/city-count`, { city_count: 2 });
    await jsonReq(app, 'POST', '/api/game/round/next', {}, ADMIN);
    const html = await civHtml();
    expect(html).not.toMatch(/id="pop-input"[^>]*disabled/);
    expect(html).not.toMatch(/id="submit-census"[^>]*disabled/);
    expect(html).not.toMatch(/mov-row" hidden/);
  });

  it('civ page: city-count submit is disabled before the census is revealed', async () => {
    // Fresh round, census not yet revealed (census phase).
    const html = await civHtml();
    expect(html).toMatch(/id="submit-city"[^>]*disabled/);
    expect(html).toMatch(/id="city-input"[^>]*disabled/);
    expect(html).not.toMatch(/city-hint[^>]*hidden/); // hint shown
  });

  it('civ page: city-count submit enables once the census is revealed', async () => {
    await jsonReq(app, 'POST', '/api/census/reveal', {}, ADMIN);
    const html = await civHtml();
    expect(html).not.toMatch(/id="submit-city"[^>]*disabled/);
    expect(html).not.toMatch(/id="city-input"[^>]*disabled/);
    expect(html).toMatch(/city-hint[^>]*hidden/); // hint hidden
  });
});

// ─── 6. Calamity AST regression ──────────────────────────────────────────────

describe('POST /api/players/:id/regress — calamity AST regression', () => {
  let app: Hono;
  let db: Database;
  let p1: number, p2: number;

  beforeEach(async () => {
    db = setUpDbForGameTests();
    _setTestDb(db);
    setAdminPassword('PASSWORD');
    app = makeApp();
    await jsonReq(app, 'POST', '/api/game/start',
      { expert: 1, players: [
        { civ_id: 1, name: 'Alpha', region: 'west' },
        { civ_id: 2, name: 'Beta',  region: 'east' },
      ]},
      ADMIN);
    const ids = db.query<{ id: number }, []>('SELECT id FROM players ORDER BY id').all();
    [p1, p2] = [ids[0]!.id, ids[1]!.id];
  });

  function row(id: number) {
    return db.query<{ ast_level: number; regressed: number }, [number]>(
      'SELECT ast_level, regressed FROM players WHERE id=?'
    ).get(id)!;
  }

  it('drops the player one AST step and flags them (needs admin cookie)', async () => {
    await jsonReq(app, 'POST', `/api/players/${p1}/ast`, { level: 35 }, ADMIN);
    const res = await jsonReq(app, 'POST', `/api/players/${p1}/regress`, {}, ADMIN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ast_level: 30 });
    expect(row(p1)).toEqual({ ast_level: 30, regressed: 1 });
    expect(row(p2)).toEqual({ ast_level: 0, regressed: 0 }); // untouched
  });

  it('is a no-op at Stone Age (level 0) and sets no marker', async () => {
    const res = await jsonReq(app, 'POST', `/api/players/${p1}/regress`, {}, ADMIN);
    expect(await res.json()).toEqual({ ok: true, ast_level: 0 });
    expect(row(p1)).toEqual({ ast_level: 0, regressed: 0 });
  });

  it('manually setting the AST level (dropdown) clears the regression marker', async () => {
    await jsonReq(app, 'POST', `/api/players/${p1}/ast`, { level: 35 }, ADMIN);
    await jsonReq(app, 'POST', `/api/players/${p1}/regress`, {}, ADMIN);
    expect(row(p1).regressed).toBe(1);
    await jsonReq(app, 'POST', `/api/players/${p1}/ast`, { level: 40 }, ADMIN);
    expect(row(p1)).toEqual({ ast_level: 40, regressed: 0 });
  });

  it('advancing the round clears all regression markers', async () => {
    await jsonReq(app, 'POST', `/api/players/${p1}/ast`, { level: 35 }, ADMIN);
    await jsonReq(app, 'POST', `/api/players/${p1}/regress`, {}, ADMIN);
    expect(row(p1).regressed).toBe(1);
    // Reach the point where the round can advance.
    await jsonReq(app, 'POST', '/api/census/reveal', {}, ADMIN);
    await jsonReq(app, 'POST', `/api/players/${p1}/city-count`, { city_count: 2 });
    await jsonReq(app, 'POST', `/api/players/${p2}/city-count`, { city_count: 2 });
    await jsonReq(app, 'POST', '/api/game/round/next', {}, ADMIN);
    expect(row(p1).regressed).toBe(0);
  });

  it('status board renders the red token marker for a regressed empire', async () => {
    await jsonReq(app, 'POST', `/api/players/${p1}/ast`, { level: 35 }, ADMIN);
    await jsonReq(app, 'POST', `/api/players/${p1}/regress`, {}, ADMIN);
    const res = await app.request('/', { headers: { 'HX-Request': 'true' } });
    const html = await res.text();
    expect(html).toContain('ab-magnet-regressed');
  });

  it('admin table renders a regress button, disabled at level 0', async () => {
    const res = await app.request('/admin', { headers: { 'HX-Request': 'true', cookie: ADMIN } });
    const html = await res.text();
    expect(html).toContain('regress-btn');
    // Both players start at level 0 → both buttons disabled.
    expect(html).toMatch(/regress-btn[^>]*disabled/);
  });
});

// ─── Request validation, game-state guards, secrets, escaping ────────────────

describe('API input validation', () => {
  let app: Hono;
  let db: Database;
  let p1: number;
  beforeEach(async () => {
    db = setUpDbForGameTests();
    app = makeApp();
    await jsonReq(app, 'POST', '/api/game/start',
      { expert: 1, players: [{ civ_id: 1, name: 'Ann', region: 'west' }] }, ADMIN);
    p1 = db.query<{ id: number }, []>('SELECT id FROM players').get()!.id;
  });

  it('malformed JSON is a 400 with a JSON error, not a 500', async () => {
    const res = await app.request(`/api/players/${p1}/census`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'nope',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
  });

  it.each(['census', 'city-count', 'military', 'move', 'wonder', 'special', 'adv'])(
    'unknown player on /%s is a 404', async (action) => {
      const res = await jsonReq(app, 'POST', `/api/players/999/${action}`, { population: 5, city_count: 1, adv_1vp: 1 });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Player not found' });
    });

  it('non-numeric player id is a 404', async () => {
    expect((await jsonReq(app, 'POST', '/api/players/abc/military', {})).status).toBe(404);
  });

  it('census is refused (409) when no game is running', async () => {
    db.exec('UPDATE game SET active=0');
    const res = await jsonReq(app, 'POST', `/api/players/${p1}/census`, { population: 5 });
    expect(res.status).toBe(409);
  });

  it('city count is refused (409) until the census is revealed', async () => {
    const early = await jsonReq(app, 'POST', `/api/players/${p1}/city-count`, { city_count: 3 });
    expect(early.status).toBe(409);
    await jsonReq(app, 'POST', '/api/census/reveal', {}, ADMIN);
    const ok = await jsonReq(app, 'POST', `/api/players/${p1}/city-count`, { city_count: 3 });
    expect(ok.status).toBe(200);
  });

  it('census can still be resubmitted after reveal (by design)', async () => {
    await jsonReq(app, 'POST', `/api/players/${p1}/census`, { population: 5 });
    expect((await jsonReq(app, 'POST', `/api/players/${p1}/census`, { population: 50 })).status).toBe(200);
  });

  it('non-numeric advance counts are a 400', async () => {
    const res = await jsonReq(app, 'POST', `/api/players/${p1}/adv`, { adv_1vp: 'lots' });
    expect(res.status).toBe(400);
  });

  it('game/start rejects an unknown civ and a bad expert flag', async () => {
    const badCiv = await jsonReq(app, 'POST', '/api/game/start',
      { expert: 1, players: [{ civ_id: 999, name: 'X', region: 'west' }] }, ADMIN);
    expect(badCiv.status).toBe(400);
    const badMode = await jsonReq(app, 'POST', '/api/game/start',
      { expert: 'yes', players: [{ civ_id: 1, name: 'X', region: 'west' }] }, ADMIN);
    expect(badMode.status).toBe(400);
  });

  it('debug/set-round rejects a non-positive round', async () => {
    expect((await jsonReq(app, 'POST', '/api/debug/set-round', { round: 'x' }, ADMIN)).status).toBe(400);
    expect((await jsonReq(app, 'POST', '/api/debug/set-round', { round: 0 }, ADMIN)).status).toBe(400);
  });

  it('LIA bonus toggle requires a boolean grant', async () => {
    const res = await jsonReq(app, 'POST', `/api/players/${p1}/late-iron-age-bonus`, { grant: 'yes' }, ADMIN);
    expect(res.status).toBe(400);
  });
});

describe('secrets never leave the server', () => {
  it('GET /api/state carries no admin password hash', async () => {
    setUpDbForGameTests();
    const res = await makeApp().request('/api/state');
    const text = await res.text();
    expect(text).not.toContain('admin_password');
    expect(text).not.toContain('scrypt$');
  });
});

describe('player names are HTML-escaped', () => {
  const EVIL = '"><img src=x onerror=alert(1)>';
  let app: Hono;
  beforeEach(async () => {
    setUpDbForGameTests();
    app = makeApp();
    await jsonReq(app, 'POST', '/api/game/start',
      { expert: 1, players: [{ civ_id: 1, name: EVIL, region: 'west' }] }, ADMIN);
  });

  it.each([
    ['status page', '/', {}],
    ['player page', '/minoa', {}],
    ['admin page', '/admin', { cookie: '' }],
  ])('%s', async (_label, path, headers) => {
    const h: Record<string, string> = { ...headers };
    if ('cookie' in h) h.cookie = ADMIN;
    const html = await (await app.request(path, { headers: h })).text();
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&quot;&gt;&lt;img src=x');
  });
});
