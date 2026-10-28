/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The Cards tab on the player page: every advance card as a tap-to-toggle
// button, grouped by colour. Rendered by the server on load and re-rendered by
// src/client/civ.ts on every state update, so both share this one function.

import { escapeHtml } from './html.js';
import {
  ADVANCES, ADVANCE_BY_ID, ADVANCE_GROUPS, SPECIAL_ABILITY_IDS, advanceLocked, advanceTotals, colourCredits, creditChoiceOpen, priceList, purchaseCost,
  type AdvanceCard, type AdvanceGroup, type CreditChoice, type HeldAdvance,
} from './advances.js';
import { ADVANCE_TEXT } from './advance-text.js';
import { CARD_CALAMITIES } from './calamities.js';
import { AST_LEVELS, advancesOfTier, ageOfLevel, getAdvanceRequirement, requirementParts, type AgeReqPart } from './ast-pure.js';

export const GROUP_LABEL: Readonly<Record<AdvanceGroup, string>> = {
  science: 'Science', arts: 'Arts', crafts: 'Crafts', civics: 'Civics', religion: 'Religion',
};

/** The one-time colour chooser under a held Monument / Written Record:
 *  a −/+ stepper per group in steps of 5, and Save once the split adds up. */
function renderChooser(card: AdvanceCard, values: CreditChoice): string {
  const total = card.choiceCredits!;
  const sum = ADVANCE_GROUPS.reduce((n, g) => n + (values[g] ?? 0), 0);
  const rows = ADVANCE_GROUPS.map(g => `<div class="adv-choice-row adv-${g}">`
    + `<span class="adv-choice-group">${GROUP_LABEL[g]}</span>`
    + `<button type="button" class="adv-btn" data-choice-step="-5" data-group="${g}" aria-label="5 less ${GROUP_LABEL[g]}">−</button>`
    + `<output class="adv-choice-val" data-group="${g}">${values[g] ?? 0}</output>`
    + `<button type="button" class="adv-btn" data-choice-step="5" data-group="${g}" aria-label="5 more ${GROUP_LABEL[g]}">+</button>`
    + `</div>`).join('');
  return `<div class="adv-choice" data-choice-for="${card.id}" data-total="${total}">`
    + `<p class="adv-choice-intro"><strong>${escapeHtml(card.name)}</strong>: choose the colours of ${total} extra credits. You keep them all game.</p>`
    + rows
    + `<button type="button" class="btn-submit adv-choice-save"${sum === total ? '' : ' disabled'}>Save <span class="adv-choice-sum">${sum}</span> of ${total}</button>`
    + `</div>`;
}

export interface PickerOptions {
  /** Phase 12 (after calamities): new cards may be ticked. */
  canBuy?: boolean;
  /** Colour splits being edited on this page, kept across live re-renders. */
  drafts?: ReadonlyMap<string, CreditChoice>;
  /** The GM is correcting this player's cards: nothing is locked or closed. */
  gm?: boolean;
  /** How the player has chosen to order the cards. */
  sort?: CardSort;
  dir?: SortDir;
}

/** The orders a player can pick on the Cards tab. A–Z, Cost and VP turn
 *  round on a second click; each starts in the direction players want most.
 *  Colour and VP/cost (most VP for the money) only go one way. */
export type CardSort = 'group' | 'name' | 'cost' | 'vp' | 'value';
export type SortDir = 'asc' | 'desc';
export const CARD_SORTS: readonly CardSort[] = ['group', 'name', 'cost', 'vp', 'value'];
export const DEFAULT_DIR: Readonly<Record<CardSort, SortDir>> = { group: 'asc', name: 'asc', cost: 'asc', vp: 'asc', value: 'desc' };
export const isCardSort = (s: unknown): s is CardSort => CARD_SORTS.includes(s as CardSort);
export const isSortDir = (s: unknown): s is SortDir => s === 'asc' || s === 'desc';
/** Whether a second click on the sort's button turns the order round. */
export const isReversible = (s: CardSort) => s !== 'group' && s !== 'value';

const SORT_LABEL: Readonly<Record<CardSort, Record<SortDir, [label: string, title: string]>>> = {
  group: { asc: ['Colour', 'By colour, cheapest first'], desc: ['Colour', 'By colour, cheapest first'] },
  name: { asc: ['A–Z', 'A to Z'], desc: ['Z–A', 'Z to A'] },
  cost: { asc: ['Cost ↑', 'Cheapest first, after credits'], desc: ['Cost ↓', 'Dearest first, after credits'] },
  vp: { asc: ['VP ↑', 'Fewest VP first'], desc: ['VP ↓', 'Most VP first'] },
  value: { asc: ['VP/cost', 'Most VP for the money first, after credits'], desc: ['VP/cost', 'Most VP for the money first, after credits'] },
};
/** A sort button's text and tooltip in a direction. */
export const sortLabel = (sort: CardSort, dir: SortDir) => SORT_LABEL[sort][dir];

/** One sort button; the active one shows its direction. */
export function renderSortButton(sort: CardSort, active: CardSort, dir: SortDir): string {
  const [label, title] = sortLabel(sort, sort === active ? dir : DEFAULT_DIR[sort]);
  return `<button type="button" class="adv-sort-btn" data-card-sort="${sort}" aria-pressed="${sort === active}" title="${title}">${label}</button>`;
}

/** A colour's cards as the box shows them: cheapest first by printed cost. */
const groupCards = (g: AdvanceGroup): AdvanceCard[] => ADVANCES
  .filter(c => c.groups[0] === g)
  .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));

const priceHtml = (c: AdvanceCard, price: number) => price < c.cost
  ? `<s>${c.cost}</s> <strong class="adv-price">${price}</strong>` : `${c.cost}`;

/** The cards in sections: one per colour, or a single unheaded list by name,
 *  price after credits, VP, or VP per price after credits (a free card is the
 *  best value) in the chosen direction. Ties go cheapest first, then by name. */
function sections(sort: CardSort, dir: SortDir, price: ReadonlyMap<string, number>): { group?: AdvanceGroup; cards: AdvanceCard[] }[] {
  if (sort === 'group') return ADVANCE_GROUPS.map(g => ({ group: g, cards: groupCards(g) }));
  const byName = (a: AdvanceCard, b: AdvanceCard) => a.name.localeCompare(b.name);
  const byPrice = (a: AdvanceCard, b: AdvanceCard) => price.get(a.id)! - price.get(b.id)!;
  // VP per price, compared crosswise so a price of 0 needs no division.
  const byValue = (a: AdvanceCard, b: AdvanceCard) => a.vp * price.get(b.id)! - b.vp * price.get(a.id)!;
  const primary = sort === 'name' ? byName : sort === 'cost' ? byPrice : sort === 'vp' ? (a: AdvanceCard, b: AdvanceCard) => a.vp - b.vp : byValue;
  const sign = (isReversible(sort) ? dir : DEFAULT_DIR[sort]) === 'desc' ? -1 : 1;
  return [{ cards: [...ADVANCES].sort((a, b) => sign * primary(a, b) || byPrice(a, b) || byName(a, b)) }];
}

const section = (group: AdvanceGroup | undefined, inner: string) => group
  ? `<section class="adv-group adv-${group}"><h4>${GROUP_LABEL[group]}</h4>${inner}</section>`
  : `<section class="adv-group">${inner}</section>`;

/** Inner HTML of the Cards tab picker. Dual-group cards are listed under their
 *  first group, with a dot in the second group's colour. Cards bought in an
 *  earlier round are locked; unheld cards can only be ticked while buying. */
export function renderAdvancePicker(held: readonly HeldAdvance[], round: number,
  { canBuy = true, drafts = new Map(), gm = false, sort = 'group', dir = DEFAULT_DIR[sort] }: PickerOptions = {}): string {
  const heldById = new Map(held.map(h => [h.id, h]));
  const t = advanceTotals(heldById.keys());
  const summary = `<p class="adv-pick-summary"><strong>${heldById.size}</strong> cards · <strong>${t.adv_points}</strong> VP`
    + ` <span class="adv-pick-tiers">(${t.adv_1vp} × 1 · ${t.adv_3vp} × 3 · ${t.adv_6vp} × 6)</span></p>`
    + `<p class="adv-pick-hint">${gm
      ? '<strong>GM correction:</strong> tick or untick any card, also locked ones and in any phase. A card added now counts as bought this round in the buying phase, otherwise in the round before.'
      : canBuy
      ? 'Tick the cards you buy this round. Prices include credits from cards bought in earlier rounds. Cards lock when the round ends.'
      : 'Cards are bought after calamities are resolved.'}</p>`;
  // Tile prices: after credits, with Library and Anatomy counted (priceList).
  const prices = priceList(held, round);
  const groups = sections(sort, dir, prices).map(({ group, cards }) => {
    const buttons = cards.map(c => {
      const h = heldById.get(c.id);
      const bought = h ? advanceLocked(h, round) : false;
      const locked = bought && !gm;
      const closed = !locked && !canBuy && !gm;
      const cost = priceHtml(c, prices.get(c.id)!);
      // The chooser opens by itself until a choice is saved; after that, while
      // it may still be corrected, it opens only on "Change colours".
      const open = h && c.choiceCredits && (gm || creditChoiceOpen(h, round));
      const chooser = open && (!h.choice || drafts.has(c.id))
        ? renderChooser(c, drafts.get(c.id) ?? h.choice ?? {}) : '';
      const change = open && h.choice && !drafts.has(c.id)
        ? `<button type="button" class="adv-choice-change" data-choice-change="${c.id}">Change colours</button>` : '';
      // The tile carries its colour, so it keeps it outside a colour section.
      const cls = `adv-pick adv-${c.groups[0]}${h ? ' adv-held' : ''}${locked ? ' adv-locked' : ''}${closed ? ' adv-closed' : ''}`;
      return `<button type="button" class="${cls}" data-advance="${c.id}" aria-pressed="${!!h}"${locked || closed ? ' aria-disabled="true"' : ''}>`
        + `<span class="adv-pick-name">${escapeHtml(c.name)}${dot(c)}</span>`
        + `<span class="adv-pick-meta">${cost} · ${c.vp} VP${h && h.round === round ? ' · <em>new</em>' : ''}</span>`
        + `</button>`
        + change
        + chooser;
    }).join('');
    return section(group, `<div class="adv-pick-grid">${buttons}</div>`);
  }).join('');
  return summary + groups + basket(held, round, canBuy || gm);
}

/** What this round's ticked cards are and cost together, after credits, with
 *  Clear to untick them all while buying. It sits at the bottom of the screen
 *  while the player scrolls the cards. */
function basket(held: readonly HeldAdvance[], round: number, canClear: boolean): string {
  const fresh = held.filter(h => h.round === round && ADVANCE_BY_ID.has(h.id));
  if (!fresh.length) return '';
  const cost = purchaseCost(held, round).total;
  const vp = fresh.reduce((sum, h) => sum + ADVANCE_BY_ID.get(h.id)!.vp, 0);
  const names = fresh.map(h => ADVANCE_BY_ID.get(h.id)!)
    .map(c => `<span class="adv-basket-card adv-${c.groups[0]}">${escapeHtml(c.name)}</span>`).join(' · ');
  return `<div class="adv-basket" role="status"><div class="adv-basket-text">`
    + `<p>Buying this round: <strong>${fresh.length}</strong> ${fresh.length === 1 ? 'card' : 'cards'}`
    + ` · <strong class="adv-basket-cost">${cost}</strong> · +${vp} VP</p>`
    + `<p class="adv-basket-names">${names}</p></div>`
    + (canClear ? `<button type="button" class="adv-basket-clear">Clear</button>` : '')
    + `</div>`;
}

/** Where a player stands on the A.S.T.: their square, civ and game mode. */
export interface AstStanding { level: number; civNumber: number; expert: boolean }

/** The card part of the requirement for the next age that has one, or null
 *  at the top of the board. Ages past the current one only. */
export function nextAgeCardRequirement({ level, civNumber, expert }: AstStanding): { age: string; parts: AgeReqPart[] } | null {
  const here = ageOfLevel(level);
  for (const from of AST_LEVELS.filter(l => l >= level)) {
    const age = ageOfLevel(from + 5);
    if (age === here || from + 5 > AST_LEVELS.at(-1)!) continue;
    const parts = requirementParts(getAdvanceRequirement({ ast_level: from, civ_number: civNumber }, expert))
      .filter(p => p.type !== 'cities');
    if (parts.length) return { age: age.name, parts };
  }
  return null;
}

/** Above the cards: the colour credits the player's cards give, unlabelled to
 *  fit one line on a phone (and what this
 *  round's cards add from next round), and the cards the next age asks for,
 *  counting this round's cards, so the player need not switch tabs. */
export function renderCardOverview(held: readonly HeldAdvance[], round: number, ast?: AstStanding): string {
  const now = colourCredits(held, round);
  const next = colourCredits(held);
  const chips = ADVANCE_GROUPS.map(g => `<span class="adv-credit-total adv-${g}"><span class="adv-credit-name">${GROUP_LABEL[g]}</span> <strong>${now[g]}</strong>`
    + (next[g] > now[g] ? ` → ${next[g]}` : '') + `</span>`).join('');
  const credits = `<p class="adv-credit-totals" aria-label="Colour credits">${chips}</p>`;
  const req = ast && nextAgeCardRequirement(ast);
  if (!req) return credits;
  const t = advanceTotals(held.map(h => h.id));
  const parts = req.parts.map(p => {
    const have = p.type === 'adv' ? advancesOfTier(t, p.tier) : t.adv_points;
    return `<span class="adv-req ${have >= p.n ? 'adv-req-met' : 'adv-req-unmet'}">${escapeHtml(p.label)} <span class="adv-req-have">(${have})</span></span>`;
  }).join(' + ');
  return credits + `<p class="adv-overview-line adv-next-age"><span class="adv-overview-label">A.S.T. Req. ${escapeHtml(req.age)}:</span>${parts}</p>`;
}

const dot = (c: AdvanceCard) => c.groups[1]
  ? `<span class="adv-dot adv-${c.groups[1]}" title="${GROUP_LABEL[c.groups[1]]}"></span>` : '';

/** The named-card credits each card receives: target id → givers. */
const CREDITS_FROM: ReadonlyMap<string, readonly { from: AdvanceCard; n: number }[]> = (() => {
  const m = new Map<string, { from: AdvanceCard; n: number }[]>();
  for (const from of ADVANCES) {
    for (const [id, n] of Object.entries(from.special)) m.set(id, [...(m.get(id) ?? []), { from, n }]);
  }
  return m;
})();

/** A credit amount in a group's colour. */
const credit = (g: AdvanceGroup, text: string) => `<span class="adv-ref-credit adv-${g}">${escapeHtml(text)}</span>`;
const line = (label: string, items: string[]) => items.length
  ? `<p class="adv-ref-credits">${label}: ${items.join(' · ')}</p>` : '';

/** Everything printed on a card except its picture, one line per effect:
 *  attributes, calamities, colour credits, the player's own colour split,
 *  the credit to a named card, the named cards that credit this one, and
 *  when the player bought it. */
function cardBody(c: AdvanceCard, held?: HeldAdvance): string {
  const text = ADVANCE_TEXT[c.id] ?? [];
  const attrs = text.map((t, i) => `<p>${i === 0 && SPECIAL_ABILITY_IDS.includes(c.id) ? '<strong>Special ability:</strong> ' : ''}${escapeHtml(t)}</p>`).join('');
  const cals = (CARD_CALAMITIES[c.id] ?? []).map(e => `<p class="adv-ref-cal cal-${e.effect}">`
    + `<span class="cal-mark" aria-label="${e.effect === 'help' ? 'helps' : 'hurts'}">${e.effect === 'help' ? '＋' : '−'}</span>`
    + `<span><strong>${escapeHtml(e.calamity)}:</strong> ${escapeHtml(e.text)}</span></p>`).join('');
  const choice = held?.choice;
  const chosen = choice ? ADVANCE_GROUPS.filter(g => choice[g]).map(g => credit(g, `${choice[g]} ${GROUP_LABEL[g]}`)) : [];
  // A credit to or from a named card is in that card's colour (its first
  // colour, where it is listed).
  return attrs + cals
    + line('Credits', ADVANCE_GROUPS.filter(g => c.credits[g]).map(g => credit(g, `${c.credits[g]} ${GROUP_LABEL[g]}`)))
    + (c.choiceCredits ? line('Credits of your choice', chosen.length ? chosen : [`${c.choiceCredits}, chosen once`]) : '')
    + line('Card credit', Object.entries(c.special).flatMap(([id, n]) => {
      const to = ADVANCE_BY_ID.get(id);
      return to ? [credit(to.groups[0]!, `${n} to ${to.name}`)] : [];
    }))
    + line('Cheaper with', (CREDITS_FROM.get(c.id) ?? []).map(({ from, n }) => credit(from.groups[0]!, `${from.name} −${n}`)))
    + (held ? `<p class="adv-ref-bought">Bought in round ${held.round}</p>` : '');
}

/** Every card as a collapsible row, in the order the player picked (by
 *  colour, cheapest first, unless chosen otherwise), so players can read what
 *  a card does. Prices are as in the picker. `open` names the rows to render
 *  expanded, so a live re-render keeps what the player opened. */
export function renderAdvanceReference(held: readonly HeldAdvance[], open: ReadonlySet<string> = new Set(),
  round = 0, sort: CardSort = 'group', dir: SortDir = DEFAULT_DIR[sort]): string {
  const heldById = new Map(held.map(h => [h.id, h]));
  const prices = priceList(held, round);
  return sections(sort, dir, prices).map(({ group, cards }) => {
    const rows = cards.map(c =>
      `<details class="adv-ref-item adv-${c.groups[0]}" data-advance-ref="${c.id}"${open.has(c.id) ? ' open' : ''}>`
      + `<summary><span class="adv-ref-name">${escapeHtml(c.name)}${dot(c)}</span>`
      + `<span class="adv-ref-meta">${priceHtml(c, prices.get(c.id)!)} · ${c.vp} VP</span>`
      + (heldById.has(c.id) ? '<span class="adv-ref-held" aria-label="you hold this card">✓</span>' : '')
      + `</summary>${cardBody(c, heldById.get(c.id))}</details>`).join('');
    return section(group, `<div class="adv-ref-list">${rows}</div>`);
  }).join('');
}
