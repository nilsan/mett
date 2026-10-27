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
// The trigger must target THIS player: /advances broadcasts state targeted to
// that player (broadcastState(playerId)), and the WS layer skips civ sockets
// owned by *other* players — so changing someone else's cards would never push
// a frame here and the re-render under test would never happen.

test.describe('civ page: live update preserves user input', () => {
  test('focused census input keeps value and focus when state updates', async ({ page, request }) => {
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

    // Focus the census input and type a value, but do NOT blur or submit.
    const pop = page.locator('#pop-input');
    await pop.focus();
    await pop.fill('');
    await pop.pressSequentially('37', { delay: 30 });

    // Trigger a state_update this socket will actually receive: set our own
    // cards (a public endpoint). Wait for the frame so we know renderFromState
    // has run — no arbitrary sleeps.
    const frame = nextStateFrame(ws);
    const r = await request.post(`/api/players/${myId}/advances`, { data: { ids: [] } });
    expect(r.ok()).toBe(true);
    await frame;

    await expect(pop).toHaveValue('37');
    await expect
      .poll(() => pop.evaluate(el => el === document.activeElement),
        { message: 'pop-input must still be focused after the WS update' })
      .toBe(true);
  });

  test('a card change updates in place: no #civ-content swap, the open tab stays open', async ({ page, request }) => {
    const ws = await gotoCiv(page, 'minoa');
    await page.locator('#tab-btn-cards').click();

    // Tag the node so we can prove it's the SAME DOM element after the update.
    await page.locator('#civ-content').evaluate(el =>
      el.setAttribute('data-test-tag', 'pre-swap-check'),
    );

    const myId = await page.locator('#civ-content').evaluate(el => el.dataset.playerId);

    const frame = nextStateFrame(ws);
    await request.post(`/api/players/${myId}/advances`, { data: { ids: [] } });
    await frame;

    // Same node (tag survived) ⇒ no swap happened.
    await expect(page.locator('#civ-content')).toHaveAttribute('data-test-tag', 'pre-swap-check');
    await expect(page.locator('#tab-btn-cards')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-cards')).toBeVisible();
    await expect(page.locator('#civ-summary')).toBeVisible();
  });
});

// Regression: the "Round N Census" heading is rendered once by the server and
// must be patched on every state_update — otherwise it stays on the previous
// round until a manual reload (reported live on mett.games 2026-06-06).
test.describe('civ page: round number stays in sync without reload', () => {
  test('census round heading updates when the round changes', async ({ page, request }) => {
    const ws = await gotoCiv(page, 'minoa');

    const heading = page.locator('#census-round');
    const before = Number(await heading.textContent());
    const target = (before || 1) + 2; // an explicitly different round

    // /debug/set-round changes current_round and broadcasts globally.
    const frame = nextStateFrame(ws);
    // `request` was logged in as admin by the autoSeed fixture.
    const res = await request.post('/api/debug/set-round', {
      data: { round: target },
    });
    expect(res.ok()).toBe(true);
    await frame;

    // Heading must reflect the new round with no page reload.
    await expect(heading).toHaveText(String(target));
  });
});
