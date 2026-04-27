/**
 * Integration tests for game logic: AST auto-advancement, LIA bonus, game end conditions.
 * Uses a real in-memory SQLite DB (same code path as production).
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';

import { makeDb, addPlayer, setAstLevel, setAdvances, submitCensus, getPlayer, getGame } from './_helpers.js';
import { autoAdvanceAst } from '../src/models/ast.js';
import { checkAndSetLateIronAgeBonus, checkAndSetFinalRound, playerTotalVp, computeTieGroupMeta, advanceRound } from '../src/models/game.js';
import { _setTestDb } from '../src/services/db.js';
import { sortCensusOrder } from '../src/views/main.js';

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

describe('static-row caches reset on _setTestDb', () => {
  // ast_levels and civs are cached for the lifetime of the process. Tests
  // swap the DB via _setTestDb, which must invalidate the cache so the
  // next call sees the new database's rows.
  it('getAstLevels cache invalidates between DB swaps', async () => {
    const { getAstLevels } = await import('../src/models/ast.js');
    const dbA = makeDb();
    _setTestDb(dbA);
    dbA.exec("UPDATE ast_levels SET era='SENTINEL_A' WHERE level=0");
    const a = getAstLevels();
    expect(a[0]!.era).toBe('SENTINEL_A');

    const dbB = makeDb();
    _setTestDb(dbB);  // must clear the cache
    dbB.exec("UPDATE ast_levels SET era='SENTINEL_B' WHERE level=0");
    const b = getAstLevels();
    expect(b[0]!.era).toBe('SENTINEL_B');
  });
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
