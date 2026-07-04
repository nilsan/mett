/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Pure AST functions — no database dependencies.
// Imported by both src/models/ast.ts (server) and src/client/civ.ts (browser).

import { getCivAstProfile } from '../civs.js';
import type { PlayerRow, AstLevelRow, AstStatus } from '../types.js';

export type { AstStatus };

// ─── Structured requirement interface ─────────────────────────────────────────

export interface AstRequirement {
  cities: number;
  advCount?: number;
  advTier?: 'any' | 'medium' | 'expensive' | 'cheap';
  advVpTotal?: number;
  totalVp?: number;
  impossible?: true;
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
    { name: 'Start',             shortName: '',     expertReq: '',                                basicReq: '',                                levels: [0],             cls: 'age-start'   },
    { name: 'Stone Age',         shortName: 'S.A.', expertReq: 'No requirements',                 basicReq: 'No requirements',                 levels: [5, 10, 15, 20], cls: 'age-stone'   },
    { name: 'Early Bronze Age',  shortName: 'E.B.', expertReq: '3 Cities',                        basicReq: '2 Cities',                        levels: [25, 30, 35],    cls: 'age-ebronze' },
    { name: 'Middle Bronze Age', shortName: 'M.B.', expertReq: '3 Cities + 5 VP in Advances',     basicReq: '3 Cities + 3 Advances',           levels: [40, 45, 50],    cls: 'age-mbronze' },
    { name: 'Late Bronze Age',   shortName: 'L.B.', expertReq: '4 Cities + 12 Advances',          basicReq: '3 Cities + 3 Adv (≥100 VP each)', levels: [55, 60, 65],    cls: 'age-lbronze' },
    ...(expert ? [
      { name: 'Early Iron Age',  shortName: 'E.I.', expertReq: '5 Cities + 10 Adv ≤100 + 38 VP', basicReq: '',                                levels: [70],            cls: 'age-eiron'   },
      { name: 'Late Iron Age',   shortName: 'L.I.', expertReq: '6 Cities + 17 Adv ≤100 + 56 VP', basicReq: '',                                levels: [75, 80],        cls: 'age-liron'   },
    ] : [
      { name: 'Early Iron Age',  shortName: 'E.I.', expertReq: '',                                basicReq: '4 Cities + 2 Adv ≥200 VP each',  levels: [70],            cls: 'age-eiron'   },
      { name: 'Late Iron Age',   shortName: 'L.I.', expertReq: '',                                basicReq: '5 Cities + 3 Adv ≥200 VP each',  levels: [75],            cls: 'age-liron'   },
    ]),
  ] as AgeBand[];
}

/** Requirement-legend `<li>` items for the A.S.T. board, one per era. Shared by
 *  the status page and the player page so the two never drift. */
export function reqLegendItems(expert: boolean): string {
  return getAgeBands(expert)
    .filter(b => b.cls !== 'age-start' && b.name)
    .map(b => `<li><span class="ab-legend-dot ${b.cls}"></span><strong>${b.name}:</strong> ${expert ? b.expertReq : b.basicReq}</li>`)
    .join('');
}

// ─── Per-age requirement breakdown (player-page coloured list) ─────────────────

/** One checkable sub-condition of an age's requirement.
 *  - `cities`: dynamic — the empire's effective city count this round (goes up
 *     and down as calamities hit / cities are built).
 *  - `adv` / `vp`: advancement-based — monotonic in normal play (a player never
 *     loses an advancement card), so once met it stays met and never goes red
 *     again. */
export interface AgeReqPart {
  type: 'cities' | 'adv' | 'vp';
  n: number;
  tier?: AstRequirement['advTier'];
  label: string;
}
export interface AgeReqLine { cls: string; name: string; parts: AgeReqPart[]; }

/** Structured per-age requirements, mirroring the getAgeBands() legend text but
 *  broken into individually checkable parts so the player page can colour each
 *  green (reached) or red (still needed). Keep in sync with getAgeBands(). */
export function ageRequirements(expert: boolean): AgeReqLine[] {
  if (expert) return [
    { cls: 'age-stone',   name: 'Stone Age',         parts: [] },
    { cls: 'age-ebronze', name: 'Early Bronze Age',  parts: [{ type: 'cities', n: 3, label: '3 Cities' }] },
    { cls: 'age-mbronze', name: 'Middle Bronze Age', parts: [{ type: 'cities', n: 3, label: '3 Cities' }, { type: 'vp', n: 5, label: '5 VP in Advances' }] },
    { cls: 'age-lbronze', name: 'Late Bronze Age',   parts: [{ type: 'cities', n: 4, label: '4 Cities' }, { type: 'adv', n: 12, tier: 'any', label: '12 Advances' }] },
    { cls: 'age-eiron',   name: 'Early Iron Age',    parts: [{ type: 'cities', n: 5, label: '5 Cities' }, { type: 'adv', n: 10, tier: 'cheap', label: '10 Adv ≤100' }, { type: 'vp', n: 38, label: '38 VP' }] },
    { cls: 'age-liron',   name: 'Late Iron Age',     parts: [{ type: 'cities', n: 6, label: '6 Cities' }, { type: 'adv', n: 17, tier: 'cheap', label: '17 Adv ≤100' }, { type: 'vp', n: 56, label: '56 VP' }] },
  ];
  return [
    { cls: 'age-stone',   name: 'Stone Age',         parts: [] },
    { cls: 'age-ebronze', name: 'Early Bronze Age',  parts: [{ type: 'cities', n: 2, label: '2 Cities' }] },
    { cls: 'age-mbronze', name: 'Middle Bronze Age', parts: [{ type: 'cities', n: 3, label: '3 Cities' }, { type: 'adv', n: 3, tier: 'any', label: '3 Advances' }] },
    { cls: 'age-lbronze', name: 'Late Bronze Age',   parts: [{ type: 'cities', n: 3, label: '3 Cities' }, { type: 'adv', n: 3, tier: 'medium', label: '3 Adv ≥100' }] },
    { cls: 'age-eiron',   name: 'Early Iron Age',    parts: [{ type: 'cities', n: 4, label: '4 Cities' }, { type: 'adv', n: 2, tier: 'expensive', label: '2 Adv ≥200' }] },
    { cls: 'age-liron',   name: 'Late Iron Age',     parts: [{ type: 'cities', n: 5, label: '5 Cities' }, { type: 'adv', n: 3, tier: 'expensive', label: '3 Adv ≥200' }] },
  ];
}

/** Render the all-ages requirement legend for the player page, colouring each
 *  sub-condition green (reached) or red (still needed). City conditions use the
 *  empire's current effective city count (dynamic — flips as cities change);
 *  advancement conditions use the current card counts, which only ever rise in
 *  play, so once green they stay green. `cityCount === null` (not yet submitted)
 *  leaves the city part neutral. */
export function renderAgeRequirementsList(
  player: Pick<PlayerRow, 'adv_1vp' | 'adv_3vp' | 'adv_6vp' | 'adv_points' | 'wonder'>,
  cityCount: number | null,
  expert: boolean,
): string {
  const effCities = cityCount == null ? null : cityCount + (player.wonder ? 1 : 0);
  return ageRequirements(expert).map(line => {
    const dot = `<span class="ab-legend-dot ${line.cls}"></span><strong>${line.name}:</strong>`;
    if (!line.parts.length) {
      return `<li>${dot} <span class="req-part-none">No requirements</span></li>`;
    }
    // Colour only (no icons/gaps) and join with a compact " + " so each line
    // stays as narrow as the old white-text legend — otherwise, at large phone
    // font sizes the extra width forces requirements onto a second line.
    const parts = line.parts.map(part => {
      let met: boolean | null;
      if (part.type === 'cities') met = effCities == null ? null : effCities >= part.n;
      else if (part.type === 'adv') met = advancesOfTier(player, part.tier) >= part.n;
      else met = player.adv_points >= part.n;
      const state = met == null ? 'unknown' : met ? 'ok' : 'fail';
      return `<span class="req-part req-part-${state}">${part.label}</span>`;
    }).join('<span class="req-sep"> + </span>');
    return `<li>${dot} ${parts}</li>`;
  }).join('');
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

// ─── Advance counting and requirement access ───────────────────────────────────

/** Returns the number of advances a player holds at a given tier. */
export function advancesOfTier(player: Pick<PlayerRow, 'adv_1vp' | 'adv_3vp' | 'adv_6vp'>, tier: AstRequirement['advTier']): number {
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

  if (stoneEnd > 20 && currentLevel.level < stoneEnd) return true;

  if (!expert && (currentLevel.level === 35 || currentLevel.level === 40)) {
    if (currentLevel.level < ebaEnd) return cityCount >= 2;
  }

  const reqJson = expert ? currentLevel.expert_req_json : currentLevel.basic_req_json;
  const req: AstRequirement | null = reqJson ? JSON.parse(reqJson) : null;
  return checkRequirement(player, req, cityCount);
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
