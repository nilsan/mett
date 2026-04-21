import { getDb } from '../services/db.js';
import { autoAdvanceAst } from './ast.js';
import type { GameRow } from '../types.js';

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
    'SELECT id FROM players WHERE ast_level >= 70'
  ).all();
  if (atLIA.length === 1) {
    db.query('UPDATE players SET late_iron_age_bonus=1 WHERE id=?').run(atLIA[0].id);
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
