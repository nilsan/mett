/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getDb, _onReset } from '../services/db.js';
import { autoAdvanceAst, LIA_THRESHOLD } from './ast.js';
import type { GameRow, PlayerRow, RoundSummary, RoundSummaryPlayer } from '../types.js';

/** Final VP for a player: AST VP + ADV VP + city VP (1 per city) + LIA bonus (5 VP). */
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

/**
 * Rulebook tiebreaker order: total VP → AST level → 6VP advances → 3VP advances
 * → manual resolution (rank_order; 0 = unresolved) → stable civ number.
 * City count is NOT a tiebreaker — it only contributes to total VP.
 */
export function compareScores(a: ScoreEntry, b: ScoreEntry): number {
  if (b.total !== a.total) return b.total - a.total;
  if (b.ast_level !== a.ast_level) return b.ast_level - a.ast_level;
  if (b.adv_6vp !== a.adv_6vp) return b.adv_6vp - a.adv_6vp;
  if (b.adv_3vp !== a.adv_3vp) return b.adv_3vp - a.adv_3vp;
  return (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number);
}

/**
 * True when two entries are in the same tie group (all rulebook criteria equal).
 * Players in the same group need manual admin resolution via cumulative advance cost.
 */
export function sameScoreGroup(a: ScoreEntry, b: ScoreEntry): boolean {
  return a.total === b.total && a.ast_level === b.ast_level &&
    a.adv_6vp === b.adv_6vp && a.adv_3vp === b.adv_3vp;
}

export interface TieGroupMeta {
  displayRank: number;
  tied: boolean;
  groupStart: boolean;
  resolved: boolean; // true when all group members have rank_order !== 0
  /** Ranks this entry's tie group spans, e.g. [5, 6, 7] for a 3-way tie at rank 5. */
  groupPositions: number[];
  /** Indices into the original entries array for all members of this tie group. */
  groupMemberIndices: number[];
}

/**
 * Given a sorted array of ScoreEntry (with attached rank_order), compute display metadata
 * for each entry: which rank to show, whether it's tied, whether the tie is resolved, and
 * the group's position span and member indices (for rendering rank-select dropdowns).
 */
export function computeTieGroupMeta(entries: Array<ScoreEntry & { rank_order: number }>): TieGroupMeta[] {
  const meta: TieGroupMeta[] = new Array(entries.length);
  let pos = 1, gi = 0;
  while (gi < entries.length) {
    let gj = gi;
    while (gj + 1 < entries.length && sameScoreGroup(entries[gi]!, entries[gj + 1]!)) gj++;
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

export function getGame(): GameRow {
  return getDb().query<GameRow, []>('SELECT * FROM game WHERE id = 1').get() as GameRow;
}

export function startGame(expert: number): void {
  const db = getDb();
  db.transaction(() => {
    db.exec('DELETE FROM census');
    db.exec('DELETE FROM players');
    db.query('UPDATE game SET expert=?, current_round=1, active=1, census_revealed=0, is_final_round=0, cities_phase=0, started_at=? WHERE id=1')
      .run(expert, new Date().toISOString());
  })();
}

export function resetGame(): void {
  const db = getDb();
  db.transaction(() => {
    db.exec('DELETE FROM census');
    db.exec('DELETE FROM players');
    db.query('UPDATE game SET active=0, current_round=1, census_revealed=0, is_final_round=0, cities_phase=0, started_at=NULL WHERE id=1').run();
  })();
}

export function revealCensus(): void {
  getDb().query('UPDATE game SET census_revealed=1 WHERE id=1').run();
}

export function setRound(round: number): void {
  getDb().query('UPDATE game SET current_round=? WHERE id=1').run(round);
}

export function endGame(): void {
  getDb().query('UPDATE game SET active=0, is_final_round=0 WHERE id=1').run();
}

export function checkAndSetFinalRound(): void {
  const db = getDb();
  const game = getGame();
  if (!game.active || game.is_final_round) return;
  const atLia = db.query<{ count: number }, []>(
    `SELECT COUNT(*) AS count FROM players WHERE ast_level >= ${LIA_THRESHOLD}`
  ).get();
  if (atLia && atLia.count > 0) {
    db.query('UPDATE game SET is_final_round=1 WHERE id=1').run();
  }
}

export function checkAndSetLateIronAgeBonus(): void {
  const db = getDb();
  const alreadyGranted = db.query<{ count: number }, []>(
    'SELECT COUNT(*) AS count FROM players WHERE late_iron_age_bonus=1'
  ).get()!.count;
  if (alreadyGranted > 0) return;
  const atLIA = db.query<{ id: number }, []>(
    `SELECT id FROM players WHERE ast_level >= ${LIA_THRESHOLD}`
  ).all();
  if (atLIA.length === 1) {
    db.query('UPDATE players SET late_iron_age_bonus=1 WHERE id=?').run(atLIA[0]!.id);
  }
}

// ─── Round summary ────────────────────────────────────────────────────────────
// Module-scope ring buffer of the last few round transitions. Lives in memory;
// resets on test-DB swap (registered via _onReset below). Surfaced to the admin
// page through getFullState; status page ignores it. Max 3 — older fall off.

const MAX_ROUND_SUMMARIES = 3;
let _roundSummaries: RoundSummary[] = [];

export function getRoundSummaries(): RoundSummary[] {
  return _roundSummaries;
}

function pushRoundSummary(s: RoundSummary): void {
  _roundSummaries.push(s);
  if (_roundSummaries.length > MAX_ROUND_SUMMARIES) {
    _roundSummaries = _roundSummaries.slice(-MAX_ROUND_SUMMARIES);
  }
}

_onReset(() => { _roundSummaries = []; });

interface RoundSnapshotPlayer {
  id: number;
  civ_number: number;
  civ_name: string;
  civ_color: string;
  civ_text_color: 'black' | 'white';
  ast_level: number;
  late_iron_age_bonus: number;
}

/** Lightweight pre/post snapshot used by computeRoundSummary. */
export interface RoundSnapshot {
  current_round: number;
  active: number;
  is_final_round: number;
  expert: boolean;
  players: RoundSnapshotPlayer[];
}

function toRefPlayer(p: RoundSnapshotPlayer, fromLevel: number, toLevel: number): RoundSummaryPlayer {
  return {
    player_id: p.id,
    civ_number: p.civ_number,
    civ_name: p.civ_name,
    civ_color: p.civ_color,
    civ_text_color: p.civ_text_color,
    fromLevel,
    toLevel,
  };
}

/**
 * Pure summary diff between pre/post snapshots of a round transition.
 * Doesn't touch the database — exported separately so tests can exercise
 * the rule logic without seeding a full game.
 */
export function computeRoundSummary(pre: RoundSnapshot, post: RoundSnapshot): RoundSummary {
  const preById = new Map(pre.players.map(p => [p.id, p]));

  const advanced: RoundSummaryPlayer[] = [];
  const regressed: RoundSummaryPlayer[] = [];
  const stayed: RoundSummaryPlayer[] = [];
  const liaArrived: RoundSummaryPlayer[] = [];
  let liaBonusGranted: RoundSummaryPlayer | null = null;

  for (const after of post.players) {
    const before = preById.get(after.id);
    if (!before) continue;
    const fromLevel = before.ast_level;
    const toLevel = after.ast_level;

    if (toLevel > fromLevel) advanced.push(toRefPlayer(after, fromLevel, toLevel));
    else if (toLevel < fromLevel) regressed.push(toRefPlayer(after, fromLevel, toLevel));
    else stayed.push(toRefPlayer(after, fromLevel, toLevel));

    if (fromLevel < LIA_THRESHOLD && toLevel >= LIA_THRESHOLD) {
      liaArrived.push(toRefPlayer(after, fromLevel, toLevel));
    }

    if (before.late_iron_age_bonus === 0 && after.late_iron_age_bonus === 1) {
      liaBonusGranted = toRefPlayer(after, fromLevel, toLevel);
    }
  }

  // Bonus blocked = 2+ players entered LIA this round (no solo arrival).
  const liaBonusBlocked = liaArrived.length >= 2 && liaBonusGranted === null;

  // is_final_round transitioned 0 → 1 this round (expert only).
  const finalRoundTriggered =
    pre.expert && pre.is_final_round === 0 && post.is_final_round === 1;

  // Game ended if active flipped 1 → 0.
  const gameEnded = pre.active === 1 && post.active === 0;

  // toRound: post.current_round when game continues; null when ended.
  // (The DB doesn't bump current_round when ending, so post equals pre in that case.)
  const toRound = gameEnded ? null : post.current_round;

  return {
    fromRound: pre.current_round,
    toRound,
    advanced,
    regressed,
    stayed,
    liaArrived,
    liaBonusGranted,
    liaBonusBlocked,
    finalRoundTriggered,
    gameEnded,
  };
}

/**
 * Snapshot the game + player state needed to compute a round summary.
 * Run this before AND after advanceRound; pass the pair to computeRoundSummary.
 */
export function snapshotForSummary(): RoundSnapshot {
  const db = getDb();
  const game = getGame();
  const players = db.query<RoundSnapshotPlayer, []>(`
    SELECT p.id,
           c.number AS civ_number,
           c.name AS civ_name,
           c.color AS civ_color,
           c.text_color AS civ_text_color,
           p.ast_level,
           p.late_iron_age_bonus
    FROM players p
    JOIN civs c ON c.id = p.civ_id
    ORDER BY c.number ASC
  `).all();
  return {
    current_round: game.current_round,
    active: game.active,
    is_final_round: game.is_final_round,
    expert: game.expert === 1,
    players,
  };
}

/**
 * advanceRound + capture summary atomically. Same return value as
 * advanceRound() so existing call sites remain backwards-compatible;
 * the summary is pushed onto the ring buffer as a side effect and
 * surfaces through getFullState.
 */
export function advanceRoundWithSummary(): number | null {
  const pre = snapshotForSummary();
  const next = advanceRound();
  const post = snapshotForSummary();
  pushRoundSummary(computeRoundSummary(pre, post));
  return next;
}

/** Advance to the next round. Returns the new round number, or null if the game ended. */
export function advanceRound(): number | null {
  const db = getDb();
  const game = getGame();
  const expert = game.expert === 1;
  let nextRound: number | null = null;

  db.transaction(() => {
    autoAdvanceAst(game.current_round, expert);
    checkAndSetLateIronAgeBonus();

    if (!expert) {
      // Basic: end immediately when any player reaches LIA this round
      const atLia = db.query<{ count: number }, []>(
        `SELECT COUNT(*) AS count FROM players WHERE ast_level >= ${LIA_THRESHOLD}`
      ).get();
      if (atLia && atLia.count > 0) {
        db.query('UPDATE game SET active=0, is_final_round=0 WHERE id=1').run();
        return;
      }
    } else if (game.is_final_round) {
      // Expert: this WAS the announced final round — end the game after AST runs
      db.query('UPDATE game SET active=0, is_final_round=0 WHERE id=1').run();
      return;
    } else {
      // Expert: check if anyone just triggered the final round
      checkAndSetFinalRound();
    }

    nextRound = game.current_round + 1;
    // Prune census rows older than the round we just finished. The page
    // handlers only ever read the current round and current_round - 1
    // (for the prev-round prevCensus on civ + admin pages), so anything
    // older is unreachable. Disk doesn't grow unbounded across long
    // multi-day sessions.
    db.query('DELETE FROM census WHERE round < ?').run(game.current_round);
    db.query('UPDATE game SET current_round=?, census_revealed=0, cities_phase=0 WHERE id=1').run(nextRound);
  })();

  return nextRound;
}
