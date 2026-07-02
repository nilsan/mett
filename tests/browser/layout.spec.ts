/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect } from './fixtures';

// The status display must fit a full 18-empire game without vertical scrolling
// on the TV targets. The auto-seed fixture guarantees exactly 18 players, so the
// "all 18 fit" claim is enforced — not coincidentally true for a smaller game.
test.describe('main display layout', () => {
  test('1920×1080: all 18 empires fit with 0 px overflow, version stamp visible', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // Web-first assertion auto-waits for render; also pins the precondition
    // that this is genuinely an 18-player layout.
    await expect(page.locator('.ast-order-section tbody tr')).toHaveCount(18);

    const { vh, sh } = await page.evaluate(() => ({
      vh: window.innerHeight,
      sh: document.documentElement.scrollHeight,
    }));
    expect(sh - vh, 'page must fit in 1080p without overflow').toBeLessThanOrEqual(0);

    await expect(page.locator('.mett-version')).toBeVisible();
  });

  test('3840×2160 (4K): all 18 empires fit, no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('/');

    await expect(page.locator('.ast-order-section tbody tr')).toHaveCount(18);

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // The AST age-band legend must stay within the viewport. Because the status
    // grid uses overflow:hidden, content pushed past the fold is clipped WITHOUT
    // growing scrollHeight — so the overflow check above can't see it. Taller 4K
    // rows once shoved the legend off-screen; guard against that regressing.
    const legendClipped = await page.evaluate(() => {
      const el = document.querySelector('.ast-section .ab-legend');
      if (!el) return true;
      return el.getBoundingClientRect().bottom > window.innerHeight + 1;
    });
    expect(legendClipped, 'AST legend must not be clipped below the viewport').toBe(false);
  });
});
