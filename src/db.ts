/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Public interface — re-exports from domain modules so callers need no import changes.
// Raw connection lives in src/services/db.ts
// Game flow lives in src/models/game.ts
// AST engine lives in src/models/ast.ts

export { getDb } from './services/db.js';

export type { GameRow, PlayerRow, CensusRow, FullState, CivRefRow, RoundSummary, RoundSummaryPlayer } from './types.js';

export type { AstRequirement } from './models/ast.js';
export {
  checkRequirement,
  meetsAstRequirements,
  autoAdvanceAst,
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
  advanceRoundWithSummary,
  getRoundSummaries,
} from './models/game.js';

// ─── CRUD (players, census, admin, civs, full state) ──────────────────────────

import { getDb, _onReset, PLAYER_SELECT } from './services/db.js';
import type { PlayerRow, CensusRow, FullState, CivRefRow, Region } from './types.js';
import { getGame, getRoundSummaries } from './models/game.js';
import { LIA_THRESHOLD, nextAstStatus, AST_LEVELS } from './models/ast.js';
import type { AstStatus } from './types.js';
import { advanceTotals, advanceFlags, creditChoiceOpen, type HeldAdvance, type CreditChoice } from './shared/advances.js';

// ── Admin password ─────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'node:crypto';
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

// ── Admin sessions ─────────────────────────────────────────────────────────────

/** Admin session lifetime — matches the cookie maxAge. */
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Start an admin session; returns the opaque token for the cookie. */
export function createAdminSession(): string {
  const token = randomBytes(32).toString('base64url');
  const db = getDb();
  db.query('DELETE FROM admin_sessions WHERE expires_at <= ?').run(Date.now());
  db.query('INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?,?)')
    .run(sha256(token), Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

/** Cheap lookup (one SHA-256) — safe to run on every admin request. */
export function isValidAdminSession(token: string | undefined): boolean {
  if (!token) return false;
  return !!getDb().query<{ ok: number }, [string, number]>(
    'SELECT 1 AS ok FROM admin_sessions WHERE token_hash=? AND expires_at > ?'
  ).get(sha256(token), Date.now());
}

/** Invalidate every admin session (password change). */
export function clearAdminSessions(): void {
  getDb().exec('DELETE FROM admin_sessions');
}

/** True when the current stored password is the built-in 'PASSWORD' default. */
export function isUsingDefaultPassword(): boolean {
  return verifyPassword('PASSWORD', getAdminPassword());
}

// ── Players ───────────────────────────────────────────────────────────────────

export function getPlayers(): PlayerRow[] {
  return getDb().query<PlayerRow, []>(PLAYER_SELECT).all();
}

export function playerExists(playerId: number): boolean {
  return !!getDb().query<{ ok: number }, [number]>('SELECT 1 AS ok FROM players WHERE id=?').get(playerId);
}

export function addPlayer(civId: number, name: string, region: Region): number {
  const result = getDb().query<{ id: number }, [number, string, Region]>(
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

export function toggleSpecial(playerId: number): number {
  const db = getDb();
  const current = db.query<{ special: number }, [number]>('SELECT special FROM players WHERE id=?').get(playerId);
  const next = current!.special ? 0 : 1;
  db.query('UPDATE players SET special=? WHERE id=?').run(next, playerId);
  return next;
}

export function setAstLevel(playerId: number, level: number): void {
  const db = getDb();
  // A deliberate level set via the admin dropdown supersedes any calamity
  // regression marker for this player — clear it so the red status-board cue
  // doesn't linger after a manual correction.
  db.query('UPDATE players SET ast_level=?, regressed=0 WHERE id=?').run(level, playerId);
  reevalFinalRound(db);
}

/** Regress a player one AST step (previous level in AST_LEVELS) and flag it so
 *  the status board shows a red marker on that empire's token — used by the GM
 *  to apply calamity-driven regressions. No-op (and no marker) if already at 0.
 *  Returns the new AST level. */
export function regressAst(playerId: number): number {
  const db = getDb();
  const cur = db.query<{ ast_level: number }, [number]>(
    'SELECT ast_level FROM players WHERE id=?'
  ).get(playerId);
  if (!cur) return 0;
  const idx = AST_LEVELS.indexOf(cur.ast_level);
  const prev = idx > 0 ? AST_LEVELS[idx - 1]! : 0;
  if (prev === cur.ast_level) return cur.ast_level; // already at Stone Age — nothing to regress
  db.query('UPDATE players SET ast_level=?, regressed=1 WHERE id=?').run(prev, playerId);
  reevalFinalRound(db);
  return prev;
}

/** Shared: if a player dropped below Late Iron Age, clear the expert end-trigger
 *  when no one is at LIA anymore. */
function reevalFinalRound(db: ReturnType<typeof getDb>): void {
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

type HeldAdvanceRow = { player_id: number; id: string; round: number; credit_choice: string | null };
const HELD_ADVANCE_SELECT = 'SELECT player_id, advance_id AS id, round, credit_choice FROM player_advances';

function toHeldAdvance(r: HeldAdvanceRow): HeldAdvance {
  return r.credit_choice ? { id: r.id, round: r.round, choice: JSON.parse(r.credit_choice) } : { id: r.id, round: r.round };
}

/** The advance cards a player holds, in purchase order. */
export function getPlayerAdvances(playerId: number): HeldAdvance[] {
  return getDb().query<HeldAdvanceRow, [number]>(`${HELD_ADVANCE_SELECT} WHERE player_id=? ORDER BY round, advance_id`)
    .all(playerId).map(toHeldAdvance);
}

/** Every player's advance cards, keyed by player id, in purchase order. */
export function getAllPlayerAdvances(): Record<number, HeldAdvance[]> {
  const out: Record<number, HeldAdvance[]> = {};
  for (const r of getDb().query<HeldAdvanceRow, []>(`${HELD_ADVANCE_SELECT} ORDER BY round, advance_id`).all()) {
    (out[r.player_id] ??= []).push(toHeldAdvance(r));
  }
  return out;
}

/** Set the colours of a held card's choice credits (Monument, Written Record).
 *  The choice is made once and kept all game: it can be made while none is
 *  set, or corrected in the round the card was bought; after that it is
 *  locked. Returns false when the player doesn't hold the card or the choice
 *  is locked. Validate `choice` with creditChoiceError first. */
export function setCreditChoice(playerId: number, advanceId: string, choice: CreditChoice, round: number,
  gm = false): boolean {
  const held = getPlayerAdvances(playerId).find(h => h.id === advanceId);
  if (!held || !(gm || creditChoiceOpen(held, round, getCardsConfirmed(playerId)))) return false;
  getDb().query('UPDATE player_advances SET credit_choice=? WHERE player_id=? AND advance_id=?')
    .run(JSON.stringify(choice), playerId, advanceId);
  return true;
}

/** The last round whose card purchase the player confirmed (0 = none). */
export function getCardsConfirmed(playerId: number): number {
  return getDb().query<{ n: number }, [number]>('SELECT cards_confirmed AS n FROM players WHERE id=?').get(playerId)?.n ?? 0;
}

/** Record that the player confirmed their card purchase in `round`, which
 *  locks it; 0 reopens it (the GM). */
export function setCardsConfirmed(playerId: number, round: number): void {
  getDb().query('UPDATE players SET cards_confirmed=? WHERE id=?').run(round, playerId);
}

/** Replace a player's advance cards with `ids` and derive the tier counts and
 *  the Military / Wonder / special-ability flags from them. Cards already held
 *  keep their purchase round and colour choice; new ones are bought in `round`.
 *  Unknown ids are the caller's to reject (see the API). */
export function setPlayerAdvances(playerId: number, ids: readonly string[], round: number): void {
  const db = getDb();
  const want = new Set(ids);
  db.transaction(() => {
    const had = new Map(getPlayerAdvances(playerId).map(h => [h.id, h]));
    db.query('DELETE FROM player_advances WHERE player_id=?').run(playerId);
    const ins = db.query('INSERT INTO player_advances (player_id, advance_id, round, credit_choice) VALUES (?, ?, ?, ?)');
    for (const id of want) {
      const h = had.get(id);
      ins.run(playerId, id, h?.round ?? round, h?.choice ? JSON.stringify(h.choice) : null);
    }
    const t = advanceTotals(want);
    setAdvCards(playerId, t.adv_1vp, t.adv_3vp, t.adv_6vp);
    const f = advanceFlags(want);
    db.query('UPDATE players SET military=?, wonder=?, special=? WHERE id=?').run(f.military, f.wonder, f.special, playerId);
  })();
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

/** Toggle a player's "units moved" flag for the given round. This is an
 *  optional readiness signal (neighbours can start) — it never gates phase
 *  or round advancement. Upserts a census row so it works even before the
 *  player has submitted a population. Returns the new value (0 or 1). */
export function toggleMoved(playerId: number, round: number): number {
  const db = getDb();
  const cur = db.query<{ moved: number }, [number, number]>(
    'SELECT moved FROM census WHERE player_id=? AND round=?'
  ).get(playerId, round);
  const next = cur?.moved ? 0 : 1;
  db.query(`
    INSERT INTO census (player_id, round, moved)
    VALUES (?,?,?)
    ON CONFLICT(player_id, round) DO UPDATE SET moved=excluded.moved
  `).run(playerId, round, next);
  return next;
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
  // Previous round's census is retained (advanceRound only prunes rounds strictly
  // older than the one just finished), so this is available for the last-known
  // city-count fallback used by the player-page requirement colouring.
  const prevCensus = game.current_round > 1 ? getCensusForRound(game.current_round - 1) : [];
  const expert = game.expert === 1;
  const censusByPlayer = new Map(census.map(c => [c.player_id, c]));
  const astStatus: Record<number, AstStatus> = {};
  for (const p of players) {
    astStatus[p.id] = nextAstStatus(p, censusByPlayer.get(p.id)?.city_count, expert);
  }
  const roundSummaries = getRoundSummaries();
  const advances = getAllPlayerAdvances();
  return { game, players, census, prevCensus, astStatus, roundSummaries, advances };
}
