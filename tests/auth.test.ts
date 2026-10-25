/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Auth-flow tests. Locks down the empty-password bypass fix from 47b005d,
 * the scrypt-hashed storage introduced in the same commit, and the opaque
 * session-token cookie (the password itself never leaves the login form).
 *
 * Covers:
 *   - verifyAdminPassword (correct / wrong / empty)
 *   - setAdminPassword (hashes; rejects empty)
 *   - isAdminAuthed (live / expired / unknown session; password-as-cookie rejected)
 *   - isUsingDefaultPassword (true while seeded; false after rotation)
 *   - POST /login redirect targets, cookie flags and the failure throttle
 *   - POST /admin/change-password auth + validation flow
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { Hono } from 'hono';

import { makeMinimalDb as makeDb } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { setAdminPassword, verifyAdminPassword, isUsingDefaultPassword, createAdminSession, ADMIN_SESSION_TTL_MS } from '../src/db.js';
import pages, { isAdminAuthed, _resetLoginThrottle } from '../src/routes/pages.js';

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

// ─── isAdminAuthed (session cookie validation) ────────────────────────────────

describe('isAdminAuthed', () => {
  let db: Database;
  let token: string;
  beforeEach(() => {
    db = makeDb();
    _setTestDb(db);
    setAdminPassword('PASSWORD');
    token = createAdminSession();
  });

  it('accepts a live session token', () => {
    expect(isAdminAuthed(reqWith(`mett_admin=${token}`))).toBe(true);
  });

  it('rejects the plaintext password as a cookie value', () => {
    expect(isAdminAuthed(reqWith('mett_admin=PASSWORD'))).toBe(false);
  });

  it('rejects when there is no cookie at all', () => {
    expect(isAdminAuthed(reqWith())).toBe(false);
  });

  it('rejects an explicitly empty cookie value', () => {
    expect(isAdminAuthed(reqWith('mett_admin='))).toBe(false);
  });

  it('rejects an unknown token', () => {
    expect(isAdminAuthed(reqWith('mett_admin=not-a-session'))).toBe(false);
  });

  it('reads the cookie even when other cookies precede or follow it', () => {
    expect(isAdminAuthed(reqWith(`foo=bar; mett_admin=${token}; baz=qux`))).toBe(true);
  });

  it('rejects an expired session', () => {
    db.exec('UPDATE admin_sessions SET expires_at = 0');
    expect(isAdminAuthed(reqWith(`mett_admin=${token}`))).toBe(false);
  });

  it('stores only a hash of the token', () => {
    const rows = db.query<{ token_hash: string }, []>('SELECT token_hash FROM admin_sessions').all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).not.toBe(token);
  });
});

// ─── isUsingDefaultPassword (drives the admin nag banner) ─────────────────────

describe('isUsingDefaultPassword', () => {
  let testDb: Database;
  const getDbForTest = () => testDb;
  beforeEach(() => { testDb = makeDb(); _setTestDb(testDb); });

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

  it('false when admin_password is unset (NULL row)', () => {
    getDbForTest().exec('UPDATE game SET admin_password=NULL WHERE id=1');
    expect(isUsingDefaultPassword()).toBe(false);
  });
});

// ─── POST /login ──────────────────────────────────────────────────────────────

/** Value of the mett_admin cookie in a Set-Cookie header, or null. */
function sessionCookie(res: Response): string | null {
  return (res.headers.get('set-cookie') ?? '').match(/mett_admin=([^;]*)/)?.[1] ?? null;
}

describe('POST /login', () => {
  let app: Hono;
  beforeEach(() => {
    _setTestDb(makeDb());
    setAdminPassword('PASSWORD');
    _resetLoginThrottle();
    app = makeApp();
  });

  it('correct password redirects to /admin with an opaque session cookie', async () => {
    const res = await postForm(app, '/login', { password: 'PASSWORD' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin');
    const token = sessionCookie(res);
    expect(token).toBeTruthy();
    expect(token).not.toBe('PASSWORD');
    expect(res.headers.get('set-cookie')).toContain('HttpOnly');
    expect(isAdminAuthed(reqWith(`mett_admin=${token}`))).toBe(true);
  });

  it('marks the cookie Secure behind an HTTPS proxy, not on plain HTTP', async () => {
    const plain = await postForm(app, '/login', { password: 'PASSWORD' });
    expect(plain.headers.get('set-cookie')).not.toContain('Secure');
    const res = await app.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-Proto': 'https' },
      body: 'password=PASSWORD',
    });
    expect(res.headers.get('set-cookie')).toContain('Secure');
  });

  it('wrong password redirects to /login?error=1 and sets no cookie', async () => {
    const res = await postForm(app, '/login', { password: 'wrong' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?error=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('empty password is rejected', async () => {
    const res = await postForm(app, '/login', { password: '' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?error=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('locks a client out after 10 failures, even for the right password', async () => {
    for (let i = 0; i < 10; i++) await postForm(app, '/login', { password: 'wrong' });
    const res = await postForm(app, '/login', { password: 'PASSWORD' });
    expect(res.headers.get('location')).toBe('/login?error=locked');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('throttles per client — another forwarded address can still log in', async () => {
    const from = (ip: string, password: string) => app.request('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': ip },
      body: `password=${password}`,
    });
    for (let i = 0; i < 10; i++) await from('10.0.0.1', 'wrong');
    expect((await from('10.0.0.1', 'PASSWORD')).headers.get('location')).toBe('/login?error=locked');
    expect((await from('10.0.0.2', 'PASSWORD')).headers.get('location')).toBe('/admin');
  });

  it('session lifetime matches the cookie maxAge', async () => {
    const res = await postForm(app, '/login', { password: 'PASSWORD' });
    expect(res.headers.get('set-cookie')).toContain(`Max-Age=${ADMIN_SESSION_TTL_MS / 1000}`);
  });
});

// ─── POST /admin/change-password ──────────────────────────────────────────────

describe('POST /admin/change-password', () => {
  let app: Hono;
  let cookie: string;
  beforeEach(() => {
    _setTestDb(makeDb());
    setAdminPassword('CURRENT');
    cookie = `mett_admin=${createAdminSession()}`;
    app = makeApp();
  });

  it('valid change rotates the stored hash and issues a fresh session', async () => {
    const other = `mett_admin=${createAdminSession()}`;
    const res = await postForm(app, '/admin/change-password',
      { current: 'CURRENT', next: 'NEW' }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin?pwd_ok=1');
    const fresh = sessionCookie(res);
    expect(fresh).toBeTruthy();
    expect(fresh).not.toBe('NEW');
    expect(verifyAdminPassword('NEW')).toBe(true);
    expect(verifyAdminPassword('CURRENT')).toBe(false);
    // Every pre-existing session is logged out; the new one works.
    expect(isAdminAuthed(reqWith(cookie))).toBe(false);
    expect(isAdminAuthed(reqWith(other))).toBe(false);
    expect(isAdminAuthed(reqWith(`mett_admin=${fresh}`))).toBe(true);
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
      { current: 'wrong', next: 'NEW' }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin?pwd_error=1');
    expect(verifyAdminPassword('CURRENT')).toBe(true);
  });

  it('empty current — pwd_error=1 (matches the wrong-password branch)', async () => {
    const res = await postForm(app, '/admin/change-password',
      { current: '', next: 'NEW' }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin?pwd_error=1');
    expect(verifyAdminPassword('CURRENT')).toBe(true);
  });

  it('empty new — pwd_error=2, password unchanged', async () => {
    const res = await postForm(app, '/admin/change-password',
      { current: 'CURRENT', next: '' }, cookie);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin?pwd_error=2');
    expect(verifyAdminPassword('CURRENT')).toBe(true);
  });
});
