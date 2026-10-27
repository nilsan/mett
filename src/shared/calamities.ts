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
}

export const CARD_CALAMITIES: Readonly<Record<string, readonly CalamityEffect[]>> = {
  'advanced-military': [
    { calamity: 'Civil Disorder', effect: 'hurt', text: "Reduce 1 additional city." },
  ],
  'agriculture': [
    { calamity: 'Famine', effect: 'hurt', text: "If you are the primary victim, take 5 additional damage." },
  ],
  'anatomy': [
    { calamity: 'Epidemic', effect: 'help', text: "If you are a secondary victim, prevent 5 damage." },
  ],
  'calendar': [
    { calamity: 'Famine', effect: 'help', text: "Prevent 5 damage." },
    { calamity: 'Cyclone', effect: 'help', text: "Reduce 2 less selected cities." },
  ],
  'cartography': [
    { calamity: 'Piracy', effect: 'hurt', text: "If you are the primary victim, the beneficiary selects and replaces 1 additional coastal city." },
  ],
  'coinage': [
    { calamity: 'Corruption', effect: 'hurt', text: "Discard 5 additional points of face value." },
  ],
  'deism': [
    { calamity: 'Superstition', effect: 'help', text: "Reduce 1 less city." },
  ],
  'democracy': [
    { calamity: 'Civil War', effect: 'help', text: "Select 10 less unit points." },
    { calamity: 'Civil Disorder', effect: 'help', text: "Reduce 1 less city." },
  ],
  'diplomacy': [
    { calamity: 'Treachery', effect: 'hurt', text: "The beneficiary selects and annexes 1 additional city." },
  ],
  'drama-and-poetry': [
    { calamity: 'Civil War', effect: 'help', text: "Select 5 less unit points." },
    { calamity: 'Civil Disorder', effect: 'help', text: "Reduce 1 less city." },
  ],
  'engineering': [
    { calamity: 'Earthquake', effect: 'help', text: "Your city is reduced instead of destroyed." },
    { calamity: 'Flood', effect: 'help', text: "Prevent 5 damage." },
  ],
  'enlightenment': [
    { calamity: 'Superstition', effect: 'help', text: "Reduce 1 less city." },
    { calamity: 'Slave Revolt', effect: 'help', text: "Your city support rate is decreased by 1 during the resolution of Slave Revolt." },
    { calamity: 'Epidemic', effect: 'help', text: "If you are the primary victim, prevent 5 damage." },
    { calamity: 'Regression', effect: 'help', text: "For each step backward, you may choose to prevent the effect by destroying 2 of your cities (if possible non-coastal)." },
  ],
  'fundamentalism': [
    { calamity: 'Regression', effect: 'hurt', text: "Your marker is moved backward 1 additional step." },
  ],
  'law': [
    { calamity: 'Tyranny', effect: 'help', text: "The beneficiary selects and annexes 5 less unit points." },
    { calamity: 'Civil Disorder', effect: 'help', text: "Reduce 1 less city." },
    { calamity: 'Corruption', effect: 'help', text: "Discard 5 less points of face value." },
  ],
  'library': [
    { calamity: 'Regression', effect: 'help', text: "Your marker is moved backward 1 less step." },
  ],
  'masonry': [
    { calamity: 'Cyclone', effect: 'help', text: "Reduce 1 less of your selected cities." },
  ],
  'medicine': [
    { calamity: 'Epidemic', effect: 'help', text: "Prevent 5 damage." },
  ],
  'military': [
    { calamity: 'Civil War', effect: 'hurt', text: "Select 5 additional unit points." },
  ],
  'mining': [
    { calamity: 'Slave Revolt', effect: 'hurt', text: "Your city support rate is increased by 1 during the resolution of Slave Revolt." },
  ],
  'monarchy': [
    { calamity: 'Barbarian Hordes', effect: 'help', text: "5 less barbarian tokens are used." },
    { calamity: 'Tyranny', effect: 'hurt', text: "The beneficiary selects and annexes 5 additional unit points." },
  ],
  'monotheism': [
    { calamity: 'Iconoclasm and Heresy', effect: 'hurt', text: "Reduce 1 additional city." },
  ],
  'music': [
    { calamity: 'Civil War', effect: 'help', text: "Select 5 less unit points." },
    { calamity: 'Civil Disorder', effect: 'help', text: "Reduce 1 less city." },
  ],
  'mysticism': [
    { calamity: 'Superstition', effect: 'help', text: "Reduce 1 less city." },
  ],
  'mythology': [
    { calamity: 'Slave Revolt', effect: 'help', text: "Your city support rate is decreased by 1 during the resolution of Slave Revolt." },
  ],
  'naval-warfare': [
    { calamity: 'Piracy', effect: 'help', text: "If you are the primary victim, the beneficiary selects and replaces 1 less coastal city. You may not be selected as a secondary victim." },
    { calamity: 'Civil Disorder', effect: 'hurt', text: "Reduce 1 additional city." },
  ],
  'philosophy': [
    { calamity: 'Iconoclasm and Heresy', effect: 'help', text: "Reduce 2 less cities." },
    { calamity: 'Civil War', effect: 'hurt', text: "Select 5 additional unit points." },
  ],
  'politics': [
    { calamity: 'Barbarian Hordes', effect: 'hurt', text: "5 additional barbarian tokens are used." },
  ],
  'pottery': [
    { calamity: 'Famine', effect: 'help', text: "Prevent 5 damage." },
  ],
  'provincial-empire': [
    { calamity: 'Barbarian Hordes', effect: 'hurt', text: "5 additional barbarian tokens are used." },
    { calamity: 'Tyranny', effect: 'hurt', text: "The beneficiary selects and annexes 5 additional unit points." },
  ],
  'roadbuilding': [
    { calamity: 'Epidemic', effect: 'hurt', text: "If you are the primary victim, take 5 additional damage." },
  ],
  'sculpture': [
    { calamity: 'Tyranny', effect: 'help', text: "The beneficiary selects and annexes 5 less unit points." },
  ],
  'theocracy': [
    { calamity: 'Iconoclasm and Heresy', effect: 'help', text: "You may choose to discard 2 commodity cards to prevent the city reduction effect for you." },
  ],
  'theology': [
    { calamity: 'Iconoclasm and Heresy', effect: 'help', text: "Reduce 3 less cities." },
  ],
  'trade-empire': [
    { calamity: 'Cyclone', effect: 'hurt', text: "Select and reduce 1 additional city adjacent to the open sea area." },
    { calamity: 'Epidemic', effect: 'hurt', text: "If you are the primary victim, take 5 additional damage." },
  ],
  'universal-doctrine': [
    { calamity: 'Superstition', effect: 'hurt', text: "Reduce 1 additional city." },
  ],
  'wonder-of-the-world': [
    { calamity: 'Corruption', effect: 'hurt', text: "Discard 5 additional points of face value." },
  ],
};
