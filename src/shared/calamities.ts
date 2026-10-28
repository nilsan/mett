/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The calamities, and what each Civilization Advance does to its holder
// during them. Calamity text is the Calamity Resolution Quick Chart (5-18
// players) on the back of the Strategy Explorer; card effects are in the
// wording printed on the cards (checked card by card against scans of the
// physical deck, 2026-10-26). Cards not listed have no calamity effect.

export type CalamityKind = 'minor' | 'non-tradeable' | 'tradeable';

export interface Calamity {
  name: string;
  /** Trade card stack (2-9) the calamity is shuffled into. */
  stack: number;
  /** Minor calamities are tradeable; Advances never affect them. */
  kind: CalamityKind;
  /** Quick Chart text, one string per paragraph. */
  text: readonly string[];
  /** Another name a card uses for this calamity ("EARTHQUAKE:" on Engineering). */
  alias?: string;
}

/** Quick Chart order: the minor calamities, then the major ones by stack. */
export const CALAMITIES: readonly Calamity[] = [
  { name: 'Tempest', stack: 2, kind: 'minor', text: ["Take 2 damage in total from coastal areas of your choice and lose 5 treasury tokens."] },
  { name: 'Squandered Wealth', stack: 3, kind: 'minor', text: ["Lose 10 treasury tokens."] },
  { name: 'City Riots', stack: 4, kind: 'minor', text: ["Reduce 1 of your cities and lose 5 treasury tokens."] },
  { name: 'City in Flames', stack: 5, kind: 'minor', text: ["Destroy 1 of your cities. You may choose to pay 10 treasury tokens to prevent this."] },
  { name: 'Tribal Conflict', stack: 6, kind: 'minor', text: ["Take 5 damage."] },
  { name: 'Minor Uprising', stack: 7, kind: 'minor', text: ["Destroy 1 of your cities."] },
  { name: 'Banditry', stack: 8, kind: 'minor', text: ["Discard 2 commodity cards of your choice. For each card you must discard, you may choose to pay 4 treasury tokens to prevent it."] },
  { name: 'Coastal Migration', stack: 9, kind: 'minor', text: ["Destroy 1 of your coastal cities and lose 5 treasury tokens."] },
  { name: 'Volcanic Eruption', stack: 2, kind: 'non-tradeable', alias: 'Earthquake', text: [
    "Only if you have a city on a volcano this calamity is a Volcanic Eruption, otherwise this is an Earthquake.",
    "Volcanic Eruption: Destroy all units (irrespective of ownership) in the area(s) touched by the volcano. If you have cities in more than one area with a volcano, select the one volcano that would affect the most of your unit points.",
    "Earthquake: Select and destroy 1 of your cities and select and reduce 1 city adjacent by land or water (irrespective of ownership).",
  ] },
  { name: 'Treachery', stack: 2, kind: 'tradeable', text: ["The beneficiary selects and annexes 1 of your cities."] },
  { name: 'Famine', stack: 3, kind: 'non-tradeable', text: ["Take 10 damage and select 3 other players who must take 5 damage as well."] },
  { name: 'Slave Revolt', stack: 3, kind: 'tradeable', text: ["Immediately perform an additional check for city support, during which your city support rate is increased by 2. Reduce cities until you have sufficient support."] },
  { name: 'Flood', stack: 4, kind: 'non-tradeable', text: ["Only if you have any units on a flood plain, take 15 damage from the flood plain. If you have units on more than one flood plain, select the one flood plain where the most of your units would be affected. All other players with units on the same flood plain take 5 damage from that flood plain as well. Cities built on black city sites are not considered to be on the flood plain. If you have no units on a flood plain, take 5 damage in total from coastal areas of your choice instead."] },
  { name: 'Superstition', stack: 4, kind: 'tradeable', text: ["Reduce 3 of your cities."] },
  { name: 'Civil War', stack: 5, kind: 'non-tradeable', text: ["The beneficiary annexes all your units in excess of 35 unit points. You select the units. Count all units points that you have on the board and select units in excess of 35. All units selected this way must be in areas adjacent to each other if possible, and in each of these areas all of your units must be selected. If you have 35 unit points or less there is no Civil War."] },
  { name: 'Barbarian Hordes', stack: 5, kind: 'tradeable', text: ["One of your cities is attacked by 15 barbarian tokens, which will continue attacking your units until there are no areas with barbarian tokens in which the population limit is exceeded. Place 15 barbarian tokens in one of your cities selected by the beneficiary (if possible a wilderness city) and resolve a city attack. After this conflict, the beneficiary moves all remaining barbarian tokens in excess of the population limit to an area adjacent by land or water that contains any of your units and conflict is resolved again. The beneficiary may only move barbarian tokens into an area that contains a city if the attack would be successful. This process is repeated until no population limit is exceeded by the barbarian tokens or no new area can be chosen legally. Any barbarian tokens in excess of a population limit are then destroyed."] },
  { name: 'Cyclone', stack: 6, kind: 'non-tradeable', text: ["Select and reduce 3 of your cities adjacent to the one open sea area that has the largest number of your cities directly adjacent to it. All other players with cities directly adjacent to the same open sea area must select and reduce 2 of such cities as well."] },
  { name: 'Epidemic', stack: 6, kind: 'tradeable', text: ["Take 15 damage and select 2 other players who must take 10 damage as well. The beneficiary may not be selected as a secondary victim."] },
  { name: 'Tyranny', stack: 7, kind: 'non-tradeable', text: ["The beneficiary selects and annexes 15 of your unit points. All units selected this way must be in areas adjacent to each other if possible, and in each of these areas all of your units must be selected."] },
  { name: 'Civil Disorder', stack: 7, kind: 'tradeable', text: ["Reduce all but 3 of your cities."] },
  { name: 'Corruption', stack: 8, kind: 'non-tradeable', text: ["Discard commodity cards with a total face value (not set value) of at least 10 points."] },
  { name: 'Iconoclasm and Heresy', stack: 8, kind: 'tradeable', text: ["Reduce 4 of your cities and select 2 other players who must reduce 1 of their cities as well. The beneficiary may not be selected as a secondary victim."] },
  { name: 'Regression', stack: 9, kind: 'non-tradeable', text: ["Your succession marker on the A.S.T. is moved 1 step backward."] },
  { name: 'Piracy', stack: 9, kind: 'tradeable', text: ["The beneficiary selects 2 of your coastal cities, which are replaced by pirate cities. Then you select from 2 other players 1 coastal city each, which are also replaced by pirate cities. The beneficiary may not be selected as a secondary victim."] },
];

/** The calamity a card effect names, by name or alias. */
export function calamityNamed(name: string): Calamity | undefined {
  return CALAMITIES.find(c => c.name === name || c.alias === name);
}

// ─── Who suffers what (rulebook ch. 8, Card-Specific Rules: Calamities) ─────

/** What a calamity does to one role. `n` is the number cards change (damage,
 *  cities, unit points, …); `say` words the outcome for a number after cards. */
export interface CalamityOutcome {
  n?: number;
  say: (n: number) => string;
}

export interface CalamityRoles {
  /** The player holding the calamity. */
  primary: CalamityOutcome;
  /** Players who suffer too, and who they are. */
  secondary?: CalamityOutcome & { who: string };
  /** Players hit as a side effect, not as victims, so cards don't apply. */
  others?: string;
  /** Who the beneficiary is and what they do. */
  beneficiary?: string;
  /** For a number where more is better for the victim (Civil War's limit,
   *  Civil Disorder's cities kept). */
  higherIsBetter?: true;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The beneficiary of a tradeable calamity (rulebook ch. 8, Beneficiary). */
const TRADED_BENEFICIARY = 'the player who traded the calamity to you. If you drew it yourself, or no one can tell who traded it: the player with the most cities in stock (tie: most tokens in stock, then A.S.T. ranking).';
/** The beneficiary of a non-tradeable calamity. */
const STOCK_BENEFICIARY = 'the player with the most cities in stock (tie: most tokens in stock, then A.S.T. ranking). Never the primary victim.';

/** Each calamity's victims, with the numbers that advances change. Minor
 *  calamities have only a primary victim and no card changes them. */
export const CALAMITY_ROLES: Readonly<Record<string, CalamityRoles>> = {
  'Tempest': { primary: { say: () => 'Take 2 damage in total from coastal areas of your choice and lose 5 treasury tokens.' } },
  'Squandered Wealth': { primary: { say: () => 'Lose 10 treasury tokens.' } },
  'City Riots': { primary: { say: () => 'Reduce 1 of your cities and lose 5 treasury tokens.' } },
  'City in Flames': { primary: { say: () => 'Destroy 1 of your cities, or pay 10 treasury tokens to prevent it.' } },
  'Tribal Conflict': { primary: { say: () => 'Take 5 damage.' } },
  'Minor Uprising': { primary: { say: () => 'Destroy 1 of your cities.' } },
  'Banditry': { primary: { say: () => 'Discard 2 commodity cards of your choice; pay 4 treasury tokens per card to keep it.' } },
  'Coastal Migration': { primary: { say: () => 'Destroy 1 of your coastal cities and lose 5 treasury tokens.' } },
  'Volcanic Eruption': {
    primary: { say: () => 'With a city on a volcano: all units in the area(s) the volcano touches are destroyed. Otherwise an Earthquake: destroy 1 of your cities and reduce 1 city next to it by land or water.' },
    others: 'Their units in the volcano’s area(s) are destroyed too. An Earthquake may reduce one of their cities next to the destroyed one.',
  },
  'Treachery': {
    primary: { n: 1, say: n => `The beneficiary annexes ${n} of your cities.` },
    beneficiary: `${TRADED_BENEFICIARY} They pick the cities and annex them.`,
  },
  'Famine': {
    primary: { n: 10, say: n => n > 0 ? `Take ${n} damage.` : 'No damage. Famine still hits the secondary victims.' },
    secondary: { n: 5, who: '3 players the primary victim picks', say: n => n > 0 ? `Take ${n} damage.` : 'No damage.' },
  },
  'Slave Revolt': {
    primary: { n: 2, say: n => n > 0
      ? `An extra city support check with your support rate raised by ${n}. Reduce cities until they are supported.`
      : 'An extra city support check at your normal support rate. Reduce cities until they are supported.' },
  },
  'Flood': {
    // 15 damage on a flood plain, else 5 from coastal areas: cards change both alike.
    primary: { n: 15, say: n => {
      const coastal = Math.max(0, n - 10);
      return `With units on a flood plain: ${n > 0 ? `take ${n} damage there` : 'no damage'}. With none: ${coastal > 0 ? `take ${coastal} damage in total from coastal areas` : 'no damage'}.`;
    } },
    secondary: { n: 5, who: 'every other player with units on the same flood plain', say: n => n > 0 ? `Take ${n} damage from that flood plain.` : 'No damage.' },
  },
  'Superstition': {
    primary: { n: 3, say: n => n > 0 ? `Reduce ${n} of your cities.` : 'No city is reduced.' },
  },
  'Civil War': {
    primary: { n: 35, say: n => `The beneficiary annexes all your units beyond ${n} unit points; you pick them, in neighbouring areas. With ${n} unit points or less: no Civil War.` },
    beneficiary: `${STOCK_BENEFICIARY} They annex the units.`,
    higherIsBetter: true,
  },
  'Barbarian Hordes': {
    primary: { n: 15, say: n => `${n} barbarian tokens attack one of your cities and keep attacking your units while they exceed a population limit.` },
    beneficiary: `${TRADED_BENEFICIARY} They pick the city (a wilderness city if possible) and move the barbarians.`,
  },
  'Cyclone': {
    primary: { n: 3, say: n => n > 0 ? `Reduce ${n} of your cities next to the open sea area with the most of your cities beside it.` : 'No city is reduced.' },
    secondary: { n: 2, who: 'every other player with cities next to that sea area', say: n => n > 0 ? `Reduce ${n} of your cities next to it.` : 'No city is reduced.' },
  },
  'Epidemic': {
    primary: { n: 15, say: n => n > 0 ? `Take ${n} damage.` : 'No damage.' },
    secondary: { n: 10, who: '2 other players the primary victim picks, not the beneficiary', say: n => n > 0 ? `Take ${n} damage.` : 'No damage.' },
    beneficiary: `${TRADED_BENEFICIARY} They can’t be picked as a secondary victim.`,
  },
  'Tyranny': {
    primary: { n: 15, say: n => `The beneficiary annexes ${n} of your unit points, in neighbouring areas.` },
    beneficiary: `${STOCK_BENEFICIARY} They pick the units and annex them.`,
  },
  'Civil Disorder': {
    primary: { n: 3, say: n => `Reduce all but ${n} of your cities.` },
    higherIsBetter: true,
  },
  'Corruption': {
    primary: { n: 10, say: n => n > 0 ? `Discard commodity cards with a face value of at least ${n}.` : 'Nothing to discard.' },
  },
  'Iconoclasm and Heresy': {
    primary: { n: 4, say: n => n > 0 ? `Reduce ${n} of your cities.` : 'No city is reduced. It still hits the secondary victims.' },
    secondary: { n: 1, who: '2 other players the primary victim picks, not the beneficiary', say: n => n > 0 ? `Reduce ${n} of your cities.` : 'No city is reduced.' },
    beneficiary: `${TRADED_BENEFICIARY} They can’t be picked as a secondary victim.`,
  },
  'Regression': {
    primary: { n: 1, say: n => n > 0 ? `Your A.S.T. marker moves ${plural(n, 'step')} back.` : 'Your A.S.T. marker stays.' },
  },
  'Piracy': {
    primary: { n: 2, say: n => n > 0 ? `The beneficiary turns ${n} of your coastal cities into pirate cities.` : 'None of your cities becomes a pirate city.' },
    secondary: { who: '2 other players the primary victim picks, not the beneficiary', say: () => '1 of your coastal cities becomes a pirate city.' },
    beneficiary: `${TRADED_BENEFICIARY} They pick your cities and can’t be picked as a secondary victim.`,
  },
};

/** A role's outcome for a player holding `heldIds`: the number after their
 *  cards, the cards that changed it, the wordless card effects that apply,
 *  and whether the player can't be picked at all. */
export interface RoleResult {
  text: string;
  base?: number;
  changes: { card: string; delta: number; effect: CalamityEffect['effect'] }[];
  notes: { card: string; e: CalamityEffect }[];
  immune?: string;
}

export function roleResult(cal: Calamity, role: 'primary' | 'secondary', heldIds: Iterable<string>): RoleResult | null {
  const roles = CALAMITY_ROLES[cal.name];
  const outcome = roles?.[role];
  if (!outcome) return null;
  const changes: RoleResult['changes'] = [];
  const notes: RoleResult['notes'] = [];
  let immune: string | undefined;
  for (const id of new Set(heldIds)) {
    for (const e of CARD_CALAMITIES[id] ?? []) {
      if (calamityNamed(e.calamity) !== cal) continue;
      if (role === 'secondary' && e.noSecondary) immune = id;
      if (e.role && e.role !== role) continue;
      if (e.delta !== undefined && outcome.n !== undefined) changes.push({ card: id, delta: e.delta, effect: e.effect });
      else if (e.delta === undefined) notes.push({ card: id, e });
    }
  }
  // What helps first, then what hurts; by card id within each.
  changes.sort((a, b) => (a.effect === b.effect ? a.card.localeCompare(b.card) : a.effect === 'help' ? -1 : 1));
  const n = outcome.n === undefined ? 0 : Math.max(0, outcome.n + changes.reduce((sum, c) => sum + c.delta, 0));
  return { text: outcome.say(n), base: outcome.n, changes, notes, ...(immune ? { immune } : {}) };
}

/** Minor calamities are shuffled into the trade cards only with 9, 10-11 and
 *  15-18 players (rulebook ch. 4 and the 10-18 player scenario); with 3-8 and
 *  12-14 players they stay in the box. */
export function minorCalamitiesInPlay(playerCount: number): boolean {
  return playerCount === 9 || playerCount === 10 || playerCount === 11 || playerCount >= 15;
}

export interface CalamityEffect {
  /** Calamity name as printed on the card. */
  calamity: string;
  /** 'help' softens the calamity for the holder, 'hurt' makes it worse. */
  effect: 'help' | 'hurt';
  /** Card text, verbatim. */
  text: string;
  /** Only when the holder is this victim ("If you are the primary victim…");
   *  unset: whenever the calamity hits the holder. */
  role?: 'primary' | 'secondary';
  /** How the card changes the number in the calamity's outcome for that role
   *  (CALAMITY_ROLES): +5 damage, −1 city, … Unset: an effect that is not a
   *  number (Theocracy, Engineering's Earthquake, Enlightenment's Regression). */
  delta?: number;
  /** The holder may not be chosen as a secondary victim (Naval Warfare). */
  noSecondary?: true;
}

export const CARD_CALAMITIES: Readonly<Record<string, readonly CalamityEffect[]>> = {
  'advanced-military': [
    { calamity: 'Civil Disorder', effect: 'hurt', text: "Reduce 1 additional city.", delta: -1 },
  ],
  'agriculture': [
    { calamity: 'Famine', effect: 'hurt', text: "If you are the primary victim, take 5 additional damage.", role: 'primary', delta: 5 },
  ],
  'anatomy': [
    { calamity: 'Epidemic', effect: 'help', text: "If you are a secondary victim, prevent 5 damage.", role: 'secondary', delta: -5 },
  ],
  'calendar': [
    { calamity: 'Famine', effect: 'help', text: "Prevent 5 damage.", delta: -5 },
    { calamity: 'Cyclone', effect: 'help', text: "Reduce 2 less selected cities.", delta: -2 },
  ],
  'cartography': [
    { calamity: 'Piracy', effect: 'hurt', text: "If you are the primary victim, the beneficiary selects and replaces 1 additional coastal city.", role: 'primary', delta: 1 },
  ],
  'coinage': [
    { calamity: 'Corruption', effect: 'hurt', text: "Discard 5 additional points of face value.", delta: 5 },
  ],
  'deism': [
    { calamity: 'Superstition', effect: 'help', text: "Reduce 1 less city.", delta: -1 },
  ],
  'democracy': [
    { calamity: 'Civil War', effect: 'help', text: "Select 10 less unit points.", delta: 10 },
    { calamity: 'Civil Disorder', effect: 'help', text: "Reduce 1 less city.", delta: 1 },
  ],
  'diplomacy': [
    { calamity: 'Treachery', effect: 'hurt', text: "The beneficiary selects and annexes 1 additional city.", delta: 1 },
  ],
  'drama-and-poetry': [
    { calamity: 'Civil War', effect: 'help', text: "Select 5 less unit points.", delta: 5 },
    { calamity: 'Civil Disorder', effect: 'help', text: "Reduce 1 less city.", delta: 1 },
  ],
  'engineering': [
    { calamity: 'Earthquake', effect: 'help', text: "Your city is reduced instead of destroyed.", role: 'primary' },
    { calamity: 'Flood', effect: 'help', text: "Prevent 5 damage.", delta: -5 },
  ],
  'enlightenment': [
    { calamity: 'Superstition', effect: 'help', text: "Reduce 1 less city.", delta: -1 },
    { calamity: 'Slave Revolt', effect: 'help', text: "Your city support rate is decreased by 1 during the resolution of Slave Revolt.", delta: -1 },
    { calamity: 'Epidemic', effect: 'help', text: "If you are the primary victim, prevent 5 damage.", role: 'primary', delta: -5 },
    { calamity: 'Regression', effect: 'help', text: "For each step backward, you may choose to prevent the effect by destroying 2 of your cities (if possible non-coastal)." },
  ],
  'fundamentalism': [
    { calamity: 'Regression', effect: 'hurt', text: "Your marker is moved backward 1 additional step.", delta: 1 },
  ],
  'law': [
    { calamity: 'Tyranny', effect: 'help', text: "The beneficiary selects and annexes 5 less unit points.", delta: -5 },
    { calamity: 'Civil Disorder', effect: 'help', text: "Reduce 1 less city.", delta: 1 },
    { calamity: 'Corruption', effect: 'help', text: "Discard 5 less points of face value.", delta: -5 },
  ],
  'library': [
    { calamity: 'Regression', effect: 'help', text: "Your marker is moved backward 1 less step.", delta: -1 },
  ],
  'masonry': [
    { calamity: 'Cyclone', effect: 'help', text: "Reduce 1 less of your selected cities.", delta: -1 },
  ],
  'medicine': [
    { calamity: 'Epidemic', effect: 'help', text: "Prevent 5 damage.", delta: -5 },
  ],
  'military': [
    { calamity: 'Civil War', effect: 'hurt', text: "Select 5 additional unit points.", delta: -5 },
  ],
  'mining': [
    { calamity: 'Slave Revolt', effect: 'hurt', text: "Your city support rate is increased by 1 during the resolution of Slave Revolt.", delta: 1 },
  ],
  'monarchy': [
    { calamity: 'Barbarian Hordes', effect: 'help', text: "5 less barbarian tokens are used.", delta: -5 },
    { calamity: 'Tyranny', effect: 'hurt', text: "The beneficiary selects and annexes 5 additional unit points.", delta: 5 },
  ],
  'monotheism': [
    { calamity: 'Iconoclasm and Heresy', effect: 'hurt', text: "Reduce 1 additional city.", delta: 1 },
  ],
  'music': [
    { calamity: 'Civil War', effect: 'help', text: "Select 5 less unit points.", delta: 5 },
    { calamity: 'Civil Disorder', effect: 'help', text: "Reduce 1 less city.", delta: 1 },
  ],
  'mysticism': [
    { calamity: 'Superstition', effect: 'help', text: "Reduce 1 less city.", delta: -1 },
  ],
  'mythology': [
    { calamity: 'Slave Revolt', effect: 'help', text: "Your city support rate is decreased by 1 during the resolution of Slave Revolt.", delta: -1 },
  ],
  'naval-warfare': [
    { calamity: 'Piracy', effect: 'help', text: "If you are the primary victim, the beneficiary selects and replaces 1 less coastal city. You may not be selected as a secondary victim.", role: 'primary', delta: -1, noSecondary: true },
    { calamity: 'Civil Disorder', effect: 'hurt', text: "Reduce 1 additional city.", delta: -1 },
  ],
  'philosophy': [
    { calamity: 'Iconoclasm and Heresy', effect: 'help', text: "Reduce 2 less cities.", delta: -2 },
    { calamity: 'Civil War', effect: 'hurt', text: "Select 5 additional unit points.", delta: -5 },
  ],
  'politics': [
    { calamity: 'Barbarian Hordes', effect: 'hurt', text: "5 additional barbarian tokens are used.", delta: 5 },
  ],
  'pottery': [
    { calamity: 'Famine', effect: 'help', text: "Prevent 5 damage.", delta: -5 },
  ],
  'provincial-empire': [
    { calamity: 'Barbarian Hordes', effect: 'hurt', text: "5 additional barbarian tokens are used.", delta: 5 },
    { calamity: 'Tyranny', effect: 'hurt', text: "The beneficiary selects and annexes 5 additional unit points.", delta: 5 },
  ],
  'roadbuilding': [
    { calamity: 'Epidemic', effect: 'hurt', text: "If you are the primary victim, take 5 additional damage.", role: 'primary', delta: 5 },
  ],
  'sculpture': [
    { calamity: 'Tyranny', effect: 'help', text: "The beneficiary selects and annexes 5 less unit points.", delta: -5 },
  ],
  'theocracy': [
    { calamity: 'Iconoclasm and Heresy', effect: 'help', text: "You may choose to discard 2 commodity cards to prevent the city reduction effect for you." },
  ],
  'theology': [
    { calamity: 'Iconoclasm and Heresy', effect: 'help', text: "Reduce 3 less cities.", delta: -3 },
  ],
  'trade-empire': [
    { calamity: 'Cyclone', effect: 'hurt', text: "Select and reduce 1 additional city adjacent to the open sea area.", delta: 1 },
    { calamity: 'Epidemic', effect: 'hurt', text: "If you are the primary victim, take 5 additional damage.", role: 'primary', delta: 5 },
  ],
  'universal-doctrine': [
    { calamity: 'Superstition', effect: 'hurt', text: "Reduce 1 additional city.", delta: 1 },
  ],
  'wonder-of-the-world': [
    { calamity: 'Corruption', effect: 'hurt', text: "Discard 5 additional points of face value.", delta: 5 },
  ],
};
