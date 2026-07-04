/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { hashPassword, isLegacyPlaintext } from './password.js';

/** Resolved SQLite path. Module-relative so it doesn't depend on the cwd
 *  the server was started from. Exported so callers (e.g. index.ts'
 *  mkdirSync) operate on the same path the DB will actually open. */
export const DB_PATH = process.env.DATABASE_PATH ?? join(import.meta.dir, '..', '..', 'data', 'mett.db');

/** Canonical PlayerRow shape — joins civs to expose civ_number/name/slug/colors alongside the player row. */
export const PLAYER_SELECT = `
  SELECT
    p.id, p.civ_id, p.name, p.military, p.wonder, p.special, p.ast_level, p.adv_points,
    p.adv_1vp, p.adv_3vp, p.adv_6vp, p.region, p.rank_order, p.late_iron_age_bonus,
    c.number AS civ_number, c.name AS civ_name, c.slug AS civ_slug,
    c.color AS civ_color, c.text_color AS civ_text_color
  FROM players p
  JOIN civs c ON c.id = p.civ_id
  ORDER BY c.number ASC
`;

let _db: Database | null = null;
let _testDb: Database | null = null;

// Cache-reset registry. Modules that cache static DB rows (ast_levels, civs)
// register a reset callback here so swapping the DB in tests invalidates them.
const _resetHooks: Array<() => void> = [];

export function _onReset(hook: () => void): void {
  _resetHooks.push(hook);
}

/** Override the DB instance for isolated unit/integration tests. Pass null to restore. */
export function _setTestDb(db: Database | null): void {
  _testDb = db;
  for (const hook of _resetHooks) hook();
}

// Structured AST requirements seeded into ast_levels.{basic,expert}_req_json.
// Tier values: 'any' = all advances, 'medium' = adv_3vp+adv_6vp (≥100 each),
//              'expensive' = adv_6vp (≥200 each), 'cheap' = adv_1vp (<100 each).
const AST_REQ_SEED: Record<number, { basic: object | null; expert: object | null }> = {
  0:  { basic: null, expert: null },
  5:  { basic: null, expert: null },
  10: { basic: null, expert: null },
  15: { basic: null, expert: null },
  20: { basic: { cities: 2 },                                                     expert: { cities: 3 } },
  25: { basic: { cities: 2 },                                                     expert: { cities: 3 } },
  30: { basic: { cities: 2 },                                                     expert: { cities: 3 } },
  35: { basic: { cities: 3, advCount: 3, advTier: 'any' },                        expert: { cities: 3, advVpTotal: 5 } },
  40: { basic: { cities: 3, advCount: 3, advTier: 'any' },                        expert: { cities: 3, advVpTotal: 5 } },
  45: { basic: { cities: 3, advCount: 3, advTier: 'any' },                        expert: { cities: 3, advVpTotal: 5 } },
  50: { basic: { cities: 3, advCount: 3, advTier: 'medium' },                     expert: { cities: 4, advCount: 12, advTier: 'any' } },
  55: { basic: { cities: 3, advCount: 3, advTier: 'medium' },                     expert: { cities: 4, advCount: 12, advTier: 'any' } },
  60: { basic: { cities: 3, advCount: 3, advTier: 'medium' },                     expert: { cities: 4, advCount: 12, advTier: 'any' } },
  65: { basic: { cities: 4, advCount: 2, advTier: 'expensive' },                  expert: { cities: 5, advCount: 10, advTier: 'cheap', totalVp: 38 } },
  70: { basic: { cities: 5, advCount: 3, advTier: 'expensive' },                  expert: { cities: 6, advCount: 17, advTier: 'cheap', totalVp: 56 } },
  75: { basic: { impossible: true },                                               expert: { cities: 6, advCount: 17, advTier: 'cheap', totalVp: 56 } },
  80: { basic: { impossible: true },                                               expert: { impossible: true } },
};

export function getDb(): Database {
  if (_testDb) return _testDb;
  if (_db) return _db;

  _db = new Database(DB_PATH, { create: true });
  _db.exec('PRAGMA journal_mode=WAL;');
  _db.exec('PRAGMA foreign_keys=ON;');
  const schema = readFileSync(join(import.meta.dir, '..', '..', 'db', 'schema.sql'), 'utf8');
  _db.exec(schema);

  // Backward-compat column additions for databases created before the column
  // was added to schema.sql. Every column below is part of the canonical
  // schema now; these ALTERs no-op on fresh installs (duplicate column name
  // is swallowed) but upgrade older DBs in place.
  function migrate(sql: string) {
    try { _db!.exec(sql); } catch (e: any) {
      if (!String(e?.message).includes('duplicate column name')) throw e;
    }
  }

  migrate('ALTER TABLE players ADD COLUMN rank_order INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN adv_1vp INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN adv_3vp INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN adv_6vp INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE census ADD COLUMN city_count INTEGER');
  migrate('ALTER TABLE census ADD COLUMN moved INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE game ADD COLUMN is_final_round INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN late_iron_age_bonus INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE game ADD COLUMN cities_phase INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE game ADD COLUMN admin_password TEXT');
  migrate('ALTER TABLE players ADD COLUMN wonder INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE players ADD COLUMN special INTEGER NOT NULL DEFAULT 0');
  migrate('ALTER TABLE ast_levels ADD COLUMN basic_req_json TEXT');
  migrate('ALTER TABLE ast_levels ADD COLUMN expert_req_json TEXT');

  // Fix basic EIA/LIA era assignments
  _db.query("UPDATE ast_levels SET era='Early Iron Age', basic_req='5 cities + 3 advances (≥200 each)' WHERE level=70").run();
  _db.query("UPDATE ast_levels SET era='Late Iron Age', basic_req='N/A', expert_req='6 cities + all 17 advances (<100 each) + 56 VP' WHERE level=75").run();

  // Seed JSON requirements (idempotent)
  const seedStmt = _db.prepare('UPDATE ast_levels SET basic_req_json=?, expert_req_json=? WHERE level=?');
  for (const [lvl, { basic, expert }] of Object.entries(AST_REQ_SEED)) {
    seedStmt.run(
      basic  ? JSON.stringify(basic)  : null,
      expert ? JSON.stringify(expert) : null,
      parseInt(lvl),
    );
  }

  // Seed admin password from env var on first run, and migrate pre-hash
  // databases to the scrypt format. Empty ADMIN_PASSWORD falls back to the
  // 'PASSWORD' default (|| not ?? so '' also falls through).
  const envPassword = process.env.ADMIN_PASSWORD || 'PASSWORD';
  const row = _db.query<{ admin_password: string | null }, []>('SELECT admin_password FROM game WHERE id=1').get();
  const stored = row?.admin_password ?? null;
  if (!stored) {
    _db.query('UPDATE game SET admin_password=? WHERE id=1').run(hashPassword(envPassword));
  } else if (isLegacyPlaintext(stored)) {
    console.log('[me[tt]] Migrating admin password storage: plaintext → scrypt');
    _db.query('UPDATE game SET admin_password=? WHERE id=1').run(hashPassword(stored));
  }

  return _db;
}
