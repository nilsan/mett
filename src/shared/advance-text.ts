/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The attribute text printed on each Civilization Advance, one string per
// paragraph, read card by card from scans of the physical deck (2026-10-27).
// The calamity lines on the cards live in CARD_CALAMITIES (calamities.ts), the
// costs and credits in ADVANCES (advances.ts). Cards with only calamity lines,
// or none, are not listed. For the special-ability cards (SPECIAL_ABILITY_IDS)
// this is the text under "Special ability:".

export const ADVANCE_TEXT: Readonly<Record<string, readonly string[]>> = {
  'monument': [
    "Acquire 20 additional points of credit tokens in any combination of colors.",
  ],
  'wonder-of-the-world': [
    "During the Trade cards acquisition phase, you may acquire 1 additional trade card for free from a stack number that is higher than your number of cities in play.",
    "Wonder of the World counts as a city during the A.S.T.-alteration phase.",
  ],
  'architecture': [
    "Once per turn, when constructing a city you may choose to pay up to half of the required number of tokens from treasury.",
  ],
  'mining': [
    "During the Trade cards acquisition phase, you may acquire additional trade cards from stack 6 and/or stack 8 for 13 treasury tokens per card.",
    "Treasury tokens are worth 2 points when purchasing Civilization Advances.",
  ],
  'cloth-making': [
    "Your ships are allowed to move 5 steps.",
  ],
  'naval-warfare': [
    "Your ships are allowed to carry 6 tokens.",
    "In conflicts, you may choose to remove ships from the conflict area instead of tokens. After each round of token removal a new check for token majority must be made.",
  ],
  'diaspora': [
    "You may choose to take up to 5 of your tokens from the board and place them anywhere on the board, providing that no population limits are exceeded.",
  ],
  'urbanism': [
    "Once per turn, when constructing a wilderness city you may choose to use up to 4 tokens from areas adjacent by land.",
  ],
  'diplomacy': [
    "Players are not allowed to move tokens into areas containing your cities, except for areas where a conflict situation already occurs. This does not count for players holding Diplomacy or Military.",
  ],
  'provincial-empire': [
    "You may choose to select up to 5 players that have units adjacent by land or water to your units. These players must choose and give you a commodity card with a face value of at least 2. Players holding Provincial Empire or Public Works may not be selected.",
  ],
  'monarchy': [
    "You may choose to increase your tax rate by 1.",
  ],
  'cultural-ascendancy': [
    "Players are not allowed to cause conflict in areas containing your units, except for areas where a conflict situation already occurs. This does not count for players holding Cultural Ascendancy or Advanced Military.",
    "Your units are protected against the effect of Politics.",
    "Your default city support rate is increased by 1.",
  ],
  'written-record': [
    "Acquire 10 additional points of credit tokens in any combination of colors.",
  ],
  'cartography': [
    "During the Trade cards acquisition phase, you may acquire additional trade cards from stack 2 for 5 treasury tokens and/or from stack 7 for 13 treasury tokens per card.",
  ],
  'library': [
    "You may discount the cost of 1 other Civilization Advance that you purchase in the same turn as Library by 40 points.",
  ],
  'agriculture': [
    "The population limit of ‘0’, ‘1’, and ‘2’ areas on the board is increased by 1 for you as long as these areas do not contain any other player’s units or barbarian tokens.",
  ],
  'democracy': [
    "During the Tax collection phase you collect tax as usual but your cities do not revolt as a result of a shortage in tax collection.",
  ],
  'engineering': [
    "Other players or barbarians require 8 tokens to successfully attack your cities. Your cities are then replaced with 7 tokens. This does not apply when the attacking player also holds Engineering.",
    "You require 6 tokens to successfully attack other player’s cities or pirate cities. Their cities are then replaced with 5 tokens. This does not apply when the defending player also holds Engineering.",
  ],
  'roadbuilding': [
    "When moving over land, your tokens may move 2 areas. Tokens that are in a conflict situation after one step are not allowed to move any further.",
    "Your hand limit of trade cards is increased by 1.",
  ],
  'anatomy': [
    "Upon purchase, you may choose to acquire 1 science card with an undiscounted cost price of less than 100 for free.",
  ],
  'fundamentalism': [
    "You may choose to destroy all units in an area adjacent by land to your units. Barbarian tokens, pirate cities and units belonging to players holding Fundamentalism or Philosophy are unaffected.",
  ],
  'monotheism': [
    "You may choose to annex all units in an area adjacent by land to your units. Barbarian tokens, pirate cities, and units belonging to players holding Monotheism or Theology are unaffected.",
  ],
  'universal-doctrine': [
    "You may choose to annex 1 pirate city or up to 5 barbarian tokens anywhere on the board.",
  ],
  'theology': [
    "Your units are protected against the effect of Monotheism.",
  ],
  'rhetoric': [
    "During the Trade cards acquisition phase, you may acquire additional trade cards from stack 3 for 9 treasury tokens per card.",
  ],
  'politics': [
    "You may choose one of two options:",
    "1) Gain up to 5 treasury tokens from stock.",
    "2) Annex all units in an area adjacent by land to your units. Pay treasury tokens equal to the number of unit points annexed, or the effect is canceled. Barbarian tokens, pirate cities, and units belonging to players holding Politics or Cultural Ascendancy are unaffected.",
  ],
  'philosophy': [
    "Your units are protected against the effect of Fundamentalism.",
  ],
  'astronavigation': [
    "Your ships are allowed to move through open sea areas.",
  ],
  'public-works': [
    "Areas containing your cities may also contain 1 of your tokens.",
    "You are protected against the effect of Provincial Empire.",
  ],
  'coinage': [
    "You may choose to increase or decrease your tax rate by 1.",
  ],
  'trade-routes': [
    "You may choose to discard any number of commodity cards to gain treasury tokens at twice the face value of the commodity cards discarded this way.",
  ],
  'trade-empire': [
    "Once per turn, you may choose to use 1 substitute commodity card of at least the same face value when turning in an incomplete set of commodity cards.",
  ],
  'metalworking': [
    "In conflicts, for each round of token removal all other players not holding Metalworking must remove their token first.",
  ],
  'military': [
    "Your movement phase is after all other players not holding Military have moved.",
    "You are allowed to move tokens into areas containing cities belonging to players holding Diplomacy.",
  ],
  'advanced-military': [
    "In conflicts, you may choose to remove tokens from areas adjacent by land. After each round of token removal a new check for token majority must be made. You may decide to wait for other token conflicts to be resolved first.",
    "You are allowed to cause conflict in areas containing units belonging to players holding Cultural Ascendancy.",
  ],
};
