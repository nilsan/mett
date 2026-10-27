/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect } from './fixtures';

// The A.S.T. progress strip must fill the full width (no wasted space on the
// right) and keep every age band the same height — even when a 1-cell age like
// Early Iron Age wraps to multiple lines. Iberia is a slow-start civ (long Stone
// Age, narrow Early Bronze) — the case that used to clip labels.
test.describe('civ page: A.S.T. strip layout', () => {
  test('age bands fill the width and are equal height', async ({ page }) => {
    await page.goto('/iberia#ast');
    await expect(page.locator('.ast-progress-grid')).toBeVisible();

    // Grid stretches to its container — not a fixed max-content block.
    const { gridW, wrapW } = await page.evaluate(() => {
      const g = document.querySelector('.ast-progress-grid')!.getBoundingClientRect();
      const w = document.querySelector('.ast-bar-wrap')!.getBoundingClientRect();
      return { gridW: g.width, wrapW: w.width };
    });
    expect(gridW).toBeGreaterThan(wrapW * 0.95);

    // Every age-band box is the same height (wrapped Iron age no longer pokes up).
    const heights = await page.locator('.ast-age-label').evaluateAll(els =>
      els.map(e => Math.round(e.getBoundingClientRect().height)));
    expect(heights.length).toBeGreaterThan(3);
    expect(new Set(heights).size).toBe(1);
  });
});
