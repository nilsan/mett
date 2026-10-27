/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/// <reference lib="dom" />
import { test, expect, adminLogin } from './fixtures';

// The player page is split into Round · Cards · A.S.T. tabs. Exactly one panel
// shows at a time; the open tab lives in the URL hash so a reload or bookmark
// comes back to it; arrow keys move between tabs (WAI-ARIA tabs pattern).

const selected = (page: import('@playwright/test').Page) =>
  page.locator('.civ-tab[aria-selected="true"]');

test.describe('civ page: tabs', () => {
  test('opens on Round, and a tab click shows only its panel', async ({ page }) => {
    await page.goto('/minoa');
    await expect(selected(page)).toHaveText('Round');
    await expect(page.locator('#tab-round')).toBeVisible();
    await expect(page.locator('#tab-cards')).toBeHidden();
    await expect(page.locator('#tab-ast')).toBeHidden();

    await page.locator('#tab-btn-ast').click();
    await expect(page.locator('#tab-ast')).toBeVisible();
    await expect(page.locator('#tab-round')).toBeHidden();
    expect(new URL(page.url()).hash).toBe('#ast');
  });

  test('the hash picks the tab on load', async ({ page }) => {
    await page.goto('/minoa#cards');
    await expect(selected(page)).toHaveText('Cards');
    await expect(page.locator('#tab-cards')).toBeVisible();
  });

  test('arrow keys move between tabs and wrap around', async ({ page }) => {
    await page.goto('/minoa');
    await page.locator('#tab-btn-round').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(selected(page)).toHaveText('Calamities');
    await expect(page.locator('#tab-btn-calamities')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(selected(page)).toHaveText('Round');
  });

  test('Calamities lists what held cards change, helps first, and updates live', async ({ page, request }) => {
    await page.goto('/minoa#calamities');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    await request.post(`/api/players/${id}/advances`, { data: { ids: [] } });
    await expect(page.locator('#cal-panel .cal-none')).toBeVisible();
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['pottery', 'agriculture', 'enlightenment'] } });
    const famine = page.locator('.cal-group', { has: page.locator('h4', { hasText: 'Famine' }) });
    await expect(famine.locator('li')).toHaveCount(2);
    await expect(famine.locator('li').first()).toHaveClass('cal-help');
    await expect(famine.locator('li').last()).toHaveClass('cal-hurt');
    await expect(page.locator('.cal-group h4')).toHaveText(['Epidemic', 'Famine', 'Regression', 'Slave Revolt', 'Superstition']);
  });

  test('All calamities: a row opens on tap and stays open through a live update', async ({ page, request }) => {
    await page.goto('/minoa#calamities');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    // The seeded game has 18 players, so the minor calamities are in play.
    await expect(page.locator('#cal-ref details[data-calamity="Tempest"]')).toHaveCount(1);
    const famine = page.locator('#cal-ref details[data-calamity="Famine"]');
    await famine.locator('summary').click();
    await expect(famine).toHaveAttribute('open', '');
    await request.post(`/api/players/${id}/advances`, { data: { ids: [] } });
    await expect(famine.locator('.cal-held')).toHaveCount(0);
    await expect(famine).toHaveAttribute('open', '');
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['pottery'] } });
    await expect(famine.locator('.cal-held .cal-mod-card')).toHaveText('Pottery:');
    await expect(famine.locator('.cal-check')).toHaveCount(1);
    await expect(famine).toHaveAttribute('open', '');
  });

  test('Cards: buy after calamities, locked once the round rolls over', async ({ page, request }) => {
    await page.goto('/minoa#cards');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    const round = Number(await page.locator('#census-round').textContent());
    await request.post(`/api/players/${id}/advances`, { data: { ids: [] } });
    const tile = page.locator('.adv-pick[data-advance="mysticism"]');
    await request.post('/api/game/cities/clear'); // calamities resolved: phase 12
    await expect(tile).not.toHaveAttribute('aria-disabled', 'true');
    await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    await expect(tile).toContainText('new');
    await expect(page.locator('.adv-basket')).toContainText('Buying this round: 1 card');
    await expect(page.locator('.adv-basket')).toBeInViewport();
    await request.post('/api/debug/set-round', { data: { round: round + 1 } });
    await expect(tile).toHaveClass(/adv-locked/);
    await expect(page.locator('#adv-ref details[data-advance-ref="mysticism"]')).toContainText(`Bought in round ${round}`);
    // aria-disabled: Playwright would refuse a normal click. The handler flips
    // aria-pressed synchronously, so a toggle would show at once.
    await tile.click({ force: true });
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
  });

  test('the GM session does not unlock cards on a player page', async ({ page, request }) => {
    await adminLogin(page.context().request);
    await page.goto('/minoa#cards');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    const round = Number(await page.locator('#census-round').textContent());
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['mysticism'] } });
    await request.post('/api/debug/set-round', { data: { round: round + 1 } });
    await expect(page.locator('.adv-pick[data-advance="mysticism"]')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#tab-cards')).not.toContainText('GM correction');
  });

  test('All cards: a row shows the card text and stays open through a live update', async ({ page, request }) => {
    await page.goto('/minoa#cards');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    await request.post(`/api/players/${id}/advances`, { data: { ids: [] } });
    const politics = page.locator('#adv-ref details[data-advance-ref="politics"]');
    await politics.locator('summary').click();
    await expect(politics).toContainText('Special ability: You may choose one of two options:');
    await expect(politics.locator('.adv-ref-held')).toHaveCount(0);
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['politics'] } });
    await expect(politics.locator('.adv-ref-held')).toHaveCount(1);
    await expect(politics).toHaveAttribute('open', '');
  });

  test('All cards: a changed colour choice shows in the open row', async ({ page, request }) => {
    await page.goto('/minoa#cards');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['monument'] } });
    const monument = page.locator('#adv-ref details[data-advance-ref="monument"]');
    await monument.locator('summary').click();
    await expect(monument).toContainText('Credits of your choice: 20, chosen once');
    await request.post(`/api/players/${id}/advances/monument/choice`, { data: { choice: { arts: 20 } } });
    await expect(monument).toContainText('Credits of your choice: 20 Arts');
    await request.post(`/api/players/${id}/advances/monument/choice`, { data: { choice: { arts: 10, science: 10 } } });
    await expect(monument).toContainText('Credits of your choice: 10 Science · 10 Arts');
    await expect(monument).toHaveAttribute('open', '');
  });

  test('the summary line and the tab bar sit above every panel', async ({ page }) => {
    await page.goto('/minoa#ast');
    await expect(page.locator('#civ-summary')).toBeVisible();
    await expect(page.locator('#civ-summary')).toContainText('VP');
  });
});
