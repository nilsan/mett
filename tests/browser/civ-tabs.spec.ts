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

  test('Calamities works out each victim role for the held cards, and updates live', async ({ page, request }) => {
    await page.goto('/minoa#calamities');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    await request.post(`/api/players/${id}/advances`, { data: { ids: [] } });
    const famine = page.locator('#cal-ref details[data-calamity="Famine"]');
    await expect(famine.locator('summary .cal-check')).toHaveCount(0);
    await famine.locator('summary').click();
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['pottery', 'agriculture', 'enlightenment'] } });
    await expect(famine.locator('summary .cal-check')).toHaveCount(2);
    await expect(famine.locator('.cal-role')).toHaveText([
      'Primary victim: Take 10 damage. 10 −5 Pottery +5 Agriculture',
      'Secondary victims (3 players the primary victim picks): No damage. 5 −5 Pottery',
    ]);
    await expect(famine.locator('.cal-calc .cal-help')).toHaveText(['−5 Pottery', '−5 Pottery']);
    await expect(famine.locator('.cal-calc .cal-hurt')).toHaveText('+5 Agriculture');
    await expect(page.locator('#cal-ref summary:has(.cal-check) .cal-ref-name')).toHaveText(['Famine', 'Slave Revolt', 'Superstition', 'Epidemic', 'Regression']);
  });

  test('All calamities: ✓ takes the colour of the effect, and the beneficiary has its own line', async ({ page, request }) => {
    await page.goto('/minoa#calamities');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['pottery', 'agriculture'] } });
    const famine = page.locator('#cal-ref details[data-calamity="Famine"]');
    await famine.locator('summary').click();
    const color = (l: import('@playwright/test').Locator) => l.evaluate(el => getComputedStyle(el).color);
    const help = famine.locator('li.cal-help.cal-held .cal-check');
    const hurt = famine.locator('li.cal-hurt.cal-held .cal-check');
    expect(await color(help)).not.toBe(await color(hurt));
    expect(await color(hurt)).toBe(await color(famine.locator('li.cal-hurt .cal-mark').first()));
    expect(await color(famine.locator('summary .cal-check-hurt'))).toBe(await color(hurt));
    expect(await color(famine.locator('summary .cal-check-help'))).toBe(await color(help));
    const epidemic = page.locator('#cal-ref details[data-calamity="Epidemic"]');
    await epidemic.locator('summary').click();
    await expect(epidemic.locator('.cal-role', { hasText: 'Beneficiary:' })).toContainText('The player who traded the calamity to you');
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
    await expect(famine.locator('.cal-mods .cal-check')).toHaveCount(1);
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

  test('Cards: the chosen order, either way round, applies to both lists and is kept on reload', async ({ page }) => {
    await page.goto('/minoa#cards');
    const first = () => page.locator('.adv-pick').first();
    const firstRef = () => page.locator('#adv-ref details').first();
    await expect(page.locator('[data-card-sort="group"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-card-sort="name"]').click();
    await expect(page.locator('[data-card-sort="name"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(first()).toHaveAttribute('data-advance', 'advanced-military');
    await expect(firstRef()).toHaveAttribute('data-advance-ref', 'advanced-military');
    await expect(page.locator('#adv-picker h4')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-card-sort="name"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(first()).toHaveAttribute('data-advance', 'advanced-military');
    // A second click on the same button turns the order round.
    await page.locator('[data-card-sort="name"]').click();
    await expect(page.locator('[data-card-sort="name"]')).toHaveText('Z–A');
    await expect(first()).toHaveAttribute('data-advance', 'written-record');
    await expect(firstRef()).toHaveAttribute('data-advance-ref', 'written-record');
    await page.reload();
    await expect(page.locator('[data-card-sort="name"]')).toHaveText('Z–A');
    await expect(first()).toHaveAttribute('data-advance', 'written-record');
    await page.locator('[data-card-sort="vp"]').click();
    await expect(page.locator('[data-card-sort="vp"]')).toHaveText('VP ↑');
    await expect(page.locator('[data-card-sort="name"]')).toHaveText('A–Z');
    await expect(first().locator('.adv-pick-meta')).toContainText('1 VP');
    await page.locator('[data-card-sort="vp"]').click();
    await expect(page.locator('[data-card-sort="vp"]')).toHaveText('VP ↓');
    await expect(first().locator('.adv-pick-meta')).toContainText('6 VP');
    // VP/cost only goes one way: a second click keeps the order.
    await page.locator('[data-card-sort="value"]').click();
    await expect(page.locator('[data-card-sort="value"]')).toHaveAttribute('aria-pressed', 'true');
    const best = await first().getAttribute('data-advance');
    await page.locator('[data-card-sort="value"]').click();
    await expect(page.locator('[data-card-sort="value"]')).toHaveText('VP/cost');
    await expect(first()).toHaveAttribute('data-advance', best!);
    await page.locator('[data-card-sort="group"]').click();
    await expect(page.locator('#adv-picker h4').first()).toHaveText('Science');
  });

  test('Cards: the purchase bar names the cards, and Clear unticks this round\'s purchase', async ({ page, request }) => {
    await page.goto('/minoa#cards');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    await request.post(`/api/players/${id}/advances`, { data: { ids: [] } });
    await request.post('/api/game/cities/clear'); // phase 12
    await page.locator('.adv-pick[data-advance="pottery"]').click();
    await page.locator('.adv-pick[data-advance="mysticism"]').click();
    await expect(page.locator('.adv-basket-names')).toHaveText('Mysticism · Pottery');
    await page.locator('.adv-basket-clear').click();
    await expect(page.locator('.adv-basket')).toHaveCount(0);
    await expect(page.locator('.adv-pick[aria-pressed="true"]')).toHaveCount(0);
  });

  test('Cards: colour credits and the next age\'s cards sit under the sort buttons', async ({ page, request }) => {
    await page.goto('/minoa#cards');
    const id = await page.locator('#civ-content').getAttribute('data-player-id');
    await request.post(`/api/players/${id}/advances`, { data: { ids: ['pottery'] } });
    await expect(page.locator('#adv-overview .adv-credit-total.adv-crafts')).toContainText('Crafts');
    await expect(page.locator('#adv-overview .adv-credit-totals')).toHaveCount(1);
    await expect(page.locator('#adv-overview .adv-overview-line')).toHaveCount(1); // the next age
    const sortBottom = await page.locator('.adv-sort').evaluate(el => el.getBoundingClientRect().bottom);
    const overviewTop = await page.locator('#adv-overview').evaluate(el => el.getBoundingClientRect().top);
    expect(overviewTop).toBeGreaterThanOrEqual(sortBottom);
  });

  test('the source and Ko-fi line shows on the Cards and Calamities tabs only', async ({ page }) => {
    await page.goto('/minoa');
    for (const [tab, shown] of [['round', false], ['cards', true], ['ast', false], ['calamities', true]] as const) {
      await page.locator(`#tab-btn-${tab}`).click();
      await expect(page.locator('.support-line:visible')).toHaveCount(shown ? 1 : 0);
    }
  });

  test('the summary line and the tab bar sit above every panel', async ({ page }) => {
    await page.goto('/minoa#ast');
    await expect(page.locator('#civ-summary')).toBeVisible();
    await expect(page.locator('#civ-summary')).toContainText('VP');
  });
});
