/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { test, expect } from 'bun:test';
import { join } from 'path';

const ROOT = join(import.meta.dir, '..');

// public/js/{civ,admin}.js are committed build artifacts: nothing in CI or the
// Docker image rebuilds them, so production ships whatever was last committed.
// This test rebuilds each bundle and byte-compares it so a forgotten
// `bun run build:client` fails the suite instead of silently shipping a stale page.
// Output is bun-version-sensitive; CI and Docker pin the version in .bun-version.
for (const name of ['civ', 'admin']) {
  test(`committed public/js/${name}.js matches a fresh build of src/client/${name}.ts`, async () => {
    const outfile = join('/tmp', `mett-${name}-build-check-${process.pid}.js`);
    const proc = Bun.spawnSync(
      ['bun', 'build', `src/client/${name}.ts`, '--outfile', outfile, '--format', 'iife', '--target', 'browser'],
      { cwd: ROOT },
    );
    expect(proc.exitCode).toBe(0);

    const fresh = await Bun.file(outfile).text();
    const committed = await Bun.file(join(ROOT, 'public', 'js', `${name}.js`)).text();
    expect(committed).toBe(fresh); // drifted? run: bun run build:client
  });
}

// One Bun version everywhere: CI reads .bun-version, the Docker image takes it
// as a build arg, and the Dockerfile default must match for local builds.
test('Dockerfile BUN_VERSION default matches .bun-version', async () => {
  const pinned = (await Bun.file(join(ROOT, '.bun-version')).text()).trim();
  const dockerfile = await Bun.file(join(ROOT, 'docker', 'Dockerfile')).text();
  expect(dockerfile.match(/^ARG BUN_VERSION=(\S+)$/m)?.[1]).toBe(pinned);
});
