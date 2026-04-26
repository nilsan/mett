import pkg from '../package.json' with { type: 'json' };

const sha = process.env.BUILD_SHA?.trim() || null;

/** "v0.7.0 · abc1234" when BUILD_SHA is set, else "v0.7.0". */
export const VERSION_STRING: string = sha ? `v${pkg.version} · ${sha}` : `v${pkg.version}`;
