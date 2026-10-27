/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Unused-CSS report: lists every selector in public/css/style.css that never
 * matches anything while the app is walked through all its pages and states.
 *
 *   bun run css:usage            # report; exit 1 if anything is unused
 *
 * Starts its own me[tt] instance on a throwaway database (never touches the
 * dev server or its data), then for each game state — no game, census, trade,
 * calamities, game over, basic mode — loads the status, admin, player and
 * login pages at phone, 1080p and 4K sizes. Media queries are ignored when
 * collecting selectors (every size is visited); pseudo-elements and
 * interaction states (:hover, ::before, …) are stripped before matching.
 *
 * Selectors that only match DOM built at runtime by rare paths (an error
 * toast, the offline pill) are listed in KNOWN_DYNAMIC below, with the reason.
 */

import { chromium, type Page } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 3300;
const BASE = `http://localhost:${PORT}`;

/** Selectors for DOM that exists only on rare runtime paths. */
const KNOWN_DYNAMIC: Record<string, string> = {
  '#mett-toast.visible': 'error toast, shown by toast.js on a failed request',
  '.mett-offline-pill[hidden]': 'offline pill, hidden by ws-client.js once the WebSocket reconnects',
  '.mett-flash': 'flash animation api.js adds to a value the player just changed',
  '.mett-offline-pill': 'offline pill, created by ws-client.js while the WebSocket is down',
  '.backup-section[open] summary': 'the admin backup list after the GM opens it',
  '.cal-ref-item[open] > summary': 'a calamity row on the Calamities tab after the player opens it',
  '.adv-ref-item[open] > summary': 'a card row in All cards on the Cards tab after the player opens it',
  // Round-summary lines for specific transitions (logic covered by
  // computeRoundSummary tests in tests/game.test.ts).
  '.round-summary .rs-final': 'summary line: the advance triggered the final round',
  '.round-summary .rs-lia-bonus': 'summary line: one empire reached Late Iron Age alone',
  '.round-summary .rs-lia-blocked': 'summary line: several reached Late Iron Age together',
  '.round-summary .rs-lia-late': 'summary line: Late Iron Age after the bonus was taken',
  '.round-summary .rs-quiet': 'summary line: a round with no A.S.T. changes',
};

const dir = mkdtempSync(join(tmpdir(), 'mett-css-usage-'));
const server = Bun.spawn(['bun', 'run', 'src/index.ts'], {
  env: { ...process.env, PORT: String(PORT), DATABASE_PATH: join(dir, 'css.db'), ADMIN_PASSWORD: 'PASSWORD', NODE_ENV: 'production' },
  stdout: 'ignore', stderr: 'inherit',
});

try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(BASE + '/healthz')).ok) break; } catch { /* starting */ }
    if (i > 50) throw new Error('server did not start');
    await Bun.sleep(100);
  }
  const login = await fetch(BASE + '/login', { method: 'POST', body: new URLSearchParams({ password: 'PASSWORD' }), redirect: 'manual' });
  const token = login.headers.get('set-cookie')!.split(';')[0]!.split('=')[1]!;
  const post = (path: string, body: object = {}) => fetch(BASE + path, {
    method: 'POST', headers: { cookie: `mett_admin=${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });

  const browser = await chromium.launch();
  const sizes = [{ width: 412, height: 915 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }];
  let unmatched: Set<string> | null = null;

  async function visit(path: string, admin = false): Promise<void> {
    for (const viewport of sizes) {
      const ctx = await browser.newContext({ viewport });
      if (admin) await ctx.addCookies([{ name: 'mett_admin', value: token, url: BASE }]);
      const page = await ctx.newPage();
      await page.goto(BASE + path);
      await page.waitForLoadState('networkidle');
      unmatched = await collect(page, unmatched);
      await ctx.close();
    }
  }

  async function pages(): Promise<void> {
    const state = await (await fetch(BASE + '/api/state')).json() as { players: Array<{ civ_slug: string }> };
    await visit('/');
    await visit('/admin', true);
    // Player pages: two that submit early in each phase, one that never does,
    // and one that ends the calamities phase on 0 cities.
    for (const i of [0, 1, 4, 5]) if (state.players[i]) await visit(`/${state.players[i]!.civ_slug}`);
  }

  const players = async () => ((await (await fetch(BASE + '/api/state')).json()) as { players: Array<{ id: number }> }).players;

  // No game: setup wizard, login page variants, unknown civ.
  await visit('/admin', true);
  await visit('/login');
  await visit('/login?error=1');
  await visit('/login?error=locked');
  await visit('/minoa');
  // Round 1 of a fresh game: no city count exists yet anywhere, so the
  // player pages show "not yet submitted" requirements.
  await post('/api/debug/simulate', { expert: 1, player_count: 18, rounds: 0, seed: 1 });
  await post(`/api/players/${(await players())[0]!.id}/ast`, { level: 30 });  // next step needs cities
  await pages();
  // Expert game, census phase: a few censuses in, toggles switched on.
  await post('/api/debug/simulate', { expert: 1, player_count: 18, rounds: 6, seed: 1 });
  const ps = await players();
  for (const p of ps.slice(0, 3)) await post(`/api/players/${p.id}/census`, { population: 20 });
  // Cards: flags from Military / Wonder / Monotheism, a Monument with its
  // colours chosen (and still correctable this round), a Written Record not
  // chosen yet (open chooser).
  await post(`/api/players/${ps[0]!.id}/advances`, { ids: ['military', 'wonder-of-the-world', 'monotheism', 'monument'] });
  await post(`/api/players/${ps[0]!.id}/advances/monument/choice`, { choice: { arts: 10, science: 10 } });
  await post(`/api/players/${ps[1]!.id}/advances`, { ids: ['written-record'] });
  await post(`/api/players/${ps[5]!.id}/ast`, { level: 0 });  // admin: regress button disabled
  await pages();
  // Trade phase: census revealed, a few city counts in, units marked moved.
  await post('/api/debug/census', { seed: 1 });
  for (const p of ps.slice(0, 3)) await post(`/api/players/${p.id}/city-count`, { city_count: 6 });
  await post(`/api/players/${ps[0]!.id}/move`);
  await pages();
  // Trade phase with every city count in: trade cards (and a wonder chip).
  await post('/api/debug/cities', { seed: 1 });
  await pages();
  // Calamities: recount, a calamity regression marker, then the round
  // advances for real — the admin page gets a round summary.
  await post('/api/game/cities/clear');
  await post(`/api/players/${ps[1]!.id}/regress`);
  await pages();
  await post('/api/debug/cities', { seed: 2 });
  await post(`/api/players/${ps[5]!.id}/city-count`, { city_count: 0 });  // will regress
  await post(`/api/players/${ps[4]!.id}/ast`, { level: 30 });
  await post(`/api/players/${ps[4]!.id}/city-count`, { city_count: 0 });  // regresses at the advance
  await pages();
  await post('/api/game/round/next');
  await pages();
  // Final round: one empire reaches Late Iron Age (LIA bonus + final banner).
  await post(`/api/players/${ps[0]!.id}/ast`, { level: 80 });
  await post(`/api/players/${ps[0]!.id}/late-iron-age-bonus`, { grant: true });
  await pages();
  // Game over with an unresolved tie (admin shows the tie-break dropdowns).
  await post('/api/debug/census', { seed: 3 });
  await post('/api/debug/cities', { seed: 3 });
  // The tie sits low in the table so gold, silver and bronze stay clear.
  const tieCards = ['pottery', 'masonry'];
  for (const p of ps.slice(5, 7)) {
    await post(`/api/players/${p.id}/ast`, { level: 10 });
    await post(`/api/players/${p.id}/advances`, { ids: tieCards });
    await post(`/api/players/${p.id}/city-count`, { city_count: 4 });
  }
  await post('/api/game/round/next');
  await pages();
  // Admin password form states.
  await visit('/admin?pwd_ok=1', true);
  await visit('/admin?pwd_error=1', true);
  // Basic mode, small West game.
  await post('/api/debug/simulate', { expert: 0, player_count: 5, rounds: 4, seed: 3 });
  await pages();

  await browser.close();
  const unused = [...unmatched!].filter(s => !(s in KNOWN_DYNAMIC)).sort();
  if (unused.length) {
    console.log(`${unused.length} selector(s) in public/css/style.css never matched:\n`);
    for (const s of unused) console.log('  ' + s);
    process.exitCode = 1;
  } else {
    console.log('Every selector in public/css/style.css matched at least once.');
  }
} finally {
  server.kill();
  await server.exited;
  rmSync(dir, { recursive: true, force: true });
}

/** Selectors (from style.css) still unmatched after looking at this page. */
async function collect(page: Page, still: Set<string> | null): Promise<Set<string>> {
  const remaining = await page.evaluate((prev: string[] | null) => {
    // Split a selector list at top-level commas (not inside :is()/:not()/…).
    const split = (list: string) => {
      const out: string[] = [];
      let depth = 0, cur = '';
      for (const ch of list) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
      }
      if (cur.trim()) out.push(cur.trim());
      return out;
    };
    // Interaction states and pseudo-elements don't exist as DOM — match the
    // element they style instead.
    const strip = (sel: string) => sel
      .replace(/::?(before|after|placeholder|marker|selection|backdrop|-webkit-[\w-]+|-moz-[\w-]+)/g, '')
      .replace(/:(hover|active|focus-visible|focus-within|focus|visited)/g, '')
      .trim() || '*';
    const selectors: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const r of Array.from(rules)) {
        if (r instanceof CSSStyleRule) selectors.push(...split(r.selectorText));
        else if ('cssRules' in r) walk((r as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.href?.includes('/css/style.css')) walk(sheet.cssRules);
    }
    const candidates = prev ?? selectors;
    return candidates.filter(sel => {
      if (sel === ':root' || sel === 'html' || sel === 'body' || sel.startsWith('@')) return false;
      try { return document.querySelector(strip(sel)) === null; } catch { return true; }
    });
  }, still ? [...still] : null);
  return new Set(remaining);
}
