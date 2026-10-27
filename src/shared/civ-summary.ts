/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The summary line above the player-page tabs: A.S.T. position and total VP.
// Shared by the server render and the live client re-render.

import type { PlayerRow } from '../types.js';

type SummaryPlayer = Pick<PlayerRow, 'ast_level'>;

export function renderCivSummary(player: SummaryPlayer, totalVp: number): string {
  return `<div class="civ-summary" id="civ-summary">`
    + `<span class="civ-sum-item">A.S.T. <strong>${player.ast_level === 0 ? 'S' : player.ast_level}</strong></span>`
    + `<span class="civ-sum-item"><strong>${totalVp}</strong> VP</span>`
    + `</div>`;
}
