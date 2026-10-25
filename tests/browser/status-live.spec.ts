/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test, expect } from './fixtures';

// The status page re-renders via HTMX and never reads the JSON state, so it
// identifies as ping-only: after the initial full frame it must receive tiny
// `state_changed` frames (no state payload) and still refresh on each one.
test.describe('status page live updates', () => {
  test('receives ping-only frames and re-fetches its HTML on change', async ({ page, request }) => {
    const wsPromise = page.waitForEvent('websocket');
    await page.goto('/');
    const ws = await wsPromise;
    await expect(page.locator('#main-content')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const frame = ws.waitForEvent('framereceived', {
      predicate: f => typeof f.payload === 'string' && f.payload.includes('state_'),
    });
    const refetch = page.waitForRequest(r => new URL(r.url()).pathname === '/' && r.headers()['hx-request'] === 'true');

    // `request` was logged in as admin by the autoSeed fixture.
    const res = await request.post('/api/debug/advances', { data: {} });
    expect(res.ok()).toBe(true);

    const f = await frame;
    expect(JSON.parse(String(f.payload))).toEqual({ type: 'state_changed' });
    await refetch;
  });
});
