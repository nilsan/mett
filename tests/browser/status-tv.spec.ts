/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect } from './fixtures';

// TV conveniences on the status page: a screen wake lock (so the display
// computer doesn't sleep mid-game) and a full-screen toggle. Headless Chromium
// can't grant either for real, so both browser APIs are replaced with
// recorders before the page loads.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { __tv: string[] }).__tv = calls;
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async (type: string) => { calls.push(`wake:${type}`); return { released: false }; } },
    });
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
    let fsEl: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fsEl });
    Element.prototype.requestFullscreen = async function () { calls.push('fs:enter'); fsEl = this; };
    document.exitFullscreen = async () => { calls.push('fs:exit'); fsEl = null; };
  });
});

const calls = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __tv: string[] }).__tv);

test('status page asks for a screen wake lock on load', async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => calls(page)).toContain('wake:screen');
});

test('full-screen toggle enters and leaves full screen, also after a live update', async ({ page, request }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  const toggle = page.locator('#fullscreen-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect.poll(() => calls(page)).toContain('fs:enter');

  // A state change re-renders #main-content (and the button) via htmx; the
  // delegated handler must still work on the new button.
  const swapped = page.waitForResponse(r => r.url().endsWith('/') && r.request().method() === 'GET');
  await request.post('/api/census/reveal');
  await swapped;
  await page.locator('#fullscreen-toggle').click();
  await expect.poll(() => calls(page)).toContain('fs:exit');
});
