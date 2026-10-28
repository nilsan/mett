/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Civilization Advance cards — the single source of truth for card data.
// Pure: imported by the server and the browser bundles alike.
//
// Card data comes from the game's Strategy Explorer sheet (the rulebook names
// the cards but not their cost, groups or credits). Credit rules, from the rulebook § Purchase
// of Civilization Advances:
//   • Permanent group credits come from cards bought in *previous* turns.
//   • A card in two groups takes the credit of the one group that discounts
//     it most; the two groups' credits are never combined.
//   • Special credits printed at the bottom of a card discount one named card.

export type AdvanceGroup = 'science' | 'arts' | 'crafts' | 'civics' | 'religion';

export const ADVANCE_GROUPS: readonly AdvanceGroup[] = ['science', 'arts', 'crafts', 'civics', 'religion'];

export interface AdvanceCard {
  /** Stable slug, stored in player_advances.advance_id — never rename. */
  id: string;
  name: string;
  /** Printed cost, before credits. */
  cost: number;
  /** Printed victory points. */
  vp: 1 | 3 | 6;
  /** One group, or two for dual-group cards. */
  groups: readonly AdvanceGroup[];
  /** Permanent credit tokens the card gives, per group (colour credits plus any
   *  additional credits named in the attributes). */
  credits: Readonly<Partial<Record<AdvanceGroup, number>>>;
  /** Special credits to specific cards: advance id → amount. */
  special: Readonly<Record<string, number>>;
  /** Extra credit tokens in colours the player picks once, when buying the
   *  card, and keeps for the rest of the game (Monument 20, Written Record 10). */
  choiceCredits?: number;
}

// Transcribed from the game's Civilization Advances – Strategy Explorer sheet,
// one row per line of the sheet: tier 1 (1 VP) → tier 2 (3 VP) → tier 3 (6 VP).
// Each card gives a special credit to the next card in its row (10 from tier 1,
// 20 from tier 2).
export const ADVANCES: readonly AdvanceCard[] = [
  // Mysticism → Monument → Wonder of the World
  { id: 'mysticism', name: 'Mysticism', cost: 50, vp: 1, groups: ['arts', 'religion'], credits: { arts: 5, religion: 5 }, special: { 'monument': 10 } },
  { id: 'monument', name: 'Monument', cost: 180, vp: 3, groups: ['crafts', 'religion'], credits: { crafts: 10, religion: 10 }, special: { 'wonder-of-the-world': 20 }, choiceCredits: 20 },
  { id: 'wonder-of-the-world', name: 'Wonder of the World', cost: 290, vp: 6, groups: ['arts', 'crafts'], credits: { arts: 20, crafts: 20 }, special: {} },
  // Sculpture → Architecture → Mining
  { id: 'sculpture', name: 'Sculpture', cost: 50, vp: 1, groups: ['arts'], credits: { arts: 10, civics: 5 }, special: { 'architecture': 10 } },
  { id: 'architecture', name: 'Architecture', cost: 140, vp: 3, groups: ['arts'], credits: { science: 5, arts: 10 }, special: { 'mining': 20 } },
  { id: 'mining', name: 'Mining', cost: 230, vp: 6, groups: ['crafts'], credits: { science: 5, crafts: 20 }, special: {} },
  // Cloth Making → Naval Warfare → Diaspora
  { id: 'cloth-making', name: 'Cloth Making', cost: 50, vp: 1, groups: ['crafts'], credits: { arts: 5, crafts: 10 }, special: { 'naval-warfare': 10 } },
  { id: 'naval-warfare', name: 'Naval Warfare', cost: 160, vp: 3, groups: ['civics'], credits: { crafts: 5, civics: 10 }, special: { 'diaspora': 20 } },
  { id: 'diaspora', name: 'Diaspora', cost: 270, vp: 6, groups: ['religion'], credits: { arts: 5, religion: 20 }, special: {} },
  // Urbanism → Diplomacy → Provincial Empire
  { id: 'urbanism', name: 'Urbanism', cost: 50, vp: 1, groups: ['civics'], credits: { science: 5, civics: 10 }, special: { 'diplomacy': 10 } },
  { id: 'diplomacy', name: 'Diplomacy', cost: 160, vp: 3, groups: ['arts'], credits: { arts: 10, civics: 5 }, special: { 'provincial-empire': 20 } },
  { id: 'provincial-empire', name: 'Provincial Empire', cost: 260, vp: 6, groups: ['civics'], credits: { civics: 20, religion: 5 }, special: {} },
  // Monarchy → Law → Cultural Ascendancy
  { id: 'monarchy', name: 'Monarchy', cost: 60, vp: 1, groups: ['civics'], credits: { civics: 10, religion: 5 }, special: { 'law': 10 } },
  { id: 'law', name: 'Law', cost: 150, vp: 3, groups: ['civics'], credits: { civics: 10, religion: 5 }, special: { 'cultural-ascendancy': 20 } },
  { id: 'cultural-ascendancy', name: 'Cultural Ascendancy', cost: 280, vp: 6, groups: ['arts'], credits: { arts: 20, religion: 5 }, special: {} },
  // Written Record → Cartography → Library
  { id: 'written-record', name: 'Written Record', cost: 60, vp: 1, groups: ['civics', 'science'], credits: { science: 5, civics: 5 }, special: { 'cartography': 10 }, choiceCredits: 10 },
  { id: 'cartography', name: 'Cartography', cost: 160, vp: 3, groups: ['science'], credits: { science: 10, arts: 5 }, special: { 'library': 20 } },
  { id: 'library', name: 'Library', cost: 220, vp: 6, groups: ['science'], credits: { science: 20, arts: 5 }, special: {} },
  // Pottery → Agriculture → Democracy
  { id: 'pottery', name: 'Pottery', cost: 60, vp: 1, groups: ['crafts'], credits: { arts: 5, crafts: 10 }, special: { 'agriculture': 10 } },
  { id: 'agriculture', name: 'Agriculture', cost: 120, vp: 3, groups: ['crafts'], credits: { science: 5, crafts: 10 }, special: { 'democracy': 20 } },
  { id: 'democracy', name: 'Democracy', cost: 220, vp: 6, groups: ['civics'], credits: { arts: 5, civics: 20 }, special: {} },
  // Masonry → Engineering → Roadbuilding
  { id: 'masonry', name: 'Masonry', cost: 60, vp: 1, groups: ['crafts'], credits: { science: 5, crafts: 10 }, special: { 'engineering': 10 } },
  { id: 'engineering', name: 'Engineering', cost: 160, vp: 3, groups: ['crafts', 'science'], credits: { science: 10, crafts: 10 }, special: { 'roadbuilding': 20 } },
  { id: 'roadbuilding', name: 'Roadbuilding', cost: 220, vp: 6, groups: ['crafts'], credits: { science: 5, crafts: 20 }, special: {} },
  // Mythology → Literacy → Mathematics
  { id: 'mythology', name: 'Mythology', cost: 60, vp: 1, groups: ['religion'], credits: { arts: 5, religion: 10 }, special: { 'literacy': 10 } },
  { id: 'literacy', name: 'Literacy', cost: 110, vp: 3, groups: ['arts', 'civics'], credits: { science: 5, arts: 10, crafts: 5, civics: 10, religion: 5 }, special: { 'mathematics': 20 } },
  { id: 'mathematics', name: 'Mathematics', cost: 250, vp: 6, groups: ['arts', 'science'], credits: { science: 20, arts: 20, crafts: 10, civics: 10, religion: 10 }, special: {} },
  // Empiricism → Medicine → Anatomy
  { id: 'empiricism', name: 'Empiricism', cost: 60, vp: 1, groups: ['science'], credits: { science: 10, arts: 5, crafts: 5, civics: 5, religion: 5 }, special: { 'medicine': 10 } },
  { id: 'medicine', name: 'Medicine', cost: 140, vp: 3, groups: ['science'], credits: { science: 10, crafts: 5 }, special: { 'anatomy': 20 } },
  { id: 'anatomy', name: 'Anatomy', cost: 270, vp: 6, groups: ['science'], credits: { science: 20, crafts: 5 }, special: {} },
  // Deism → Fundamentalism → Monotheism
  { id: 'deism', name: 'Deism', cost: 70, vp: 1, groups: ['religion'], credits: { crafts: 5, religion: 10 }, special: { 'fundamentalism': 10 } },
  { id: 'fundamentalism', name: 'Fundamentalism', cost: 150, vp: 3, groups: ['religion'], credits: { arts: 5, religion: 10 }, special: { 'monotheism': 20 } },
  { id: 'monotheism', name: 'Monotheism', cost: 240, vp: 6, groups: ['religion'], credits: { civics: 5, religion: 20 }, special: {} },
  // Theocracy → Universal Doctrine → Theology
  { id: 'theocracy', name: 'Theocracy', cost: 80, vp: 1, groups: ['civics', 'religion'], credits: { civics: 5, religion: 5 }, special: { 'universal-doctrine': 10 } },
  { id: 'universal-doctrine', name: 'Universal Doctrine', cost: 160, vp: 3, groups: ['religion'], credits: { civics: 5, religion: 10 }, special: { 'theology': 20 } },
  { id: 'theology', name: 'Theology', cost: 250, vp: 6, groups: ['religion'], credits: { science: 5, religion: 20 }, special: {} },
  // Drama and Poetry → Rhetoric → Politics
  { id: 'drama-and-poetry', name: 'Drama and Poetry', cost: 80, vp: 1, groups: ['arts'], credits: { arts: 10, religion: 5 }, special: { 'rhetoric': 10 } },
  { id: 'rhetoric', name: 'Rhetoric', cost: 130, vp: 3, groups: ['arts'], credits: { arts: 10, civics: 5 }, special: { 'politics': 20 } },
  { id: 'politics', name: 'Politics', cost: 230, vp: 6, groups: ['arts'], credits: { arts: 20, religion: 5 }, special: {} },
  // Music → Enlightenment → Philosophy
  { id: 'music', name: 'Music', cost: 80, vp: 1, groups: ['arts'], credits: { arts: 10, religion: 5 }, special: { 'enlightenment': 10 } },
  { id: 'enlightenment', name: 'Enlightenment', cost: 160, vp: 3, groups: ['religion'], credits: { crafts: 5, religion: 10 }, special: { 'philosophy': 20 } },
  { id: 'philosophy', name: 'Philosophy', cost: 220, vp: 6, groups: ['religion', 'science'], credits: { science: 20, religion: 20 }, special: {} },
  // Astronavigation → Calendar → Public Works
  { id: 'astronavigation', name: 'Astronavigation', cost: 80, vp: 1, groups: ['science'], credits: { science: 10, religion: 5 }, special: { 'calendar': 10 } },
  { id: 'calendar', name: 'Calendar', cost: 180, vp: 3, groups: ['science'], credits: { science: 10, civics: 5 }, special: { 'public-works': 20 } },
  { id: 'public-works', name: 'Public Works', cost: 230, vp: 6, groups: ['civics'], credits: { crafts: 5, civics: 20 }, special: {} },
  // Coinage → Trade Routes → Trade Empire
  { id: 'coinage', name: 'Coinage', cost: 90, vp: 1, groups: ['science'], credits: { science: 10, civics: 5 }, special: { 'trade-routes': 10 } },
  { id: 'trade-routes', name: 'Trade Routes', cost: 180, vp: 3, groups: ['crafts'], credits: { crafts: 10, religion: 5 }, special: { 'trade-empire': 20 } },
  { id: 'trade-empire', name: 'Trade Empire', cost: 260, vp: 6, groups: ['crafts'], credits: { crafts: 20, civics: 5 }, special: {} },
  // Metalworking → Military → Advanced Military
  { id: 'metalworking', name: 'Metalworking', cost: 90, vp: 1, groups: ['crafts'], credits: { crafts: 10, civics: 5 }, special: { 'military': 10 } },
  { id: 'military', name: 'Military', cost: 170, vp: 3, groups: ['civics'], credits: { crafts: 5, civics: 10 }, special: { 'advanced-military': 20 } },
  { id: 'advanced-military', name: 'Advanced Military', cost: 240, vp: 6, groups: ['civics'], credits: { science: 5, civics: 20 }, special: {} },
];

export const ADVANCE_BY_ID: ReadonlyMap<string, AdvanceCard> = new Map(ADVANCES.map(a => [a.id, a]));

// Cards that set the other player flags (rulebook § Card-Specific Rules).
export const MILITARY_ID = 'military';
export const WONDER_ID = 'wonder-of-the-world';
/** "There are 7 different Civilization Advances with special abilities." */
export const SPECIAL_ABILITY_IDS: readonly string[] = [
  'diaspora', 'fundamentalism', 'monotheism', 'politics', 'provincial-empire', 'trade-routes', 'universal-doctrine',
];

/** The players-row flags a set of held cards implies (1/0, as stored). */
export function advanceFlags(ids: Iterable<string>): { military: number; wonder: number; special: number } {
  const held = new Set(ids);
  return {
    military: held.has(MILITARY_ID) ? 1 : 0,
    wonder: held.has(WONDER_ID) ? 1 : 0,
    special: SPECIAL_ABILITY_IDS.some(id => held.has(id)) ? 1 : 0,
  };
}

/** Colour split of a card's choiceCredits: group → amount. */
export type CreditChoice = Partial<Record<AdvanceGroup, number>>;

/** A card a player holds, the round it was bought in and, for Monument and
 *  Written Record, the colours the player chose for the extra credits. */
export interface HeldAdvance {
  id: string;
  round: number;
  choice?: CreditChoice;
}

/** Whether a held card's colour choice may still be made or changed in
 *  `round`: while none is set, or during the round the card was bought. */
export function creditChoiceOpen(held: HeldAdvance, round: number): boolean {
  return !held.choice || held.round === round;
}

/** A card bought in an earlier round is locked: the player can no longer
 *  untick it (the GM still can, to correct a mistake). */
export function advanceLocked(held: HeldAdvance, round: number): boolean {
  return held.round < round;
}

/** Why a player may not change their cards from `held` to `ids` in `round`,
 *  or null when they may. Cards are bought in phase 12, after calamities
 *  (`buyingOpen`), and lock when the round ends. */
export function playerAdvanceChangeError(held: readonly HeldAdvance[], ids: readonly string[],
  round: number, buyingOpen: boolean): string | null {
  const want = new Set(ids);
  const dropped = held.filter(h => !want.has(h.id) && advanceLocked(h, round));
  if (dropped.length) {
    return `${dropped.map(h => ADVANCE_BY_ID.get(h.id)?.name ?? h.id).join(', ')}: bought in an earlier round, ask the GM to correct it`;
  }
  // Outside phase 12 nothing changes, not even a card ticked this round.
  const had = new Set(held.map(h => h.id));
  if (!buyingOpen && (want.size !== had.size || [...want].some(id => !had.has(id)))) {
    return 'Cards are bought after calamities are resolved';
  }
  return null;
}

/** Why `choice` is not a valid colour split for `card`, or null if it is: the
 *  card must offer choiceCredits, and the amounts — multiples of 5 in real
 *  groups — must add up to exactly that. */
export function creditChoiceError(card: AdvanceCard, choice: unknown): string | null {
  if (!card.choiceCredits) return `${card.name} has no credits to choose`;
  if (typeof choice !== 'object' || choice === null || Array.isArray(choice)) return 'choice must be an object of group amounts';
  let sum = 0;
  for (const [g, n] of Object.entries(choice)) {
    if (!ADVANCE_GROUPS.includes(g as AdvanceGroup)) return `Unknown group: ${g}`;
    if (!Number.isInteger(n) || (n as number) < 0 || (n as number) % 5 !== 0) return 'Amounts must be multiples of 5';
    sum += n as number;
  }
  return sum === card.choiceCredits ? null : `${card.name} gives ${card.choiceCredits} credits to choose, not ${sum}`;
}

/** Tier counts and VP total for a set of held cards, in the shape of the
 *  players columns the A.S.T. rules already read: adv_1vp = cards costing under
 *  100, adv_3vp = 100–199, adv_6vp = 200 and up. */
export function advanceTotals(ids: Iterable<string>, catalogue: ReadonlyMap<string, AdvanceCard> = ADVANCE_BY_ID):
  { adv_1vp: number; adv_3vp: number; adv_6vp: number; adv_points: number } {
  const t = { adv_1vp: 0, adv_3vp: 0, adv_6vp: 0, adv_points: 0 };
  for (const id of new Set(ids)) {
    const card = catalogue.get(id);
    if (!card) continue;
    if (card.vp === 1) t.adv_1vp++;
    else if (card.vp === 3) t.adv_3vp++;
    else t.adv_6vp++;
    t.adv_points += card.vp;
  }
  return t;
}

/** The colour credits a player's cards give, chosen colours included: from
 *  cards bought before `round` (what prices use), or from all held cards when
 *  `round` is omitted. */
export function colourCredits(held: readonly HeldAdvance[], round = Infinity,
  catalogue: ReadonlyMap<string, AdvanceCard> = ADVANCE_BY_ID): Record<AdvanceGroup, number> {
  const total = { science: 0, arts: 0, crafts: 0, civics: 0, religion: 0 };
  for (const h of held) {
    const card = catalogue.get(h.id);
    if (!card || h.round >= round) continue;
    for (const g of ADVANCE_GROUPS) total[g] += (card.credits[g] ?? 0) + (h.choice?.[g] ?? 0);
  }
  return total;
}

/** What `cardId` costs a player in `round`, given the cards they hold. Only
 *  cards bought before `round` give credits, chosen colours included. Never
 *  below 0. */
export function advanceCost(cardId: string, held: readonly HeldAdvance[], round: number,
  catalogue: ReadonlyMap<string, AdvanceCard> = ADVANCE_BY_ID): number {
  const card = catalogue.get(cardId);
  if (!card) throw new Error(`Unknown advance: ${cardId}`);
  const others = held.filter(h => h.id !== cardId);
  const groupCredit = colourCredits(others, round, catalogue);
  let special = 0;
  for (const h of others) {
    if (h.round < round) special += catalogue.get(h.id)?.special[cardId] ?? 0;
  }
  const bestGroup = Math.max(0, ...card.groups.map(g => groupCredit[g]));
  return Math.max(0, card.cost - bestGroup - special);
}

// ─── Purchase-time effects: Library and Anatomy ──────────────────────────────

export const LIBRARY_ID = 'library';
export const ANATOMY_ID = 'anatomy';
/** Library: "discount the cost of 1 other Civilization Advance that you
 *  purchase in the same turn as Library by 40 points" (one card only, FAQ). */
export const LIBRARY_DISCOUNT = 40;
/** Anatomy: "acquire 1 science card with an undiscounted cost price of less
 *  than 100 for free" upon purchase. */
export const ANATOMY_FREE_BELOW = 100;

/** What each card bought in `round` costs, and the total: the price after
 *  credits from earlier rounds, then Anatomy's free science card and Library's
 *  40 off one other card, both used where they save the most. */
export function purchaseCost(held: readonly HeldAdvance[], round: number,
  catalogue: ReadonlyMap<string, AdvanceCard> = ADVANCE_BY_ID): { total: number; prices: Map<string, number> } {
  const fresh = held.filter(h => h.round === round && catalogue.has(h.id)).map(h => h.id);
  const prices = new Map(fresh.map(id => [id, advanceCost(id, held, round, catalogue)]));
  const anatomyPicks = fresh.includes(ANATOMY_ID)
    ? fresh.filter(id => id !== ANATOMY_ID && catalogue.get(id)!.groups.includes('science') && catalogue.get(id)!.cost < ANATOMY_FREE_BELOW)
    : [];
  let best = { saving: 0, free: undefined as string | undefined, library: undefined as string | undefined };
  for (const free of [undefined, ...anatomyPicks]) {
    let saving = free ? prices.get(free)! : 0;
    let library: string | undefined;
    if (fresh.includes(LIBRARY_ID)) {
      for (const id of fresh) {
        if (id === LIBRARY_ID || id === free) continue;
        if (!library || prices.get(id)! > prices.get(library)!) library = id;
      }
      if (library) saving += Math.min(LIBRARY_DISCOUNT, prices.get(library)!);
    }
    if (saving > best.saving) best = { saving, free, library };
  }
  if (best.free) prices.set(best.free, 0);
  if (best.library) prices.set(best.library, Math.max(0, prices.get(best.library)! - LIBRARY_DISCOUNT));
  return { total: [...prices.values()].reduce((a, b) => a + b, 0), prices };
}

/** What every card costs the player in `round`: a card bought this round, its
 *  share of the purchase; a card not held, what ticking it adds to this
 *  round's total (so Library and Anatomy count); an earlier card, its print. */
export function priceList(held: readonly HeldAdvance[], round: number): Map<string, number> {
  const now = purchaseCost(held, round);
  const out = new Map<string, number>();
  for (const c of ADVANCES) {
    const h = held.find(x => x.id === c.id);
    if (h) out.set(c.id, h.round < round ? c.cost : now.prices.get(c.id) ?? c.cost);
    else out.set(c.id, purchaseCost([...held, { id: c.id, round }], round).total - now.total);
  }
  return out;
}
