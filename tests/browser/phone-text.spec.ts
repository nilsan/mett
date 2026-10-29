/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect } from './fixtures';

// A tester found the smallest text unreadable on a phone: the status board's
// A.S.T. numbers, legend and player names (sized for TVs by screen height,
// 7–9px on a phone) and the player page's explanations and A.S.T. track (shrunk
// to fit one screen before the page had tabs). Each place has a floor in CSS px
// at the default font size.

/** Smallest computed font size of the visible elements matching `sel`. */
async function smallest(page: import('@playwright/test').Page, sel: string): Promise<number> {
  return page.locator(sel).evaluateAll(es => Math.min(...es
    .filter(e => (e as HTMLElement).offsetParent)
    .map(e => parseFloat(getComputedStyle(e).fontSize))));
}

test.describe('phone: readable text', () => {
  test.use({ viewport: { width: 412, height: 915 } });

  test('status board', async ({ page }) => {
    await page.goto('/');
    for (const [sel, min] of [
      ['.status-ast .ab-level-num', 12],
      ['.status-ast .ab-round-num', 12],
      ['.status-ast .ab-name', 13],
      ['.status-ast .ab-magnet', 11],
      ['.status-grid .ab-legend li', 13],
      ['.status-grid .empire-player-name', 12],
    ] as const) expect(await smallest(page, sel), sel).toBeGreaterThanOrEqual(min);
  });

  test('player page: Round and A.S.T.', async ({ page }) => {
    await page.goto('/minoa');
    for (const [sel, min] of [
      ['.phase-hint', 14],
      ['.move-order', 14],
      ['.mov-hint', 14],
      ['.census-submitted, .census-pending', 14],
    ] as const) expect(await smallest(page, sel), sel).toBeGreaterThanOrEqual(min);
    await page.locator('#tab-btn-ast').click();
    for (const [sel, min] of [
      ['.ast-node', 12],
      ['.ast-age-label', 9.5],
      ['.ast-req-legend li', 14],
      ['.ast-level-label', 14],
    ] as const) expect(await smallest(page, sel), sel).toBeGreaterThanOrEqual(min);
  });
});
