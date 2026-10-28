/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * initDb: fresh databases, upgrades from pre-versioned (user_version 0)
 * databases, and idempotence across reboots.
 */

import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initDb } from '../src/services/db.js';
import { CIVS } from '../src/civs.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const userVersion = (db: Database) =>
  db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
const columns = (db: Database, table: string) =>
  db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map(c => c.name);
const tableExists = (db: Database, name: string) =>
  !!db.query<{ name: string }, [string]>("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);

/** Shape of a database created by an early release: no versioning, original
 *  columns only, ast_levels table, plaintext admin password, civs seeded in
 *  schema order (so id = number). */
function legacyDb(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE civs (id INTEGER PRIMARY KEY, number INTEGER NOT NULL UNIQUE, name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE, color TEXT NOT NULL, text_color TEXT NOT NULL, def_region TEXT NOT NULL);
    CREATE TABLE ast_levels (level INTEGER PRIMARY KEY, era TEXT NOT NULL, basic_req TEXT, expert_req TEXT);
    CREATE TABLE game (id INTEGER PRIMARY KEY DEFAULT 1, expert INTEGER NOT NULL DEFAULT 1,
      current_round INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 0,
      census_revealed INTEGER NOT NULL DEFAULT 0, started_at TEXT);
    INSERT INTO game (id) VALUES (1);
    CREATE TABLE players (id INTEGER PRIMARY KEY, civ_id INTEGER NOT NULL REFERENCES civs(id), name TEXT NOT NULL,
      military INTEGER NOT NULL DEFAULT 0, ast_level INTEGER NOT NULL DEFAULT 0,
      adv_points INTEGER NOT NULL DEFAULT 0, region TEXT NOT NULL);
    CREATE TABLE census (id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      round INTEGER NOT NULL, population INTEGER, submitted_at TEXT, UNIQUE(player_id, round));
  `);
  const stmt = db.prepare('INSERT INTO civs (number, name, slug, color, text_color, def_region) VALUES (?,?,?,?,?,?)');
  for (const c of CIVS) stmt.run(c.number, c.name, c.slug, '#000000', c.textColor, c.defRegion);
  db.exec("INSERT INTO players (civ_id, name, region) VALUES (1, 'Old Timer', 'west')");
  return db;
}

describe('initDb', () => {
  it('fresh DB: current schema, latest version, all civs, hashed default password', () => {
    const db = new Database(':memory:');
    initDb(db);
    expect(userVersion(db)).toBe(4);
    expect(tableExists(db, 'ast_levels')).toBe(false);
    expect(tableExists(db, 'admin_sessions')).toBe(true);
    expect(tableExists(db, 'player_advances')).toBe(true);
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM civs').get()!.n).toBe(CIVS.length);
    const pwd = db.query<{ admin_password: string }, []>('SELECT admin_password FROM game').get()!.admin_password;
    expect(pwd.startsWith('scrypt$')).toBe(true);
  });

  it('legacy DB: adds missing columns, drops ast_levels, keeps players', () => {
    const db = legacyDb();
    db.exec("ALTER TABLE game ADD COLUMN admin_password TEXT; UPDATE game SET admin_password='hunter2'");
    initDb(db);

    expect(userVersion(db)).toBe(4);
    expect(tableExists(db, 'ast_levels')).toBe(false);
    expect(tableExists(db, 'player_advances')).toBe(true);
    expect(columns(db, 'players')).toEqual(expect.arrayContaining(
      ['rank_order', 'adv_1vp', 'adv_3vp', 'adv_6vp', 'late_iron_age_bonus', 'regressed', 'wonder', 'special', 'cards_confirmed']));
    expect(columns(db, 'census')).toEqual(expect.arrayContaining(['city_count', 'moved']));
    expect(columns(db, 'game')).toEqual(expect.arrayContaining(['is_final_round', 'cities_phase', 'admin_password']));
    expect(db.query<{ name: string }, []>('SELECT name FROM players').get()!.name).toBe('Old Timer');

    // Plaintext password migrated to scrypt.
    const pwd = db.query<{ admin_password: string }, []>('SELECT admin_password FROM game').get()!.admin_password;
    expect(pwd.startsWith('scrypt$')).toBe(true);
  });

  it('legacy DB: civ reference rows are refreshed from CIVS without changing ids', () => {
    const db = legacyDb();
    initDb(db);
    const minoa = db.query<{ id: number; color: string }, []>("SELECT id, color FROM civs WHERE slug='minoa'").get()!;
    expect(minoa.id).toBe(1);
    expect(minoa.color).toBe(CIVS.find(c => c.slug === 'minoa')!.color);
  });

  it('schema.sql alone has every column the migrations add', () => {
    const fromSchema = new Database(':memory:');
    fromSchema.exec(readFileSync(join(import.meta.dir, '..', 'db', 'schema.sql'), 'utf8'));
    const migrated = new Database(':memory:');
    initDb(migrated);
    for (const table of ['game', 'players', 'census']) {
      expect(columns(fromSchema, table).sort()).toEqual(columns(migrated, table).sort());
    }
  });

  it('is idempotent across reboots', () => {
    const db = legacyDb();
    initDb(db);
    const before = db.query<{ admin_password: string }, []>('SELECT admin_password FROM game').get()!.admin_password;
    initDb(db);
    expect(userVersion(db)).toBe(4);
    expect(db.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM civs').get()!.n).toBe(CIVS.length);
    // The stored hash is not re-seeded on a second boot.
    expect(db.query<{ admin_password: string }, []>('SELECT admin_password FROM game').get()!.admin_password).toBe(before);
  });
});
