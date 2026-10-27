/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect, adminLogin } from './fixtures';

// Regression: the admin census input committed only on blur, so editing it with
// the native number-spinner up/down arrows (which fire `change` but never blur)
// silently dropped the edit. It must now persist on `change` too.
test.describe('admin census input', () => {
  test('spinner/arrow change persists without blurring the field', async ({ page, request }) => {
    // /admin is GM-gated — log the page's browser context in.
    await adminLogin(page.context().request);
    await page.goto('/admin');

    const input = page.locator('input.census-admin-input').first();
    await expect(input).toBeVisible();
    const pid = await input.getAttribute('data-player-id');
    expect(pid).toBeTruthy();

    // ArrowUp on a focused number input increments it and fires input+change with
    // NO blur — the same event sequence as clicking the spinner's up arrow.
    await input.focus();
    await input.press('ArrowUp');

    // The value must be persisted server-side even though the field never blurred.
    await expect
      .poll(async () => {
        const res = await request.get('/api/state');
        const state = await res.json();
        const c = state.census.find((row: { player_id: number }) => String(row.player_id) === pid);
        return c?.population ?? null;
      }, { message: 'census population must persist on change-without-blur' })
      .not.toBeNull();
  });
});

// The advance VP follows the cards live and opens the GM's card correction
// dialog: any card, locked or not, in any phase.
test.describe('admin: cards', () => {
  test('Adv VP opens the card dialog, where the GM unticks a locked card', async ({ page, request }) => {
    await adminLogin(page.context().request);
    await page.goto('/admin');
    const state = await (await request.get('/api/state')).json();
    const id = state.players.find((p: { civ_slug: string }) => p.civ_slug === 'minoa').id;
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['military', 'mysticism'] } });
    await request.post('/api/debug/set-round', { data: { round: state.game.current_round + 1 } });
    const vp = page.locator(`.adv-pts-btn[data-player-id="${id}"]`);
    await expect(vp).toHaveText('4');
    await vp.click();
    const dialog = page.locator('#gm-cards');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h3')).toHaveText('Correct cards: Minoa');
    await expect(dialog).toContainText('GM correction');
    const tile = dialog.locator('.adv-pick[data-advance="mysticism"]');
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    await expect(tile).not.toHaveAttribute('aria-disabled', 'true');
    await tile.click();
    await expect.poll(async () => (await (await request.get('/api/state')).json()).advances[id].map((h: { id: string }) => h.id))
      .toEqual(['military']);
    await expect(vp).toHaveText('3');
    await expect(tile).toHaveAttribute('aria-pressed', 'false');
    await dialog.locator('.gm-cards-close').click();
    await expect(dialog).toBeHidden();
  });
});
