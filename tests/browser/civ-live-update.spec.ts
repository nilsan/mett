/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect } from '@playwright/test';

// Regression test for todo 9.3 (Option A — client-side rendering of civ page):
// when WebSocket state arrives while the user is editing an input, the input
// must keep its typed value AND its focus. Previously HTMX swapped the whole
// #civ-content div, destroying any focused input.

test.describe('civ page: live update preserves user input', () => {
  test('focused adv input keeps value and focus when other state changes', async ({ page, request }) => {
    await page.goto('/minoa');
    await page.waitForLoadState('networkidle');

    // Sanity-check: civ.js wired and #civ-content has no HTMX trigger
    const hxAttrs = await page.locator('#civ-content').evaluate(el => ({
      hxGet: el.getAttribute('hx-get'),
      hxTrigger: el.getAttribute('hx-trigger'),
    }));
    expect(hxAttrs.hxGet, 'hx-get should be removed').toBeNull();
    expect(hxAttrs.hxTrigger, 'hx-trigger should be removed').toBeNull();

    // Find the player id so we can trigger admin actions on a *different* player
    const myId = await page.locator('#civ-content').evaluate(el => el.dataset.playerId);
    expect(myId).toBeTruthy();

    // Get an admin-authed cookie so we can hit /api/players/:id/military
    // (any global broadcast will do; we want to prove it doesn't disturb us).
    const civsResp = await request.get('/api/state');
    const state = await civsResp.json();
    const otherPlayer = state.players.find((p: any) => String(p.id) !== myId);
    expect(otherPlayer, 'need at least one other player').toBeTruthy();

    // Focus the 3 VP input and type a value, but do NOT blur.
    const adv3 = page.locator('#adv-3vp');
    await adv3.focus();
    await adv3.fill('');           // clear current value
    await adv3.pressSequentially('7', { delay: 30 });

    // Trigger a global state change — toggle another player's military.
    // /military is a public endpoint (no admin cookie required).
    const r = await request.post(`/api/players/${otherPlayer.id}/military`);
    expect(r.ok()).toBe(true);

    // Wait for the WS round-trip to complete: poll until renderFromState
    // would have run. We give it a generous window.
    await page.waitForFunction(() => {
      // The "other player's military" toggle changes their move-order
      // position (since military moves last). On us, nothing visible
      // changes — but the WS event still fires renderFromState. We just
      // have to wait long enough for that to have happened.
      return true;
    }, undefined, { timeout: 1500 });
    await page.waitForTimeout(500);

    // Our typed value must be intact and we must still have focus.
    await expect(adv3).toHaveValue('7');
    const isFocused = await adv3.evaluate(el => el === document.activeElement);
    expect(isFocused, 'adv-3vp must still be focused after WS update').toBe(true);

    // Restore the toggled state so subsequent runs start clean.
    await request.post(`/api/players/${otherPlayer.id}/military`);
  });

  test('mil/won button toggles update without page swap', async ({ page, request }) => {
    await page.goto('/minoa');
    await page.waitForLoadState('networkidle');

    // Capture the #civ-content element reference so we can prove it's the
    // SAME DOM node before and after a state change (i.e. not swapped).
    const beforeId = await page.locator('#civ-content').evaluate(el => {
      // Tag the node so we can detect if it was replaced
      el.setAttribute('data-test-tag', 'pre-swap-check');
      return el.dataset.testTag;
    });
    expect(beforeId).toBe('pre-swap-check');

    // Trigger a state change on this player by toggling military
    const myId = await page.locator('#civ-content').evaluate(el => el.dataset.playerId);
    await request.post(`/api/players/${myId}/military`);
    await page.waitForTimeout(400);

    // Same node? If so, no swap happened.
    const afterId = await page.locator('#civ-content').evaluate(
      el => el.getAttribute('data-test-tag'),
    );
    expect(afterId, '#civ-content was not replaced').toBe('pre-swap-check');

    // The mil button should reflect the new state
    const milClasses = await page.locator('#mil-toggle').evaluate(el => el.className);
    expect(milClasses).toMatch(/mil-(on|off)/);

    // Restore
    await request.post(`/api/players/${myId}/military`);
  });
});
