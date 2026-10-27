/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { hashPassword, isLegacyPlaintext } from './password.js';
import { CIVS } from '../civs.js';

/** Resolved SQLite path. Module-relative so it doesn't depend on the cwd
 *  the server was started from. Exported so callers (e.g. index.ts'
 *  mkdirSync) operate on the same path the DB will actually open. */
export const DB_PATH = process.env.DATABASE_PATH ?? join(import.meta.dir, '..', '..', 'data', 'mett.db');

/** Canonical PlayerRow shape — joins civs to expose civ_number/name/slug/colors alongside the player row. */
export const PLAYER_SELECT = `
  SELECT
    p.id, p.civ_id, p.name, p.military, p.wonder, p.special, p.ast_level, p.adv_points,
    p.adv_1vp, p.adv_3vp, p.adv_6vp, p.region, p.rank_order, p.late_iron_age_bonus, p.regressed,
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

/** True while a test has swapped in its own database (see _setTestDb). */
export function usingTestDb(): boolean {
  return _testDb !== null;
}

/** Ordered schema migrations, tracked with PRAGMA user_version. Migration i
 *  runs once, when the DB's user_version is below i+1. schema.sql (CREATE IF
 *  NOT EXISTS) always describes the current shape, so on a fresh DB these are
 *  no-ops; they exist to upgrade databases created by older releases.
 *  Append only — never reorder or edit a shipped entry. */
const MIGRATIONS: ReadonlyArray<(db: Database) => void> = [
  // 1: columns added before versioned migrations existed. Older DBs may have
  //    any subset of them, so tolerate "duplicate column name".
  (db) => {
    for (const sql of [
      'ALTER TABLE players ADD COLUMN rank_order INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE players ADD COLUMN adv_1vp INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE players ADD COLUMN adv_3vp INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE players ADD COLUMN adv_6vp INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE census ADD COLUMN city_count INTEGER',
      'ALTER TABLE census ADD COLUMN moved INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE game ADD COLUMN is_final_round INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE players ADD COLUMN late_iron_age_bonus INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE players ADD COLUMN regressed INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE game ADD COLUMN cities_phase INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE game ADD COLUMN admin_password TEXT',
      'ALTER TABLE players ADD COLUMN wonder INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE players ADD COLUMN special INTEGER NOT NULL DEFAULT 0',
    ]) {
      try { db.exec(sql); } catch (e: any) {
        if (!String(e?.message).includes('duplicate column name')) throw e;
      }
    }
  },
  // 2: A.S.T. rules moved from the ast_levels table into src/shared/ast-pure.ts.
  (db) => { db.exec('DROP TABLE IF EXISTS ast_levels'); },
  // 3: advance cards per player (player_advances). schema.sql creates the
  //    table; nothing to convert — existing games keep their tier counts.
  //    credit_choice joined the table during development, so add it if absent.
  (db) => {
    try { db.exec('ALTER TABLE player_advances ADD COLUMN credit_choice TEXT'); } catch (e: any) {
      if (!String(e?.message).includes('duplicate column name')) throw e;
    }
  },
];

/** Bring any database — fresh, legacy, or in-memory test DB — to the current
 *  schema: tables, migrations, static civ reference data, admin password.
 *  Idempotent; runs on every boot. */
export function initDb(db: Database): void {
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec(readFileSync(join(import.meta.dir, '..', '..', 'db', 'schema.sql'), 'utf8'));

  const version = db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.transaction(() => {
      MIGRATIONS[i]!(db);
      db.exec(`PRAGMA user_version = ${i + 1}`);
    })();
  }

  // Civ reference rows mirror CIVS — upsert so colour/name fixes in civs.ts
  // reach existing databases too.
  const civStmt = db.prepare(`
    INSERT INTO civs (number, name, slug, color, text_color, def_region) VALUES (?,?,?,?,?,?)
    ON CONFLICT(number) DO UPDATE SET name=excluded.name, slug=excluded.slug,
      color=excluded.color, text_color=excluded.text_color, def_region=excluded.def_region
  `);
  for (const c of CIVS) civStmt.run(c.number, c.name, c.slug, c.color, c.textColor, c.defRegion);

  // Seed admin password from env var on first run, and migrate pre-hash
  // databases to the scrypt format. Empty ADMIN_PASSWORD falls back to the
  // 'PASSWORD' default (|| not ?? so '' also falls through).
  const row = db.query<{ admin_password: string | null }, []>('SELECT admin_password FROM game WHERE id=1').get();
  const stored = row?.admin_password ?? null;
  if (!stored) {
    db.query('UPDATE game SET admin_password=? WHERE id=1').run(hashPassword(process.env.ADMIN_PASSWORD || 'PASSWORD'));
  } else if (isLegacyPlaintext(stored)) {
    console.log('[me[tt]] Migrating admin password storage: plaintext → scrypt');
    db.query('UPDATE game SET admin_password=? WHERE id=1').run(hashPassword(stored));
  }
}

export function getDb(): Database {
  if (_testDb) return _testDb;
  if (_db) return _db;

  _db = new Database(DB_PATH, { create: true });
  _db.exec('PRAGMA journal_mode=WAL;');
  initDb(_db);
  return _db;
}
