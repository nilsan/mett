import { getDb, _onReset, PLAYER_SELECT } from '../services/db.js';
import { getCivAstProfile } from '../civs.js';
import type { PlayerRow, AstLevelRow } from '../types.js';

// ─── Structured requirement interface ─────────────────────────────────────────

export interface AstRequirement {
  cities: number;
  advCount?: number;
  advTier?: 'any' | 'medium' | 'expensive' | 'cheap';
  advVpTotal?: number;  // "X VP in advances" — total adv_points needed
  totalVp?: number;     // VP floor alongside advance-count requirement
  impossible?: true;    // N/A — cannot advance
}

// ─── Requirement checking ──────────────────────────────────────────────────────

/** Check a single structured requirement. null means "no requirement" — always passes. */
export function checkRequirement(
  player: PlayerRow,
  req: AstRequirement | null,
  cityCount: number,
): boolean {
  if (!req) return true;
  if (req.impossible) return false;
  if (cityCount < req.cities) return false;

  if (req.advVpTotal !== undefined) {
    return player.adv_points >= req.advVpTotal;
  }

  if (req.advCount !== undefined) {
    if (advancesOfTier(player, req.advTier) < req.advCount) return false;
    if (req.totalVp !== undefined && player.adv_points < req.totalVp) return false;
  }

  return true;
}

export type AstStatus = 'advance' | 'stay' | 'regress' | 'unknown';

/** Predict next-round AST outcome for a player given their current city count. */
export function nextAstStatus(
  player: PlayerRow,
  cityCount: number | null | undefined,
  levels: AstLevelRow[],
  expert: boolean,
): AstStatus {
  if (cityCount == null) return 'unknown';

  const levelNums = levels.map(l => l.level);
  const curIdx = levelNums.indexOf(player.ast_level);
  if (curIdx === -1) return 'unknown';

  const { stoneEnd } = getCivAstProfile(player.civ_number, expert);
  const inStoneAge = player.ast_level <= stoneEnd;
  const effectiveCityCount = cityCount + (player.wonder ? 1 : 0);

  if (expert && effectiveCityCount === 0 && !inStoneAge) return curIdx > 0 ? 'regress' : 'stay';
  if (curIdx >= levels.length - 1) return 'stay';

  const currentLevel = levels[curIdx]!;
  return meetsAstRequirements(player, currentLevel, effectiveCityCount, expert) ? 'advance' : 'stay';
}

/** Full AST advancement check, incorporating per-civ era profile overrides. */
export function meetsAstRequirements(
  player: PlayerRow,
  currentLevel: AstLevelRow,
  cityCount: number,
  expert: boolean,
): boolean {
  const { stoneEnd, ebaEnd } = getCivAstProfile(player.civ_number, expert);

  // Slow-start civs (stoneEnd=25): levels strictly inside Stone Age are free
  if (stoneEnd > 20 && currentLevel.level < stoneEnd) return true;

  // Basic mode: slow-start and late-start civs still within EBA only need 2 cities
  if (!expert && (currentLevel.level === 35 || currentLevel.level === 40)) {
    if (currentLevel.level < ebaEnd) return cityCount >= 2;
  }

  const reqJson = expert ? currentLevel.expert_req_json : currentLevel.basic_req_json;
  const req: AstRequirement | null = reqJson ? JSON.parse(reqJson) : null;
  return checkRequirement(player, req, cityCount);
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const AST_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];

/** AST level at which an empire enters Late Iron Age — triggers LIA bonus eligibility. */
export const LIA_THRESHOLD = 75;

/** Maximum population each empire can hold on the table. */
export const MAX_POPULATION = 55;

/** Maximum cities an empire can have on the board. */
export const MAX_CITIES = 9;

// ─── Display utilities ────────────────────────────────────────────────────────

export interface AgeBand {
  name: string;
  shortName: string;
  expertReq: string;
  basicReq: string;
  levels: number[];
  cls: string;
}

export function getAgeBands(expert: boolean): AgeBand[] {
  return [
    { name: 'Start',             shortName: '',          expertReq: '',                                basicReq: '',                                levels: [0],             cls: 'age-start'   },
    { name: 'Stone Age',         shortName: 'Stone',     expertReq: 'No requirements',                 basicReq: 'No requirements',                 levels: [5, 10, 15, 20], cls: 'age-stone'   },
    { name: 'Early Bronze Age',  shortName: 'E. Bronze', expertReq: '3 Cities',                        basicReq: '2 Cities',                        levels: [25, 30, 35],    cls: 'age-ebronze' },
    { name: 'Middle Bronze Age', shortName: 'M. Bronze', expertReq: '3 Cities + 5 VP in Advances',     basicReq: '3 Cities + 3 Advances',           levels: [40, 45, 50],    cls: 'age-mbronze' },
    { name: 'Late Bronze Age',   shortName: 'L. Bronze', expertReq: '4 Cities + 12 Advances',          basicReq: '3 Cities + 3 Adv (≥100 VP each)', levels: [55, 60, 65],    cls: 'age-lbronze' },
    ...(expert ? [
      { name: 'Early Iron Age',  shortName: 'E.I.',      expertReq: '5 Cities + 10 Adv ≤100 + 38 VP', basicReq: '',                                levels: [70],            cls: 'age-eiron'   },
      { name: 'Late Iron Age',   shortName: 'L. Iron',   expertReq: '6 Cities + 17 Adv ≤100 + 56 VP', basicReq: '',                                levels: [75, 80],        cls: 'age-liron'   },
    ] : [
      { name: 'Early Iron Age',  shortName: 'E.I.',      expertReq: '',                                basicReq: '4 Cities + 2 Adv ≥200 VP each',  levels: [70],            cls: 'age-eiron'   },
      { name: 'Late Iron Age',   shortName: 'L. Iron',   expertReq: '',                                basicReq: '5 Cities + 3 Adv ≥200 VP each',  levels: [75],            cls: 'age-liron'   },
    ]),
  ] as AgeBand[];
}

/** CSS age-band class for a single player cell on the AST board. */
export function civBandClass(civNumber: number, level: number, expert: boolean): string {
  if (level === 0) return 'age-start';
  const { stoneEnd, ebaEnd } = getCivAstProfile(civNumber, expert);
  if (level <= stoneEnd) return 'age-stone';
  if (level <= ebaEnd)   return 'age-ebronze';
  if (level <= 50)       return 'age-mbronze';
  if (level <= 65)       return 'age-lbronze';
  if (level === 70)      return 'age-eiron';
  return 'age-liron';
}

/** True when this AST level is the last cell of its age band for this empire. */
export function isAgeEnd(civNumber: number, level: number, expert: boolean): boolean {
  const { stoneEnd, ebaEnd } = getCivAstProfile(civNumber, expert);
  const liaEnd = expert ? 80 : 75;
  return level === stoneEnd || level === ebaEnd || level === 50 || level === 65 || level === 70 || level === liaEnd;
}

// ─── Advance requirement access ────────────────────────────────────────────────

/** Returns the number of advances a player holds at a given tier. */
export function advancesOfTier(player: Pick<PlayerRow, 'adv_1vp' | 'adv_3vp' | 'adv_6vp'>, tier: AstRequirement['advTier']): number {
  switch (tier) {
    case 'expensive': return player.adv_6vp;
    case 'medium':    return player.adv_3vp + player.adv_6vp;
    case 'cheap':     return player.adv_1vp;
    default:          return player.adv_1vp + player.adv_3vp + player.adv_6vp;
  }
}

/**
 * Returns the effective AstRequirement a player must meet to advance from their current level,
 * accounting for per-civ Stone Age and EBA overrides.
 * Returns null when there is no requirement (always advances or already at max).
 */
export function getAdvanceRequirement(
  player: Pick<PlayerRow, 'ast_level' | 'civ_number'>,
  levels: AstLevelRow[],
  expert: boolean,
): AstRequirement | null {
  const curIdx = levels.findIndex(l => l.level === player.ast_level);
  if (curIdx < 0 || curIdx >= levels.length - 1) return null;
  const currentLevel = levels[curIdx]!;
  const { stoneEnd, ebaEnd } = getCivAstProfile(player.civ_number, expert);
  if (stoneEnd > 20 && currentLevel.level < stoneEnd) return null;
  if (!expert && (currentLevel.level === 35 || currentLevel.level === 40)) {
    if (currentLevel.level < ebaEnd) return { cities: 2 };
  }
  const reqJson = expert ? currentLevel.expert_req_json : currentLevel.basic_req_json;
  return reqJson ? (JSON.parse(reqJson) as AstRequirement) : null;
}

// ─── AST auto-advancement ──────────────────────────────────────────────────────

export function autoAdvanceAst(round: number, expert: boolean): void {
  const db = getDb();
  const players = db.query<PlayerRow, []>(PLAYER_SELECT).all();
  const censusRows = db.query<{ player_id: number; city_count: number | null }, [number]>(
    'SELECT player_id, city_count FROM census WHERE round=?'
  ).all(round);
  const astRows = db.query<AstLevelRow, []>('SELECT * FROM ast_levels ORDER BY level ASC').all();

  for (const player of players) {
    const cityEntry = censusRows.find(c => c.player_id === player.id);
    const cityCount = cityEntry?.city_count ?? 0;
    const effectiveCityCount = cityCount + (player.wonder ? 1 : 0);
    const curIdx = AST_LEVELS.indexOf(player.ast_level);
    if (curIdx === -1) continue;

    const { stoneEnd } = getCivAstProfile(player.civ_number, expert);
    const inStoneAge = player.ast_level <= stoneEnd;

    if (expert && effectiveCityCount === 0 && !inStoneAge) {
      if (curIdx > 0) {
        db.query('UPDATE players SET ast_level=? WHERE id=?').run(AST_LEVELS[curIdx - 1]!, player.id);
      }
    } else if (curIdx < AST_LEVELS.length - 1) {
      const currentLevelRow = astRows.find(r => r.level === player.ast_level);
      if (currentLevelRow && meetsAstRequirements(player, currentLevelRow, effectiveCityCount, expert)) {
        db.query('UPDATE players SET ast_level=? WHERE id=?').run(AST_LEVELS[curIdx + 1]!, player.id);
      }
    }
  }
}

// ─── AST level queries ─────────────────────────────────────────────────────────

// ast_levels rows are seeded once at boot and never mutated, so cache the
// result for the lifetime of the process. Reset on test-DB swap.
let _astLevelsCache: AstLevelRow[] | null = null;
_onReset(() => { _astLevelsCache = null; });

export function getAstLevels(): AstLevelRow[] {
  if (_astLevelsCache) return _astLevelsCache;
  _astLevelsCache = getDb().query<AstLevelRow, []>('SELECT * FROM ast_levels ORDER BY level ASC').all();
  return _astLevelsCache;
}

export function getAstLevel(level: number): AstLevelRow | null {
  return getDb().query<AstLevelRow, [number]>('SELECT * FROM ast_levels WHERE level=?').get(level) ?? null;
}
