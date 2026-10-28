/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The Cards tab on the player page (every advance card as a row with a Buy
// button) and the GM's card correction tiles on the admin page. Rendered by
// the server on load and re-rendered by the client on every state update, so
// both share these functions.

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
  /** Phase 12 (after calamities): new cards may be bought. */
  canBuy?: boolean;
  /** Colour splits being edited on this page, kept across live re-renders. */
  drafts?: ReadonlyMap<string, CreditChoice>;
  /** How the player has chosen to order the cards. */
  sort?: CardSort;
  dir?: SortDir;
  /** The card rows to render expanded, so a live re-render keeps what the
   *  player opened. */
  open?: ReadonlySet<string>;
  /** The last round whose purchase the player confirmed (0 = none). */
  confirmed?: number;
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

/** The player's card count and VP, then a line on how buying works. */
function pickSummary(held: readonly HeldAdvance[], hint: string): string {
  const t = advanceTotals(held.map(h => h.id));
  return `<p class="adv-pick-summary"><strong>${held.length}</strong> cards · <strong>${t.adv_points}</strong> VP`
    + ` <span class="adv-pick-tiers">(${t.adv_1vp} × 1 · ${t.adv_3vp} × 3 · ${t.adv_6vp} × 6)</span></p>`
    + `<p class="adv-pick-hint">${hint}</p>`;
}

/** Under a held Monument / Written Record: the colour chooser, which opens by
 *  itself until a choice is saved; after that, while it may still be
 *  corrected, it opens only on "Change colours". */
function chooserFor(c: AdvanceCard, h: HeldAdvance | undefined, round: number,
  drafts: ReadonlyMap<string, CreditChoice>, gm: boolean, confirmed = 0): string {
  if (!h || !c.choiceCredits || !(gm || creditChoiceOpen(h, round, confirmed))) return '';
  if (!h.choice || drafts.has(c.id)) return renderChooser(c, drafts.get(c.id) ?? h.choice ?? {});
  return `<button type="button" class="adv-choice-change" data-choice-change="${c.id}">Change colours</button>`;
}

/** The GM's card correction on the admin page: every card as a tap-to-toggle
 *  tile, grouped by colour, locked or not and in any phase. Dual-group cards
 *  are listed under their first group, with a dot in the second group's
 *  colour. */
export function renderAdvancePicker(held: readonly HeldAdvance[], round: number,
  { drafts = new Map(), confirmed = 0 }: Pick<PickerOptions, 'drafts' | 'confirmed'> = {}): string {
  const heldById = new Map(held.map(h => [h.id, h]));
  const prices = priceList(held, round);
  const groups = sections('group', 'asc', prices).map(({ group, cards }) => {
    const buttons = cards.map(c => {
      const h = heldById.get(c.id);
      const cls = `adv-pick adv-${c.groups[0]}${dual(c)}${h ? ' adv-held' : ''}`;
      return `<button type="button" class="${cls}" data-advance="${c.id}" aria-pressed="${!!h}">`
        + `<span class="adv-pick-name">${escapeHtml(c.name)}${dot(c)}</span>`
        + `<span class="adv-pick-meta">${priceHtml(c, prices.get(c.id)!)} · ${c.vp} VP${h && h.round === round ? ' · <em>new</em>' : ''}</span>`
        + `</button>`
        + chooserFor(c, h, round, drafts, true);
    }).join('');
    return section(group, `<div class="adv-pick-grid">${buttons}</div>`);
  }).join('');
  return pickSummary(held, '<strong>GM correction:</strong> tick or untick any card, also locked ones and in any phase. A card added now counts as bought this round in the buying phase, otherwise in the round before.')
    + groups + basket(held, round, confirmed >= round
    ? { done: 'Confirmed by the player', buttons: `<button type="button" class="adv-basket-reopen">Reopen</button>` }
    : { buttons: CLEAR });
}

/** The Cards tab: every card as a row that opens to its full text, in the
 *  order the player picked (by colour, cheapest first, unless chosen
 *  otherwise). Held cards are filled in their colour. While buying, a Buy
 *  button on each card not yet held; this round's cards show as Buying and
 *  can be undone until the player confirms the purchase or the round ends,
 *  when they lock. Prices are after credits, with Library and Anatomy
 *  counted (priceList). */
export function renderCardList(held: readonly HeldAdvance[], round: number,
  { canBuy = true, drafts = new Map(), sort = 'group', dir = DEFAULT_DIR[sort], open = new Set(), confirmed = 0 }: PickerOptions = {}): string {
  const done = confirmed >= round;
  const heldById = new Map(held.map(h => [h.id, h]));
  const prices = priceList(held, round);
  const list = sections(sort, dir, prices).map(({ group, cards }) => {
    const rows = cards.map(c => {
      const h = heldById.get(c.id);
      const fresh = !!h && !advanceLocked(h, round, confirmed);
      const action = h && !(fresh && canBuy)
        ? `<span class="adv-ref-held">✓ ${h.round === round ? 'Bought' : 'Owned'}</span>`
        : canBuy && !done
        ? `<button type="button" class="adv-buy" data-advance="${c.id}" aria-pressed="${fresh}"${fresh ? ' title="Tap to undo"' : ''}>${fresh ? '✓ Buying' : 'Buy'}</button>`
        : '';
      return `<details class="adv-ref-item adv-${c.groups[0]}${dual(c)}${h ? ' adv-held' : ''}" data-advance-ref="${c.id}"${open.has(c.id) ? ' open' : ''}>`
        + `<summary><span class="adv-ref-name">${escapeHtml(c.name)}${dot(c)}</span>`
        + `<span class="adv-ref-end"><span class="adv-ref-meta">${priceHtml(c, prices.get(c.id)!)} · ${c.vp} VP</span>${action}</span>`
        + `</summary>${cardBody(c, h)}</details>`
        + chooserFor(c, h, round, drafts, false, confirmed);
    }).join('');
    return section(group, `<div class="adv-ref-list">${rows}</div>`);
  }).join('');
  return pickSummary(held, done
    ? 'Your cards for this round are confirmed; ask the GM if one needs correcting. Tap a card to read it.'
    : canBuy
    ? 'Tap Buy on the cards you buy this round, then Confirm. Prices include credits from cards bought in earlier rounds. Tap a card to read it.'
    : 'Cards are bought after calamities are resolved. Tap a card to read it.')
    + list + basket(held, round, done ? { done: '✓ Confirmed' }
      : canBuy ? { buttons: `<button type="button" class="adv-basket-confirm">Confirm</button>${CLEAR}` } : {});
}

const CLEAR = `<button type="button" class="adv-basket-clear">Clear</button>`;

/** What this round's cards are and cost together, after credits, with the
 *  buttons that apply (Confirm and Clear while buying, Reopen for the GM), or
 *  `done` once the purchase is confirmed. It sits at the bottom of the screen
 *  while the player scrolls the cards. */
function basket(held: readonly HeldAdvance[], round: number, { buttons = '', done }: { buttons?: string; done?: string }): string {
  const fresh = held.filter(h => h.round === round && ADVANCE_BY_ID.has(h.id));
  if (!fresh.length) return '';
  const cost = purchaseCost(held, round).total;
  const vp = fresh.reduce((sum, h) => sum + ADVANCE_BY_ID.get(h.id)!.vp, 0);
  const names = fresh.map(h => ADVANCE_BY_ID.get(h.id)!)
    .map(c => `<span class="adv-basket-card adv-${c.groups[0]}">${escapeHtml(c.name)}</span>`).join(' · ');
  return `<div class="adv-basket" role="status"><div class="adv-basket-text">`
    + `<p>${done ? 'Bought' : 'Buying'} this round: <strong>${fresh.length}</strong> ${fresh.length === 1 ? 'card' : 'cards'}`
    + ` · <strong class="adv-basket-cost">${cost}</strong> · <span class="adv-basket-vp">+${vp} VP</span></p>`
    + `<p class="adv-basket-names">${names}</p></div>`
    + (done ? `<p class="adv-basket-done">${done}</p>` : '')
    + (buttons ? `<div class="adv-basket-buttons">${buttons}</div>` : '')
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
  const label = `A.S.T. Req. ${req.age}:`;
  const texts = req.parts.map(p => {
    const have = p.type === 'adv' ? advancesOfTier(t, p.tier) : t.adv_points;
    return { p, have, text: `${p.label} (${have})` };
  });
  const parts = texts.map(({ p, have }) => `<span class="adv-req ${have >= p.n ? 'adv-req-met' : 'adv-req-unmet'}">${escapeHtml(p.label)} <span class="adv-req-have">(${have})</span></span>`).join(' + ');
  // Its length in characters lets the CSS shrink a long line to fit one row.
  const chars = [label, ...texts.map(x => x.text)].join(' + ').length + 1;
  return credits + `<p class="adv-overview-line adv-next-age" style="--chars: ${chars}"><span class="adv-overview-label">${escapeHtml(label)}</span>${parts}</p>`;
}

/** A two-colour card is drawn as the game draws it: listed under its first
 *  colour, with a stripe in both colours and, when held, a fade from the
 *  first colour to the second (the Strategy Explorer's banner). */
const dual = (c: AdvanceCard) => c.groups[1] ? ` adv-dual adv-2-${c.groups[1]}` : '';

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
