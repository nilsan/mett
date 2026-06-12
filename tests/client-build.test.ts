/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test, expect } from 'bun:test';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');

// public/js/civ.js is a committed build artifact: nothing in CI or the Docker
// image rebuilds it, so production ships whatever was last committed. This test
// rebuilds the bundle and byte-compares it so a forgotten `bun run build:client`
// fails the suite instead of silently shipping a stale player page.
// Output is bun-version-sensitive; CI pins the same bun version as local dev.
test('committed public/js/civ.js matches a fresh build of src/client/civ.ts', async () => {
  const outfile = join('/tmp', `mett-civ-build-check-${process.pid}.js`);
  const proc = Bun.spawnSync(
    ['bun', 'build', 'src/client/civ.ts', '--outfile', outfile, '--format', 'iife', '--target', 'browser'],
    { cwd: ROOT },
  );
  expect(proc.exitCode).toBe(0);

  const fresh = await Bun.file(outfile).text();
  const committed = await Bun.file(join(ROOT, 'public', 'js', 'civ.js')).text();
  expect(committed).toBe(fresh); // drifted? run: bun run build:client
});
