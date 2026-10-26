/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Preloaded by `bun test` (bunfig.toml): backups taken through the API in
// unit tests land in one temp folder, removed when the whole run is done.
import { afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'mett-unit-backups-'));
process.env.BACKUP_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));
