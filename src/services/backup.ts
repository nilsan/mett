/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Game backups: a full copy of the database taken right before every action
 * that rewrites the game (round advance, game start, reset, restore), kept in
 * `<data dir>/<db name>-backups/` (e.g. data/mett-backups/). `VACUUM INTO` writes a consistent snapshot while the
 * game keeps running (WAL), so taking one costs a few milliseconds.
 *
 * Restoring copies back only the game state (game row minus the admin
 * password, players, census): the current admin password and sessions stay,
 * and a backup is taken first so a restore can itself be undone.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDb, DB_PATH, usingTestDb } from './db.js';
import { GAME_STATE_COLUMNS, clearRoundSummaries } from '../models/game.js';

/** How many backups to keep (oldest pruned first). Two days of play is ~20 rounds. */
export const BACKUP_KEEP = 30;

export type BackupReason = 'before-round' | 'before-start' | 'before-reset' | 'before-restore';

export interface BackupInfo {
  file: string;
  reason: BackupReason;
  /** Round the game was on when the backup was taken. */
  round: number;
  createdAt: string;
}

// e.g. 2026-10-25T21-04-05-123Z_before-round_r13.db — sortable by name.
const FILE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_(before-round|before-start|before-reset|before-restore)_r(\d+)\.db$/;

let _dir: string | null = null;

/** Backup directory: BACKUP_DIR, else `<db name>-backups/` next to the
 *  database — per database, so a test instance on its own DB never mixes its
 *  backups into the dev or production list. Unit tests run on an in-memory
 *  DB; their backups never go next to DB_PATH (tests/_preload.ts points
 *  BACKUP_DIR at a temp folder it removes afterwards). */
export function backupDir(): string {
  if (_dir) return _dir;
  if (process.env.BACKUP_DIR) return process.env.BACKUP_DIR;
  if (usingTestDb()) return join(tmpdir(), `mett-unit-backups-${process.pid}`);
  return join(dirname(DB_PATH), `${basename(DB_PATH, '.db')}-backups`);
}

/** @internal tests only */
export function _setBackupDir(dir: string | null): void { _dir = dir; }

function parse(file: string): BackupInfo | null {
  const m = FILE_RE.exec(file);
  if (!m) return null;
  const [, stamp, reason, round] = m;
  const createdAt = stamp!.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');
  return { file, reason: reason as BackupReason, round: Number(round), createdAt };
}

/** All backups, newest first. */
export function listBackups(): BackupInfo[] {
  let files: string[];
  try { files = readdirSync(backupDir()); } catch { return []; }
  return files.map(parse).filter((b): b is BackupInfo => b !== null)
    .sort((a, b) => b.file.localeCompare(a.file));
}

/** Snapshot the whole database. Returns the new backup; prunes beyond BACKUP_KEEP. */
export function takeBackup(reason: BackupReason): BackupInfo {
  const db = getDb();
  const round = db.query<{ current_round: number }, []>('SELECT current_round FROM game WHERE id=1').get()?.current_round ?? 0;
  const dir = backupDir();
  mkdirSync(dir, { recursive: true });
  // Names sort by time, so every new backup must be strictly newer than the
  // newest one on disk (two can land in the same millisecond, e.g. the
  // before-restore backup right after another).
  const newest = listBackups()[0];
  const now = Math.max(Date.now(), newest ? Date.parse(newest.createdAt) + 1 : 0);
  const file = `${new Date(now).toISOString().replace(/[:.]/g, '-')}_${reason}_r${round}.db`;
  db.query('VACUUM INTO ?').run(join(dir, file));
  for (const old of listBackups().slice(BACKUP_KEEP)) rmSync(join(dir, old.file), { force: true });
  return parse(file)!;
}

/** The newest backup taken right before advancing *into* `round`, if any —
 *  restoring it undoes that round advance completely. */
export function backupBeforeAdvanceTo(round: number): BackupInfo | null {
  return listBackups().find(b => b.reason === 'before-round' && b.round === round - 1) ?? null;
}

/** Restore game state from a backup file name (as listed by listBackups).
 *  Throws on unknown names or a backup from a different schema version. */
export function restoreBackup(file: string): void {
  if (!parse(file)) throw new Error('Unknown backup');
  const path = join(backupDir(), file);
  try { statSync(path); } catch { throw new Error('Unknown backup'); }

  const db = getDb();
  const version = (d: Database) => d.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;
  const src = new Database(path, { readonly: true });
  try {
    if (version(src) !== version(db)) throw new Error('Backup is from a different database version');
  } finally {
    src.close();
  }

  takeBackup('before-restore');
  db.query('ATTACH DATABASE ? AS bk').run(path);
  try {
    db.transaction(() => {
      // Game row: state columns only — the admin password stays current.
      db.query(`UPDATE game SET (${GAME_STATE_COLUMNS}) = (SELECT ${GAME_STATE_COLUMNS} FROM bk.game WHERE id=1) WHERE id=1`).run();
      db.query('DELETE FROM census').run();
      db.query('DELETE FROM players').run();
      db.query('INSERT INTO players SELECT * FROM bk.players').run();
      db.query('INSERT INTO census SELECT * FROM bk.census').run();
    })();
  } finally {
    db.query('DETACH DATABASE bk').run();
  }
  clearRoundSummaries();
}
