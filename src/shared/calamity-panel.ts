/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The Calamities tab on the player page: every calamity in the game as a
// lookup list, worked out per victim role for the player's cards, with a ✓
// on the calamities their cards change. Shared by the server
// render and the live client re-render.

import { escapeHtml } from './html.js';
import { ADVANCES, ADVANCE_BY_ID } from './advances.js';
import {
  CALAMITIES, CALAMITY_ROLES, CARD_CALAMITIES, calamityNamed, minorCalamitiesInPlay, roleResult,
  type Calamity, type CalamityEffect,
} from './calamities.js';

const KIND_LABEL: Readonly<Record<Calamity['kind'], string>> = {
  'minor': 'Tradeable', 'non-tradeable': 'Non tradeable', 'tradeable': 'Tradeable',
};

const mark = (effect: CalamityEffect['effect']) =>
  `<span class="cal-mark" aria-label="${effect === 'help' ? 'helps' : 'hurts'}">${effect === 'help' ? '＋' : '−'}</span>`;
const cardName = (id: string) => escapeHtml(ADVANCE_BY_ID.get(id)?.name ?? id);

/** One victim's line: the outcome after the player's cards, how the cards
 *  got there ("10 +5 Agriculture −5 Pottery"), and card effects that are not
 *  a number. */
function roleLines(cal: Calamity, role: 'primary' | 'secondary', held: ReadonlySet<string>): string {
  const r = roleResult(cal, role, held);
  if (!r) return '';
  const roles = CALAMITY_ROLES[cal.name]!;
  const label = role === 'primary' ? 'Primary victim' : `Secondary victims <span class="cal-who">(${escapeHtml(roles.secondary!.who)})</span>`;
  if (r.immune) {
    return `<p class="cal-role"><span class="cal-role-name">${label}:</span> <span class="cal-help">You can’t be picked (${cardName(r.immune)}).</span></p>`;
  }
  const calc = r.changes.length
    ? ` <span class="cal-calc">${r.base}${r.changes.map(c => ` <span class="cal-${c.effect}">${c.delta > 0 ? '+' : '−'}${Math.abs(c.delta)} ${cardName(c.card)}</span>`).join('')}</span>` : '';
  return `<p class="cal-role"><span class="cal-role-name">${label}:</span> ${escapeHtml(r.text)}${calc}</p>`
    + r.notes.map(({ card, e }) => `<p class="cal-role-note cal-${e.effect}">${mark(e.effect)}<span><strong>${cardName(card)}:</strong> ${escapeHtml(e.text)}</span></p>`).join('');
}

/** Everyone a calamity touches: the primary victim and any secondary victims,
 *  as it works out for this player, then other players and the beneficiary. */
function renderRoles(cal: Calamity, held: ReadonlySet<string>): string {
  const roles = CALAMITY_ROLES[cal.name];
  return `<div class="cal-roles">`
    + roleLines(cal, 'primary', held)
    + roleLines(cal, 'secondary', held)
    + (roles?.others ? `<p class="cal-role"><span class="cal-role-name">Other players:</span> ${escapeHtml(roles.others)}</p>` : '')
    + (roles?.beneficiary ? `<p class="cal-role"><span class="cal-role-name">Beneficiary:</span> ${escapeHtml(roles.beneficiary[0]!.toUpperCase() + roles.beneficiary.slice(1))}</p>` : '')
    + `</div>`;
}

/** A ✓ after a calamity's name for each way the player's cards change it:
 *  green when one helps, red when one hurts. */
function heldMarks(cal: Calamity, held: ReadonlySet<string>): string {
  const mine = cardsFor(cal).filter(c => held.has(c.id)).map(c => c.e.effect);
  return (['help', 'hurt'] as const).filter(f => mine.includes(f))
    .map(f => `<span class="cal-check cal-check-${f}" aria-label="your cards ${f === 'help' ? 'help' : 'hurt'}">✓</span>`).join('');
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

/** Every calamity in this game as a collapsible row: stack, name, kind, who
 *  suffers what (as it works out for this player), the Quick Chart text and
 *  what each card does to it, ✓ on the player's own.
 *  Minor calamities only when the player count uses them. `open` names the
 *  rows to render expanded, so a live re-render keeps what the player opened. */
export function renderCalamityReference(heldIds: Iterable<string>, playerCount: number,
  open: ReadonlySet<string> = new Set()): string {
  const held = new Set(heldIds);
  const item = (cal: Calamity) => {
    const mods = cardsFor(cal).map(({ id, e }) => `<li class="cal-${e.effect}${held.has(id) ? ' cal-held' : ''}">`
      + mark(e.effect)
      + `<span><span class="cal-mod-card">${cardName(id)}:</span> ${escapeHtml(e.text)}</span>`
      + (held.has(id) ? '<span class="cal-check" aria-label="you hold this card">✓</span>' : '')
      + `</li>`).join('');
    return `<details class="cal-ref-item" data-calamity="${escapeHtml(cal.name)}"${open.has(cal.name) ? ' open' : ''}>`
      + `<summary><span class="cal-stack">${cal.stack}</span><span class="cal-ref-name">${escapeHtml(cal.name)}</span>${heldMarks(cal, held)}`
      + `<span class="cal-kind cal-kind-${cal.kind}">${KIND_LABEL[cal.kind]}</span></summary>`
      + renderRoles(cal, held)
      + cal.text.map(t => `<p class="cal-chart">${escapeHtml(t)}</p>`).join('')
      + (mods ? `<ul class="cal-mods">${mods}</ul>` : '')
      + `</details>`;
  };
  const major = `<h4>Major calamities</h4><div class="cal-ref-list">${CALAMITIES.filter(c => c.kind !== 'minor').map(item).join('')}</div>`;
  return minorCalamitiesInPlay(playerCount)
    ? `<h4>Minor calamities</h4><div class="cal-ref-list">${CALAMITIES.filter(c => c.kind === 'minor').map(item).join('')}</div>` + major
    : major + `<p class="cal-none">Minor calamities are not used with ${playerCount} players, only with 9–11 or 15–18.</p>`;
}
