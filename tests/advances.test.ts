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
  ADVANCES, ADVANCE_BY_ID, ADVANCE_GROUPS, advanceTotals, advanceCost, advanceFlags,
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
  CALAMITIES, CARD_CALAMITIES, calamityNamed, minorCalamitiesInPlay,
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

import { advanceLocked, playerAdvanceChangeError } from '../src/shared/advances.js';
import { ADVANCE_TEXT } from '../src/shared/advance-text.js';
import { renderAdvancePicker, renderAdvanceReference } from '../src/shared/advance-picker.js';

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

describe('renderAdvancePicker: locks and the buying window', () => {
  const held = [{ id: 'pottery', round: 2 }, { id: 'masonry', round: 3 }];
  const tile = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-advance="${id}"[^>]*>`))![0];

  it('an earlier round\'s card is locked; this round\'s is not', () => {
    const html = renderAdvancePicker(held, 3);
    expect(tile(html, 'pottery')).toContain('adv-locked');
    expect(tile(html, 'pottery')).toContain('aria-disabled="true"');
    expect(html).not.toContain('round 2'); // the round is in All cards, not on the tile
    expect(tile(html, 'masonry')).not.toContain('aria-disabled');
  });

  it('tiles show the price after credits from earlier rounds, not this round\'s', () => {
    const price = advanceCost('agriculture', held, 3);
    expect(price).toBeLessThan(ADVANCE_BY_ID.get('agriculture')!.cost);
    expect(renderAdvancePicker(held, 3)).toMatch(new RegExp(`data-advance="agriculture"[^]*?<s>${ADVANCE_BY_ID.get('agriculture')!.cost}</s> <strong class="adv-price">${price}</strong>`));
    const fresh = renderAdvancePicker([{ id: 'pottery', round: 3 }], 3);
    expect(fresh).not.toContain('adv-price');
  });

  it('the basket sums this round\'s cards after credits; empty when none are new', () => {
    const now = [{ id: 'pottery', round: 2 }, { id: 'agriculture', round: 3 }, { id: 'mysticism', round: 3 }];
    const cost = advanceCost('agriculture', now, 3) + advanceCost('mysticism', now, 3);
    const vp = ADVANCE_BY_ID.get('agriculture')!.vp + ADVANCE_BY_ID.get('mysticism')!.vp;
    expect(renderAdvancePicker(now, 3)).toContain(`Buying this round: <strong>2</strong> cards · <strong class="adv-basket-cost">${cost}</strong> · +${vp} VP`);
    expect(renderAdvancePicker(now, 4)).not.toContain('adv-basket');
  });

  it('one line per kind of credit; the colour split once chosen; when it was bought', () => {
    const row = (html: string, id: string) => html.match(new RegExp(`data-advance-ref="${id}"[^]*?</details>`))![0];
    const lines = (html: string) => [...html.matchAll(/<p class="adv-ref-(?:credits|bought)">([^]*?)<\/p>/g)]
      .map(m => m[1]!.replace(/<[^>]+>/g, ''));
    expect(lines(row(renderAdvanceReference([]), 'monument'))).toEqual([
      'Credits: 10 Crafts · 10 Religion',
      'Credits of your choice: 20, chosen once',
      'Card credit: 20 to Wonder of the World',
      'Cheaper with: Mysticism −10',
    ]);
    const mine = row(renderAdvanceReference([{ id: 'monument', round: 4, choice: { arts: 10, civics: 10 } }]), 'monument');
    expect(lines(mine).slice(1, 2)).toEqual(['Credits of your choice: 10 Arts · 10 Civics']);
    expect(mine).toContain('<span class="adv-ref-credit adv-arts">10 Arts</span>');
    expect(lines(mine).at(-1)).toBe('Bought in round 4');
  });

  it('cards bought for a named card show it as "Cheaper with", in the giver\'s colour', () => {
    const pottery = ADVANCE_BY_ID.get('pottery')!;
    const n = pottery.special['agriculture'];
    expect(n).toBeGreaterThan(0);
    expect(renderAdvanceReference([])).toMatch(new RegExp(`data-advance-ref="agriculture"[^]*?Cheaper with: <span class="adv-ref-credit adv-${pottery.groups[0]}">Pottery −${n}</span>`));
  });

  it('a credit to a named card is in that card\'s colour', () => {
    const monument = ADVANCE_BY_ID.get('monument')!;
    expect(renderAdvanceReference([])).toMatch(new RegExp(`data-advance-ref="mysticism"[^]*?<span class="adv-ref-credit adv-${monument.groups[0]}">\\d+ to Monument</span>`));
  });

  it('cards within a colour run cheapest first, in the picker and in All cards', () => {
    for (const html of [renderAdvancePicker([], 1), renderAdvanceReference([])]) {
      for (const section of html.split('<section').slice(1)) {
        const costs = [...section.matchAll(/data-advance(?:-ref)?="([^"]+)"/g)].map(m => ADVANCE_BY_ID.get(m[1]!)!.cost);
        expect(costs).toEqual([...costs].sort((a, b) => a - b));
      }
    }
  });

  it('GM correction: nothing is locked or closed, and the hint says so', () => {
    const html = renderAdvancePicker(held, 3, { canBuy: false, gm: true });
    for (const id of ['pottery', 'masonry', 'mysticism']) expect(tile(html, id)).not.toContain('aria-disabled');
    expect(html).toContain('GM correction:');
    expect(html).toMatch(/data-advance="monument"/);
  });

  it('cards not locked are closed until the buying phase, held ones too', () => {
    const closed = renderAdvancePicker(held, 3, { canBuy: false });
    expect(tile(closed, 'mysticism')).toContain('adv-closed');
    expect(tile(closed, 'masonry')).toContain('adv-closed');
    expect(tile(closed, 'masonry')).toContain('aria-disabled="true"');
    expect(tile(closed, 'pottery')).not.toContain('adv-closed');
    expect(tile(renderAdvancePicker(held, 3, { canBuy: true }), 'mysticism')).not.toContain('aria-disabled');
  });
});

describe('ADVANCE_TEXT and the All cards list', () => {
  it('is keyed by real card ids, and every special-ability card has its text', () => {
    for (const id of Object.keys(ADVANCE_TEXT)) expect([id, ADVANCE_BY_ID.has(id)]).toEqual([id, true]);
    for (const id of SPECIAL_ABILITY_IDS) expect([id, (ADVANCE_TEXT[id] ?? []).length > 0]).toEqual([id, true]);
    expect(Object.keys(ADVANCE_TEXT)).toHaveLength(35);
  });

  it('lists all 51 cards, ✓ on held ones, opened rows kept open', () => {
    const html = renderAdvanceReference([{ id: 'politics', round: 1 }], new Set(['politics']));
    expect([...html.matchAll(/data-advance-ref="/g)]).toHaveLength(51);
    expect(html).toMatch(/data-advance-ref="politics" open><summary>.*?<span class="adv-ref-held"[^>]*>✓<\/span><\/summary>/);
    expect(html).toContain('<strong>Special ability:</strong> You may choose one of two options:');
    expect(html).toContain('<strong>Barbarian Hordes:</strong> 5 additional barbarian tokens are used.');
    expect(html).not.toMatch(/data-advance-ref="pottery" open/);
  });
});
