import { Database } from 'bun:sqlite';
import { readFileSync } from 'fs';
import { join } from 'path';
import { LATE_BRONZE_BASIC, LATE_BRONZE_EXPERT } from './civs.js';

const DB_PATH = process.env.DATABASE_PATH ?? join(import.meta.dir, '..', 'data', 'mett.db');

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH, { create: true });
    _db.exec('PRAGMA journal_mode=WAL;');
    _db.exec('PRAGMA foreign_keys=ON;');
    const schema = readFileSync(join(import.meta.dir, '..', 'db', 'schema.sql'), 'utf8');
    _db.exec(schema);
    // Migrations — catch only "duplicate column name" (expected on re-run); rethrow real errors
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
    migrate('ALTER TABLE players ADD COLUMN ast_moved INTEGER NOT NULL DEFAULT 0');
    migrate('ALTER TABLE game ADD COLUMN is_final_round INTEGER NOT NULL DEFAULT 0');
    migrate('ALTER TABLE players ADD COLUMN late_iron_age_bonus INTEGER NOT NULL DEFAULT 0');
  }
  return _db;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GameRow {
  id: number;
  expert: number;
  current_round: number;
  active: number;
  census_revealed: number;
  is_final_round: number;
  started_at: string | null;
}

export interface PlayerRow {
  id: number;
  civ_id: number;
  name: string;
  military: number;
  ast_level: number;
  adv_points: number;
  adv_1vp: number;
  adv_3vp: number;
  adv_6vp: number;
  region: string;
  rank_order: number;
  late_iron_age_bonus: number;
  // joined from civs
  civ_number: number;
  civ_name: string;
  civ_slug: string;
  civ_color: string;
  civ_text_color: string;
}

export interface CensusRow {
  id: number;
  player_id: number;
  round: number;
  population: number | null;
  city_count: number | null;
  submitted_at: string | null;
}

export interface AstLevelRow {
  level: number;
  era: string;
  basic_req: string | null;
  expert_req: string | null;
}

export interface FullState {
  game: GameRow;
  players: PlayerRow[];
  census: CensusRow[];
  astLevels: AstLevelRow[];
}

// ─── Game ─────────────────────────────────────────────────────────────────────

export function getGame(): GameRow {
  const db = getDb();
  return db.query<GameRow, []>('SELECT * FROM game WHERE id = 1').get() as GameRow;
}

export function startGame(expert: number): void {
  const db = getDb();
  // Clear existing players + census
  db.exec('DELETE FROM census');
  db.exec('DELETE FROM players');
  db.query('UPDATE game SET expert=?, current_round=1, active=1, census_revealed=0, is_final_round=0, started_at=? WHERE id=1')
    .run(expert, new Date().toISOString());
}

export function resetGame(): void {
  const db = getDb();
  db.exec('DELETE FROM census');
  db.exec('DELETE FROM players');
  db.query('UPDATE game SET active=0, current_round=1, census_revealed=0, is_final_round=0, started_at=NULL WHERE id=1').run();
}

const AST_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];

// The requirement stored AT a level is the requirement to advance FROM that level.
// e.g. to advance from 45 to 50, check level 45's requirement — not level 50's.
function meetsAstRequirements(player: PlayerRow, currentLevel: AstLevelRow, cityCount: number, expert: boolean): boolean {
  // Slow-start empires treat level 20 as Stone Age — no requirement to advance from it
  const lateSet = expert ? LATE_BRONZE_EXPERT : LATE_BRONZE_BASIC;
  if (currentLevel.level === 20 && lateSet.has(player.civ_number)) return true;

  const req = expert ? currentLevel.expert_req : currentLevel.basic_req;
  if (!req || req === 'None') return true;   // no requirement → always advance
  if (req === 'N/A') return false;            // cannot advance (e.g. basic at 75+)

  const cityMatch = req.match(/(\d+) cities/);
  if (!cityMatch) return false;
  if (cityCount < parseInt(cityMatch[1], 10)) return false;

  if (req.includes('all 17 advances')) {
    if (player.adv_1vp < 17) return false;
    const vpM = req.match(/\+ (\d+) VP/);
    if (vpM && player.adv_points < parseInt(vpM[1], 10)) return false;
    return true;
  }

  // "VP in advances" must be checked before the advance-count regex, because
  // /(\d+) advances/ does NOT match "5 VP in advances" (no digit before "advances")
  // and would incorrectly fall through to the "cities only" early return.
  if (req.includes('VP in advances')) {
    const vpM = req.match(/(\d+) VP in advances/);
    return !vpM || player.adv_points >= parseInt(vpM[1], 10);
  }

  const advM = req.match(/(\d+) advances/);
  if (!advM) return true;  // cities-only requirement
  const reqAdv = parseInt(advM[1], 10);

  if (req.includes('≥200 each')) return player.adv_6vp >= reqAdv;
  if (req.includes('≥100 each')) return (player.adv_3vp + player.adv_6vp) >= reqAdv;
  if (req.includes('<100 each')) {
    if (player.adv_1vp < reqAdv) return false;
    const vpM = req.match(/\+ (\d+) VP/);
    if (vpM && player.adv_points < parseInt(vpM[1], 10)) return false;
    return true;
  }
  // Plain advance count
  return (player.adv_1vp + player.adv_3vp + player.adv_6vp) >= reqAdv;
}

function autoAdvanceAst(round: number, expert: boolean): void {
  const db = getDb();
  const players = getPlayers();
  const censusRows = db.query<{ player_id: number; city_count: number | null }, [number]>(
    'SELECT player_id, city_count FROM census WHERE round=?'
  ).all(round);
  const astRows = db.query<AstLevelRow, []>('SELECT * FROM ast_levels ORDER BY level ASC').all();

  const lateSet = expert ? LATE_BRONZE_EXPERT : LATE_BRONZE_BASIC;

  for (const player of players) {
    const cityEntry = censusRows.find(c => c.player_id === player.id);
    const cityCount = cityEntry?.city_count ?? 0;
    const curIdx = AST_LEVELS.indexOf(player.ast_level);
    if (curIdx === -1) continue;

    // Stone Age extends one level further for slow-start empires
    const stoneAgeMax = lateSet.has(player.civ_number) ? 20 : 15;
    const inStoneAge = player.ast_level <= stoneAgeMax;

    if (cityCount === 0 && !inStoneAge) {
      // Regress one step — only outside Stone Age (Stone Age req is "None", 0 cities is fine)
      if (curIdx > 0) {
        db.query('UPDATE players SET ast_level=? WHERE id=?').run(AST_LEVELS[curIdx - 1], player.id);
      }
    } else if (curIdx < AST_LEVELS.length - 1) {
      const currentLevelRow = astRows.find(r => r.level === player.ast_level);
      if (currentLevelRow && meetsAstRequirements(player, currentLevelRow, cityCount, expert)) {
        db.query('UPDATE players SET ast_level=? WHERE id=?').run(AST_LEVELS[curIdx + 1], player.id);
      }
    }
  }
}

export function advanceRound(): number {
  const db = getDb();
  const game = getGame();
  // Auto-advance/regress AST from this round's city counts before incrementing
  autoAdvanceAst(game.current_round, game.expert === 1);
  checkAndSetLateIronAgeBonus();
  checkAndSetFinalRound();
  const nextRound = game.current_round + 1;
  db.query('UPDATE game SET current_round=?, census_revealed=0 WHERE id=1').run(nextRound);
  return nextRound;
}

export function endGame(): void {
  getDb().query('UPDATE game SET active=0, is_final_round=0 WHERE id=1').run();
}

/** After an AST level change, check if the game-end condition is met.
 *  Expert: first player reaches 75 → is_final_round = 1 (one more full round).
 *  Basic:  first player reaches 80 → is_final_round = 1 immediately.
 */
export function checkAndSetFinalRound(): void {
  const db = getDb();
  const game = getGame();
  if (!game.active || game.is_final_round) return; // already triggered or inactive
  const trigger = game.expert ? 75 : 80;
  const hit = db.query<{ count: number }, [number]>(
    'SELECT COUNT(*) AS count FROM players WHERE ast_level >= ?'
  ).get(trigger);
  if (hit && hit.count > 0) {
    db.query('UPDATE game SET is_final_round=1 WHERE id=1').run();
  }
}

export function revealCensus(): void {
  const db = getDb();
  db.query('UPDATE game SET census_revealed=1 WHERE id=1').run();
}

export function setRound(round: number): void {
  getDb().query('UPDATE game SET current_round=? WHERE id=1').run(round);
}

// ─── Players ──────────────────────────────────────────────────────────────────

const PLAYER_SELECT = `
  SELECT
    p.id, p.civ_id, p.name, p.military, p.ast_level, p.adv_points,
    p.adv_1vp, p.adv_3vp, p.adv_6vp, p.region, p.rank_order, p.late_iron_age_bonus,
    c.number AS civ_number, c.name AS civ_name, c.slug AS civ_slug,
    c.color AS civ_color, c.text_color AS civ_text_color
  FROM players p
  JOIN civs c ON c.id = p.civ_id
  ORDER BY c.number ASC
`;

export function getPlayers(): PlayerRow[] {
  return getDb().query<PlayerRow, []>(PLAYER_SELECT).all();
}

export function addPlayer(civId: number, name: string, region: string): number {
  const db = getDb();
  // rank_order=0 means unresolved; civ_number used as fallback for stable sort
  const result = db.query<{ id: number }, [number, string, string]>(
    'INSERT INTO players (civ_id, name, region, military, ast_level, adv_points, rank_order) VALUES (?,?,?,0,0,0,0) RETURNING id'
  ).get(civId, name, region);
  return result!.id;
}

export function setRankOrder(playerId: number, rankOrder: number): void {
  getDb().query('UPDATE players SET rank_order=? WHERE id=?').run(rankOrder, playerId);
}

/** Grant the Late Iron Age bonus (5VP) to one player exclusively, or clear it. */
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

export function setAstLevel(playerId: number, level: number): void {
  getDb().query('UPDATE players SET ast_level=? WHERE id=?').run(level, playerId);
}

/** After any AST update, grant the Late Iron Age bonus (5VP) to the one player
 *  who is first to reach level 70, if no one has been granted it yet.
 *  If multiple players are already at 70+, no automatic grant (split arrival).
 */
export function checkAndSetLateIronAgeBonus(): void {
  const db = getDb();
  const alreadyGranted = db.query<{ count: number }, []>(
    'SELECT COUNT(*) AS count FROM players WHERE late_iron_age_bonus=1'
  ).get()!.count;
  if (alreadyGranted > 0) return;
  const atLIA = db.query<{ id: number }, []>(
    'SELECT id FROM players WHERE ast_level >= 70'
  ).all();
  if (atLIA.length === 1) {
    db.query('UPDATE players SET late_iron_age_bonus=1 WHERE id=?').run(atLIA[0].id);
  }
}

export function setAdvPoints(playerId: number, points: number): void {
  getDb().query('UPDATE players SET adv_points=? WHERE id=?').run(points, playerId);
}

export function setAdvCards(playerId: number, v1: number, v3: number, v6: number): void {
  const total = v1 * 1 + v3 * 3 + v6 * 6;
  getDb().query('UPDATE players SET adv_1vp=?, adv_3vp=?, adv_6vp=?, adv_points=? WHERE id=?')
    .run(v1, v3, v6, total, playerId);
}

// ─── Census ───────────────────────────────────────────────────────────────────

export function getCensusForRound(round: number): CensusRow[] {
  return getDb().query<CensusRow, [number]>(
    'SELECT * FROM census WHERE round=?'
  ).all(round);
}

export function getPlayerCensus(playerId: number, round: number): CensusRow | null {
  return getDb().query<CensusRow, [number, number]>(
    'SELECT * FROM census WHERE player_id=? AND round=?'
  ).get(playerId, round) ?? null;
}

export function submitCensus(playerId: number, round: number, population: number): void {
  const db = getDb();
  db.query(`
    INSERT INTO census (player_id, round, population, submitted_at)
    VALUES (?,?,?,?)
    ON CONFLICT(player_id, round) DO UPDATE SET population=excluded.population, submitted_at=excluded.submitted_at
  `).run(playerId, round, population, new Date().toISOString());
}

export function submitCityCount(playerId: number, round: number, count: number): void {
  const db = getDb();
  db.query(`
    INSERT INTO census (player_id, round, city_count)
    VALUES (?,?,?)
    ON CONFLICT(player_id, round) DO UPDATE SET city_count=excluded.city_count
  `).run(playerId, round, count);
}

export function allPlayersSubmitted(round: number): boolean {
  const db = getDb();
  const players = getPlayers();
  if (players.length === 0) return false;
  const submitted = db.query<{ count: number }, [number]>(
    'SELECT COUNT(*) AS count FROM census WHERE round=? AND population IS NOT NULL'
  ).get(round);
  return submitted!.count === players.length;
}

export function allCitiesSubmitted(round: number): boolean {
  const db = getDb();
  const players = getPlayers();
  if (players.length === 0) return false;
  const submitted = db.query<{ count: number }, [number]>(
    'SELECT COUNT(*) AS count FROM census WHERE round=? AND city_count IS NOT NULL'
  ).get(round);
  return submitted!.count === players.length;
}


// ─── AST ──────────────────────────────────────────────────────────────────────

export function getAstLevels(): AstLevelRow[] {
  return getDb().query<AstLevelRow, []>('SELECT * FROM ast_levels ORDER BY level ASC').all();
}

export function getAstLevel(level: number): AstLevelRow | null {
  return getDb().query<AstLevelRow, [number]>('SELECT * FROM ast_levels WHERE level=?').get(level) ?? null;
}

// ─── Full state ───────────────────────────────────────────────────────────────

export function getFullState(): FullState {
  const game = getGame();
  const players = getPlayers();
  const census = getCensusForRound(game.current_round);
  const astLevels = getAstLevels();
  return { game, players, census, astLevels };
}

// ─── Civs reference ───────────────────────────────────────────────────────────

export interface CivRefRow {
  id: number;
  number: number;
  name: string;
  slug: string;
  color: string;
  text_color: string;
  def_region: string;
}

export function getAllCivs(): CivRefRow[] {
  return getDb().query<CivRefRow, []>('SELECT * FROM civs ORDER BY number ASC').all();
}

export function getCivBySlug(slug: string): CivRefRow | null {
  return getDb().query<CivRefRow, [string]>('SELECT * FROM civs WHERE slug=?').get(slug) ?? null;
}
