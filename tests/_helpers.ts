/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared test helpers. Underscored filename keeps it out of the
 * `bun test tests/*.test.ts` glob — this file is library code, not a suite.
 *
 * Two factories:
 *   - makeDb()        full schema + migrations + AST seed + active game
 *   - makeMinimalDb() schema only (auth/password tests don't need players)
 *
 * Plus primitive helpers used by tests/game.test.ts.
 */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';

// Schema text + migrations + AST requirement seeds — read once at module load.
export const SCHEMA_SQL = readFileSync(join(import.meta.dir, '..', 'db', 'schema.sql'), 'utf8');

export const MIGRATIONS: readonly string[] = [
  'ALTER TABLE players ADD COLUMN rank_order INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE players ADD COLUMN adv_1vp INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE players ADD COLUMN adv_3vp INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE players ADD COLUMN adv_6vp INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE census ADD COLUMN city_count INTEGER',
  'ALTER TABLE game ADD COLUMN is_final_round INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE players ADD COLUMN late_iron_age_bonus INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE game ADD COLUMN cities_phase INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE game ADD COLUMN admin_password TEXT',
  'ALTER TABLE players ADD COLUMN wonder INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE ast_levels ADD COLUMN basic_req_json TEXT',
  'ALTER TABLE ast_levels ADD COLUMN expert_req_json TEXT',
];

export const REQS: Record<number, { basic: object | null; expert: object | null }> = {
  0:  { basic: null,                                                expert: null },
  5:  { basic: null,                                                expert: null },
  10: { basic: null,                                                expert: null },
  15: { basic: null,                                                expert: null },
  20: { basic: { cities: 2 },                                       expert: { cities: 3 } },
  25: { basic: { cities: 2 },                                       expert: { cities: 3 } },
  30: { basic: { cities: 2 },                                       expert: { cities: 3 } },
  35: { basic: { cities: 3, advCount: 3, advTier: 'any' },          expert: { cities: 3, advVpTotal: 5 } },
  40: { basic: { cities: 3, advCount: 3, advTier: 'any' },          expert: { cities: 3, advVpTotal: 5 } },
  45: { basic: { cities: 3, advCount: 3, advTier: 'any' },          expert: { cities: 3, advVpTotal: 5 } },
  50: { basic: { cities: 3, advCount: 3, advTier: 'medium' },       expert: { cities: 4, advCount: 12, advTier: 'any' } },
  55: { basic: { cities: 3, advCount: 3, advTier: 'medium' },       expert: { cities: 4, advCount: 12, advTier: 'any' } },
  60: { basic: { cities: 3, advCount: 3, advTier: 'medium' },       expert: { cities: 4, advCount: 12, advTier: 'any' } },
  65: { basic: { cities: 4, advCount: 2, advTier: 'expensive' },    expert: { cities: 5, advCount: 10, advTier: 'cheap', totalVp: 38 } },
  70: { basic: { cities: 5, advCount: 3, advTier: 'expensive' },    expert: { cities: 6, advCount: 17, advTier: 'cheap', totalVp: 56 } },
  75: { basic: { impossible: true },                                 expert: { cities: 6, advCount: 17, advTier: 'cheap', totalVp: 56 } },
  80: { basic: { impossible: true },                                 expert: { impossible: true } },
};

// Stringify each row's JSON once.
export const REQ_ROWS: ReadonlyArray<readonly [string | null, string | null, number]> = Object.entries(REQS).map(
  ([lvl, { basic, expert }]) => [
    basic  ? JSON.stringify(basic)  : null,
    expert ? JSON.stringify(expert) : null,
    parseInt(lvl, 10),
  ] as const,
);

/** Schema-only test DB. For auth/password tests that don't need players. */
export function makeMinimalDb(): Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  return db;
}

/** Full test DB: schema + migrations + AST requirement seed + an active basic game. */
export function makeDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(SCHEMA_SQL);

  for (const sql of MIGRATIONS) {
    try { db.exec(sql); } catch (e: any) {
      if (!String(e?.message).includes('duplicate column name')) throw e;
    }
  }

  const stmt = db.prepare('UPDATE ast_levels SET basic_req_json=?, expert_req_json=? WHERE level=?');
  for (const [b, e, lvl] of REQ_ROWS) stmt.run(b, e, lvl);

  db.exec("UPDATE game SET active=1, expert=0, current_round=1 WHERE id=1");
  return db;
}

// ─── Game helpers used by game.test.ts ────────────────────────────────────────

export function addPlayer(db: Database, civId: number, name: string, region = 'west'): number {
  const result = db.query<{ id: number }, [number, string, string]>(
    'INSERT INTO players (civ_id, name, region) VALUES (?,?,?) RETURNING id'
  ).get(civId, name, region)!;
  return result.id;
}

export function setAstLevel(db: Database, playerId: number, level: number) {
  db.query('UPDATE players SET ast_level=? WHERE id=?').run(level, playerId);
}

export function setAdvances(db: Database, playerId: number, v1: number, v3 = 0, v6 = 0) {
  const total = v1 + v3 * 3 + v6 * 6;
  db.query('UPDATE players SET adv_1vp=?, adv_3vp=?, adv_6vp=?, adv_points=? WHERE id=?')
    .run(v1, v3, v6, total, playerId);
}

export function submitCensus(db: Database, playerId: number, round: number, population: number, cityCount: number) {
  db.query(`
    INSERT INTO census (player_id, round, population, city_count, submitted_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(player_id, round) DO UPDATE SET population=excluded.population, city_count=excluded.city_count
  `).run(playerId, round, population, cityCount, new Date().toISOString());
}

export function getPlayer(db: Database, id: number): any {
  return db.query<any, [number]>('SELECT * FROM players WHERE id=?').get(id)!;
}

export function getGame(db: Database): any {
  return db.query<any, []>('SELECT * FROM game WHERE id=1').get()!;
}
