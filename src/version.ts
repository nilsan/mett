// Single source of truth for the displayed app version.
// Semver comes from package.json; build SHA (when available) comes from the
// BUILD_SHA env var, which the Docker image bakes in at build time.

import { readFileSync } from 'fs';
import { join } from 'path';

interface Pkg { version: string }

function readSemver(): string {
  try {
    const path = join(import.meta.dir, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as Pkg;
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const semver = readSemver();
const sha = (process.env.BUILD_SHA ?? '').trim() || null;

/** "v0.1.0 · abc1234" when BUILD_SHA is set, else "v0.1.0". */
export const VERSION_STRING: string = sha ? `v${semver} · ${sha}` : `v${semver}`;

export const VERSION = { semver, sha } as const;
