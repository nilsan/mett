/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect } from './fixtures';

// The player page must fit without scrolling across the supported modern-phone
// fleet (minimum 390×844 — iPhone SE / 6–8-class 375×667 is no longer supported)
// and short laptops (1366×768 was 55px over) — covered by the height-scoped
// compaction blocks at the end of style.css.
test.describe('civ page viewport fit', () => {
  const viewports = [
    { w: 390, h: 844, label: 'iPhone 13/14 (minimum)' },
    { w: 412, h: 915, label: 'Pixel 6/7/8' },
    { w: 440, h: 956, label: 'iPhone 16 Pro Max' },
    { w: 1366, h: 768, label: 'short laptop' },
  ];

  for (const vp of viewports) {
    test(`${vp.w}×${vp.h} (${vp.label}): no overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto('/minoa');
      await expect(page.locator('.civ-page')).toBeVisible();

      const { v, h } = await page.evaluate(() => ({
        v: document.documentElement.scrollHeight - window.innerHeight,
        h: document.documentElement.scrollWidth - window.innerWidth,
      }));
      expect(v, 'vertical overflow').toBeLessThanOrEqual(0);
      expect(h, 'horizontal overflow').toBeLessThanOrEqual(0);
    });
  }
});

// OS font scaling (Pixel/iPhone accessibility text size) raises the browser's
// default font size; Pico's percentage-based :root font-size and the em-based
// compaction media queries both scale with it. Emulated via CDP — default is
// 16px, Pixel "Large" ≈ 1.3× = 21px, maximum ≈ 2.0× = 32px.
test.describe('civ page with OS font scaling', () => {
  test('Pixel 8 (412×915) at 1.3× font scale: fits with no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 412, height: 915 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 21, fixed: 17 } });
    await page.goto('/minoa');
    await expect(page.locator('.civ-page')).toBeVisible();

    const { v, h } = await page.evaluate(() => ({
      v: document.documentElement.scrollHeight - window.innerHeight,
      h: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(v, 'vertical overflow at 1.3× font scale').toBeLessThanOrEqual(0);
    expect(h, 'horizontal overflow at 1.3× font scale').toBeLessThanOrEqual(0);
  });

  test('390×844 at 2.0× font scale: may scroll vertically but never horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Page.enable');
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
    await page.goto('/minoa');
    await expect(page.locator('.civ-page')).toBeVisible();

    const h = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(h, 'horizontal overflow at 2.0× font scale').toBeLessThanOrEqual(0);
  });
});
