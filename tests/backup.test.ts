/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Game backups (services/backup.ts) and the endpoints built on them:
 *   1. takeBackup / listBackups / pruning / file-name validation.
 *   2. restoreBackup — game state back, admin password + sessions untouched,
 *      undoable, refuses a backup from another schema version.
 *   3. API: automatic backup before a round advance, start and reset;
 *      POST /api/game/round/undo; GET /api/backups (admin only);
 *      POST /api/backups/restore.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { makeDb, addPlayer, setAstLevel, submitCensus, getPlayer, getGame } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { createAdminSession, isValidAdminSession } from '../src/db.js';
import {
  takeBackup, listBackups, restoreBackup, backupBeforeAdvanceTo, _setBackupDir, BACKUP_KEEP, backupDir,
} from '../src/services/backup.js';
import { DB_PATH } from '../src/services/db.js';
import api from '../src/routes/api.js';
import pages from '../src/routes/pages.js';

let dir: string;
let db: Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mett-backup-test-'));
  _setBackupDir(dir);
  db = makeDb();
  _setTestDb(db);
});

afterEach(() => {
  _setBackupDir(null);
  rmSync(dir, { recursive: true, force: true });
});

const passwordHash = () => db.query<{ admin_password: string }, []>('SELECT admin_password FROM game').get()!.admin_password;

// ─── 1. Taking and listing ───────────────────────────────────────────────────

describe('takeBackup / listBackups', () => {
  it('writes a full database copy and lists it with reason and round', () => {
    db.exec('UPDATE game SET current_round=4');
    const b = takeBackup('before-round');
    expect(b.reason).toBe('before-round');
    expect(b.round).toBe(4);
    expect(listBackups()).toEqual([b]);
    const copy = new Database(join(dir, b.file), { readonly: true });
    expect(copy.query<{ current_round: number }, []>('SELECT current_round FROM game').get()!.current_round).toBe(4);
    copy.close();
  });

  it('lists newest first and ignores foreign files', () => {
    Bun.write(join(dir, 'notes.txt'), 'x');
    const a = takeBackup('before-start');
    const b = takeBackup('before-reset');
    expect(listBackups().map(x => x.file)).toEqual([b.file, a.file]);
  });

  it(`keeps only the newest ${BACKUP_KEEP}`, () => {
    for (let i = 0; i < BACKUP_KEEP + 3; i++) takeBackup('before-round');
    expect(listBackups()).toHaveLength(BACKUP_KEEP);
    expect(readdirSync(dir).filter(f => f.endsWith('.db'))).toHaveLength(BACKUP_KEEP);
  });

  it('backupBeforeAdvanceTo finds the backup taken in the previous round', () => {
    db.exec('UPDATE game SET current_round=6');
    const b = takeBackup('before-round');
    expect(backupBeforeAdvanceTo(7)?.file).toBe(b.file);
    expect(backupBeforeAdvanceTo(6)).toBeNull();
  });
});

describe('backupDir', () => {
  it('unit tests never write next to the real database', () => {
    _setBackupDir(null);
    expect(backupDir().startsWith(tmpdir())).toBe(true);
    expect(backupDir().startsWith(dirname(DB_PATH))).toBe(false);
  });
});

// ─── 2. Restoring ────────────────────────────────────────────────────────────

describe('restoreBackup', () => {
  it('brings back players, census and round; keeps the admin password and sessions', () => {
    const pid = addPlayer(db, 1, 'Ann');
    setAstLevel(db, pid, 20);
    submitCensus(db, pid, 3, 12, 4);
    db.exec('UPDATE game SET current_round=3, census_revealed=1');
    const b = takeBackup('before-round');

    // Later: the game moves on, a player is removed, the password changes.
    db.exec('UPDATE game SET current_round=4, census_revealed=0');
    setAstLevel(db, pid, 25);
    db.exec('DELETE FROM census');
    db.exec("UPDATE game SET admin_password='scrypt$changed'");
    const session = createAdminSession();

    restoreBackup(b.file);
    expect(getGame(db).current_round).toBe(3);
    expect(getGame(db).census_revealed).toBe(1);
    expect(getPlayer(db, pid).ast_level).toBe(20);
    expect(db.query('SELECT * FROM census').all()).toHaveLength(1);
    expect(passwordHash()).toBe('scrypt$changed');
    expect(isValidAdminSession(session)).toBe(true);
  });

  it('backs up the current state first, so a restore can be undone', () => {
    const b = takeBackup('before-start');
    db.exec('UPDATE game SET current_round=9');
    restoreBackup(b.file);
    const undo = listBackups().find(x => x.reason === 'before-restore')!;
    expect(undo.round).toBe(9);
    restoreBackup(undo.file);
    expect(getGame(db).current_round).toBe(9);
  });

  it('rejects names that are not backups (no path traversal)', () => {
    expect(() => restoreBackup('../mett.db')).toThrow('Unknown backup');
    expect(() => restoreBackup('2026-01-01T00-00-00-000Z_before-round_r1.db')).toThrow('Unknown backup');
  });

  it('refuses a backup from a different database version', () => {
    const b = takeBackup('before-start');
    const copy = new Database(join(dir, b.file));
    copy.exec('PRAGMA user_version = 999');
    copy.close();
    expect(() => restoreBackup(b.file)).toThrow('different database version');
  });
});

// ─── 3. API ──────────────────────────────────────────────────────────────────

describe('backup endpoints', () => {
  const app = new Hono().route('/', pages).route('/api', api);
  let ADMIN = '';
  beforeEach(() => { ADMIN = `mett_admin=${createAdminSession()}`; });

  const post = (path: string, body: object = {}, cookie = ADMIN) =>
    app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });

  /** Round 1 with every empire's city count in, so the round can advance. */
  function readyToAdvance(): number {
    const pid = addPlayer(db, 1, 'Ann');
    setAstLevel(db, pid, 0);
    submitCensus(db, pid, 1, 5, 3);
    db.exec('UPDATE game SET census_revealed=1, cities_phase=1');
    return pid;
  }

  it('advancing a round takes a backup first, and undo restores it exactly', async () => {
    const pid = readyToAdvance();
    expect((await post('/api/game/round/next')).status).toBe(200);
    expect(getGame(db).current_round).toBe(2);
    expect(listBackups().map(b => b.reason)).toEqual(['before-round']);

    const res = await post('/api/game/round/undo');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, round: 1 });
    expect(getGame(db).current_round).toBe(1);
    expect(getGame(db).cities_phase).toBe(1);
    expect(getPlayer(db, pid).ast_level).toBe(0);
  });

  it('undo without a backup from before this round is a 409', async () => {
    expect((await post('/api/game/round/undo')).status).toBe(409);
  });

  it('reset takes a backup first', async () => {
    expect((await post('/api/game/reset', { confirm: true })).status).toBe(200);
    expect(listBackups().map(b => b.reason)).toEqual(['before-reset']);
  });

  it('GET /api/backups is admin-only and reports the undo candidate', async () => {
    expect((await app.request('/api/backups')).status).toBe(401);
    readyToAdvance();
    await post('/api/game/round/next');
    const res = await app.request('/api/backups', { headers: { cookie: ADMIN } });
    const body = await res.json() as { backups: unknown[]; undoRound: string | null };
    expect(body.backups).toHaveLength(1);
    expect(body.undoRound).toBe(listBackups()[0]!.file);
  });

  it('restore: admin-only, 404 for unknown files, 200 on success', async () => {
    const b = takeBackup('before-start');
    expect((await post('/api/backups/restore', { file: b.file }, '')).status).toBe(401);
    expect((await post('/api/backups/restore', { file: 'nope.db' })).status).toBe(404);
    expect((await post('/api/backups/restore', {})).status).toBe(400);
    expect((await post('/api/backups/restore', { file: b.file })).status).toBe(200);
  });

  it('the admin page offers undo only when a matching backup exists', async () => {
    readyToAdvance();
    const page = async () => (await app.request('/admin', { headers: { cookie: ADMIN } })).text();
    expect(await page()).not.toContain('id="undo-round"');
    await post('/api/game/round/next');
    const html = await page();
    expect(html).toContain('id="undo-round"');
    expect(html).toContain('Backups (1)');
  });
});
