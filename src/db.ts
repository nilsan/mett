// Public interface — re-exports from domain modules so callers need no import changes.
// Raw connection lives in src/services/db.ts
// Game flow lives in src/models/game.ts
// AST engine lives in src/models/ast.ts

export { getDb } from './services/db.js';

export type { GameRow, PlayerRow, CensusRow, AstLevelRow, FullState, CivRefRow } from './types.js';

export type { AstRequirement } from './models/ast.js';
export {
  checkRequirement,
  meetsAstRequirements,
  autoAdvanceAst,
  getAstLevels,
  getAstLevel,
} from './models/ast.js';

export {
  getGame,
  startGame,
  resetGame,
  revealCensus,
  setRound,
  endGame,
  checkAndSetFinalRound,
  checkAndSetLateIronAgeBonus,
  advanceRound,
} from './models/game.js';

// ─── CRUD (players, census, admin, civs, full state) ──────────────────────────

import { getDb, _onReset, PLAYER_SELECT } from './services/db.js';
import type { PlayerRow, CensusRow, AstLevelRow, FullState, CivRefRow } from './types.js';
import { getGame } from './models/game.js';
import { getAstLevels, LIA_THRESHOLD } from './models/ast.js';

// ── Admin password ─────────────────────────────────────────────────────────────

import { hashPassword, verifyPassword } from './services/password.js';

/** Returns the stored scrypt hash, or '' when unset. */
export function getAdminPassword(): string {
  return getDb().query<{ admin_password: string | null }, []>(
    'SELECT admin_password FROM game WHERE id=1'
  ).get()?.admin_password ?? '';
}

/** Hash and store a new admin password. Throws on empty input. */
export function setAdminPassword(plain: string): void {
  if (!plain) throw new Error('Admin password cannot be empty');
  getDb().query('UPDATE game SET admin_password=? WHERE id=1').run(hashPassword(plain));
}

/** Timing-safe check of submitted plaintext against the stored hash. */
export function verifyAdminPassword(plain: string): boolean {
  return verifyPassword(plain, getAdminPassword());
}

/** True when the current stored password is the built-in 'PASSWORD' default. */
export function isUsingDefaultPassword(): boolean {
  return verifyPassword('PASSWORD', getAdminPassword());
}

// ── Players ───────────────────────────────────────────────────────────────────

export function getPlayers(): PlayerRow[] {
  return getDb().query<PlayerRow, []>(PLAYER_SELECT).all();
}

export function addPlayer(civId: number, name: string, region: string): number {
  const result = getDb().query<{ id: number }, [number, string, string]>(
    'INSERT INTO players (civ_id, name, region, military, ast_level, adv_points, rank_order) VALUES (?,?,?,0,0,0,0) RETURNING id'
  ).get(civId, name, region);
  return result!.id;
}

export function setRankOrder(playerId: number, rankOrder: number): void {
  getDb().query('UPDATE players SET rank_order=? WHERE id=?').run(rankOrder, playerId);
}

export function setLateIronAgeBonus(playerId: number, grant: boolean): void {
  const db = getDb();
  if (grant) {
    db.exec('UPDATE players SET late_iron_age_bonus=0');
    db.query('UPDATE players SET late_iron_age_bonus=1 WHERE id=?').run(playerId);
  } else {
    db.query('UPDATE players SET late_iron_age_bonus=0 WHERE id=?').run(playerId);
  }
}

export function updatePlayerName(playerId: number, name: string): void {
  getDb().query('UPDATE players SET name=? WHERE id=?').run(name, playerId);
}

export function toggleMilitary(playerId: number): number {
  const db = getDb();
  const current = db.query<{ military: number }, [number]>('SELECT military FROM players WHERE id=?').get(playerId);
  const next = current!.military ? 0 : 1;
  db.query('UPDATE players SET military=? WHERE id=?').run(next, playerId);
  return next;
}

export function toggleWonder(playerId: number): number {
  const db = getDb();
  const current = db.query<{ wonder: number }, [number]>('SELECT wonder FROM players WHERE id=?').get(playerId);
  const next = current!.wonder ? 0 : 1;
  db.query('UPDATE players SET wonder=? WHERE id=?').run(next, playerId);
  return next;
}

export function setAstLevel(playerId: number, level: number): void {
  const db = getDb();
  db.query('UPDATE players SET ast_level=? WHERE id=?').run(level, playerId);
  // If admin moved a player back below LIA, clear the expert end-trigger if no one else is there
  const game = db.query<{ active: number; expert: number; is_final_round: number }, []>(
    'SELECT active, expert, is_final_round FROM game WHERE id=1'
  ).get();
  if (game?.active && game.expert === 1 && game.is_final_round) {
    const atLia = db.query<{ count: number }, []>(
      `SELECT COUNT(*) AS count FROM players WHERE ast_level >= ${LIA_THRESHOLD}`
    ).get();
    if (!atLia || atLia.count === 0) {
      db.query('UPDATE game SET is_final_round=0 WHERE id=1').run();
    }
  }
}

export function setAdvCards(playerId: number, v1: number, v3: number, v6: number): void {
  const total = v1 * 1 + v3 * 3 + v6 * 6;
  getDb().query('UPDATE players SET adv_1vp=?, adv_3vp=?, adv_6vp=?, adv_points=? WHERE id=?')
    .run(v1, v3, v6, total, playerId);
}

// ── Census ────────────────────────────────────────────────────────────────────

export function getCensusForRound(round: number): CensusRow[] {
  return getDb().query<CensusRow, [number]>('SELECT * FROM census WHERE round=?').all(round);
}

export function getPlayerCensus(playerId: number, round: number): CensusRow | null {
  return getDb().query<CensusRow, [number, number]>(
    'SELECT * FROM census WHERE player_id=? AND round=?'
  ).get(playerId, round) ?? null;
}

export function submitCensus(playerId: number, round: number, population: number): void {
  getDb().query(`
    INSERT INTO census (player_id, round, population, submitted_at)
    VALUES (?,?,?,?)
    ON CONFLICT(player_id, round) DO UPDATE SET population=excluded.population, submitted_at=excluded.submitted_at
  `).run(playerId, round, population, new Date().toISOString());
}

export function submitCityCount(playerId: number, round: number, count: number): void {
  getDb().query(`
    INSERT INTO census (player_id, round, city_count)
    VALUES (?,?,?)
    ON CONFLICT(player_id, round) DO UPDATE SET city_count=excluded.city_count
  `).run(playerId, round, count);
}

export function allPlayersSubmitted(round: number): boolean {
  const db = getDb();
  const total = db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM players').get()!.count;
  if (total === 0) return false;
  const submitted = db.query<{ count: number }, [number]>(
    'SELECT COUNT(*) AS count FROM census WHERE round=? AND population IS NOT NULL'
  ).get(round)!.count;
  return submitted === total;
}

export function allCitiesSubmitted(round: number): boolean {
  const db = getDb();
  const total = db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM players').get()!.count;
  if (total === 0) return false;
  const submitted = db.query<{ count: number }, [number]>(
    'SELECT COUNT(*) AS count FROM census WHERE round=? AND city_count IS NOT NULL'
  ).get(round)!.count;
  return submitted === total;
}

export function clearCityCount(round: number): void {
  const db = getDb();
  db.query('UPDATE census SET city_count=NULL WHERE round=?').run(round);
  db.query('UPDATE game SET cities_phase=1 WHERE id=1').run();
}

// ── Civs reference ────────────────────────────────────────────────────────────

// civs rows are seeded once at boot and never mutated. Cache for the process
// lifetime; reset on test-DB swap.
let _civsCache: CivRefRow[] | null = null;
_onReset(() => { _civsCache = null; });

export function getAllCivs(): CivRefRow[] {
  if (_civsCache) return _civsCache;
  _civsCache = getDb().query<CivRefRow, []>('SELECT * FROM civs ORDER BY number ASC').all();
  return _civsCache;
}

export function getCivBySlug(slug: string): CivRefRow | null {
  return getDb().query<CivRefRow, [string]>('SELECT * FROM civs WHERE slug=?').get(slug) ?? null;
}

// ── Full state ────────────────────────────────────────────────────────────────

export function getFullState(): FullState {
  const game = getGame();
  const players = getPlayers();
  const census = getCensusForRound(game.current_round);
  const astLevels = getAstLevels();
  return { game, players, census, astLevels };
}
