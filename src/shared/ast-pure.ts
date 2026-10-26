/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Pure AST functions — no database dependencies.
// Imported by both src/models/ast.ts (server) and src/client/civ.ts (browser).

import { getCivAstProfile } from '../civs.js';
import type { PlayerRow, AstStatus } from '../types.js';

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

/** Last square on the A.S.T. board — basic mode ends at 75, so 80 is unreachable. */
export function maxAstLevel(expert: boolean): number {
  return expert ? 80 : 75;
}

/** The board levels in play for the given mode. */
export function boardLevels(expert: boolean): number[] {
  return AST_LEVELS.filter(l => l <= maxAstLevel(expert));
}

// ─── Age table — the single source of A.S.T. rules ─────────────────────────────
//
// One row per age: its display names, the default board squares it covers
// (per-civ Stone/EBA shifts live in getCivAstProfile), and the requirement an
// empire must meet to move onto a square of that age, per mode. Everything
// else — legends, tooltips, the player-page checklist and the advancement
// rule itself — is derived from this table.
//
// Tier values: 'any' = all advances, 'medium' = adv_3vp+adv_6vp (≥100 each),
//              'expensive' = adv_6vp (≥200 each), 'cheap' = adv_1vp (cost under 100 each, as the rulebook says).

export interface AgeBand {
  name: string;
  shortName: string;
  levels: number[];
  cls: string;
  /** Requirement to move onto a square of this age; null = free. */
  req: { expert: AstRequirement | null; basic: AstRequirement | null };
}

export const AGE_TABLE: readonly AgeBand[] = [
  { name: 'Start',             shortName: '',     levels: [0],             cls: 'age-start',
    req: { expert: null, basic: null } },
  { name: 'Stone Age',         shortName: 'S.A.', levels: [5, 10, 15, 20], cls: 'age-stone',
    req: { expert: null, basic: null } },
  { name: 'Early Bronze Age',  shortName: 'E.B.', levels: [25, 30, 35],    cls: 'age-ebronze',
    req: { expert: { cities: 3 },
           basic:  { cities: 2 } } },
  { name: 'Middle Bronze Age', shortName: 'M.B.', levels: [40, 45, 50],    cls: 'age-mbronze',
    req: { expert: { cities: 3, advVpTotal: 5 },
           basic:  { cities: 3, advCount: 3, advTier: 'any' } } },
  { name: 'Late Bronze Age',   shortName: 'L.B.', levels: [55, 60, 65],    cls: 'age-lbronze',
    req: { expert: { cities: 4, advCount: 12, advTier: 'any' },
           basic:  { cities: 3, advCount: 3, advTier: 'medium' } } },
  { name: 'Early Iron Age',    shortName: 'E.I.', levels: [70],            cls: 'age-eiron',
    req: { expert: { cities: 5, advCount: 10, advTier: 'cheap', totalVp: 38 },
           basic:  { cities: 4, advCount: 2, advTier: 'expensive' } } },
  { name: 'Late Iron Age',     shortName: 'L.I.', levels: [75, 80],        cls: 'age-liron',
    req: { expert: { cities: 6, advCount: 17, advTier: 'cheap', totalVp: 56 },
           basic:  { cities: 5, advCount: 3, advTier: 'expensive' } } },
];

/** Age bands with their squares trimmed to the mode's board. */
export function getAgeBands(expert: boolean): AgeBand[] {
  const max = maxAstLevel(expert);
  return AGE_TABLE.map(b => ({ ...b, levels: b.levels.filter(l => l <= max) }));
}

/** The age a board square belongs to by default (ignores per-civ shifts). */
export function ageOfLevel(level: number): AgeBand {
  return AGE_TABLE.find(b => b.levels.includes(level)) ?? AGE_TABLE[AGE_TABLE.length - 1]!;
}

/** Requirement to advance FROM `level` — i.e. the requirement of the age that
 *  holds the next square. `{ impossible: true }` on the last square; null when
 *  the next square is free. Per-civ overrides are applied in
 *  getAdvanceRequirement, not here. */
export function requirementFor(level: number, expert: boolean): AstRequirement | null {
  const next = level + 5;
  if (next > maxAstLevel(expert)) return { cities: 0, impossible: true };
  return ageOfLevel(next).req[expert ? 'expert' : 'basic'];
}

// ─── Requirement labels ───────────────────────────────────────────────────────

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

const TIER_LABEL: Record<NonNullable<AstRequirement['advTier']>, (n: number) => string> = {
  any:       n => `${n} Advances`,
  medium:    n => `${n} Adv ≥100`,
  expensive: n => `${n} Adv ≥200`,
  cheap:     n => `${n} Adv <100`,
};

/** Break a requirement into its labelled, individually checkable parts. */
export function requirementParts(req: AstRequirement | null): AgeReqPart[] {
  if (!req || req.impossible) return [];
  const parts: AgeReqPart[] = [];
  if (req.cities > 0) parts.push({ type: 'cities', n: req.cities, label: `${req.cities} Cities` });
  if (req.advVpTotal !== undefined) parts.push({ type: 'vp', n: req.advVpTotal, label: `${req.advVpTotal} VP in Advances` });
  if (req.advCount !== undefined) {
    const tier = req.advTier ?? 'any';
    parts.push({ type: 'adv', n: req.advCount, tier, label: TIER_LABEL[tier](req.advCount) });
  }
  if (req.totalVp !== undefined) parts.push({ type: 'vp', n: req.totalVp, label: `${req.totalVp} VP` });
  return parts;
}

/** Human-readable requirement, e.g. "5 Cities + 10 Adv <100 + 38 VP". */
export function describeRequirement(req: AstRequirement | null): string {
  if (req?.impossible) return 'N/A';
  const parts = requirementParts(req);
  return parts.length ? parts.map(p => p.label).join(' + ') : 'No requirements';
}

/** Tooltip for one A.S.T. board square: its age and what it takes to reach it. */
export function astNodeTitle(level: number, expert: boolean): string {
  const band = ageOfLevel(level);
  return level === 0 ? band.name : `${band.name}: ${describeRequirement(band.req[expert ? 'expert' : 'basic'])}`;
}

/** Requirement-legend `<li>` items for the A.S.T. board, one per era. Shared by
 *  the status page and the player page so the two never drift. */
export function reqLegendItems(expert: boolean): string {
  return AGE_TABLE
    .filter(b => b.cls !== 'age-start')
    .map(b => `<li><span class="ab-legend-dot ${b.cls}"></span><strong>${b.name}:</strong> ${describeRequirement(b.req[expert ? 'expert' : 'basic'])}</li>`)
    .join('');
}

// ─── Per-age requirement breakdown (player-page coloured list) ─────────────────

export interface AgeReqLine { cls: string; name: string; parts: AgeReqPart[]; }

/** Structured per-age requirements, broken into individually checkable parts
 *  so the player page can colour each green (reached) or red (still needed). */
export function ageRequirements(expert: boolean): AgeReqLine[] {
  return AGE_TABLE
    .filter(b => b.cls !== 'age-start')
    .map(b => ({ cls: b.cls, name: b.name, parts: requirementParts(b.req[expert ? 'expert' : 'basic']) }));
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

/** Requirement for a given civ to advance from `level`, applying the per-civ
 *  era profile: slow-start civs get extra free Stone Age squares, and in basic
 *  mode civs whose EBA runs to 40 only need 2 cities at 35/40. */
function civRequirementFor(civNumber: number, level: number, expert: boolean): AstRequirement | null {
  const { stoneEnd, ebaEnd } = getCivAstProfile(civNumber, expert);
  if (stoneEnd > 20 && level < stoneEnd) return null;
  if (!expert && (level === 35 || level === 40) && level < ebaEnd) return { cities: 2 };
  return requirementFor(level, expert);
}

/** Full AST advancement check from `level`, incorporating per-civ era profile overrides. */
export function meetsAstRequirements(
  player: PlayerRow,
  level: number,
  cityCount: number,
  expert: boolean,
): boolean {
  return checkRequirement(player, civRequirementFor(player.civ_number, level, expert), cityCount);
}

/**
 * Returns the effective AstRequirement a player must meet to advance from their current level,
 * accounting for per-civ Stone Age and EBA overrides.
 * Returns null when there is no requirement; `{ impossible: true }` on the last square.
 */
export function getAdvanceRequirement(
  player: Pick<PlayerRow, 'ast_level' | 'civ_number'>,
  expert: boolean,
): AstRequirement | null {
  return civRequirementFor(player.civ_number, player.ast_level, expert);
}

/** Predict next-round AST outcome for a player given their current city count. */
export function nextAstStatus(
  player: PlayerRow,
  cityCount: number | null | undefined,
  expert: boolean,
): AstStatus {
  if (cityCount == null) return 'unknown';

  const curIdx = AST_LEVELS.indexOf(player.ast_level);
  if (curIdx === -1) return 'unknown';

  const { stoneEnd } = getCivAstProfile(player.civ_number, expert);
  const inStoneAge = player.ast_level <= stoneEnd;
  const effectiveCityCount = cityCount + (player.wonder ? 1 : 0);

  if (expert && effectiveCityCount === 0 && !inStoneAge) return curIdx > 0 ? 'regress' : 'stay';
  if (curIdx >= AST_LEVELS.length - 1) return 'stay';

  return meetsAstRequirements(player, player.ast_level, effectiveCityCount, expert) ? 'advance' : 'stay';
}
