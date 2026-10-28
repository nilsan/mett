/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Civilization Advance cards (src/shared/advances.ts): the catalogue's
 * integrity, the tier counts derived from held cards, and the purchase-cost
 * rules — checked against the rulebook's two worked examples.
 */

import { describe, it, expect } from 'bun:test';
import {
  ADVANCES, ADVANCE_BY_ID, ADVANCE_GROUPS, advanceTotals, advanceCost, advanceFlags, colourCredits, priceList, purchaseCost,
  creditChoiceError, creditChoiceOpen,
  MILITARY_ID, WONDER_ID, SPECIAL_ABILITY_IDS, type AdvanceCard,
} from '../src/shared/advances.js';

// The rulebook's examples (§ Purchase of Civilization Advances) need only these
// four cards. Credits are what the examples imply: after Pottery and Masonry,
// "credit tokens worth 20 to Crafts, 5 to Sciences, and 5 to Arts".
const card = (c: Partial<AdvanceCard> & Pick<AdvanceCard, 'id' | 'cost' | 'vp' | 'groups'>): AdvanceCard =>
  ({ name: c.id, credits: {}, special: {}, ...c });
const FIXTURE = new Map([
  card({ id: 'pottery', cost: 60, vp: 1, groups: ['crafts'], credits: { crafts: 10, arts: 5 }, special: { agriculture: 10 } }),
  card({ id: 'masonry', cost: 60, vp: 1, groups: ['crafts'], credits: { crafts: 10, science: 5 } }),
  card({ id: 'agriculture', cost: 120, vp: 3, groups: ['crafts'], special: { democracy: 20 } }),
  card({ id: 'democracy', cost: 220, vp: 6, groups: ['civics'] }),
  card({ id: 'dual', cost: 150, vp: 3, groups: ['crafts', 'science'] }),
].map(c => [c.id, c]));

describe('advanceCost — rulebook examples', () => {
  it('Example 1: Agriculture costs 90 after Pottery and Masonry (120 − 20 crafts − 10 special)', () => {
    const held = [{ id: 'pottery', round: 1 }, { id: 'masonry', round: 1 }];
    expect(advanceCost('agriculture', held, 2, FIXTURE)).toBe(90);
  });

  it('Example 2: Democracy costs 200 after Agriculture (220 − 20 special, no civics credits)', () => {
    expect(advanceCost('democracy', [{ id: 'agriculture', round: 1 }], 2, FIXTURE)).toBe(200);
  });
});

describe('advanceCost — credit rules', () => {
  it('cards bought this round give no credit yet', () => {
    const held = [{ id: 'pottery', round: 2 }, { id: 'masonry', round: 2 }];
    expect(advanceCost('agriculture', held, 2, FIXTURE)).toBe(120);
  });

  it('a dual-group card takes the better group credit, never both', () => {
    // 20 crafts (Pottery + Masonry) beats 5 science (Masonry): 150 − 20.
    const held = [{ id: 'pottery', round: 1 }, { id: 'masonry', round: 1 }];
    expect(advanceCost('dual', held, 2, FIXTURE)).toBe(130);
  });

  it('never goes below 0', () => {
    const big = new Map(FIXTURE);
    big.set('pottery', { ...FIXTURE.get('pottery')!, credits: { crafts: 500 } });
    expect(advanceCost('masonry', [{ id: 'pottery', round: 1 }], 2, big)).toBe(0);
  });

  it('rejects an unknown card', () => {
    expect(() => advanceCost('nope', [], 1, FIXTURE)).toThrow('Unknown advance: nope');
  });
});

describe('choice credits (Monument 20, Written Record 10)', () => {
  const monument = ADVANCE_BY_ID.get('monument')!;

  it('Monument and Written Record offer 20 and 10 credits to choose; no other card does', () => {
    expect(ADVANCES.filter(a => a.choiceCredits).map(a => [a.id, a.choiceCredits]))
      .toEqual([['monument', 20], ['written-record', 10]]);
  });

  it('accepts a split in steps of 5 that adds up exactly', () => {
    expect(creditChoiceError(monument, { science: 10, arts: 5, religion: 5 })).toBeNull();
    expect(creditChoiceError(monument, { crafts: 20 })).toBeNull();
  });

  it.each([
    [{ science: 15 }, 'Monument gives 20 credits to choose, not 15'],
    [{ science: 25 }, 'Monument gives 20 credits to choose, not 25'],
    [{ science: 12, arts: 8 }, 'Amounts must be multiples of 5'],
    [{ science: -5, arts: 25 }, 'Amounts must be multiples of 5'],
    [{ gold: 20 }, 'Unknown group: gold'],
    [[20], 'choice must be an object of group amounts'],
    [null, 'choice must be an object of group amounts'],
  ])('rejects %j', (choice, error) => {
    expect(creditChoiceError(monument, choice)).toBe(error);
  });

  it('only cards with choice credits take a choice', () => {
    expect(creditChoiceError(ADVANCE_BY_ID.get('pottery')!, { arts: 5 })).toBe('Pottery has no credits to choose');
  });

  it('is open while unchosen or in the purchase round, locked after', () => {
    expect(creditChoiceOpen({ id: 'monument', round: 3 }, 7)).toBe(true);
    expect(creditChoiceOpen({ id: 'monument', round: 3, choice: { arts: 20 } }, 3)).toBe(true);
    expect(creditChoiceOpen({ id: 'monument', round: 3, choice: { arts: 20 } }, 4)).toBe(false);
  });

  it('chosen colours count as credits from the next round on', () => {
    // Sculpture 50 (Arts): Monument's 20 chosen as Arts takes it to 30.
    const held = [{ id: 'monument', round: 2, choice: { arts: 20 } }];
    expect(advanceCost('sculpture', held, 3)).toBe(30);
    expect(advanceCost('sculpture', held, 2)).toBe(50);
  });
});

describe('advanceTotals', () => {
  it('counts cards per VP tier and sums their VP', () => {
    expect(advanceTotals(['pottery', 'masonry', 'agriculture', 'democracy'], FIXTURE))
      .toEqual({ adv_1vp: 2, adv_3vp: 1, adv_6vp: 1, adv_points: 11 });
  });

  it('ignores duplicates and unknown ids', () => {
    expect(advanceTotals(['pottery', 'pottery', 'nope'], FIXTURE))
      .toEqual({ adv_1vp: 1, adv_3vp: 0, adv_6vp: 0, adv_points: 1 });
  });
});

describe('advanceFlags', () => {
  it('Military and Wonder of the World set their flags', () => {
    expect(advanceFlags([MILITARY_ID])).toEqual({ military: 1, wonder: 0, special: 0 });
    expect(advanceFlags([WONDER_ID])).toEqual({ military: 0, wonder: 1, special: 0 });
  });

  it.each(SPECIAL_ABILITY_IDS)('%s grants the special ability', (id) => {
    expect(advanceFlags(['pottery', id]).special).toBe(1);
  });

  it('no flag cards, no flags', () => {
    expect(advanceFlags(['pottery'])).toEqual({ military: 0, wonder: 0, special: 0 });
  });
});

describe('ADVANCES catalogue', () => {
  it('ids are unique slugs', () => {
    expect(ADVANCE_BY_ID.size).toBe(ADVANCES.length);
    for (const a of ADVANCES) expect(a.id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('printed VP matches the cost band the A.S.T. rules count by (<100 = 1, <200 = 3, else 6)', () => {
    for (const a of ADVANCES) expect([a.id, a.vp]).toEqual([a.id, a.cost < 100 ? 1 : a.cost < 200 ? 3 : 6]);
  });

  it('every card has one or two valid groups and non-negative credits', () => {
    for (const a of ADVANCES) {
      expect(a.groups.length).toBeGreaterThanOrEqual(1);
      expect(a.groups.length).toBeLessThanOrEqual(2);
      for (const g of a.groups) expect(ADVANCE_GROUPS).toContain(g);
      for (const [g, n] of Object.entries(a.credits)) {
        expect(ADVANCE_GROUPS).toContain(g as never);
        expect(n).toBeGreaterThan(0);
      }
    }
  });

  it('holds the cards the player flags are derived from', () => {
    for (const id of [MILITARY_ID, WONDER_ID, ...SPECIAL_ABILITY_IDS]) expect(ADVANCE_BY_ID.has(id)).toBe(true);
  });

  it('has the 51 cards of the Strategy Explorer: 17 per tier, the tier-1 cards are the 17 cheap ones', () => {
    expect(ADVANCES).toHaveLength(51);
    for (const vp of [1, 3, 6] as const) expect(ADVANCES.filter(a => a.vp === vp)).toHaveLength(17);
  });

  it('each tier-1 card credits one tier-2 card by 10, each tier-2 card one tier-3 card by 20', () => {
    for (const a of ADVANCES) {
      const sp = Object.entries(a.special);
      if (a.vp === 6) { expect([a.id, sp]).toEqual([a.id, []]); continue; }
      expect([a.id, sp.length]).toEqual([a.id, 1]);
      const [to, n] = sp[0]!;
      expect([a.id, ADVANCE_BY_ID.get(to)!.vp, n]).toEqual([a.id, a.vp === 1 ? 3 : 6, a.vp === 1 ? 10 : 20]);
    }
    // …and every tier-2/3 card is credited by exactly one card.
    const targets = ADVANCES.flatMap(a => Object.keys(a.special)).sort();
    expect(targets).toEqual(ADVANCES.filter(a => a.vp > 1).map(a => a.id).sort());
  });

  it('the rulebook examples hold with the real cards', () => {
    expect(advanceCost('agriculture', [{ id: 'pottery', round: 1 }, { id: 'masonry', round: 1 }], 2)).toBe(90);
    expect(advanceCost('democracy', [{ id: 'agriculture', round: 1 }], 2)).toBe(200);
  });

  it('special credits name existing cards, never the card itself', () => {
    for (const a of ADVANCES) {
      for (const [to, n] of Object.entries(a.special)) {
        expect([a.id, ADVANCE_BY_ID.has(to)]).toEqual([a.id, true]);
        expect(to).not.toBe(a.id);
        expect(n).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Storage: setPlayerAdvances / getPlayerAdvances ──────────────────────────
// Card ids are validated by the API, not here, so these tests can use any ids
// while the catalogue is still being transcribed.

import { makeDb, addPlayer } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { setPlayerAdvances, getPlayerAdvances, setCreditChoice } from '../src/db.js';

describe('setPlayerAdvances', () => {
  it('keeps the round a held card was bought in; new cards take the given round', () => {
    const db = makeDb();
    _setTestDb(db);
    const pid = addPlayer(db, 1, 'Ann');
    setPlayerAdvances(pid, ['a', 'b'], 2);
    setPlayerAdvances(pid, ['b', 'c'], 4);
    expect(getPlayerAdvances(pid)).toEqual([{ id: 'b', round: 2 }, { id: 'c', round: 4 }]);
  });

  it('derives Military, Wonder and the special ability, and clears them again', () => {
    const db = makeDb();
    _setTestDb(db);
    const pid = addPlayer(db, 1, 'Ann');
    const flags = () => db.query('SELECT military, wonder, special FROM players WHERE id=?').get(pid);
    setPlayerAdvances(pid, [MILITARY_ID, WONDER_ID, 'monotheism'], 1);
    expect(flags()).toEqual({ military: 1, wonder: 1, special: 1 });
    setPlayerAdvances(pid, [], 2);
    expect(flags()).toEqual({ military: 0, wonder: 0, special: 0 });
  });

  it('keeps a held card\'s colour choice when the set changes', () => {
    const db = makeDb();
    _setTestDb(db);
    const pid = addPlayer(db, 1, 'Ann');
    setPlayerAdvances(pid, ['monument'], 2);
    expect(setCreditChoice(pid, 'monument', { arts: 20 }, 2)).toBe(true);
    setPlayerAdvances(pid, ['monument', 'pottery'], 3);
    expect(getPlayerAdvances(pid)[0]).toEqual({ id: 'monument', round: 2, choice: { arts: 20 } });
  });

  it('setCreditChoice: once chosen, locked after the purchase round; a missed choice can still be made', () => {
    const db = makeDb();
    _setTestDb(db);
    const pid = addPlayer(db, 1, 'Ann');
    setPlayerAdvances(pid, ['monument', 'written-record'], 2);
    expect(setCreditChoice(pid, 'monument', { arts: 20 }, 2)).toBe(true);
    expect(setCreditChoice(pid, 'monument', { crafts: 20 }, 2)).toBe(true);   // corrected in round 2
    expect(setCreditChoice(pid, 'monument', { science: 20 }, 3)).toBe(false); // locked in round 3
    expect(setCreditChoice(pid, 'written-record', { civics: 10 }, 5)).toBe(true); // never chosen
    expect(setCreditChoice(pid, 'library', { arts: 10 }, 5)).toBe(false);     // not held
    expect(getPlayerAdvances(pid).map(h => h.choice)).toEqual([{ crafts: 20 }, { civics: 10 }]);
  });

  it('ignores duplicate ids', () => {
    const db = makeDb();
    _setTestDb(db);
    const pid = addPlayer(db, 1, 'Ann');
    setPlayerAdvances(pid, ['a', 'a'], 1);
    expect(getPlayerAdvances(pid)).toEqual([{ id: 'a', round: 1 }]);
  });

  it('a removed player takes their cards along', () => {
    const db = makeDb();
    _setTestDb(db);
    const pid = addPlayer(db, 1, 'Ann');
    setPlayerAdvances(pid, ['a'], 1);
    db.exec('DELETE FROM players');
    expect(db.query('SELECT * FROM player_advances').all()).toEqual([]);
  });
});

// ─── Calamity effects of held cards (src/shared/calamities.ts) ───────────────

import {
  CALAMITIES, CALAMITY_ROLES, CARD_CALAMITIES, calamityNamed, minorCalamitiesInPlay, roleResult,
} from '../src/shared/calamities.js';
import { renderCalamityReference } from '../src/shared/calamity-panel.js';

describe('CARD_CALAMITIES', () => {
  it('is keyed by real card ids and names known major calamities', () => {
    for (const [id, effects] of Object.entries(CARD_CALAMITIES)) {
      expect([id, ADVANCE_BY_ID.has(id)]).toEqual([id, true]);
      expect(effects.length).toBeGreaterThan(0);
      for (const e of effects) expect([id, e.calamity, calamityNamed(e.calamity)?.kind !== 'minor']).toEqual([id, e.calamity, true]);
    }
  });

  it('matches the ＋ / − card columns of the Calamity Resolution Quick Chart exactly', () => {
    // Transcribed from the Quick Chart, independent of the card scans.
    const CHART: Record<string, [string[], string[]]> = {
      'Volcanic Eruption': [['engineering'], []],
      'Treachery': [[], ['diplomacy']],
      'Famine': [['pottery', 'calendar'], ['agriculture']],
      'Slave Revolt': [['mythology', 'enlightenment'], ['mining']],
      'Flood': [['engineering'], []],
      'Superstition': [['mysticism', 'deism', 'enlightenment'], ['universal-doctrine']],
      'Civil War': [['music', 'drama-and-poetry', 'democracy'], ['philosophy', 'military']],
      'Barbarian Hordes': [['monarchy'], ['politics', 'provincial-empire']],
      'Cyclone': [['masonry', 'calendar'], ['trade-empire']],
      'Epidemic': [['medicine', 'enlightenment', 'anatomy'], ['roadbuilding', 'trade-empire']],
      'Tyranny': [['sculpture', 'law'], ['monarchy', 'provincial-empire']],
      'Civil Disorder': [['music', 'drama-and-poetry', 'democracy', 'law'], ['advanced-military', 'naval-warfare']],
      'Corruption': [['law'], ['coinage', 'wonder-of-the-world']],
      'Iconoclasm and Heresy': [['philosophy', 'theology', 'theocracy'], ['monotheism']],
      'Regression': [['enlightenment', 'library'], ['fundamentalism']],
      'Piracy': [['naval-warfare'], ['cartography']],
    };
    const fromCards: Record<string, [string[], string[]]> = {};
    for (const [id, effects] of Object.entries(CARD_CALAMITIES)) {
      for (const e of effects) {
        const name = calamityNamed(e.calamity)!.name;
        fromCards[name] ??= [[], []];
        fromCards[name][e.effect === 'help' ? 0 : 1].push(id);
      }
    }
    const sorted = (r: Record<string, [string[], string[]]>) => Object.fromEntries(
      Object.entries(r).map(([k, [h, x]]) => [k, [[...h].sort(), [...x].sort()]]));
    expect(sorted(fromCards)).toEqual(sorted(CHART));
  });

  it('marks what softens a calamity as help and what worsens it as hurt (spot checks against the cards)', () => {
    const effect = (id: string, cal: string) => CARD_CALAMITIES[id]!.find(e => e.calamity === cal)!.effect;
    expect(effect('pottery', 'Famine')).toBe('help');
    expect(effect('agriculture', 'Famine')).toBe('hurt');
    expect(effect('theology', 'Iconoclasm and Heresy')).toBe('help');
    expect(effect('monotheism', 'Iconoclasm and Heresy')).toBe('hurt');
    expect(effect('mining', 'Slave Revolt')).toBe('hurt');
    expect(effect('mythology', 'Slave Revolt')).toBe('help');
    expect(effect('trade-empire', 'Epidemic')).toBe('hurt');
  });

  it('cards without a calamity line on them have no entry', () => {
    for (const id of ['mathematics', 'public-works', 'written-record', 'empiricism', 'cultural-ascendancy']) {
      expect(CARD_CALAMITIES[id]).toBeUndefined();
    }
  });
});

describe('CALAMITY_ROLES: who suffers what, and what cards change', () => {
  const cal = (name: string) => calamityNamed(name)!;
  const plain = (html: string) => html.replace(/<[^>]+>/g, '');

  it('every calamity has its roles; the ones with a beneficiary are those the rulebook names', () => {
    expect(Object.keys(CALAMITY_ROLES).sort()).toEqual(CALAMITIES.map(c => c.name).sort());
    expect(Object.keys(CALAMITY_ROLES).filter(n => CALAMITY_ROLES[n]!.beneficiary).sort()).toEqual(
      ['Barbarian Hordes', 'Civil War', 'Epidemic', 'Iconoclasm and Heresy', 'Piracy', 'Treachery', 'Tyranny']);
    expect(Object.keys(CALAMITY_ROLES).filter(n => CALAMITY_ROLES[n]!.secondary).sort()).toEqual(
      ['Cyclone', 'Epidemic', 'Famine', 'Flood', 'Iconoclasm and Heresy', 'Piracy']);
    // Tradeable ones: the trading partner, else most cities in stock. Non-tradeable: most cities in stock.
    expect(CALAMITY_ROLES['Treachery']!.beneficiary).toMatch(/^the player who traded the calamity to you\. If you drew it yourself.*most cities in stock \(tie: most tokens in stock/);
    expect(CALAMITY_ROLES['Civil War']!.beneficiary).toMatch(/^the player with the most cities in stock \(tie: most tokens in stock/);
  });

  it('each card effect has the role its text names, and a number only where the role has one', () => {
    for (const [id, effects] of Object.entries(CARD_CALAMITIES)) {
      for (const e of effects) {
        const where = [id, e.calamity];
        // Engineering's Earthquake: only the primary victim has a city destroyed.
        const primaryOnly = e.text.startsWith('If you are the primary victim') || (id === 'engineering' && e.calamity === 'Earthquake');
        expect([...where, e.role ?? null]).toEqual([...where,
          primaryOnly ? 'primary' : e.text.startsWith('If you are a secondary victim') ? 'secondary' : null]);
        if (e.delta !== undefined) {
          const roles = CALAMITY_ROLES[calamityNamed(e.calamity)!.name]!;
          expect([...where, roles[e.role ?? 'primary']?.n !== undefined]).toEqual([...where, true]);
          // Help moves the number the victim's way: down, or up where more is better.
          expect([...where, e.effect === 'help']).toEqual([...where, roles.higherIsBetter ? e.delta > 0 : e.delta < 0]);
        }
      }
    }
  });

  it('Famine with Pottery and Agriculture: 10 damage as primary victim, none as a secondary one', () => {
    const held = ['pottery', 'agriculture'];
    expect(roleResult(cal('Famine'), 'primary', held)).toMatchObject({ text: 'Take 10 damage.', base: 10 });
    expect(roleResult(cal('Famine'), 'secondary', held)!.text).toBe('No damage.');
    expect(roleResult(cal('Famine'), 'secondary', held)!.changes.map(c => c.card)).toEqual(['pottery']);
    const famine = plain(renderCalamityReference(held, 18).match(/data-calamity="Famine"[^]*?<\/details>/)![0]);
    expect(famine).toContain('Primary victim: Take 10 damage. 10 −5 Pottery +5 Agriculture');
    expect(famine).toContain('Secondary victims (3 players the primary victim picks): No damage. 5 −5 Pottery');
  });

  it('works out the rulebook examples and the special cases', () => {
    // Tony holds Mysticism and Deism: Superstition reduces 1 city.
    expect(roleResult(cal('Superstition'), 'primary', ['mysticism', 'deism'])!.text).toBe('Reduce 1 of your cities.');
    // More kept is better: Music and Law keep 5 cities in Civil Disorder; Naval Warfare one less.
    expect(roleResult(cal('Civil Disorder'), 'primary', ['music', 'law', 'naval-warfare'])!.text).toBe('Reduce all but 4 of your cities.');
    expect(roleResult(cal('Civil War'), 'primary', ['democracy', 'military'])!.text).toMatch(/beyond 40 unit points/);
    // Naval Warfare: one city less as primary victim, can't be picked as a secondary one.
    expect(roleResult(cal('Piracy'), 'primary', ['naval-warfare'])!.text).toMatch(/turns 1 of your coastal cities/);
    expect(roleResult(cal('Piracy'), 'secondary', ['naval-warfare'])!.immune).toBe('naval-warfare');
    // Anatomy only as a secondary victim; Medicine either way.
    expect(roleResult(cal('Epidemic'), 'primary', ['anatomy', 'medicine'])!.text).toBe('Take 10 damage.');
    expect(roleResult(cal('Epidemic'), 'secondary', ['anatomy', 'medicine'])!.text).toBe('No damage.');
    // Engineering: 5 less on the flood plain and on the coast.
    expect(roleResult(cal('Flood'), 'primary', ['engineering'])!.text).toBe('With units on a flood plain: take 10 damage there. With none: no damage.');
    // Effects that are not a number are listed under the role.
    expect(roleResult(cal('Iconoclasm and Heresy'), 'secondary', ['theocracy'])!.notes.map(n => n.card)).toEqual(['theocracy']);
    expect(roleResult(cal('Volcanic Eruption'), 'primary', ['engineering'])!.notes.map(n => n.card)).toEqual(['engineering']);
    expect(roleResult(cal('Regression'), 'primary', ['fundamentalism'])!.text).toBe('Your A.S.T. marker moves 2 steps back.');
    expect(roleResult(cal('Regression'), 'primary', ['library'])!.text).toBe('Your A.S.T. marker stays.');
  });

  it('the All calamities list shows the roles, the beneficiary and ✓ in the colour of the effect', () => {
    const html = renderCalamityReference(['agriculture'], 18);
    const famine = html.match(/data-calamity="Famine"[^]*?<\/details>/)![0];
    expect(plain(famine)).toContain('Primary victim: Take 15 damage. 10 +5 Agriculture');
    expect(famine).toContain('<li class="cal-hurt cal-held">');
    // After the name: a red ✓ for a card that hurts, a green one for one that helps.
    const summary = (html: string, name: string) => html.match(new RegExp(`data-calamity="${name}"[^]*?</summary>`))![0];
    expect(summary(html, 'Famine')).toContain('<span class="cal-check cal-check-hurt"');
    expect(summary(html, 'Famine')).not.toContain('cal-check-help');
    expect(summary(renderCalamityReference(['agriculture', 'pottery'], 18), 'Famine').match(/cal-check-(help|hurt)/g)).toEqual(['cal-check-help', 'cal-check-hurt']);
    expect(summary(html, 'Flood')).not.toContain('cal-check');
    expect(plain(html.match(/data-calamity="Epidemic"[^]*?<\/details>/)![0])).toContain('Beneficiary: The player who traded the calamity to you.');
  });

  it('the printed text comes first, the same for every player; the cards, then Your result', () => {
    const famine = (held: string[]) => plain(renderCalamityReference(held, 18).match(/data-calamity="Famine"[^]*?<\/details>/)![0]);
    const printed = cal('Famine').text.join(' ');
    for (const held of [[], ['pottery', 'agriculture']]) {
      const text = famine(held);
      expect(text.indexOf(printed)).toBeGreaterThan(0);
      expect(text.indexOf(printed)).toBeLessThan(text.indexOf('Pottery: Prevent 5 damage.'));
      expect(text.indexOf('Pottery: Prevent 5 damage.')).toBeLessThan(text.indexOf('Your result'));
      expect(text.indexOf('Your result')).toBeLessThan(text.indexOf('Primary victim:'));
    }
  });
});

describe('CALAMITIES (Quick Chart)', () => {
  it('has one minor, one non-tradeable and one tradeable calamity in each of stacks 2-9', () => {
    expect(CALAMITIES).toHaveLength(24);
    for (let stack = 2; stack <= 9; stack++) {
      expect(CALAMITIES.filter(c => c.stack === stack).map(c => c.kind).sort())
        .toEqual(['minor', 'non-tradeable', 'tradeable']);
    }
    expect(new Set(CALAMITIES.map(c => c.name)).size).toBe(24);
  });

  it('Engineering\'s "Earthquake" is the Volcanic Eruption card', () => {
    expect(calamityNamed('Earthquake')?.name).toBe('Volcanic Eruption');
    expect(calamityNamed('Tempest')?.kind).toBe('minor');
    expect(calamityNamed('Plague')).toBeUndefined();
  });

  it('minor calamities are used with 9, 10-11 and 15-18 players only', () => {
    const used = Array.from({ length: 16 }, (_, i) => i + 3).filter(minorCalamitiesInPlay);
    expect(used).toEqual([9, 10, 11, 15, 16, 17, 18]);
  });
});

describe('renderCalamityReference', () => {
  const names = (html: string) => [...html.matchAll(/data-calamity="([^"]+)"/g)].map(m => m[1]);

  it('lists the minor calamities first when the player count uses them', () => {
    const html = renderCalamityReference([], 18);
    expect(names(html)).toEqual(CALAMITIES.map(c => c.name));
    expect(html).not.toContain('cal-none');
  });

  it('leaves the minor calamities out, with a note, when the player count does not use them', () => {
    const html = renderCalamityReference([], 12);
    expect(names(html)).toEqual(CALAMITIES.filter(c => c.kind !== 'minor').map(c => c.name));
    expect(html).toContain('not used with 12 players');
  });

  it('marks the cards the player holds and keeps the opened rows open', () => {
    const html = renderCalamityReference(['pottery'], 8, new Set(['Famine']));
    expect(html).toContain('<li class="cal-help cal-held"><span class="cal-mark" aria-label="helps">＋</span><span><span class="cal-mod-card">Pottery:</span> Prevent 5 damage.</span><span class="cal-check" aria-label="you hold this card">✓</span></li>');
    expect(html).toContain('<li class="cal-help"><span class="cal-mark" aria-label="helps">＋</span><span><span class="cal-mod-card">Calendar:</span> Prevent 5 damage.</span></li>');
    expect(html).toMatch(/data-calamity="Famine" open>/);
    expect(html).not.toMatch(/data-calamity="Flood" open>/);
  });
});

// ─── Buying and locking cards, card text (advances.ts, advance-picker.ts) ───

import { advanceLocked, confirmPurchaseError, playerAdvanceChangeError } from '../src/shared/advances.js';
import { ADVANCE_TEXT } from '../src/shared/advance-text.js';
import { CARD_SORTS, DEFAULT_DIR, isReversible, nextAgeCardRequirement, renderAdvancePicker, renderCardList, renderCardOverview, sortLabel, type CardSort, type SortDir } from '../src/shared/advance-picker.js';

describe('playerAdvanceChangeError', () => {
  const held = [{ id: 'pottery', round: 2 }, { id: 'masonry', round: 3 }];

  it('cards bought in an earlier round are locked', () => {
    expect(advanceLocked(held[0]!, 3)).toBe(true);
    expect(advanceLocked(held[1]!, 3)).toBe(false);
    expect(playerAdvanceChangeError(held, ['masonry'], 3, true)).toBe('Pottery: bought in an earlier round, ask the GM to correct it');
  });

  it('this round\'s cards can be unticked while buying, not before', () => {
    expect(playerAdvanceChangeError(held, ['pottery'], 3, true)).toBeNull();
    expect(playerAdvanceChangeError(held, ['pottery'], 3, false)).toBe('Cards are bought after calamities are resolved');
    expect(playerAdvanceChangeError(held, ['masonry', 'pottery'], 3, false)).toBeNull();
  });

  it('new cards only while buying (after calamities)', () => {
    expect(playerAdvanceChangeError(held, ['pottery', 'masonry', 'mysticism'], 3, true)).toBeNull();
    expect(playerAdvanceChangeError(held, ['pottery', 'masonry', 'mysticism'], 3, false)).toBe('Cards are bought after calamities are resolved');
  });

  it('after the round rolls over, everything bought before is locked', () => {
    expect(playerAdvanceChangeError(held, ['pottery'], 4, true)).toContain('Masonry');
  });
});

describe('renderCardList: locks and the buying window', () => {
  const held = [{ id: 'pottery', round: 2 }, { id: 'masonry', round: 3 }];
  /** A card row's summary line: name, price, and Buy / Bought / Owned. */
  const head = (html: string, id: string) => html.match(new RegExp(`data-advance-ref="${id}"[^>]*><summary>[^]*?</summary>`))![0];

  it('an earlier round\'s card is owned and locked; this round\'s can be undone', () => {
    const html = renderCardList(held, 3);
    expect(head(html, 'pottery')).toContain('<span class="adv-ref-held">✓ Owned</span>');
    expect(head(html, 'pottery')).not.toContain('<button');
    expect(head(html, 'masonry')).toContain('<button type="button" class="adv-buy" data-advance="masonry" aria-pressed="true" title="Tap to undo">✓ Buying</button>');
    expect(head(html, 'mysticism')).toContain('<button type="button" class="adv-buy" data-advance="mysticism" aria-pressed="false">Buy</button>');
    // Held rows are filled in their colour.
    expect(html).toMatch(/class="adv-ref-item adv-crafts adv-held" data-advance-ref="pottery"/);
    expect(html).toMatch(/class="adv-ref-item adv-arts adv-dual adv-2-religion" data-advance-ref="mysticism"/);
  });

  it('no Buy buttons until the buying phase; this round\'s cards show as bought', () => {
    const closed = renderCardList(held, 3, { canBuy: false });
    expect(closed).not.toContain('class="adv-buy"');
    expect(head(closed, 'masonry')).toContain('✓ Bought');
    expect(head(closed, 'pottery')).toContain('✓ Owned');
    expect(closed).toContain('Cards are bought after calamities are resolved.');
    expect(closed).not.toContain('adv-basket-clear');
  });

  it('Confirm locks this round\'s purchase before the round ends', () => {
    const open = renderCardList(held, 3);
    expect(open).toContain('<button type="button" class="adv-basket-confirm">Confirm</button><button type="button" class="adv-basket-clear">Clear</button>');
    const done = renderCardList(held, 3, { confirmed: 3 });
    expect(head(done, 'masonry')).toContain('<span class="adv-ref-held">✓ Bought</span>');
    expect(done).not.toContain('class="adv-buy"'); // nothing more to buy this round
    expect(done).not.toContain('adv-basket-confirm');
    expect(done).not.toContain('adv-basket-clear');
    expect(done).toContain('Bought this round: <strong>1</strong> card');
    expect(done).toContain('<p class="adv-basket-done">✓ Confirmed</p>');
    // A confirmation from an earlier round does not lock this one.
    expect(head(renderCardList(held, 3, { confirmed: 2 }), 'masonry')).toContain('✓ Buying');
    // The GM sees it and may reopen.
    const gm = renderAdvancePicker(held, 3, { confirmed: 3 });
    expect(gm).toContain('Confirmed by the player');
    expect(gm).toContain('class="adv-basket-reopen"');
    expect(renderAdvancePicker(held, 3)).not.toContain('adv-basket-reopen');
  });

  it('confirming: once, while buying, with cards and the colours chosen; then nothing changes', () => {
    expect(confirmPurchaseError(held, 3, true)).toBeNull();
    expect(confirmPurchaseError(held, 3, false)).toBe('Cards are bought after calamities are resolved');
    expect(confirmPurchaseError(held, 3, true, 3)).toBe('Your cards for this round are already confirmed');
    expect(confirmPurchaseError([{ id: 'pottery', round: 2 }], 3, true)).toBe('No cards bought this round');
    expect(confirmPurchaseError([{ id: 'monument', round: 3 }], 3, true)).toBe('Choose the colours of Monument first');
    expect(confirmPurchaseError([{ id: 'monument', round: 3, choice: { arts: 20 } }], 3, true)).toBeNull();
    expect(playerAdvanceChangeError(held, ['pottery'], 3, true, 3)).toBe('Your cards for this round are confirmed, ask the GM to correct them');
    expect(playerAdvanceChangeError(held, ['pottery', 'masonry', 'mysticism'], 3, true, 3)).toContain('confirmed');
    expect(playerAdvanceChangeError(held, ['pottery', 'masonry'], 3, true, 3)).toBeNull(); // no change
    expect(advanceLocked({ id: 'masonry', round: 3 }, 3, 3)).toBe(true);
    expect(creditChoiceOpen({ id: 'monument', round: 3, choice: { arts: 20 } }, 3, 3)).toBe(false);
  });

  it('tiles show the price after credits from earlier rounds, not this round\'s', () => {
    const price = advanceCost('agriculture', held, 3);
    expect(price).toBeLessThan(ADVANCE_BY_ID.get('agriculture')!.cost);
    expect(renderCardList(held, 3)).toMatch(new RegExp(`data-advance-ref="agriculture"[^]*?<s>${ADVANCE_BY_ID.get('agriculture')!.cost}</s> <strong class="adv-price">${price}</strong>`));
    // Pottery bought this round gives no credit yet; only Library, which would
    // take 40 off it, is cheaper than its print.
    const fresh = renderCardList([{ id: 'pottery', round: 3 }], 3);
    const cheaper = fresh.split('<details').filter(t => /<summary>[^]*<s>[^]*<\/summary>/.test(t)).map(t => t.match(/data-advance-ref="([^"]+)"/)![1]);
    expect(cheaper).toEqual(['library']);
  });

  it('Library: 40 off one other card bought the same round, where it saves most', () => {
    const now = [{ id: 'library', round: 3 }, { id: 'pottery', round: 3 }, { id: 'agriculture', round: 3 }];
    const p = purchaseCost(now, 3);
    expect(p.prices.get('agriculture')).toBe(120 - 40);
    expect(p.prices.get('pottery')).toBe(60);
    expect(p.total).toBe(220 + 60 + 80);
    // Never below 0, and only on one card even if two are cheap (FAQ).
    expect(purchaseCost([{ id: 'library', round: 3 }, { id: 'sculpture', round: 3 }, { id: 'urbanism', round: 3 }], 3).total).toBe(220 + 50 + 10);
    // An unticked card shows what it adds: Library itself, net of the 40 it saves.
    expect(priceList([{ id: 'agriculture', round: 3 }], 3).get('library')).toBe(220 - 40);
    expect(renderCardList(now, 3)).toContain(`<strong class="adv-basket-cost">${p.total}</strong>`);
  });

  it('Anatomy: one science card printed under 100 free, combined with Library for the best saving', () => {
    const now = [{ id: 'anatomy', round: 3 }, { id: 'astronavigation', round: 3 }, { id: 'coinage', round: 3 }];
    const p = purchaseCost(now, 3);
    expect(p.prices.get('coinage')).toBe(0); // the dearer one is the free one
    expect(p.prices.get('astronavigation')).toBe(80);
    expect(p.total).toBe(270 + 80);
    // Not a science card, or 100 and up: no free card.
    expect(purchaseCost([{ id: 'anatomy', round: 3 }, { id: 'pottery', round: 3 }, { id: 'medicine', round: 3 }], 3).total).toBe(270 + 60 + 140);
    // Both: Anatomy frees Coinage, Library takes 40 off Medicine.
    const both = purchaseCost([{ id: 'anatomy', round: 3 }, { id: 'library', round: 3 }, { id: 'coinage', round: 3 }, { id: 'medicine', round: 3 }], 3);
    expect(both.total).toBe(270 + 220 + 0 + 100);
  });

  it('the basket sums this round\'s cards after credits; empty when none are new', () => {
    const now = [{ id: 'pottery', round: 2 }, { id: 'agriculture', round: 3 }, { id: 'mysticism', round: 3 }];
    const cost = advanceCost('agriculture', now, 3) + advanceCost('mysticism', now, 3);
    const vp = ADVANCE_BY_ID.get('agriculture')!.vp + ADVANCE_BY_ID.get('mysticism')!.vp;
    expect(renderCardList(now, 3)).toContain(`Buying this round: <strong>2</strong> cards · <strong class="adv-basket-cost">${cost}</strong> · <span class="adv-basket-vp">+${vp} VP</span>`);
    expect(renderCardList(now, 4)).not.toContain('adv-basket');
  });

  it('one line per kind of credit; the colour split once chosen; when it was bought', () => {
    const row = (html: string, id: string) => html.match(new RegExp(`data-advance-ref="${id}"[^]*?</details>`))![0];
    const lines = (html: string) => [...html.matchAll(/<p class="adv-ref-(?:credits|bought)">([^]*?)<\/p>/g)]
      .map(m => m[1]!.replace(/<[^>]+>/g, ''));
    expect(lines(row(renderCardList([], 1), 'monument'))).toEqual([
      'Credits: 10 Crafts · 10 Religion',
      'Credits of your choice: 20, chosen once',
      'Card credit: 20 to Wonder of the World',
      'Cheaper with: Mysticism −10',
    ]);
    const mine = row(renderCardList([{ id: 'monument', round: 4, choice: { arts: 10, civics: 10 } }], 5), 'monument');
    expect(lines(mine).slice(1, 2)).toEqual(['Credits of your choice: 10 Arts · 10 Civics']);
    expect(mine).toContain('<span class="adv-ref-credit adv-arts">10 Arts</span>');
    expect(lines(mine).at(-1)).toBe('Bought in round 4');
  });

  it('cards bought for a named card show it as "Cheaper with", in the giver\'s colour', () => {
    const pottery = ADVANCE_BY_ID.get('pottery')!;
    const n = pottery.special['agriculture'];
    expect(n).toBeGreaterThan(0);
    expect(renderCardList([], 1)).toMatch(new RegExp(`data-advance-ref="agriculture"[^]*?Cheaper with: <span class="adv-ref-credit adv-${pottery.groups[0]}">Pottery −${n}</span>`));
  });

  it('a credit to a named card is in that card\'s colour', () => {
    const monument = ADVANCE_BY_ID.get('monument')!;
    expect(renderCardList([], 1)).toMatch(new RegExp(`data-advance-ref="mysticism"[^]*?<span class="adv-ref-credit adv-${monument.groups[0]}">\\d+ to Monument</span>`));
  });

  it('cards within a colour run cheapest first, in the card list and the GM tiles', () => {
    for (const html of [renderAdvancePicker([], 1), renderCardList([], 1, { canBuy: false })]) {
      for (const section of html.split('<section').slice(1)) {
        const costs = [...section.matchAll(/data-advance(?:-ref)?="([^"]+)"/g)].map(m => ADVANCE_BY_ID.get(m[1]!)!.cost);
        expect(costs).toEqual([...costs].sort((a, b) => a - b));
      }
    }
  });

  it('the player can sort by A–Z, cost after credits or VP', () => {
    // Pottery bought in round 1 makes Agriculture cheaper in round 2.
    const mine = [{ id: 'pottery', round: 1 }];
    const ids = (html: string) => [...html.matchAll(/data-advance-ref="([^"]+)"/g)].map(m => m[1]!);
    const price = (id: string) => advanceCost(id, mine, 2);
    expect(price('agriculture')).toBeLessThan(ADVANCE_BY_ID.get('agriculture')!.cost);
    const render = (sort: CardSort, dir?: SortDir) => renderCardList(mine, 2, { sort, dir });
    expect(render('group')).toContain('<h4>Science</h4>');
    const byName = ids(render('name'));
    expect(byName).toHaveLength(51);
    expect(render('name')).not.toContain('<h4>');
    expect(byName.map(id => ADVANCE_BY_ID.get(id)!.name)).toEqual(ADVANCES.map(c => c.name).sort((a, b) => a.localeCompare(b)));
    // Cost: what the card costs now (Pottery itself is held from round 1, so its print).
    const byCost = ids(render('cost')).filter(id => id !== 'pottery').map(price);
    expect(byCost).toEqual([...byCost].sort((a, b) => a - b));
    const vps = ids(render('vp')).map(id => ADVANCE_BY_ID.get(id)!.vp);
    expect(vps).toEqual([...vps].sort((a, b) => a - b));
    // A second click turns each order round.
    expect(ids(render('name', 'desc'))).toEqual([...byName].reverse());
    const dearest = ids(render('cost', 'desc')).filter(id => id !== 'pottery').map(price);
    expect(dearest).toEqual([...dearest].sort((a, b) => b - a));
    const most = ids(render('vp', 'desc')).map(id => ADVANCE_BY_ID.get(id)!.vp);
    expect(most).toEqual([...most].sort((a, b) => b - a));
    expect(CARD_SORTS.map(s => sortLabel(s, DEFAULT_DIR[s])[0])).toEqual(['Colour', 'A–Z', 'Cost ↑', 'VP ↑', 'VP/cost']);
    expect(CARD_SORTS.map(s => sortLabel(s, DEFAULT_DIR[s] === 'asc' ? 'desc' : 'asc')[0])).toEqual(['Colour', 'Z–A', 'Cost ↓', 'VP ↓', 'VP/cost']);
    // A row outside a colour section keeps its colour.
    expect(renderCardList(mine, 2, { sort: 'name' })).toContain('class="adv-ref-item adv-crafts');
    // The GM tiles show the price after credits too.
    expect(renderAdvancePicker(mine, 2)).toMatch(new RegExp(`data-advance="agriculture"[^]*?<s>${ADVANCE_BY_ID.get('agriculture')!.cost}</s> <strong class="adv-price">${price('agriculture')}</strong>`));
  });

  it('VP per cost after credits: best value first, a free card before all; one way only', () => {
    // Pottery from round 1: Agriculture costs 120 − 10 Crafts − 10 Pottery credit.
    const mine = [{ id: 'pottery', round: 1 }];
    const ids = (html: string) => [...html.matchAll(/data-advance-ref="([^"]+)"/g)].map(m => m[1]!).filter(id => id !== 'pottery');
    const value = (id: string) => { const p = advanceCost(id, mine, 2); return p ? ADVANCE_BY_ID.get(id)!.vp / p : Infinity; };
    const best = ids(renderCardList(mine, 2, { sort: 'value' })).map(value);
    expect(best).toEqual([...best].sort((a, b) => b - a));
    // Only cheapest VP first: a direction is ignored.
    expect(ids(renderCardList(mine, 2, { sort: 'value', dir: 'asc' }))).toEqual(ids(renderCardList(mine, 2, { sort: 'value' })));
    expect(isReversible('value')).toBe(false);
    expect(isReversible('group')).toBe(false);
    expect(isReversible('cost')).toBe(true);
    // A card made free by credits comes first: 70 Arts credits make Mysticism free.
    const arts = ['sculpture', 'architecture', 'diplomacy', 'cultural-ascendancy', 'wonder-of-the-world'].map(id => ({ id, round: 1 }));
    expect(priceList(arts, 2).get('mysticism')).toBe(0);
    const first = [...renderCardList(arts, 2, { sort: 'value' }).matchAll(/data-advance-ref="([^"]+)"/g)].map(m => m[1]!).find(id => !arts.some(h => h.id === id))!;
    expect(priceList(arts, 2).get(first)).toBe(0);
  });

  it('two-colour cards: under their first colour, drawn in both, in the card list and the GM tiles', () => {
    const dualIds = ADVANCES.filter(c => c.groups.length === 2).map(c => c.id);
    expect(dualIds).toHaveLength(9);
    for (const html of [renderAdvancePicker([], 1), renderCardList([], 1)]) {
      const marked = [...html.matchAll(/class="adv-(?:pick|ref-item) adv-(\w+) adv-dual adv-2-(\w+)[^"]*" data-advance(?:-ref)?="([^"]+)"/g)]
        .map(m => [m[3], m[1], m[2]]);
      expect(marked.map(m => m[0]).sort()).toEqual([...dualIds].sort());
      for (const [id, first, second] of marked) expect([first, second]).toEqual([...ADVANCE_BY_ID.get(id!)!.groups]);
    }
    // The Strategy Explorer's order of colours: Mysticism blue (Arts) to yellow (Religion).
    expect(ADVANCE_BY_ID.get('mysticism')!.groups).toEqual(['arts', 'religion']);
    expect(ADVANCE_BY_ID.get('written-record')!.groups).toEqual(['civics', 'science']);
  });

  it('the purchase bar names this round\'s cards and offers Clear while buying', () => {
    const now = [{ id: 'pottery', round: 2 }, { id: 'agriculture', round: 3 }, { id: 'mysticism', round: 3 }];
    const html = renderCardList(now, 3);
    expect(html).toContain('<p class="adv-basket-names"><span class="adv-basket-card adv-crafts">Agriculture</span> · <span class="adv-basket-card adv-arts">Mysticism</span></p>');
    expect(html).toContain('class="adv-basket-clear"');
    expect(renderCardList(now, 3, { canBuy: false })).not.toContain('adv-basket-clear');
    expect(renderAdvancePicker(now, 3)).toContain('adv-basket-clear');
  });

  it('colour credit totals: from earlier rounds now, with this round\'s cards from next round', () => {
    const now = [{ id: 'pottery', round: 1 }, { id: 'monument', round: 2, choice: { arts: 20 } }];
    expect(colourCredits(now, 2)).toEqual({ science: 0, arts: 5, crafts: 10, civics: 0, religion: 0 });
    expect(colourCredits(now)).toEqual({ science: 0, arts: 25, crafts: 20, civics: 0, religion: 10 });
    const html = renderCardOverview(now, 2);
    expect(html).toContain('<span class="adv-credit-total adv-arts"><span class="adv-credit-name">Arts</span> <strong>5</strong> → 25</span>');
    expect(html).toContain('<span class="adv-credit-total adv-science"><span class="adv-credit-name">Science</span> <strong>0</strong></span>');
  });

  it('the next age\'s card requirement, counting this round\'s cards', () => {
    const age = (level: number, expert = true) => nextAgeCardRequirement({ level, civNumber: 5, expert });
    expect(age(15)).toMatchObject({ age: 'Middle Bronze Age', parts: [{ label: '5 VP in Advances' }] });
    expect(age(45)!.age).toBe('Late Bronze Age');
    expect(age(55)!.parts.map(p => p.label)).toEqual(['10 Adv <100', '38 VP']);
    expect(age(70)!.age).toBe('Late Iron Age');
    expect(age(75)).toBeNull();
    expect(age(45, false)!.parts.map(p => p.label)).toEqual(['3 Adv ≥100']);
    const held = [{ id: 'pottery', round: 1 }, { id: 'agriculture', round: 2 }];
    const html = renderCardOverview(held, 2, { level: 15, civNumber: 5, expert: true });
    expect(html).toContain('<span class="adv-overview-label">A.S.T. Req. Middle Bronze Age:</span><span class="adv-req adv-req-unmet">5 VP in Advances <span class="adv-req-have">(4)</span></span>');
    expect(renderCardOverview([...held, { id: 'masonry', round: 2 }], 2, { level: 15, civNumber: 5, expert: true })).toContain('adv-req-met');
  });

  it('GM correction: every card a tile to toggle, nothing locked, and the hint says so', () => {
    const html = renderAdvancePicker(held, 3);
    expect(html).not.toContain('aria-disabled');
    expect([...html.matchAll(/<button type="button" class="adv-pick /g)]).toHaveLength(51);
    expect(html).toContain('GM correction:');
    expect(html).toMatch(/class="adv-pick adv-crafts adv-held" data-advance="pottery" aria-pressed="true"/);
  });
});

describe('ADVANCE_TEXT and the card list', () => {
  it('is keyed by real card ids, and every special-ability card has its text', () => {
    for (const id of Object.keys(ADVANCE_TEXT)) expect([id, ADVANCE_BY_ID.has(id)]).toEqual([id, true]);
    for (const id of SPECIAL_ABILITY_IDS) expect([id, (ADVANCE_TEXT[id] ?? []).length > 0]).toEqual([id, true]);
    expect(Object.keys(ADVANCE_TEXT)).toHaveLength(35);
  });

  it('lists all 51 cards, held ones marked, opened rows kept open', () => {
    const html = renderCardList([{ id: 'politics', round: 1 }], 2, { open: new Set(['politics']) });
    expect([...html.matchAll(/data-advance-ref="/g)]).toHaveLength(51);
    expect(html).toMatch(/data-advance-ref="politics" open><summary>.*?<span class="adv-ref-held">✓ Owned<\/span><\/span><\/summary>/);
    expect(html).toContain('<strong>Special ability:</strong> You may choose one of two options:');
    expect(html).toContain('<strong>Barbarian Hordes:</strong> 5 additional barbarian tokens are used.');
    expect(html).not.toMatch(/data-advance-ref="pottery" open/);
  });
});
