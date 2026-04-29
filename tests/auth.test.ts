/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Auth-flow tests. Locks down the empty-password bypass fix from 47b005d
 * and the scrypt-hashed storage introduced in the same commit.
 *
 * Covers:
 *   - verifyAdminPassword (correct / wrong / empty)
 *   - setAdminPassword (hashes; rejects empty)
 *   - isAdminAuthed (valid / no / empty / wrong cookie)
 *   - isUsingDefaultPassword (true while seeded; false after rotation)
 *   - POST /login redirect targets and cookie behaviour
 *   - POST /admin/change-password auth + validation flow
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Hono } from 'hono';

import { makeMinimalDb as makeDb } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { setAdminPassword, verifyAdminPassword, isUsingDefaultPassword } from '../src/db.js';
import pages, { isAdminAuthed } from '../src/routes/pages.js';

// ─── HTTP test helpers (auth-specific) ────────────────────────────────────────

function reqWith(cookie?: string): Request {
  return new Request('http://localhost/admin', {
    headers: cookie ? { cookie } : {},
  });
}

function makeApp(): Hono {
  return new Hono().route('/', pages);
}

async function postForm(app: Hono, path: string, fields: Record<string, string>, cookie?: string): Promise<Response> {
  const body = new URLSearchParams(fields).toString();
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.cookie = cookie;
  return app.request(path, { method: 'POST', headers, body });
}

// ─── verifyAdminPassword ──────────────────────────────────────────────────────

describe('verifyAdminPassword', () => {
  beforeEach(() => {
    _setTestDb(makeDb());
    setAdminPassword('CORRECT-HORSE');
  });

  it('accepts the correct password', () => {
    expect(verifyAdminPassword('CORRECT-HORSE')).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyAdminPassword('wrong')).toBe(false);
  });

  it('rejects empty input', () => {
    expect(verifyAdminPassword('')).toBe(false);
  });

  it('rejects null/undefined-ish coerced input', () => {
    expect(verifyAdminPassword(undefined as unknown as string)).toBe(false);
  });
});

// ─── setAdminPassword ─────────────────────────────────────────────────────────

describe('setAdminPassword', () => {
  let db: Database;
  beforeEach(() => {
    db = makeDb();
    _setTestDb(db);
  });

  it('stores a scrypt$-prefixed hash, never the plaintext', () => {
    setAdminPassword('plaintext-secret');
    const row = db.query<{ admin_password: string }, []>('SELECT admin_password FROM game WHERE id=1').get();
    expect(row).not.toBeNull();
    expect(row!.admin_password.startsWith('scrypt$')).toBe(true);
    expect(row!.admin_password).not.toContain('plaintext-secret');
  });

  it('produces distinct hashes for the same password (salt randomness)', () => {
    setAdminPassword('same');
    const a = db.query<{ admin_password: string }, []>('SELECT admin_password FROM game WHERE id=1').get()!.admin_password;
    setAdminPassword('same');
    const b = db.query<{ admin_password: string }, []>('SELECT admin_password FROM game WHERE id=1').get()!.admin_password;
    expect(a).not.toBe(b);
    expect(verifyAdminPassword('same')).toBe(true);
  });

  it('throws on empty input', () => {
    expect(() => setAdminPassword('')).toThrow();
  });
});

// ─── isAdminAuthed (cookie validation) ────────────────────────────────────────

describe('isAdminAuthed', () => {
  beforeEach(() => {
    _setTestDb(makeDb());
    setAdminPassword('PASSWORD');
  });

  it('accepts a request whose cookie matches the stored password', () => {
    expect(isAdminAuthed(reqWith('mett_admin=PASSWORD'))).toBe(true);
  });

  it('rejects when there is no cookie at all', () => {
    expect(isAdminAuthed(reqWith())).toBe(false);
  });

  it('rejects an explicitly empty cookie value', () => {
    expect(isAdminAuthed(reqWith('mett_admin='))).toBe(false);
  });

  it('rejects a wrong cookie value', () => {
    expect(isAdminAuthed(reqWith('mett_admin=wrong'))).toBe(false);
  });

  it('reads the cookie even when other cookies precede or follow it', () => {
    expect(isAdminAuthed(reqWith('foo=bar; mett_admin=PASSWORD; baz=qux'))).toBe(true);
  });

  it('decodes URL-encoded cookie values', () => {
    expect(isAdminAuthed(reqWith('mett_admin=' + encodeURIComponent('with spaces')))).toBe(false);
    setAdminPassword('with spaces');
    expect(isAdminAuthed(reqWith('mett_admin=' + encodeURIComponent('with spaces')))).toBe(true);
  });
});

// ─── isUsingDefaultPassword (drives the admin nag banner) ─────────────────────

describe('isUsingDefaultPassword', () => {
  beforeEach(() => { _setTestDb(makeDb()); });

  it('true while seeded with PASSWORD', () => {
    setAdminPassword('PASSWORD');
    expect(isUsingDefaultPassword()).toBe(true);
  });

  it('false after rotation', () => {
    setAdminPassword('PASSWORD');
    expect(isUsingDefaultPassword()).toBe(true);
    setAdminPassword('rotated');
    expect(isUsingDefaultPassword()).toBe(false);
  });

  it('false when admin_password is unset (NULL row from a fresh schema)', () => {
    expect(isUsingDefaultPassword()).toBe(false);
  });
});

// ─── POST /login ──────────────────────────────────────────────────────────────

describe('POST /login', () => {
  let app: Hono;
  beforeEach(() => {
    _setTestDb(makeDb());
    setAdminPassword('PASSWORD');
    app = makeApp();
  });

  it('correct password redirects to /admin with the session cookie', async () => {
    const res = await postForm(app, '/login', { password: 'PASSWORD' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin');
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('mett_admin=PASSWORD');
    expect(setCookie).toContain('HttpOnly');
  });

  it('wrong password redirects to /login?error=1 and sets no cookie', async () => {
    const res = await postForm(app, '/login', { password: 'wrong' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?error=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  // Regression test for the empty-password bypass fixed in 47b005d. Before the
  // fix, an empty stored password (or the right shape of guard) would let any
  // submitted value through.
  it('empty password is rejected (regression: empty-password bypass)', async () => {
    const res = await postForm(app, '/login', { password: '' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?error=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

// ─── POST /admin/change-password ──────────────────────────────────────────────

describe('POST /admin/change-password', () => {
  let app: Hono;
  beforeEach(() => {
    _setTestDb(makeDb());
    setAdminPassword('CURRENT');
    app = makeApp();
  });

  it('valid change rotates the stored hash and refreshes the cookie', async () => {
    const res = await postForm(app, '/admin/change-password',
      { current: 'CURRENT', next: 'NEW' }, 'mett_admin=CURRENT');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin?pwd_ok=1');
    expect(res.headers.get('set-cookie') ?? '').toContain('mett_admin=NEW');
    expect(verifyAdminPassword('NEW')).toBe(true);
    expect(verifyAdminPassword('CURRENT')).toBe(false);
  });

  it('without admin cookie redirects to /login (no rotation happens)', async () => {
    const res = await postForm(app, '/admin/change-password',
      { current: 'CURRENT', next: 'NEW' }, undefined);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login');
    expect(verifyAdminPassword('CURRENT')).toBe(true);
  });

  it('wrong current password — pwd_error=1, password unchanged', async () => {
    const res = await postForm(app, '/admin/change-password',
      { current: 'wrong', next: 'NEW' }, 'mett_admin=CURRENT');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin?pwd_error=1');
    expect(verifyAdminPassword('CURRENT')).toBe(true);
  });

  it('empty current — pwd_error=1 (matches the wrong-password branch)', async () => {
    const res = await postForm(app, '/admin/change-password',
      { current: '', next: 'NEW' }, 'mett_admin=CURRENT');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin?pwd_error=1');
    expect(verifyAdminPassword('CURRENT')).toBe(true);
  });

  it('empty new — pwd_error=2, password unchanged', async () => {
    const res = await postForm(app, '/admin/change-password',
      { current: 'CURRENT', next: '' }, 'mett_admin=CURRENT');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin?pwd_error=2');
    expect(verifyAdminPassword('CURRENT')).toBe(true);
  });
});
