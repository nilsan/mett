/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import type { APIRequestContext } from '@playwright/test';
import { test, expect, adminLogin } from './fixtures';

// The status display must fit a full 18-empire game without vertical scrolling
// on the TV targets. The auto-seed fixture guarantees exactly 18 players, so the
// "all 18 fit" claim is enforced — not coincidentally true for a smaller game.
//
// 3072×1600 is a 4K screen at 125 % OS scaling minus browser chrome: wide
// enough for the 4K column widths but much shorter than native 4K, which once
// clipped the bottom ~100 px of every panel.
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3072, height: 1600 },
  { width: 3440, height: 1440 },
  { width: 3840, height: 2160 },
  { width: 5120, height: 2160 },
];

/** Worst case for the trade table: census revealed and every empire at 9
 *  cities, so every trade row carries the maximum 9 chips. */
async function fillTradeChips(request: APIRequestContext): Promise<void> {
  await adminLogin(request);
  expect((await request.post('/api/debug/census')).ok()).toBe(true);
  const state = await (await request.get('/api/state')).json();
  for (const p of state.players) {
    const res = await request.post(`/api/players/${p.id}/city-count`, { data: { city_count: 9 } });
    expect(res.ok()).toBe(true);
  }
}

test.describe('main display layout', () => {
  for (const vp of VIEWPORTS) {
    for (const chips of [false, true]) {
    test(`${vp.width}×${vp.height}${chips ? ' with 9 trade cards each' : ''}: all 18 empires fit, nothing clipped`, async ({ page, request }) => {
      if (chips) await fillTradeChips(request);
      await page.setViewportSize(vp);
      await page.goto('/');

      // Web-first assertion auto-waits for render; also pins the precondition
      // that this is genuinely an 18-player layout.
      await expect(page.locator('.ast-order-section tbody tr')).toHaveCount(18);
      if (chips) await expect(page.locator('.trade-chip')).toHaveCount(18 * 9);
      await page.evaluate(() => document.fonts.ready);

      const { overflow, clipped, rowHeights } = await page.evaluate(() => ({
        overflow: document.documentElement.scrollHeight - window.innerHeight,
        // The status grid uses overflow:hidden, so content pushed past the fold
        // is clipped WITHOUT growing scrollHeight — the overflow check can't see
        // it. Every panel (and so the AST legend at the bottom of the timeline)
        // must end inside the viewport.
        clipped: Array.from(document.querySelectorAll('.table-section'))
          .filter(el => el.getBoundingClientRect().bottom > window.innerHeight + 1)
          .map(el => el.querySelector('h3')?.textContent?.trim()),
        // Rows line up across tables only if every table's rows are the same
        // height (trade chips once made the trade rows taller).
        rowHeights: Array.from(new Set(
          ['.census-table', '.trade-table', '.ast-order-table', '.lb-table'].map(sel =>
            Math.round(document.querySelector(`${sel} tbody tr`)!.getBoundingClientRect().height)),
        )),
      }));
      expect(overflow, 'page must not scroll').toBeLessThanOrEqual(0);
      expect(clipped, 'panels clipped below the viewport').toEqual([]);
      expect(rowHeights, 'row height must match across tables').toHaveLength(1);

      await expect(page.locator('.mett-version')).toBeVisible();
    });
    }
  }

  // Smaller games fill the board: rows grow by 18 / players (up to 3×) and
  // text a little, without clipping names or numbers or breaking alignment.
  for (const players of [6, 12]) {
    for (const vp of [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
      test(`${players} players at ${vp.width}×${vp.height}: rows fill the board, nothing clipped`, async ({ page, request }) => {
        expect((await request.post('/api/debug/simulate', { data: { expert: 1, player_count: players, rounds: 6 } })).ok()).toBe(true);
        await fillTradeChips(request);
        await page.setViewportSize(vp);
        await page.goto('/');
        await expect(page.locator('.census-table tbody tr')).toHaveCount(players);

        const r = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('.census-table tbody tr'));
          return {
            filled: rows[rows.length - 1]!.getBoundingClientRect().bottom / window.innerHeight,
            clippedPanels: Array.from(document.querySelectorAll('.table-section'))
              .filter(el => el.getBoundingClientRect().bottom > window.innerHeight + 1).length,
            rowHeights: Array.from(new Set(
              ['.census-table', '.trade-table', '.ast-order-table', '.lb-table'].map(sel =>
                Math.round(document.querySelector(`${sel} tbody tr`)!.getBoundingClientRect().height)),
            )),
            // Text cut off inside a cell: names, player names and every number.
            cutText: Array.from(document.querySelectorAll('.status-grid .empire-civ, .status-grid .empire-player-name, .status-grid td:not(.empire-cell):not(.trade-region)'))
              .filter(el => el.scrollWidth > el.clientWidth + 1)
              .map(el => el.textContent?.trim()),
          };
        });
        expect(r.filled, 'rows should use most of the screen height').toBeGreaterThan(0.7);
        expect(r.clippedPanels).toBe(0);
        expect(r.rowHeights).toHaveLength(1);
        expect(r.cutText).toEqual([]);
      });
    }
  }

  // Phones are supported too: the status page stacks and scrolls table by
  // table, and the admin page must stay usable — but neither may ever scroll
  // horizontally.
  for (const path of ['/', '/admin']) {
    test(`phone 412×915: ${path} never scrolls horizontally`, async ({ page }) => {
      await page.setViewportSize({ width: 412, height: 915 });
      if (path === '/admin') await adminLogin(page.context().request);
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator('.mett-version')).toBeVisible();
      const hOverflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(hOverflow).toBeLessThanOrEqual(0);
    });
  }
});
