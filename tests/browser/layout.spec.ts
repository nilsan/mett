/// <reference lib="dom" />
import { test, expect } from '@playwright/test';

// Regression test for todo 10.1: at 1080p the main display must show all 18
// empires across every section without vertical scrolling.
test.describe('main display layout', () => {
  test('1920×1080: 0 px overflow, footer visible, 18 leaderboard rows', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const { vh, sh } = await page.evaluate(() => ({
      vh: window.innerHeight,
      sh: document.documentElement.scrollHeight,
    }));
    expect(sh - vh, 'page must fit in 1080p without overflow').toBeLessThanOrEqual(0);

    await expect(page.locator('.version-footer')).toBeVisible();
    await expect(page.locator('.lb-table tbody tr')).toHaveCount(18);
  });

  test('3840×2160 (4K): no overflow', async ({ page }) => {
    await page.setViewportSize({ width: 3840, height: 2160 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollHeight - window.innerHeight,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
