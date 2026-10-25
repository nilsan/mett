/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared test helpers. Underscored filename keeps it out of `bun test`
 * discovery — this file is library code, not a suite.
 *
 * Two factories, both built by the production initDb() (schema, migrations,
 * civ seed, admin password) so tests never carry a copy of the schema:
 *   - makeDb()        + an active basic game
 *   - makeMinimalDb() no game started (auth/password tests don't need players)
 *
 * Plus primitive helpers used by tests/game.test.ts.
 */

import { Database } from 'bun:sqlite';
import { initDb } from '../src/services/db.js';

/** Freshly initialised in-memory DB, no game started. */
export function makeMinimalDb(): Database {
  const db = new Database(':memory:');
  initDb(db);
  return db;
}

/** Initialised in-memory DB with an active basic game. */
export function makeDb(): Database {
  const db = makeMinimalDb();
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
