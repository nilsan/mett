import { getDb } from '../services/db.js';
import { autoAdvanceAst } from './ast.js';
import type { GameRow, PlayerRow } from '../types.js';

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
}

/**
 * Given a sorted array of ScoreEntry (with attached rank_order), compute display metadata
 * for each entry: which rank to show, whether it's tied, and whether the tie is resolved.
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
    for (let k = gi; k <= gj; k++) {
      meta[k] = { displayRank: resolved ? pos + (k - gi) : pos, tied, groupStart: k === gi, resolved };
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
    'SELECT COUNT(*) AS count FROM players WHERE ast_level >= 75'
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
    'SELECT id FROM players WHERE ast_level >= 75'
  ).all();
  if (atLIA.length === 1) {
    db.query('UPDATE players SET late_iron_age_bonus=1 WHERE id=?').run(atLIA[0]!.id);
  }
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
      // Basic: end immediately when any player reaches ≥75 this round
      const atLia = db.query<{ count: number }, []>(
        'SELECT COUNT(*) AS count FROM players WHERE ast_level >= 75'
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
    db.query('UPDATE game SET current_round=?, census_revealed=0, cities_phase=0 WHERE id=1').run(nextRound);
  })();

  return nextRound;
}
