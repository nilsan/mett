/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Single helper for the four empire-cell shapes that appear across
 * status, admin, and game-over views. Keep them here so a CSS class
 * rename doesn't have to be hunted across multiple template strings.
 */

import type { TextColor } from '../types.js';

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
  /** Player's display name. Only consumed by `badge-with-player`. */
  name?: string;
}

export function empireCell(p: EmpireCellInput, variant: EmpireCellVariant = 'cell'): string {
  const style = `background:${p.civ_color};color:${p.civ_text_color}`;
  switch (variant) {
    case 'cell':
      return `<td class="empire-cell" style="${style}"><span class="civ-num">${p.civ_number}</span>${p.civ_name}</td>`;
    case 'cell-ab':
      return `<td class="ab-civ-label empire-cell" style="${style}"><span class="civ-num">${p.civ_number}</span>${p.civ_name}</td>`;
    case 'badge':
      return `<span class="civ-badge civ-badge-with-num" style="${style}"><span class="civ-num-in-badge">${p.civ_number}</span>${p.civ_name}</span>`;
    case 'badge-with-player':
      return `<span class="civ-badge civ-badge-with-num" style="${style}"><span class="civ-num-in-badge">${p.civ_number}</span><span class="civ-badge-label">${p.civ_name}<span class="go-player-name">${p.name ?? ''}</span></span></span>`;
  }
}
