/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect, adminLogin } from './fixtures';

// Lines on the player page that must stay on one line on a phone, whatever
// the OS font size. Also runs with the wide DejaVu Sans font (the CI runners'
// default), where text needs the most room.

test.describe('civ page: one-line rows on a phone', () => {
  test('Cards: the A.S.T. requirement line stays on one line, also at the longest and with large fonts', async ({ page, request }) => {
    const id = await (async () => { await page.goto('/minoa#cards'); return page.locator('#civ-content').getAttribute('data-player-id'); })();
    // From 55 the next age is Early Iron Age: the longest requirement (cards under 100 and VP).
    await adminLogin(request);
    await request.post(`/api/players/${id}/ast`, { data: { level: 55 } });
    for (const [width, std] of [[390, 16], [412, 21], [412, 32]] as const) {
      await page.setViewportSize({ width, height: 900 });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Page.enable');
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: std, fixed: Math.round(std * 0.8) } });
      await page.goto('/minoa#cards');
      const line = page.locator('.adv-next-age');
      await expect(line).toContainText('A.S.T. Req. Early Iron Age:');
      const fits = await line.evaluate(el => {
        const tops = new Set(Array.from(el.children).map(c => Math.round(c.getBoundingClientRect().top)));
        return tops.size === 1 && el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= innerWidth;
      });
      expect(fits, `one line at ${width}px, ${std}px font`).toBe(true);
    }
  });

});
