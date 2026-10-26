/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test, expect } from 'bun:test';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');

// Every source file carries the MPL 2.0 notice near the top (Exhibit A of the
// license), so a file copied out of the repo still says what it is under.
// Generated bundles are exempt: they are built from src/client/, which has it.
const SOURCE = /\.(ts|js|css|sql|sh|conf)$|(^|\/)Dockerfile$/;
const GENERATED = new Set(['public/js/civ.js', 'public/js/admin.js']);

test('every tracked source file starts with the MPL 2.0 notice', async () => {
  const files = Bun.spawnSync(['git', 'ls-files'], { cwd: ROOT }).stdout.toString().split('\n')
    .filter(f => SOURCE.test(f) && !GENERATED.has(f));
  expect(files.length).toBeGreaterThan(40);
  const missing: string[] = [];
  for (const f of files) {
    const head = (await Bun.file(join(ROOT, f)).text()).split('\n').slice(0, 6).join('\n');
    if (!head.includes('This Source Code Form is subject to the terms of the Mozilla Public')) missing.push(f);
  }
  expect(missing).toEqual([]);
});
