/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Single helper for the four empire-cell shapes that appear across
 * status, admin, and game-over views. Keep them here so a CSS class
 * rename doesn't have to be hunted across multiple template strings.
 */

import type { TextColor } from '../types.js';
import { escapeHtml } from '../shared/html.js';

export type EmpireCellVariant =
  | 'cell'              // <td class="empire-cell">          status tables
  | 'cell-ab'           // <td class="ab-civ-label …">       AST board row label
  | 'badge'             // <span class="civ-badge …">        inline admin badge
  | 'badge-with-player' // …with player display name nested  game-over rank rows
  ;

interface EmpireCellInput {
  civ_number: number;
  civ_name: string;
  civ_color: string;
  civ_text_color: TextColor;
  /** Player's display name. Rendered as a 2nd line in the status-table cells. */
  name?: string;
}

/**
 * Two-line cell body: civ name on line 1 (with the seat-number badge), the
 * player's display name on a dimmer 2nd line. Used by every status table so
 * the player name is visible in-cell without a dedicated column.
 */
function cellBody(p: EmpireCellInput): string {
  return `<span class="empire-civ"><span class="civ-num">${p.civ_number}</span>${p.civ_name}</span>` +
    `<span class="empire-player-name">${escapeHtml(p.name)}</span>`;
}

export function empireCell(p: EmpireCellInput, variant: EmpireCellVariant = 'cell'): string {
  // Every variant is neutral; the empire colour only paints the .civ-num
  // badge (via --civ / --civ-fg), so a page of 18 empires doesn't shout.
  const vars = `--civ:${p.civ_color};--civ-fg:${p.civ_text_color}`;
  const num = `<span class="civ-num">${p.civ_number}</span>`;
  switch (variant) {
    case 'cell':
      return `<td class="empire-cell" style="${vars}">${cellBody(p)}</td>`;
    case 'cell-ab':
      return `<td class="ab-civ-label empire-cell" style="${vars}">${cellBody(p)}</td>`;
    case 'badge':
      return `<span class="civ-badge civ-badge-with-num" style="${vars}">${num}${p.civ_name}</span>`;
    case 'badge-with-player':
      return `<span class="civ-badge civ-badge-with-num" style="${vars}">${num}<span class="civ-badge-label">${p.civ_name}<span class="go-player-name">${escapeHtml(p.name)}</span></span></span>`;
  }
}
