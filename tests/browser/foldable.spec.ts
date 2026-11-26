/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect, adminLogin } from './fixtures';

// A foldable's inner screen (Galaxy Z Fold 8, 4:3, 2448×1848 px) sits between
// a phone and the 1080p TV board, used either way round: 857×647 CSS px in
// Firefox (dpr 2.86; 971×734 at a smaller density), less the browser's bars. The status board scrolls
// there in two columns instead of clipping its five; the player page keeps its
// desktop layout with readable text and finger-sized controls; the GM's
// Players table fits without sideways scrolling.
const INNER = [
  // Measured on the user's Fold 8 in Firefox (dpr 2.86): whole screen, and
  // with the browser's bars.
  { width: 857, height: 647 },
  { width: 857, height: 500 },
  { width: 647, height: 857 },
  { width: 647, height: 711 },
  { width: 971, height: 734 },
  { width: 971, height: 650 },
  { width: 734, height: 971 },
  { width: 734, height: 880 },
];

/** Smallest computed font size of the visible elements matching `sel`. */
async function smallest(page: import('@playwright/test').Page, sel: string): Promise<number> {
  return page.locator(sel).evaluateAll(es => Math.min(...es
    .filter(e => (e as HTMLElement).offsetParent)
    .map(e => parseFloat(getComputedStyle(e).fontSize))));
}

for (const viewport of INNER) {
  test.describe(`foldable inner screen ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('status board: nothing clipped, two columns, the A.S.T. board across both', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('.status-grid')).toBeVisible();
      const m = await page.evaluate(() => {
        const sections = Array.from(document.querySelectorAll<HTMLElement>('.status-grid > .table-section'));
        const lefts = new Set(sections.filter(s => !s.classList.contains('ast-section'))
          .map(s => Math.round(s.getBoundingClientRect().left)));
        const grid = document.querySelector('.status-grid')!.getBoundingClientRect();
        const board = document.querySelector('.ast-section')!.getBoundingClientRect();
        return {
          sideways: document.documentElement.scrollWidth - innerWidth,
          clipped: sections.filter(s => s.scrollWidth > s.clientWidth + 1).length,
          columns: lefts.size,
          boardSpans: Math.abs(board.width - grid.width) < 2,
        };
      });
      expect(m).toEqual({ sideways: 0, clipped: 0, columns: 2, boardSpans: true });
    });

    if (viewport.height > viewport.width) {
      test('status board upright: Trade Cards beside A.S.T. Progress Order, chips inside the card', async ({ page }) => {
        // Worst case: census revealed and every empire at 9 cities.
        await adminLogin(page.request);
        expect((await page.request.post('/api/debug/census', { data: {} })).ok()).toBe(true);
        const state = await (await page.request.get('/api/state')).json();
        for (const p of state.players)
          expect((await page.request.post(`/api/players/${p.id}/city-count`, { data: { city_count: 9 } })).ok()).toBe(true);
        await page.goto('/');
        await expect(page.locator('.trade-table')).toBeVisible();
        const m = await page.evaluate(() => {
          const trade = document.querySelector('.trade-table')!.closest('section')!.getBoundingClientRect();
          const order = document.querySelector('.ast-order-section')!.getBoundingClientRect();
          return {
            sameRow: Math.abs(trade.top - order.top) < 1,
            orderRight: order.left > trade.right,
            chipsOut: Array.from(document.querySelectorAll('.trade-chips'))
              .filter(c => c.getBoundingClientRect().right > trade.right + 0.5).length,
            chips: document.querySelectorAll('.trade-chip').length > 0,
          };
        });
        expect(m).toEqual({ sameRow: true, orderRight: true, chipsOut: 0, chips: true });
      });
    }

    // Below 700px (the Fold 8 held upright at its default density) the admin
    // page is the phone one, whose Players table scrolls in its card.
    if (viewport.width > 700) test('admin: every control on screen, no sideways scrolling in the Players table', async ({ page }) => {
      await adminLogin(page.request);
      await page.goto('/admin');
      await expect(page.locator('.admin-table:not(.backup-table)')).toBeVisible();
      const m = await page.evaluate(() => ({
        sideways: document.documentElement.scrollWidth - innerWidth,
        tableScroll: Array.from(document.querySelectorAll('.table-scroll')).filter(e => e.scrollWidth > e.clientWidth + 1).length,
        offscreen: Array.from(document.querySelectorAll('button, input, select'))
          .filter(e => (e as HTMLElement).offsetParent && e.getBoundingClientRect().right > innerWidth + 0.5).length,
      }));
      expect(m).toEqual({ sideways: 0, tableScroll: 0, offscreen: 0 });
    });

    test('player page: readable text and finger-sized controls', async ({ page }) => {
      await page.goto('/minoa');
      for (const [sel, min] of [
        ['.phase-hint', 14],
        ['.move-order', 14],
        ['.census-submitted, .census-pending', 14],
      ] as const) expect(await smallest(page, sel), sel).toBeGreaterThanOrEqual(min);
      const small = await page.locator('.adv-btn, .btn-submit, .census-input').evaluateAll(es => es
        .filter(e => (e as HTMLElement).offsetParent)
        .map(e => e.getBoundingClientRect())
        .filter(r => r.height < 44 || r.width < 44).map(r => `${Math.round(r.width)}x${Math.round(r.height)}`));
      expect(small, "controls under 44px").toEqual([]);
      const out = await page.evaluate(() => ({
        offscreen: Array.from(document.querySelectorAll('button, input, select'))
          .filter(e => (e as HTMLElement).offsetParent && e.getBoundingClientRect().right > innerWidth + 0.5).length,
        clipped: Array.from(document.querySelectorAll('.civ-section'))
          .filter(e => (e as HTMLElement).offsetParent && e.scrollWidth > e.clientWidth + 1).length,
      }));
      expect(out, 'Round tab fits across').toEqual({ offscreen: 0, clipped: 0 });
      await page.locator('#tab-btn-ast').click();
      for (const [sel, min] of [
        ['.ast-node', 12],
        ['.ast-age-label', 9.5],
        ['.ast-req-legend li', 14],
      ] as const) expect(await smallest(page, sel), sel).toBeGreaterThanOrEqual(min);
    });
  });
}
