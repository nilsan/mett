/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The Calamities tab on the player page: what the player's held cards change,
// grouped by calamity (only calamities touched by a held card are listed),
// then every calamity in the game as a lookup list. Shared by the server
// render and the live client re-render.

import { escapeHtml } from './html.js';
import { ADVANCES, ADVANCE_BY_ID } from './advances.js';
import {
  CALAMITIES, CARD_CALAMITIES, calamityNamed, minorCalamitiesInPlay,
  type Calamity, type CalamityEffect,
} from './calamities.js';

const KIND_LABEL: Readonly<Record<Calamity['kind'], string>> = {
  'minor': 'Tradeable', 'non-tradeable': 'Non tradeable', 'tradeable': 'Tradeable',
};

export function renderCalamityPanel(heldIds: Iterable<string>): string {
  const byCalamity = new Map<string, { card: string; e: CalamityEffect }[]>();
  for (const id of heldIds) {
    for (const e of CARD_CALAMITIES[id] ?? []) {
      const list = byCalamity.get(e.calamity) ?? [];
      list.push({ card: ADVANCE_BY_ID.get(id)?.name ?? id, e });
      byCalamity.set(e.calamity, list);
    }
  }
  if (!byCalamity.size) {
    return '<p class="cal-none">None of your cards change a calamity.</p>';
  }
  return [...byCalamity.keys()].sort().map(cal => {
    // What helps first, then what hurts; card order within each.
    const rows = byCalamity.get(cal)!
      .sort((a, b) => (a.e.effect === b.e.effect ? 0 : a.e.effect === 'help' ? -1 : 1))
      .map(({ card, e }) => `<li class="cal-${e.effect}">`
        + `<span class="cal-mark" aria-label="${e.effect === 'help' ? 'helps' : 'hurts'}">${e.effect === 'help' ? '＋' : '−'}</span>`
        + `<span class="cal-text">${escapeHtml(e.text)} <span class="cal-card">${escapeHtml(card)}</span></span></li>`)
      .join('');
    return `<section class="cal-group"><h4>${escapeHtml(cal)}</h4><ul>${rows}</ul></section>`;
  }).join('');
}

/** The cards that change a calamity, in card order: what helps, then what hurts. */
function cardsFor(cal: Calamity): { id: string; e: CalamityEffect }[] {
  const out: { id: string; e: CalamityEffect }[] = [];
  for (const card of ADVANCES) {
    for (const e of CARD_CALAMITIES[card.id] ?? []) {
      if (calamityNamed(e.calamity) === cal) out.push({ id: card.id, e });
    }
  }
  return [...out.filter(c => c.e.effect === 'help'), ...out.filter(c => c.e.effect === 'hurt')];
}

/** Every calamity in this game as a collapsible row: stack, name, kind, the
 *  Quick Chart text and what each card does to it, ✓ on the player's own.
 *  Minor calamities only when the player count uses them. `open` names the
 *  rows to render expanded, so a live re-render keeps what the player opened. */
export function renderCalamityReference(heldIds: Iterable<string>, playerCount: number,
  open: ReadonlySet<string> = new Set()): string {
  const held = new Set(heldIds);
  const item = (cal: Calamity) => {
    const mods = cardsFor(cal).map(({ id, e }) => `<li class="cal-${e.effect}${held.has(id) ? ' cal-held' : ''}">`
      + `<span class="cal-mark" aria-label="${e.effect === 'help' ? 'helps' : 'hurts'}">${e.effect === 'help' ? '＋' : '−'}</span>`
      + `<span><span class="cal-mod-card">${escapeHtml(ADVANCE_BY_ID.get(id)!.name)}:</span> ${escapeHtml(e.text)}</span>`
      + (held.has(id) ? '<span class="cal-check" aria-label="you hold this card">✓</span>' : '')
      + `</li>`).join('');
    return `<details class="cal-ref-item" data-calamity="${escapeHtml(cal.name)}"${open.has(cal.name) ? ' open' : ''}>`
      + `<summary><span class="cal-stack">${cal.stack}</span><span class="cal-ref-name">${escapeHtml(cal.name)}</span>`
      + `<span class="cal-kind cal-kind-${cal.kind}">${KIND_LABEL[cal.kind]}</span></summary>`
      + cal.text.map(t => `<p>${escapeHtml(t)}</p>`).join('')
      + (mods ? `<ul class="cal-mods">${mods}</ul>` : '')
      + `</details>`;
  };
  const major = `<h4>Major calamities</h4><div class="cal-ref-list">${CALAMITIES.filter(c => c.kind !== 'minor').map(item).join('')}</div>`;
  return minorCalamitiesInPlay(playerCount)
    ? `<h4>Minor calamities</h4><div class="cal-ref-list">${CALAMITIES.filter(c => c.kind === 'minor').map(item).join('')}</div>` + major
    : major + `<p class="cal-none">Minor calamities are not used with ${playerCount} players, only with 9–11 or 15–18.</p>`;
}
