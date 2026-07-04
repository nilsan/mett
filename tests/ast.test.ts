/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect } from 'bun:test';
import { meetsAstRequirements } from '../src/db.js';
import { renderAgeRequirementsList } from '../src/models/ast.js';
import type { PlayerRow, AstLevelRow } from '../src/db.js';

// ─── Stubs ────────────────────────────────────────────────────────────────────

function p(overrides: Partial<PlayerRow> = {}): PlayerRow {
  return {
    id: 1, civ_id: 15, name: 'Test',
    military: 0, wonder: 0, special: 0,
    ast_level: 0, adv_points: 0,
    adv_1vp: 0, adv_3vp: 0, adv_6vp: 0,
    region: 'west', rank_order: 0, late_iron_age_bonus: 0, regressed: 0,
    civ_number: 15, // Hellas — normal civ (stoneEnd=20, ebaEnd=35 expert / ebaEnd=35 basic)
    civ_name: 'Hellas', civ_slug: 'hellas',
    civ_color: '#F5EE2A', civ_text_color: 'black',
    ...overrides,
  };
}

// Civ profiles used in tests:
//   civ 15 (Hellas) — normal:      stoneEnd=20, ebaEnd=35 (expert & basic)
//   civ 1  (Minoa)  — slow-start:  stoneEnd=25, ebaEnd=35 (expert) / ebaEnd=40 (basic)
//   civ 5  (Celt)   — late-start:  stoneEnd=20, ebaEnd=40 (basic only)

// Build an AstLevelRow stub using the JSON requirement columns — the production
// code path.  basic_req / expert_req (legacy text) are set to null because
// meetsAstRequirements only falls back to the regex parser when the JSON column
// is `undefined`; setting null routes through checkRequirement as in production.
function lvl(level: number, req: object | null, mode: 'basic' | 'expert'): AstLevelRow {
  const jsonStr = req ? JSON.stringify(req) : null;
  return {
    level, era: 'Test',
    basic_req:       null,
    expert_req:      null,
    basic_req_json:  mode === 'basic'  ? jsonStr : null,
    expert_req_json: mode === 'expert' ? jsonStr : null,
  };
}

// Structured requirements matching AST_REQ_SEED in src/services/db.ts:
const REQ = {
  none:     null,
  na:       { impossible: true },
  c2:       { cities: 2 },
  c3:       { cities: 3 },
  c4:       { cities: 4 },
  c5:       { cities: 5 },
  c6:       { cities: 6 },
  c3a3:     { cities: 3, advCount: 3, advTier: 'any' },
  c3a3x100: { cities: 3, advCount: 3, advTier: 'medium' },
  c4a2x200: { cities: 4, advCount: 2, advTier: 'expensive' },
  c5a3x200: { cities: 5, advCount: 3, advTier: 'expensive' },
  c3vp5:    { cities: 3, advVpTotal: 5 },
  c4a12:    { cities: 4, advCount: 12, advTier: 'any' },
  c5a10:    { cities: 5, advCount: 10, advTier: 'cheap', totalVp: 38 },
  c6a17:    { cities: 6, advCount: 17, advTier: 'cheap', totalVp: 56 },
} as const;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('meetsAstRequirements', () => {

  // ── No requirement ─────────────────────────────────────────────────────────
  describe('None — always advance', () => {
    it('expert Stone Age (level 0)', () => {
      expect(meetsAstRequirements(p(), lvl(0, REQ.none, 'expert'), 0, true)).toBe(true);
    });
    it('basic Stone Age (level 5)', () => {
      expect(meetsAstRequirements(p(), lvl(5, REQ.none, 'basic'), 0, false)).toBe(true);
    });
    it('null JSON req treated as free (production: levels 0-15 have null req_json)', () => {
      // In the DB, free levels have basic_req_json=NULL and expert_req_json=NULL.
      // NULL is falsy → checkRequirement receives null → returns true.
      const row: AstLevelRow = { level: 0, era: 'Test', basic_req: null, expert_req: null, basic_req_json: null, expert_req_json: null };
      expect(meetsAstRequirements(p(), row, 0, true)).toBe(true);
    });
  });

  // ── Impossible (N/A) ───────────────────────────────────────────────────────
  describe('N/A — cannot advance', () => {
    it('basic at level 75', () => {
      expect(meetsAstRequirements(p(), lvl(75, REQ.na, 'basic'), 9, false)).toBe(false);
    });
    it('expert at level 80', () => {
      expect(meetsAstRequirements(p(), lvl(80, REQ.na, 'expert'), 9, true)).toBe(false);
    });
  });

  // ── Slow-start civs — free Stone Age steps ─────────────────────────────────
  describe('slow-start civs (Minoa civ 1, Saba civ 2, Kushan civ 10, Iberia civ 13) in expert', () => {
    // stoneEnd=25 for these civs in expert: levels 5,10,15,20 are free
    it('Minoa level 5 with 0 cities — free', () => {
      expect(meetsAstRequirements(p({ civ_number: 1 }), lvl(5, REQ.c3, 'expert'), 0, true)).toBe(true);
    });
    it('Minoa level 20 with 0 cities — still free (< stoneEnd=25)', () => {
      expect(meetsAstRequirements(p({ civ_number: 1 }), lvl(20, REQ.c3, 'expert'), 0, true)).toBe(true);
    });
    it('Minoa level 25 with 2 cities — NOT free, needs 3 cities', () => {
      // level 25 is stoneEnd itself → not free, falls through to req check
      expect(meetsAstRequirements(p({ civ_number: 1 }), lvl(25, REQ.c3, 'expert'), 2, true)).toBe(false);
    });
    it('Minoa level 25 with 3 cities — passes', () => {
      expect(meetsAstRequirements(p({ civ_number: 1 }), lvl(25, REQ.c3, 'expert'), 3, true)).toBe(true);
    });
    it('normal civ (Hellas) at level 20 is NOT free — stoneEnd=20 so 20 < 20 is false', () => {
      expect(meetsAstRequirements(p({ civ_number: 15 }), lvl(20, REQ.c3, 'expert'), 0, true)).toBe(false);
    });
  });

  // ── Basic mode EBA override ────────────────────────────────────────────────
  describe('basic mode: EBA override at levels 35 and 40', () => {
    // Minoa in basic: stoneEnd=25, ebaEnd=40 → levels 35 and 40 are within EBA (< 40)
    // so use simple "2 cities" check, not the stored req
    it('Minoa basic level 35 with 2 cities — override applies', () => {
      expect(meetsAstRequirements(p({ civ_number: 1 }), lvl(35, REQ.c3a3, 'basic'), 2, false)).toBe(true);
    });
    it('Minoa basic level 35 with 1 city — override applies, fails', () => {
      expect(meetsAstRequirements(p({ civ_number: 1 }), lvl(35, REQ.c3a3, 'basic'), 1, false)).toBe(false);
    });
    it('Minoa basic level 40 with 2 cities — 40 < ebaEnd=40 is false, no override', () => {
      // level 40 is ebaEnd itself for Minoa basic → NOT overridden, uses stored req
      expect(meetsAstRequirements(
        p({ civ_number: 1, adv_3vp: 3 }),
        lvl(40, REQ.c3a3, 'basic'), 3, false,
      )).toBe(true);
    });
    it('Hellas basic level 35 — ebaEnd=35, no override', () => {
      // 35 < 35 is false → falls through to stored req '3 cities + 3 advances'
      expect(meetsAstRequirements(
        p({ civ_number: 15 }),
        lvl(35, REQ.c3a3, 'basic'), 3, false,
      )).toBe(false); // 0 advances → fail
    });
    it('Celt (late-start) basic level 35 with 2 cities — ebaEnd=40, override', () => {
      expect(meetsAstRequirements(p({ civ_number: 5 }), lvl(35, REQ.c3a3, 'basic'), 2, false)).toBe(true);
    });
    it('Celt basic level 40 with 2 cities — ebaEnd=40, 40 < 40 false, no override', () => {
      // stored req is '3 cities + 3 advances'; 2 cities → fail cities check
      expect(meetsAstRequirements(p({ civ_number: 5 }), lvl(40, REQ.c3a3, 'basic'), 2, false)).toBe(false);
    });
  });

  // ── Cities only ───────────────────────────────────────────────────────────
  describe('cities-only requirement', () => {
    it('expert EBA: exactly 3 cities required', () => {
      expect(meetsAstRequirements(p(), lvl(20, REQ.c3, 'expert'), 3, true)).toBe(true);
      expect(meetsAstRequirements(p(), lvl(20, REQ.c3, 'expert'), 2, true)).toBe(false);
    });
    it('basic EBA: 2 cities', () => {
      expect(meetsAstRequirements(p(), lvl(20, REQ.c2, 'basic'), 2, false)).toBe(true);
      expect(meetsAstRequirements(p(), lvl(20, REQ.c2, 'basic'), 1, false)).toBe(false);
    });
  });

  // ── VP in advances (expert MBA: 3 cities + 5 VP in advances) ──────────────
  describe('VP in advances — expert MBA', () => {
    const expert = true;
    it('exactly 5 adv_points passes', () => {
      expect(meetsAstRequirements(
        p({ adv_points: 5 }), lvl(35, REQ.c3vp5, 'expert'), 3, expert,
      )).toBe(true);
    });
    it('4 adv_points fails', () => {
      expect(meetsAstRequirements(
        p({ adv_points: 4 }), lvl(35, REQ.c3vp5, 'expert'), 3, expert,
      )).toBe(false);
    });
    it('city check runs first — 2 cities with enough VP fails', () => {
      expect(meetsAstRequirements(
        p({ adv_points: 99 }), lvl(35, REQ.c3vp5, 'expert'), 2, expert,
      )).toBe(false);
    });
    it('applies at all MBA levels (40, 45)', () => {
      expect(meetsAstRequirements(p({ adv_points: 5 }), lvl(40, REQ.c3vp5, 'expert'), 3, expert)).toBe(true);
      expect(meetsAstRequirements(p({ adv_points: 5 }), lvl(45, REQ.c3vp5, 'expert'), 3, expert)).toBe(true);
    });
  });

  // ── Plain advance count (basic MBA: 3 cities + 3 advances) ────────────────
  describe('plain advance count — basic MBA', () => {
    const basic = false;
    it('any combination totalling 3 advances passes', () => {
      expect(meetsAstRequirements(p({ adv_1vp: 3 }),          lvl(35, REQ.c3a3, 'basic'), 3, basic)).toBe(true);
      expect(meetsAstRequirements(p({ adv_3vp: 3 }),          lvl(35, REQ.c3a3, 'basic'), 3, basic)).toBe(true);
      expect(meetsAstRequirements(p({ adv_6vp: 3 }),          lvl(35, REQ.c3a3, 'basic'), 3, basic)).toBe(true);
      expect(meetsAstRequirements(p({ adv_1vp: 1, adv_3vp: 1, adv_6vp: 1 }), lvl(35, REQ.c3a3, 'basic'), 3, basic)).toBe(true);
    });
    it('2 advances fails', () => {
      expect(meetsAstRequirements(p({ adv_1vp: 2 }), lvl(35, REQ.c3a3, 'basic'), 3, basic)).toBe(false);
    });
  });

  // ── Advances ≥100 each (basic LBA: 3 cities + 3 advances ≥100 each) ───────
  describe('advances ≥100 each — basic LBA', () => {
    const basic = false;
    it('adv_3vp + adv_6vp >= 3 passes', () => {
      expect(meetsAstRequirements(p({ adv_3vp: 2, adv_6vp: 1 }), lvl(50, REQ.c3a3x100, 'basic'), 3, basic)).toBe(true);
      expect(meetsAstRequirements(p({ adv_3vp: 0, adv_6vp: 3 }), lvl(50, REQ.c3a3x100, 'basic'), 3, basic)).toBe(true);
    });
    it('cheap advances (adv_1vp) do not count', () => {
      expect(meetsAstRequirements(p({ adv_1vp: 9, adv_3vp: 0, adv_6vp: 0 }), lvl(50, REQ.c3a3x100, 'basic'), 3, basic)).toBe(false);
    });
    it('adv_3vp + adv_6vp = 2 fails', () => {
      expect(meetsAstRequirements(p({ adv_3vp: 2, adv_6vp: 0 }), lvl(50, REQ.c3a3x100, 'basic'), 3, basic)).toBe(false);
    });
  });

  // ── Advances ≥200 each (basic EIA) ────────────────────────────────────────
  describe('advances ≥200 each — basic EIA', () => {
    const basic = false;
    it('level 65: 4 cities + 2 ≥200-advances', () => {
      expect(meetsAstRequirements(p({ adv_6vp: 2 }), lvl(65, REQ.c4a2x200, 'basic'), 4, basic)).toBe(true);
      expect(meetsAstRequirements(p({ adv_6vp: 1 }), lvl(65, REQ.c4a2x200, 'basic'), 4, basic)).toBe(false);
    });
    it('adv_3vp does not satisfy ≥200 requirement', () => {
      expect(meetsAstRequirements(p({ adv_3vp: 5, adv_6vp: 0 }), lvl(65, REQ.c4a2x200, 'basic'), 4, basic)).toBe(false);
    });
    it('level 70: 5 cities + 3 ≥200-advances', () => {
      expect(meetsAstRequirements(p({ adv_6vp: 3 }), lvl(70, REQ.c5a3x200, 'basic'), 5, basic)).toBe(true);
      expect(meetsAstRequirements(p({ adv_6vp: 2 }), lvl(70, REQ.c5a3x200, 'basic'), 5, basic)).toBe(false);
    });
  });

  // ── Expert LBA: plain count (4 cities + 12 advances) ─────────────────────
  describe('plain advance count (large) — expert LBA', () => {
    const expert = true;
    it('12 advances of any tier passes', () => {
      expect(meetsAstRequirements(p({ adv_1vp: 12 }), lvl(50, REQ.c4a12, 'expert'), 4, expert)).toBe(true);
      expect(meetsAstRequirements(p({ adv_6vp: 12 }), lvl(50, REQ.c4a12, 'expert'), 4, expert)).toBe(true);
      expect(meetsAstRequirements(p({ adv_1vp: 4, adv_3vp: 4, adv_6vp: 4 }), lvl(50, REQ.c4a12, 'expert'), 4, expert)).toBe(true);
    });
    it('11 advances fails', () => {
      expect(meetsAstRequirements(p({ adv_1vp: 11 }), lvl(50, REQ.c4a12, 'expert'), 4, expert)).toBe(false);
    });
  });

  // ── Advances <100 each + VP floor (expert EIA) ────────────────────────────
  describe('advances <100 each + VP floor — expert EIA', () => {
    const expert = true;
    // level 65: 5 cities + 10 advances (<100 each) + 38 VP
    it('10 cheap advances and 38 VP passes', () => {
      expect(meetsAstRequirements(
        p({ adv_1vp: 10, adv_points: 38 }), lvl(65, REQ.c5a10, 'expert'), 5, expert,
      )).toBe(true);
    });
    it('only 9 cheap advances fails', () => {
      expect(meetsAstRequirements(
        p({ adv_1vp: 9, adv_points: 50 }), lvl(65, REQ.c5a10, 'expert'), 5, expert,
      )).toBe(false);
    });
    it('10 cheap advances but only 37 VP fails', () => {
      expect(meetsAstRequirements(
        p({ adv_1vp: 10, adv_points: 37 }), lvl(65, REQ.c5a10, 'expert'), 5, expert,
      )).toBe(false);
    });
    it('medium/expensive advances do not satisfy the cheap-advance count', () => {
      // adv_3vp and adv_6vp are not <100 advances; adv_1vp must meet the count
      expect(meetsAstRequirements(
        p({ adv_1vp: 0, adv_3vp: 10, adv_6vp: 10, adv_points: 100 }), lvl(65, REQ.c5a10, 'expert'), 5, expert,
      )).toBe(false);
    });
  });

  // ── All 17 advances <100 each + VP floor (expert LIA) ────────────────────
  describe('all 17 advances + VP floor — expert LIA', () => {
    const expert = true;
    // level 70 and 75: 6 cities + all 17 advances (<100 each) + 56 VP
    it('exactly 17 cheap advances and 56 VP passes', () => {
      expect(meetsAstRequirements(
        p({ adv_1vp: 17, adv_points: 56 }), lvl(70, REQ.c6a17, 'expert'), 6, expert,
      )).toBe(true);
    });
    it('16 cheap advances fails even with high VP', () => {
      expect(meetsAstRequirements(
        p({ adv_1vp: 16, adv_points: 100 }), lvl(70, REQ.c6a17, 'expert'), 6, expert,
      )).toBe(false);
    });
    it('17 cheap advances but only 55 VP fails', () => {
      expect(meetsAstRequirements(
        p({ adv_1vp: 17, adv_points: 55 }), lvl(70, REQ.c6a17, 'expert'), 6, expert,
      )).toBe(false);
    });
    it('applies at level 75 too', () => {
      expect(meetsAstRequirements(
        p({ adv_1vp: 17, adv_points: 56 }), lvl(75, REQ.c6a17, 'expert'), 6, expert,
      )).toBe(true);
    });
    it('city check still applies', () => {
      expect(meetsAstRequirements(
        p({ adv_1vp: 17, adv_points: 56 }), lvl(70, REQ.c6a17, 'expert'), 5, expert,
      )).toBe(false);
    });
  });

});

// ─── Player-page coloured all-ages requirement list ────────────────────────────

describe('renderAgeRequirementsList — green/red per-age requirement colouring', () => {
  // Mirrors the Maurya example: 10 cheap + 2 mid advances (12 total), 16 adv VP.
  const player = { adv_1vp: 10, adv_3vp: 2, adv_6vp: 0, adv_points: 16, wonder: 0 };

  it('colours cities against the current effective city count (dynamic)', () => {
    const html = renderAgeRequirementsList(player, 5, true);
    // 3/4/5 cities met (green), 6 cities not (red)
    expect(html).toContain('req-part-ok">3 Cities');
    expect(html).toContain('req-part-ok">4 Cities');
    expect(html).toContain('req-part-ok">5 Cities');
    expect(html).toContain('req-part-fail">6 Cities');
  });

  it('colours advancement conditions by held cards', () => {
    const html = renderAgeRequirementsList(player, 5, true);
    expect(html).toContain('req-part-ok">5 VP in Advances');   // 16 ≥ 5
    expect(html).toContain('req-part-ok">12 Advances');        // any tier = 12 ≥ 12
    expect(html).toContain('req-part-ok">10 Adv ≤100');        // cheap = 10 ≥ 10
    expect(html).toContain('req-part-fail">38 VP');            // 16 < 38
    expect(html).toContain('req-part-fail">17 Adv ≤100');      // cheap 10 < 17
  });

  it('leaves city conditions neutral when no city count is submitted', () => {
    const html = renderAgeRequirementsList(player, null, true);
    expect(html).toContain('req-part-unknown">3 Cities');
    // advancement conditions are still evaluated (independent of city count)
    expect(html).toContain('req-part-ok">12 Advances');
  });

  it('counts the Wonder of the World as +1 effective city', () => {
    const withWonder = { ...player, wonder: 1 };
    const html = renderAgeRequirementsList(withWonder, 5, true);
    expect(html).toContain('req-part-ok">6 Cities'); // 5 + wonder = 6 ≥ 6
  });

  it('Stone Age shows "No requirements" and is never red', () => {
    const html = renderAgeRequirementsList(player, 0, true);
    expect(html).toContain('req-part-none">No requirements');
    expect(html).not.toContain('req-part-fail">Stone');
  });

  it('basic mode uses the basic requirement thresholds', () => {
    // Basic LBA needs 3 mid-tier (≥100) advances; player has 2 mid (adv_3vp).
    const html = renderAgeRequirementsList(player, 3, false);
    expect(html).toContain('req-part-ok">3 Cities');
    expect(html).toContain('req-part-fail">3 Adv ≥100'); // mid tier = adv_3vp+adv_6vp = 2 < 3
  });
});
