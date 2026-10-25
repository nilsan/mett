/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Integration tests for game logic: AST auto-advancement, LIA bonus, game end conditions.
 * Uses a real in-memory SQLite DB (same code path as production).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';

import { makeDb, addPlayer, setAstLevel, setAdvances, submitCensus, getPlayer, getGame } from './_helpers.js';
import { autoAdvanceAst } from '../src/models/ast.js';
import { checkAndSetLateIronAgeBonus, checkAndSetFinalRound, playerTotalVp, computeTieGroupMeta, compareScores, sameScoreGroup, advanceRound, advanceRoundWithSummary, getRoundSummaries, computeRoundSummary, type RoundSnapshot } from '../src/models/game.js';
import { _setTestDb } from '../src/services/db.js';
import { sortCensusOrder } from '../src/models/game.js';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('autoAdvanceAst — basic mode', () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    _setTestDb(db);
  });

  it('Stone Age levels (0-15) are free — advance with 0 cities', () => {
    const pid = addPlayer(db, 17, 'Egypt');  // civ 17 = Egypt, normal stoneEnd=20
    setAstLevel(db, pid, 15);
    submitCensus(db, pid, 1, 20, 0);

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(20);
  });

  it('EBA (level 20) needs 2 cities — blocked with 1 city', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 20);
    submitCensus(db, pid, 1, 20, 1);  // 1 city < 2

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(20);
  });

  it('EBA (level 20) advances with 2 cities', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 20);
    submitCensus(db, pid, 1, 20, 2);

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(25);
  });

  it('late-start civ (Celt, civ 5) — level 35 override: advances with 2 cities, no advances needed', () => {
    const pid = addPlayer(db, 5, 'Celt');  // civ 5 = Celt, ebaEnd=40
    setAstLevel(db, pid, 35);
    submitCensus(db, pid, 1, 20, 2);  // 2 cities, 0 advances — would fail normal req

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(40);
  });

  it('late-start civ (Iberia, civ 13) — level 40 no longer overridden', () => {
    const pid = addPlayer(db, 13, 'Iberia');  // civ 13 = Iberia, ebaEnd=40
    setAstLevel(db, pid, 40);
    setAdvances(db, pid, 0);  // 0 advances → fails MBA req
    submitCensus(db, pid, 1, 20, 3);  // 3 cities but 0 advances

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(40);  // blocked — no override at 40
  });

  it('MBA (level 35): normal civ needs 3 cities + 3 any advances', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 35);
    setAdvances(db, pid, 3);  // 3 cheap advances
    submitCensus(db, pid, 1, 20, 3);

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(40);
  });

  it('LBA (level 50): needs 3 medium advances — cheap advances do not count', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 50);
    setAdvances(db, pid, 9);  // 9 cheap but 0 medium
    submitCensus(db, pid, 1, 20, 3);

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(50);  // blocked
  });

  it('LBA (level 50): expensive advances count as medium', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 50);
    setAdvances(db, pid, 0, 0, 3);  // 3 expensive → counts as 3 medium
    submitCensus(db, pid, 1, 20, 3);

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(55);
  });

  it('Wonder adds 1 effective city', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 20);
    db.query('UPDATE players SET wonder=1 WHERE id=?').run(pid);
    submitCensus(db, pid, 1, 20, 1);  // 1 real + 1 wonder = 2 effective → EBA passes

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(25);
  });

  it('basic game: level 75 is impossible (N/A) — player stays at 75', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 75);
    setAdvances(db, pid, 0, 0, 3);
    submitCensus(db, pid, 1, 20, 6);

    autoAdvanceAst(1, false);

    expect(getPlayer(db, pid).ast_level).toBe(75);  // impossible
  });
});

describe('autoAdvanceAst — expert mode', () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    db.exec("UPDATE game SET expert=1 WHERE id=1");
    _setTestDb(db);
  });

  it('slow-start civ (Minoa, civ 1) — level 20 is free in expert (stoneEnd=25)', () => {
    const pid = addPlayer(db, 1, 'Minoa');  // civ 1 = Minoa, stoneEnd=25 in expert
    setAstLevel(db, pid, 20);
    submitCensus(db, pid, 1, 20, 0);  // 0 cities — would fail normal expert req

    autoAdvanceAst(1, true);

    expect(getPlayer(db, pid).ast_level).toBe(25);
  });

  it('slow-start civ (Kushan, civ 10) — level 20 free in expert', () => {
    const pid = addPlayer(db, 10, 'Kushan');  // civ 10 = Kushan, stoneEnd=25 in expert
    setAstLevel(db, pid, 20);
    submitCensus(db, pid, 1, 20, 0);

    autoAdvanceAst(1, true);

    expect(getPlayer(db, pid).ast_level).toBe(25);
  });

  it('slow-start civ — level 25 requires 3 cities (stoneEnd boundary)', () => {
    const pid = addPlayer(db, 1, 'Minoa');
    setAstLevel(db, pid, 25);
    submitCensus(db, pid, 1, 20, 0);  // 0 cities — level 25 not free (25 not < 25)

    autoAdvanceAst(1, true);

    expect(getPlayer(db, pid).ast_level).toBe(25);  // blocked
  });

  it('normal civ — level 20 requires 3 cities in expert', () => {
    const pid = addPlayer(db, 17, 'Egypt');  // civ 17 = Egypt, stoneEnd=20
    setAstLevel(db, pid, 20);
    submitCensus(db, pid, 1, 20, 2);  // 2 cities < 3

    autoAdvanceAst(1, true);

    expect(getPlayer(db, pid).ast_level).toBe(20);  // blocked
  });

  it('expert MBA (level 35): needs 3 cities + 5 VP in advances', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 35);
    setAdvances(db, pid, 4);  // 4VP < 5 required
    submitCensus(db, pid, 1, 20, 3);

    autoAdvanceAst(1, true);

    expect(getPlayer(db, pid).ast_level).toBe(35);  // blocked

    setAdvances(db, pid, 5);  // 5VP ✓
    autoAdvanceAst(1, true);

    expect(getPlayer(db, pid).ast_level).toBe(40);
  });

  it('expert LBA (level 50): needs 4 cities + 12 any advances', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 50);
    setAdvances(db, pid, 12);
    submitCensus(db, pid, 1, 20, 3);  // 3 cities < 4

    autoAdvanceAst(1, true);
    expect(getPlayer(db, pid).ast_level).toBe(50);  // blocked by cities

    submitCensus(db, pid, 1, 20, 4);
    autoAdvanceAst(1, true);
    expect(getPlayer(db, pid).ast_level).toBe(55);
  });

  it('expert EIA (level 65): needs 5 cities + 10 cheap + 38 VP total', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 65);
    setAdvances(db, pid, 10);  // 10VP < 38 (fails totalVp)
    submitCensus(db, pid, 1, 20, 5);

    autoAdvanceAst(1, true);
    expect(getPlayer(db, pid).ast_level).toBe(65);  // blocked

    setAdvances(db, pid, 38);  // 38VP ✓, 38 cheap ≥ 10 ✓
    autoAdvanceAst(1, true);
    expect(getPlayer(db, pid).ast_level).toBe(70);
  });

  it('expert LIA (level 70,75): needs 6 cities + 17 cheap + 56 VP total', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 70);
    setAdvances(db, pid, 56);  // 56 cheap ✓, 56VP ✓
    submitCensus(db, pid, 1, 20, 6);

    autoAdvanceAst(1, true);
    expect(getPlayer(db, pid).ast_level).toBe(75);

    // Level 75: same req as 70 → advance to 80 if met
    autoAdvanceAst(1, true);
    expect(getPlayer(db, pid).ast_level).toBe(80);

    // Level 80: impossible
    autoAdvanceAst(1, true);
    expect(getPlayer(db, pid).ast_level).toBe(80);
  });

  it('expert: 0 cities in non-Stone-Age causes regression (drop one level)', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 35);  // MBA — not Stone Age
    submitCensus(db, pid, 1, 20, 0);  // 0 cities

    autoAdvanceAst(1, true);

    expect(getPlayer(db, pid).ast_level).toBe(30);  // regressed
  });

  it('expert: 0 cities in Stone Age does NOT cause regression for slow-start civ', () => {
    const pid = addPlayer(db, 1, 'Minoa');  // stoneEnd=25
    setAstLevel(db, pid, 20);  // still in Stone Age (20 < stoneEnd=25)
    submitCensus(db, pid, 1, 20, 0);

    autoAdvanceAst(1, true);

    // Should advance (free), not regress
    expect(getPlayer(db, pid).ast_level).toBe(25);
  });

  it('expert Wonder: counts as +1 city, enabling advancement in LBA', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 50);
    setAdvances(db, pid, 12);
    db.query('UPDATE players SET wonder=1 WHERE id=?').run(pid);
    submitCensus(db, pid, 1, 20, 3);  // 3 real + 1 wonder = 4 effective → LBA passes

    autoAdvanceAst(1, true);

    expect(getPlayer(db, pid).ast_level).toBe(55);
  });
});

describe('LIA bonus assignment', () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    _setTestDb(db);
  });

  it('grants bonus to exactly 1 player at ≥75', () => {
    const pid1 = addPlayer(db, 17, 'Egypt');
    const pid2 = addPlayer(db, 15, 'Hellas');
    db.query('UPDATE players SET ast_level=75 WHERE id=?').run(pid1);  // Egypt at LIA entry
    db.query('UPDATE players SET ast_level=70 WHERE id=?').run(pid2);  // Hellas still at EIA

    checkAndSetLateIronAgeBonus();

    expect(getPlayer(db, pid1).late_iron_age_bonus).toBe(1);
    expect(getPlayer(db, pid2).late_iron_age_bonus).toBe(0);
  });

  it('grants no bonus when 2 or more players are at ≥75', () => {
    const pid1 = addPlayer(db, 17, 'Egypt');
    const pid2 = addPlayer(db, 15, 'Hellas');
    db.query('UPDATE players SET ast_level=75 WHERE id=?').run(pid1);
    db.query('UPDATE players SET ast_level=75 WHERE id=?').run(pid2);

    checkAndSetLateIronAgeBonus();

    expect(getPlayer(db, pid1).late_iron_age_bonus).toBe(0);
    expect(getPlayer(db, pid2).late_iron_age_bonus).toBe(0);
  });

  it('does not grant a second bonus if one is already held', () => {
    const pid1 = addPlayer(db, 17, 'Egypt');
    const pid2 = addPlayer(db, 15, 'Hellas');
    db.query('UPDATE players SET ast_level=75, late_iron_age_bonus=1 WHERE id=?').run(pid1);
    db.query('UPDATE players SET ast_level=75 WHERE id=?').run(pid2);

    checkAndSetLateIronAgeBonus();  // should be a no-op (bonus already granted)

    expect(getPlayer(db, pid2).late_iron_age_bonus).toBe(0);
  });

  it('counts players at exactly 75 (boundary: ≥75)', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    db.query('UPDATE players SET ast_level=70 WHERE id=?').run(pid);

    checkAndSetLateIronAgeBonus();

    expect(getPlayer(db, pid).late_iron_age_bonus).toBe(0);  // 70 < 75

    db.query('UPDATE players SET ast_level=75 WHERE id=?').run(pid);
    checkAndSetLateIronAgeBonus();
    expect(getPlayer(db, pid).late_iron_age_bonus).toBe(1);
  });
});

describe('checkAndSetFinalRound — expert mode', () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    db.exec("UPDATE game SET expert=1, active=1 WHERE id=1");
    _setTestDb(db);
  });

  it('sets is_final_round=1 when a player reaches ≥75', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    db.query('UPDATE players SET ast_level=75 WHERE id=?').run(pid);

    checkAndSetFinalRound();

    expect(getGame(db).is_final_round).toBe(1);
  });

  it('does not set is_final_round for level 70', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    db.query('UPDATE players SET ast_level=70 WHERE id=?').run(pid);

    checkAndSetFinalRound();

    expect(getGame(db).is_final_round).toBe(0);
  });

  it('does not change is_final_round=1 again (idempotent check)', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    db.query('UPDATE players SET ast_level=75 WHERE id=?').run(pid);
    db.exec("UPDATE game SET is_final_round=1 WHERE id=1");

    checkAndSetFinalRound();  // should be no-op

    expect(getGame(db).is_final_round).toBe(1);
  });
});

describe('playerTotalVp', () => {
  const base = { ast_level: 60, adv_points: 40, late_iron_age_bonus: 0 };

  it('sums AST + ADV only when no city count or LIA bonus', () => {
    expect(playerTotalVp(base, null)).toBe(100);
    expect(playerTotalVp(base, undefined)).toBe(100);
    expect(playerTotalVp(base, 0)).toBe(100);
  });

  it('adds city VP (1 per city)', () => {
    expect(playerTotalVp(base, 7)).toBe(107);
  });

  it('adds 5 VP for LIA bonus', () => {
    expect(playerTotalVp({ ...base, late_iron_age_bonus: 1 }, 0)).toBe(105);
  });

  it('includes all three components together', () => {
    expect(playerTotalVp({ ...base, late_iron_age_bonus: 1 }, 7)).toBe(112);
  });
});

describe('census move order — sortCensusOrder from main.ts', () => {
  it('highest population moves first within each group; military always last', () => {
    const players = [
      { military: 0, civ_number: 17, census: { population: 30 }, name: 'Egypt' },
      { military: 1, civ_number: 11, census: { population:  5 }, name: 'Rome' },   // military, low pop
      { military: 0, civ_number:  6, census: { population: 10 }, name: 'Babylon' },
      { military: 1, civ_number: 14, census: { population: 50 }, name: 'Nubia' },  // military, high pop
      { military: 0, civ_number: 15, census: { population: 20 }, name: 'Hellas' },
    ];

    const ordered = sortCensusOrder(players);
    const names = ordered.map(p => p.name);

    // Non-military highest first: Egypt(30), Hellas(20), Babylon(10)
    // Military highest first:     Nubia(50), Rome(5)
    expect(names).toEqual(['Egypt', 'Hellas', 'Babylon', 'Nubia', 'Rome']);
  });

  it('null population sorts last within group (unrevealed census treated as -Infinity)', () => {
    const players = [
      { military: 0, civ_number: 17, census: { population: 30 }, name: 'Egypt' },
      { military: 0, civ_number:  6, census: null,                name: 'Babylon' },  // no census
      { military: 0, civ_number: 15, census: { population: 20 }, name: 'Hellas' },
    ];
    const ordered = sortCensusOrder(players);
    expect(ordered.map(p => p.name)).toEqual(['Egypt', 'Hellas', 'Babylon']);
  });

  it('civ number breaks ties when populations are equal', () => {
    const players = [
      { military: 0, civ_number: 17, census: { population: 20 }, name: 'Egypt' },
      { military: 0, civ_number:  6, census: { population: 20 }, name: 'Babylon' },
    ];
    const ordered = sortCensusOrder(players);
    // Lower civ_number first when populations tied
    expect(ordered.map(p => p.name)).toEqual(['Babylon', 'Egypt']);
  });
});

describe('computeTieGroupMeta', () => {
  // Helper: build the minimum ScoreEntry+rank_order shape the function expects.
  // Different `total` values force distinct groups; same `total` forces a tie group.
  const e = (total: number, rank_order = 0, civ_number = 1) => ({
    total, ast_level: 0, adv_6vp: 0, adv_3vp: 0, rank_order, civ_number,
  });

  it('all unique scores: every entry is solo, displayRank == position', () => {
    const meta = computeTieGroupMeta([e(30), e(20), e(10)]);
    expect(meta.map(m => m.displayRank)).toEqual([1, 2, 3]);
    expect(meta.every(m => !m.tied)).toBe(true);
    expect(meta.every(m => m.resolved === false)).toBe(true);
    expect(meta.map(m => m.groupPositions)).toEqual([[1], [2], [3]]);
    expect(meta.map(m => m.groupMemberIndices)).toEqual([[0], [1], [2]]);
  });

  it('two-way unresolved tie at top: both share rank 1, groupPositions=[1,2]', () => {
    const meta = computeTieGroupMeta([e(30, 0, 1), e(30, 0, 2), e(20)]);
    expect(meta[0]!.tied).toBe(true);
    expect(meta[1]!.tied).toBe(true);
    expect(meta[0]!.resolved).toBe(false);
    expect(meta[0]!.displayRank).toBe(1);
    expect(meta[1]!.displayRank).toBe(1);            // unresolved → both show group start
    expect(meta[0]!.groupPositions).toEqual([1, 2]);
    expect(meta[1]!.groupPositions).toEqual([1, 2]);
    expect(meta[0]!.groupMemberIndices).toEqual([0, 1]);
    expect(meta[2]!.tied).toBe(false);
    expect(meta[2]!.displayRank).toBe(3);
  });

  it('three-way resolved tie: each gets its own rank from rank_order', () => {
    const meta = computeTieGroupMeta([e(30, 1, 1), e(30, 2, 2), e(30, 3, 3)]);
    expect(meta.every(m => m.tied && m.resolved)).toBe(true);
    expect(meta.map(m => m.displayRank)).toEqual([1, 2, 3]);
    expect(meta.map(m => m.groupPositions)).toEqual([[1, 2, 3], [1, 2, 3], [1, 2, 3]]);
  });

  it('groupStart marks first index of each tie group', () => {
    const meta = computeTieGroupMeta([e(30), e(20, 0, 1), e(20, 0, 2), e(10)]);
    expect(meta.map(m => m.groupStart)).toEqual([true, true, false, true]);
  });

  it('mixed: solo at top, 2-way tie at 2-3, solo at 4', () => {
    const meta = computeTieGroupMeta([e(50), e(30, 0, 1), e(30, 0, 2), e(10)]);
    expect(meta.map(m => m.displayRank)).toEqual([1, 2, 2, 4]);
    expect(meta.map(m => m.tied)).toEqual([false, true, true, false]);
    expect(meta[1]!.groupPositions).toEqual([2, 3]);
    expect(meta[1]!.groupMemberIndices).toEqual([1, 2]);
  });

  it('group members share the same groupPositions array reference', () => {
    const meta = computeTieGroupMeta([e(30, 0, 1), e(30, 0, 2)]);
    expect(meta[0]!.groupPositions).toBe(meta[1]!.groupPositions);
  });
});

describe('final tiebreak policy — live play ranks on Total VP alone', () => {
  // Models the real game that surfaced the bug: three players all at Total 38
  // (AST 35 + 3 ADV). Celt's 3 ADV points are three 1-VP advances (adv_3vp=0);
  // Hellas and Iberia each hold one 3-VP advance (adv_3vp=1). The 1/3/6-VP
  // breakdown is hidden info and must not reorder them during active play.
  const celt   = { total: 38, ast_level: 35, adv_6vp: 0, adv_3vp: 0, rank_order: 0, civ_number: 5 };
  const hellas = { total: 38, ast_level: 35, adv_6vp: 0, adv_3vp: 1, rank_order: 0, civ_number: 15 };
  const iberia = { total: 38, ast_level: 35, adv_6vp: 0, adv_3vp: 1, rank_order: 0, civ_number: 13 };

  it('game over (final=true): advance-card breakdown breaks the tie', () => {
    expect(sameScoreGroup(celt, hellas, true)).toBe(false);   // adv_3vp differs
    expect(compareScores(celt, hellas, true)).toBeGreaterThan(0); // Celt sorts after Hellas
    expect(sameScoreGroup(hellas, iberia, true)).toBe(true);  // identical breakdown → tied
  });

  it('active play (final=false): equal Total VP is always a tie', () => {
    expect(sameScoreGroup(celt, hellas, false)).toBe(true);
    expect(sameScoreGroup(celt, iberia, false)).toBe(true);
    // Different total still separates them.
    expect(sameScoreGroup(celt, { ...celt, total: 39 }, false)).toBe(false);
  });

  it('active play: equal totals ignore AST split too (rank on visible Total only)', () => {
    const astHeavy = { total: 38, ast_level: 40, adv_6vp: 0, adv_3vp: 0, rank_order: 0, civ_number: 2 };
    const advHeavy = { total: 38, ast_level: 30, adv_6vp: 1, adv_3vp: 0, rank_order: 0, civ_number: 7 };
    expect(sameScoreGroup(astHeavy, advHeavy, false)).toBe(true);
    expect(sameScoreGroup(astHeavy, advHeavy, true)).toBe(false); // game over splits by AST
  });

  it('computeTieGroupMeta(final=false): all three equal-total players share rank', () => {
    // Sorted desc; with final=false the breakdown is ignored so all are one group.
    const entries = [celt, hellas, iberia].map(p => ({ ...p }));
    const live = computeTieGroupMeta(entries, false);
    expect(live.every(m => m.tied)).toBe(true);
    expect(live.map(m => m.displayRank)).toEqual([1, 1, 1]); // unresolved tie → group start
    // At game over the same set splits: the two 3-VP holders tie, Celt drops out.
    const over = computeTieGroupMeta([hellas, iberia, celt], true);
    expect(over.map(m => m.tied)).toEqual([true, true, false]);
    expect(over.map(m => m.displayRank)).toEqual([1, 1, 3]);
  });
});

describe('static-row caches reset on _setTestDb', () => {
  // ast_levels and civs are cached for the lifetime of the process. Tests
  // swap the DB via _setTestDb, which must invalidate the cache so the
  // next call sees the new database's rows.
});

describe('advanceRound — census pruning', () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); _setTestDb(db); });

  function censusRoundsForPlayer(playerId: number): number[] {
    return db.query<{ round: number }, [number]>(
      'SELECT round FROM census WHERE player_id=? ORDER BY round'
    ).all(playerId).map(r => r.round);
  }

  it('after advance, the round just finished is kept and older rounds are dropped', () => {
    // Artificially pre-populate three rounds (in normal play only one
    // historical round would ever exist at a time, but the prune must
    // handle the "we just upgraded a long-running install" case too).
    const pid = addPlayer(db, 17, 'Egypt');
    submitCensus(db, pid, 1, 20, 2);
    submitCensus(db, pid, 2, 21, 2);
    submitCensus(db, pid, 3, 22, 2);
    db.exec('UPDATE game SET current_round=3, expert=1');
    expect(censusRoundsForPlayer(pid)).toEqual([1, 2, 3]);

    // advanceRound from 3 -> 4 prunes rounds < 3, keeping the round we
    // just finished (round 3) — that's what /admin and /:slug read as
    // prevCensus on round 4.
    expect(advanceRound()).toBe(4);
    expect(censusRoundsForPlayer(pid)).toEqual([3]);
  });

  it('keeps the round just finished so the next page render can read prevCensus', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    submitCensus(db, pid, 1, 20, 2);
    db.exec('UPDATE game SET current_round=1, expert=1');

    advanceRound();
    expect(censusRoundsForPlayer(pid)).toEqual([1]); // round 1 = prevCensus on round 2
  });

  it('across several rounds in steady-state play, only one historical round is ever kept', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    db.exec('UPDATE game SET expert=1');

    // Round 1
    submitCensus(db, pid, 1, 20, 2);
    advanceRound();
    expect(censusRoundsForPlayer(pid)).toEqual([1]);

    // Round 2
    submitCensus(db, pid, 2, 21, 2);
    advanceRound();
    expect(censusRoundsForPlayer(pid)).toEqual([2]);

    // Round 3
    submitCensus(db, pid, 3, 22, 2);
    advanceRound();
    expect(censusRoundsForPlayer(pid)).toEqual([3]);
  });
});

describe('advanceRound — game-end orchestration', () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); _setTestDb(db); });

  it('basic mode: ends the game when any player reaches LIA (≥75) at round end', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 75);
    db.exec("UPDATE game SET expert=0, current_round=4");

    expect(advanceRound()).toBeNull();
    const g = getGame(db);
    expect(g.active).toBe(0);
    expect(g.is_final_round).toBe(0);
    expect(g.current_round).toBe(4); // not advanced — game ended
  });

  it('basic mode: continues past round 8 when no one is at LIA yet', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 70);
    db.exec("UPDATE game SET expert=0, current_round=8");

    expect(advanceRound()).toBe(9);
    expect(getGame(db).active).toBe(1);
  });

  it('expert mode: a player crossing ≥75 raises is_final_round but the game keeps running', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 75);
    db.exec("UPDATE game SET expert=1, current_round=5");
    // Need ≥1 city to avoid the zero-cities expert regression in autoAdvanceAst.
    submitCensus(db, pid, 5, 30, 1);

    expect(advanceRound()).toBe(6);
    const g = getGame(db);
    expect(g.active).toBe(1);
    expect(g.is_final_round).toBe(1);
  });

  it('expert mode: the round following is_final_round=1 ends the game', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 80);
    db.exec("UPDATE game SET expert=1, current_round=6, is_final_round=1");
    submitCensus(db, pid, 6, 30, 1);

    expect(advanceRound()).toBeNull();
    const g = getGame(db);
    expect(g.active).toBe(0);
    expect(g.is_final_round).toBe(0); // cleared on end
  });
});

describe('LIA bonus + final-round flag through advanceRound (mode-aware)', () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); _setTestDb(db); });

  // ── Basic mode ────────────────────────────────────────────────────────────
  // Basic doesn't use is_final_round — the round in which any player hits
  // LIA IS the final round. Game ends at that round's advanceRound. The
  // LIA bonus rule still applies: solo arrival grants +5 VP, simultaneous
  // arrival grants nothing.

  it('basic: solo LIA reach grants the +5 LIA bonus and ends the game', () => {
    const pid1 = addPlayer(db, 17, 'Egypt');
    const pid2 = addPlayer(db, 15, 'Hellas');
    setAstLevel(db, pid1, 75);
    setAstLevel(db, pid2, 70);
    db.exec("UPDATE game SET expert=0, current_round=5");

    expect(advanceRound()).toBeNull();
    const g = getGame(db);
    expect(g.active).toBe(0);
    expect(g.is_final_round).toBe(0); // basic never sets the flag
    expect(getPlayer(db, pid1).late_iron_age_bonus).toBe(1); // solo arrival
    expect(getPlayer(db, pid2).late_iron_age_bonus).toBe(0);
  });

  it('basic: simultaneous LIA reach grants no bonus and ends the game', () => {
    const pid1 = addPlayer(db, 17, 'Egypt');
    const pid2 = addPlayer(db, 15, 'Hellas');
    setAstLevel(db, pid1, 75);
    setAstLevel(db, pid2, 75);
    db.exec("UPDATE game SET expert=0, current_round=5");

    expect(advanceRound()).toBeNull();
    expect(getGame(db).active).toBe(0);
    expect(getPlayer(db, pid1).late_iron_age_bonus).toBe(0);
    expect(getPlayer(db, pid2).late_iron_age_bonus).toBe(0);
  });

  // ── Expert mode ───────────────────────────────────────────────────────────
  // Expert has one extra round after the trigger. is_final_round=1 means
  // "next advanceRound ends the game". LIA bonus rule is the same.

  it('expert: solo LIA reach grants the bonus AND raises is_final_round (game continues)', () => {
    const pid1 = addPlayer(db, 17, 'Egypt');
    const pid2 = addPlayer(db, 15, 'Hellas');
    setAstLevel(db, pid1, 75);
    setAstLevel(db, pid2, 70);
    db.exec("UPDATE game SET expert=1, current_round=6");
    // ≥1 city for both so autoAdvanceAst doesn't regress them
    submitCensus(db, pid1, 6, 30, 1);
    submitCensus(db, pid2, 6, 30, 1);

    expect(advanceRound()).toBe(7);
    const g = getGame(db);
    expect(g.active).toBe(1);
    expect(g.is_final_round).toBe(1);
    expect(getPlayer(db, pid1).late_iron_age_bonus).toBe(1);
    expect(getPlayer(db, pid2).late_iron_age_bonus).toBe(0);
  });

  it('expert: simultaneous LIA reach raises is_final_round but grants no bonus', () => {
    const pid1 = addPlayer(db, 17, 'Egypt');
    const pid2 = addPlayer(db, 15, 'Hellas');
    setAstLevel(db, pid1, 75);
    setAstLevel(db, pid2, 75);
    db.exec("UPDATE game SET expert=1, current_round=6");
    submitCensus(db, pid1, 6, 30, 1);
    submitCensus(db, pid2, 6, 30, 1);

    expect(advanceRound()).toBe(7);
    const g = getGame(db);
    expect(g.is_final_round).toBe(1);
    expect(getPlayer(db, pid1).late_iron_age_bonus).toBe(0);
    expect(getPlayer(db, pid2).late_iron_age_bonus).toBe(0);
  });
});

describe('advanceRound — cities_phase reset on round transition', () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); _setTestDb(db); });

  it('clears cities_phase back to 0 when the round advances', () => {
    addPlayer(db, 17, 'Egypt');
    db.exec("UPDATE game SET expert=1, current_round=2, cities_phase=1");

    advanceRound();
    expect(getGame(db).cities_phase).toBe(0);
  });

  it('clears census_revealed back to 0 when the round advances', () => {
    addPlayer(db, 17, 'Egypt');
    db.exec("UPDATE game SET expert=1, current_round=2, census_revealed=1");

    advanceRound();
    expect(getGame(db).census_revealed).toBe(0);
  });
});

describe('computeRoundSummary — pure-function diff', () => {
  function snap(overrides: {
    current_round?: number;
    active?: number;
    is_final_round?: number;
    expert?: boolean;
    players?: Array<Partial<RoundSnapshot['players'][0]>>;
  } = {}): RoundSnapshot {
    return {
      current_round: overrides.current_round ?? 5,
      active: overrides.active ?? 1,
      is_final_round: overrides.is_final_round ?? 0,
      expert: overrides.expert ?? true,
      players: (overrides.players ?? []).map((p, i) => ({
        id: p.id ?? i + 1,
        civ_number: p.civ_number ?? i + 1,
        civ_name: p.civ_name ?? `Civ${i + 1}`,
        civ_color: p.civ_color ?? '#888',
        civ_text_color: p.civ_text_color ?? 'white',
        ast_level: p.ast_level ?? 50,
        late_iron_age_bonus: p.late_iron_age_bonus ?? 0,
      })),
    };
  }

  it('lists advanced players (toLevel > fromLevel)', () => {
    const pre = snap({ players: [{ id: 1, ast_level: 50 }, { id: 2, ast_level: 60 }] });
    const post = snap({ current_round: 6, players: [{ id: 1, ast_level: 55 }, { id: 2, ast_level: 60 }] });
    const s = computeRoundSummary(pre, post);
    expect(s.advanced.map(p => p.player_id)).toEqual([1]);
    expect(s.advanced[0]!.fromLevel).toBe(50);
    expect(s.advanced[0]!.toLevel).toBe(55);
    expect(s.regressed).toEqual([]);
    expect(s.fromRound).toBe(5);
    expect(s.toRound).toBe(6);
  });

  it('lists regressed players (toLevel < fromLevel)', () => {
    const pre = snap({ players: [{ id: 1, ast_level: 50 }] });
    const post = snap({ current_round: 6, players: [{ id: 1, ast_level: 45 }] });
    const s = computeRoundSummary(pre, post);
    expect(s.regressed.map(p => p.player_id)).toEqual([1]);
    expect(s.advanced).toEqual([]);
  });

  it('liaArrived: players who crossed from <75 to ≥75', () => {
    const pre = snap({ players: [
      { id: 1, ast_level: 70 }, // below threshold
      { id: 2, ast_level: 75 }, // already at LIA, not "newly arrived"
    ]});
    const post = snap({ current_round: 6, players: [
      { id: 1, ast_level: 75 }, // crossed
      { id: 2, ast_level: 75 }, // unchanged
    ]});
    const s = computeRoundSummary(pre, post);
    expect(s.liaArrived.map(p => p.player_id)).toEqual([1]);
  });

  it('liaBonusGranted: solo arrival flips late_iron_age_bonus 0→1', () => {
    const pre = snap({ players: [{ id: 1, ast_level: 70, late_iron_age_bonus: 0 }] });
    const post = snap({ current_round: 6, players: [{ id: 1, ast_level: 75, late_iron_age_bonus: 1 }] });
    const s = computeRoundSummary(pre, post);
    expect(s.liaBonusGranted?.player_id).toBe(1);
    expect(s.liaBonusBlocked).toBe(false);
  });

  it('liaBonusBlocked: 2+ arrived simultaneously, no bonus granted', () => {
    const pre = snap({ players: [
      { id: 1, ast_level: 70, late_iron_age_bonus: 0 },
      { id: 2, ast_level: 70, late_iron_age_bonus: 0 },
    ]});
    const post = snap({ current_round: 6, players: [
      { id: 1, ast_level: 75, late_iron_age_bonus: 0 },
      { id: 2, ast_level: 75, late_iron_age_bonus: 0 },
    ]});
    const s = computeRoundSummary(pre, post);
    expect(s.liaArrived.length).toBe(2);
    expect(s.liaBonusGranted).toBeNull();
    expect(s.liaBonusBlocked).toBe(true);
  });

  it('finalRoundTriggered: expert is_final_round 0 → 1', () => {
    const pre  = snap({ expert: true, is_final_round: 0 });
    const post = snap({ current_round: 6, expert: true, is_final_round: 1 });
    const s = computeRoundSummary(pre, post);
    expect(s.finalRoundTriggered).toBe(true);
  });

  it('finalRoundTriggered is false in basic mode regardless of flag', () => {
    const pre  = snap({ expert: false, is_final_round: 0 });
    const post = snap({ current_round: 6, expert: false, is_final_round: 1 }); // shouldn't happen but defensive
    const s = computeRoundSummary(pre, post);
    expect(s.finalRoundTriggered).toBe(false);
  });

  it('gameEnded: active 1 → 0, toRound is null', () => {
    const pre  = snap({ active: 1 });
    const post = snap({ active: 0 });  // current_round unchanged on end
    const s = computeRoundSummary(pre, post);
    expect(s.gameEnded).toBe(true);
    expect(s.toRound).toBeNull();
  });

  it('quiet round: no AST changes, no LIA, no flag — stayed populated, others empty', () => {
    const pre  = snap({ players: [{ id: 1, ast_level: 60 }] });
    const post = snap({ current_round: 6, players: [{ id: 1, ast_level: 60 }] });
    const s = computeRoundSummary(pre, post);
    expect(s.advanced).toEqual([]);
    expect(s.regressed).toEqual([]);
    expect(s.stayed.map(p => p.player_id)).toEqual([1]);
    expect(s.liaArrived).toEqual([]);
    expect(s.liaBonusGranted).toBeNull();
    expect(s.liaBonusBlocked).toBe(false);
    expect(s.finalRoundTriggered).toBe(false);
    expect(s.gameEnded).toBe(false);
  });

  it('stayed list contains every player whose level was unchanged', () => {
    const pre  = snap({ players: [
      { id: 1, ast_level: 50 },
      { id: 2, ast_level: 60 },
      { id: 3, ast_level: 70 },
    ]});
    const post = snap({ current_round: 6, players: [
      { id: 1, ast_level: 55 }, // advanced
      { id: 2, ast_level: 60 }, // stayed
      { id: 3, ast_level: 70 }, // stayed
    ]});
    const s = computeRoundSummary(pre, post);
    expect(s.advanced.map(p => p.player_id)).toEqual([1]);
    expect(s.stayed.map(p => p.player_id)).toEqual([2, 3]);
    expect(s.regressed).toEqual([]);
  });
});

describe('advanceRoundWithSummary — integration with the ring buffer', () => {
  let db: Database;
  beforeEach(() => { db = makeDb(); _setTestDb(db); });

  it('pushes a summary onto the ring buffer after each advance', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 50);
    submitCensus(db, pid, 1, 30, 5);
    setAdvances(db, pid, 5);
    db.exec("UPDATE game SET expert=1, current_round=1");

    expect(getRoundSummaries().length).toBe(0);
    advanceRoundWithSummary();
    const sums = getRoundSummaries();
    expect(sums.length).toBe(1);
    expect(sums[0]!.fromRound).toBe(1);
  });

  it('caps the buffer at 3 — older summaries fall off', () => {
    const pid = addPlayer(db, 17, 'Egypt');
    setAstLevel(db, pid, 50);
    db.exec("UPDATE game SET expert=1, current_round=1");
    for (let r = 1; r <= 5; r++) {
      submitCensus(db, pid, r, 30, 5);
      advanceRoundWithSummary();
    }
    const sums = getRoundSummaries();
    expect(sums.length).toBe(3);
    // Newest is last; with 5 advances the oldest two are dropped.
    expect(sums.map(s => s.fromRound)).toEqual([3, 4, 5]);
  });
});
