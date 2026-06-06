/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Pure scoring and ranking functions — no database dependencies.
// Imported by both src/models/game.ts (server) and src/client/civ.ts (browser).

import type { PlayerRow } from '../types.js';

export function playerTotalVp(p: Pick<PlayerRow, 'ast_level' | 'adv_points' | 'late_iron_age_bonus'>, cityCount: number | null | undefined): number {
  return p.ast_level + p.adv_points + (cityCount ?? 0) + (p.late_iron_age_bonus ? 5 : 0);
}

export interface ScoreEntry {
  total: number;
  ast_level: number;
  adv_6vp: number;
  adv_3vp: number;
  rank_order: number;
  civ_number: number;
}

export function makeScoreEntry(
  p: Pick<PlayerRow, 'ast_level' | 'adv_points' | 'late_iron_age_bonus' | 'adv_6vp' | 'adv_3vp' | 'rank_order' | 'civ_number'>,
  cityVp: number,
): ScoreEntry {
  return {
    total: playerTotalVp(p, cityVp),
    ast_level: p.ast_level,
    adv_6vp: p.adv_6vp,
    adv_3vp: p.adv_3vp,
    rank_order: p.rank_order,
    civ_number: p.civ_number,
  };
}

// `final` selects the tiebreak policy. At game over (final=true, the default)
// equal totals are broken by AST position then by holding higher-denomination
// advance cards (6-VP, then 3-VP). During active play (final=false) ranking is
// by Total VP ALONE — those breakdown tiebreakers are hidden info and must not
// reorder players whose visible Total VP is equal; genuine ties show as tied
// and are resolved manually via the rank dropdowns. City VP is likewise
// excluded from totals during play (see the callers' cityVp helpers).
export function compareScores(a: ScoreEntry, b: ScoreEntry, final = true): number {
  if (b.total !== a.total) return b.total - a.total;
  if (final) {
    if (b.ast_level !== a.ast_level) return b.ast_level - a.ast_level;
    if (b.adv_6vp !== a.adv_6vp) return b.adv_6vp - a.adv_6vp;
    if (b.adv_3vp !== a.adv_3vp) return b.adv_3vp - a.adv_3vp;
  }
  return (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number);
}

export function sameScoreGroup(a: ScoreEntry, b: ScoreEntry, final = true): boolean {
  if (a.total !== b.total) return false;
  if (!final) return true;
  return a.ast_level === b.ast_level && a.adv_6vp === b.adv_6vp && a.adv_3vp === b.adv_3vp;
}

export interface TieGroupMeta {
  displayRank: number;
  tied: boolean;
  groupStart: boolean;
  resolved: boolean;
  groupPositions: number[];
  groupMemberIndices: number[];
}

export function computeTieGroupMeta(entries: Array<ScoreEntry & { rank_order: number }>, final = true): TieGroupMeta[] {
  const meta: TieGroupMeta[] = new Array(entries.length);
  let pos = 1, gi = 0;
  while (gi < entries.length) {
    let gj = gi;
    while (gj + 1 < entries.length && sameScoreGroup(entries[gi]!, entries[gj + 1]!, final)) gj++;
    const groupSize = gj - gi + 1;
    const tied = groupSize > 1;
    const resolved = tied && entries.slice(gi, gj + 1).every(e => e.rank_order !== 0);
    const groupPositions = Array.from({ length: groupSize }, (_, k) => pos + k);
    const groupMemberIndices = Array.from({ length: groupSize }, (_, k) => gi + k);
    for (let k = gi; k <= gj; k++) {
      meta[k] = {
        displayRank: resolved ? pos + (k - gi) : pos,
        tied,
        groupStart: k === gi,
        resolved,
        groupPositions,
        groupMemberIndices,
      };
    }
    pos += groupSize;
    gi = gj + 1;
  }
  return meta;
}

/** Sort players into census move-order: non-military first (highest pop first), military last. */
export function sortCensusOrder<T extends {
  military: number;
  civ_number: number;
  census?: { population?: number | null } | null;
}>(players: T[]): T[] {
  return [...players].sort((a, b) => {
    if (a.military !== b.military) return a.military - b.military;
    const pa = a.census?.population ?? -Infinity;
    const pb = b.census?.population ?? -Infinity;
    if (pa !== pb) return pb - pa;
    return a.civ_number - b.civ_number;
  });
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? 'th';
}
