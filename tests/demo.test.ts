/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Demo mode (services/demo.ts, DEMO=1): the starting table, the fixed admin
 * password, the nightly schedule and what the pages show.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';

import { makeMinimalDb, getGame } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { createAdminSession, verifyAdminPassword, getPlayers } from '../src/db.js';
import { resetDemo, msUntilNextReset, DEMO_PASSWORD } from '../src/services/demo.js';
import pages from '../src/routes/pages.js';
import api from '../src/routes/api.js';
import type { Database } from 'bun:sqlite';

const app = new Hono().route('/', pages).route('/api', api);
let db: Database;

beforeEach(() => {
  db = makeMinimalDb();
  _setTestDb(db);
  process.env.DEMO = '1';
});

afterEach(() => { delete process.env.DEMO; });

describe('resetDemo', () => {
  it('sets up a 12-empire Expert game in round 7 with half the census in', async () => {
    await resetDemo();
    const game = getGame(db);
    expect(game).toMatchObject({ active: 1, expert: 1, current_round: 7, census_revealed: 0 });
    expect(getPlayers()).toHaveLength(12);
    const submitted = db.query<{ n: number }, [number]>('SELECT COUNT(*) AS n FROM census WHERE round=? AND population IS NOT NULL').get(7)!.n;
    expect(submitted).toBe(6);
    expect(verifyAdminPassword(DEMO_PASSWORD)).toBe(true);
  });

  it('is the same table every time, whatever happened in between', async () => {
    await resetDemo();
    const first = getPlayers();
    db.exec('UPDATE game SET current_round=12; DELETE FROM census');
    db.exec("UPDATE game SET admin_password='scrypt$changed'");
    await resetDemo();
    expect(getPlayers()).toEqual(first);
    expect(getGame(db).current_round).toBe(7);
    expect(verifyAdminPassword(DEMO_PASSWORD)).toBe(true);
  });
});

describe('msUntilNextReset', () => {
  const at = (iso: string) => msUntilNextReset(new Date(iso));
  it('waits for 03:00 UTC today, or tomorrow once it has passed', () => {
    expect(at('2026-10-26T01:00:00Z')).toBe(2 * 3600_000);
    expect(at('2026-10-26T03:00:00Z')).toBe(24 * 3600_000);
    expect(at('2026-10-26T22:30:00Z')).toBe(4.5 * 3600_000);
  });
});

describe('demo pages', () => {
  it('the login page shows the password; the footer says it resets', async () => {
    const html = await (await app.request('/login')).text();
    expect(html).toContain(`the password is <strong>${DEMO_PASSWORD}</strong>`);
    expect(html).toContain('demo · resets nightly');
  });

  it('the admin password cannot be changed', async () => {
    await resetDemo();
    const res = await app.request('/admin/change-password', {
      method: 'POST',
      headers: { cookie: `mett_admin=${createAdminSession()}` },
      body: new URLSearchParams({ current: DEMO_PASSWORD, next: 'mine' }),
    });
    expect(res.headers.get('location')).toBe('/admin?pwd_error=3');
    expect(verifyAdminPassword(DEMO_PASSWORD)).toBe(true);
  });

  it('outside demo mode nothing changes', async () => {
    delete process.env.DEMO;
    const html = await (await app.request('/login')).text();
    expect(html).not.toContain('the password is');
    expect(html).not.toContain('resets nightly');
  });
});
