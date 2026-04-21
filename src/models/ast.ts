import { getDb } from '../services/db.js';
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

function advancesOfTier(player: PlayerRow, tier: AstRequirement['advTier']): number {
  switch (tier) {
    case 'expensive': return player.adv_6vp;
    case 'medium':    return player.adv_3vp + player.adv_6vp;
    case 'cheap':     return player.adv_1vp;
    default:          return player.adv_1vp + player.adv_3vp + player.adv_6vp;
  }
}

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
  // Use structured JSON requirement when available (production — always seeded on startup).
  // Falls back to regex for AstLevelRow stubs that omit the json fields (unit tests).
  if (reqJson !== undefined) {
    const req: AstRequirement | null = reqJson ? JSON.parse(reqJson) : null;
    return checkRequirement(player, req, cityCount);
  }
  return legacyTextCheck(player, currentLevel, cityCount, expert);
}

/** Regex-based fallback — used only when req_json columns are absent (test stubs). */
function legacyTextCheck(
  player: PlayerRow,
  currentLevel: AstLevelRow,
  cityCount: number,
  expert: boolean,
): boolean {
  const req = expert ? currentLevel.expert_req : currentLevel.basic_req;
  if (!req || req === 'None') return true;
  if (req === 'N/A') return false;

  const cityMatch = req.match(/(\d+) cities/);
  if (!cityMatch) return false;
  if (cityCount < parseInt(cityMatch[1], 10)) return false;

  if (req.includes('all 17 advances')) {
    if (player.adv_1vp < 17) return false;
    const vpM = req.match(/\+ (\d+) VP/);
    if (vpM && player.adv_points < parseInt(vpM[1], 10)) return false;
    return true;
  }
  if (req.includes('VP in advances')) {
    const vpM = req.match(/(\d+) VP in advances/);
    return !vpM || player.adv_points >= parseInt(vpM[1], 10);
  }
  const advM = req.match(/(\d+) advances/);
  if (!advM) return true;
  const reqAdv = parseInt(advM[1], 10);
  if (req.includes('≥200 each')) return player.adv_6vp >= reqAdv;
  if (req.includes('≥100 each')) return (player.adv_3vp + player.adv_6vp) >= reqAdv;
  if (req.includes('<100 each')) {
    if (player.adv_1vp < reqAdv) return false;
    const vpM = req.match(/\+ (\d+) VP/);
    if (vpM && player.adv_points < parseInt(vpM[1], 10)) return false;
    return true;
  }
  return (player.adv_1vp + player.adv_3vp + player.adv_6vp) >= reqAdv;
}

// ─── AST auto-advancement ──────────────────────────────────────────────────────

const AST_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];

const PLAYER_SELECT = `
  SELECT
    p.id, p.civ_id, p.name, p.military, p.wonder, p.ast_level, p.adv_points,
    p.adv_1vp, p.adv_3vp, p.adv_6vp, p.region, p.rank_order, p.late_iron_age_bonus,
    c.number AS civ_number, c.name AS civ_name, c.slug AS civ_slug,
    c.color AS civ_color, c.text_color AS civ_text_color
  FROM players p
  JOIN civs c ON c.id = p.civ_id
  ORDER BY c.number ASC
`;

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
        db.query('UPDATE players SET ast_level=? WHERE id=?').run(AST_LEVELS[curIdx - 1], player.id);
      }
    } else if (curIdx < AST_LEVELS.length - 1) {
      const currentLevelRow = astRows.find(r => r.level === player.ast_level);
      if (currentLevelRow && meetsAstRequirements(player, currentLevelRow, effectiveCityCount, expert)) {
        db.query('UPDATE players SET ast_level=? WHERE id=?').run(AST_LEVELS[curIdx + 1], player.id);
      }
    }
  }
}

// ─── AST level queries ─────────────────────────────────────────────────────────

export function getAstLevels(): AstLevelRow[] {
  return getDb().query<AstLevelRow, []>('SELECT * FROM ast_levels ORDER BY level ASC').all();
}

export function getAstLevel(level: number): AstLevelRow | null {
  return getDb().query<AstLevelRow, [number]>('SELECT * FROM ast_levels WHERE level=?').get(level) ?? null;
}
