/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getDb, PLAYER_SELECT } from '../services/db.js';
import { getCivAstProfile } from '../civs.js';
import type { PlayerRow } from '../types.js';
import { AST_LEVELS, meetsAstRequirements } from '../shared/ast-pure.js';

export * from '../shared/ast-pure.js';

// ─── AST auto-advancement ──────────────────────────────────────────────────────

export function autoAdvanceAst(round: number, expert: boolean): void {
  const db = getDb();
  const players = db.query<PlayerRow, []>(PLAYER_SELECT).all();
  const censusRows = db.query<{ player_id: number; city_count: number | null }, [number]>(
    'SELECT player_id, city_count FROM census WHERE round=?'
  ).all(round);

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
      if (meetsAstRequirements(player, player.ast_level, effectiveCityCount, expert)) {
        db.query('UPDATE players SET ast_level=? WHERE id=?').run(AST_LEVELS[curIdx + 1]!, player.id);
      }
    }
  }
}
