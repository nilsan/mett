/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect, gotoCiv, nextStateFrame } from './fixtures';

// Regression test for the client-side rendering of the civ page: when a WS
// state_update arrives while the user is editing an input, the input must keep
// its typed value AND its focus, and #civ-content must NOT be swapped out.
// Previously HTMX replaced the whole #civ-content div, destroying focus.
//
// The trigger must target THIS player: /military broadcasts state targeted to
// the toggled player (broadcastState(playerId)), and the WS layer skips civ
// sockets owned by *other* players — so toggling someone else would never push
// a frame here and the re-render under test would never happen.

test.describe('civ page: live update preserves user input', () => {
  test('focused adv input keeps value and focus when state updates', async ({ page, request }) => {
    const ws = await gotoCiv(page, 'minoa');

    // Sanity-check: civ.js is wired and #civ-content carries no HTMX trigger
    // (otherwise the whole div would swap on update).
    const hxAttrs = await page.locator('#civ-content').evaluate(el => ({
      hxGet: el.getAttribute('hx-get'),
      hxTrigger: el.getAttribute('hx-trigger'),
    }));
    expect(hxAttrs.hxGet, 'hx-get should be removed').toBeNull();
    expect(hxAttrs.hxTrigger, 'hx-trigger should be removed').toBeNull();

    const myId = await page.locator('#civ-content').evaluate(el => el.dataset.playerId);
    expect(myId).toBeTruthy();

    // Focus the 3 VP input and type a value, but do NOT blur.
    const adv3 = page.locator('#adv-3vp');
    await adv3.focus();
    await adv3.fill('');
    await adv3.pressSequentially('7', { delay: 30 });

    // Trigger a state_update this socket will actually receive: toggle our own
    // military (a public endpoint, no admin cookie needed). Wait for the frame
    // so we know renderFromState has run — no arbitrary sleeps.
    const frame = nextStateFrame(ws);
    const r = await request.post(`/api/players/${myId}/military`);
    expect(r.ok()).toBe(true);
    await frame;

    // Our typed value must survive the re-render, and we must still have focus.
    await expect(adv3).toHaveValue('7');
    await expect
      .poll(() => adv3.evaluate(el => el === document.activeElement),
        { message: 'adv-3vp must still be focused after the WS update' })
      .toBe(true);
  });

  test('mil toggle updates in place without swapping #civ-content', async ({ page, request }) => {
    const ws = await gotoCiv(page, 'minoa');

    // Tag the node so we can prove it's the SAME DOM element after the update.
    await page.locator('#civ-content').evaluate(el =>
      el.setAttribute('data-test-tag', 'pre-swap-check'),
    );

    const myId = await page.locator('#civ-content').evaluate(el => el.dataset.playerId);

    const frame = nextStateFrame(ws);
    await request.post(`/api/players/${myId}/military`);
    await frame;

    // Same node (tag survived) ⇒ no swap happened.
    await expect(page.locator('#civ-content')).toHaveAttribute('data-test-tag', 'pre-swap-check');
    // The mil button reflects the toggled state.
    await expect(page.locator('#mil-toggle')).toHaveClass(/mil-(on|off)/);
  });
});
