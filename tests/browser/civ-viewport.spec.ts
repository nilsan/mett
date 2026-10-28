/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect } from './fixtures';

/** Every player-page tab is checked: each shows different content. */
const TABS = ['round', 'cards', 'ast', 'calamities'] as const;

// Player-page scroll policy: the page may scroll VERTICALLY on a phone (it
// carries the full census/cities/VP/AST controls plus the requirements legend),
// but it must NEVER scroll HORIZONTALLY at any width or OS font scale. These
// tests assert horizontal overflow is 0 across the supported fleet
// (minimum 390×844 — SE/6–8-class 375×667 is no longer supported) and at 1.3×
// and 2.0× font scaling.
test.describe('civ page: never scrolls horizontally', () => {
  const viewports = [
    { w: 390, h: 844, label: 'iPhone 13/14 (minimum)' },
    { w: 412, h: 915, label: 'Pixel 6/7/8' },
    { w: 440, h: 956, label: 'iPhone 16 Pro Max' },
    { w: 1366, h: 768, label: 'short laptop' },
  ];

  for (const vp of viewports) {
    test(`${vp.w}×${vp.h} (${vp.label}): no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/minoa');
      await expect(page.locator('.civ-page')).toBeVisible();

      for (const tab of TABS) {
        await page.locator(`#tab-btn-${tab}`).click();
        const h = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(h, `horizontal overflow on the ${tab} tab`).toBeLessThanOrEqual(0);
      }
    });
  }
});

// OS font scaling (Pixel/iPhone accessibility text size) raises the browser's
// default font size. The page is allowed to grow taller and scroll vertically;
// horizontal scroll is never acceptable. Emulated via CDP — default 16px,
// Pixel "Large" ≈ 1.3× = 21px, maximum ≈ 2.0× = 32px.
test.describe('civ page with OS font scaling: no horizontal overflow', () => {
  for (const [scale, std] of [[1.3, 21], [2.0, 32]] as const) {
    test(`412×915 at ${scale}× font scale: never scrolls horizontally`, async ({ page, request }) => {
      await request.post('/api/game/cities/clear'); // buying: Buy buttons on the Cards tab
      // Written Record bought this round: its colour chooser is open in the
      // list, and must not widen the rows.
      const state = await (await request.get('/api/state')).json();
      const minoa = state.players.find((p: { civ_slug: string }) => p.civ_slug === 'minoa');
      const held = (state.advances[minoa.id] ?? []).map((h: { id: string }) => h.id);
      await request.post(`/api/players/${minoa.id}/advances`, { data: { ids: [...new Set([...held, 'written-record'])] } });
      await page.setViewportSize({ width: 412, height: 915 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Page.enable');
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: std, fixed: Math.round(std * 0.8) } });
      await page.goto('/minoa');
      await expect(page.locator('.civ-page')).toBeVisible();

      for (const tab of TABS) {
        await page.locator(`#tab-btn-${tab}`).click();
        const h = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(h, `horizontal overflow on the ${tab} tab at ${scale}× font scale`).toBeLessThanOrEqual(0);
      }
      // The page hides sideways overflow, so also check that every tab, card
      // sort button and Buy button is fully on screen (those rows wrap instead).
      await page.locator('#tab-btn-cards').click();
      await expect(page.locator('.adv-buy').first()).toBeVisible();
      const offscreen = await page.locator('.civ-tab, .adv-sort-btn, .adv-buy').evaluateAll(els =>
        els.filter(e => e.getBoundingClientRect().right > window.innerWidth + 0.5).map(e => e.textContent));
      expect(offscreen, `buttons off-screen at ${scale}× font scale`).toEqual([]);
    });
  }
});
