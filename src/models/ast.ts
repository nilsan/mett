/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getDb, _onReset, PLAYER_SELECT } from '../services/db.js';
import { getCivAstProfile } from '../civs.js';
import type { PlayerRow, AstLevelRow } from '../types.js';
import { AST_LEVELS, meetsAstRequirements } from '../shared/ast-pure.js';

export * from '../shared/ast-pure.js';

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
