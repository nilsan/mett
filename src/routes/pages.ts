/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Hono, type Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { parse as parseCookies } from 'hono/utils/cookie';
import { layout } from '../views/layout.js';
import { renderAdmin } from '../views/admin.js';
import { renderCiv, renderCivFragment } from '../views/civ.js';
import { renderMain } from '../views/main.js';
import { getFullState, getAllCivs, getPlayerCensus, getCensusForRound, setAdminPassword, verifyAdminPassword, isUsingDefaultPassword, createAdminSession, isValidAdminSession, clearAdminSessions, ADMIN_SESSION_TTL_MS } from '../db.js';
import { CIVS } from '../civs.js';
import pkg from '../../package.json' with { type: 'json' };

const COOKIE_NAME = 'mett_admin';

/** True when the request carries a live admin session cookie. The cookie
 *  holds an opaque random token (never the password), so this is one SHA-256
 *  and an indexed lookup — no scrypt on the hot path. */
export function isAdminAuthed(req: Request): boolean {
  const cookies = parseCookies(req.headers.get('cookie') ?? '', COOKIE_NAME);
  return isValidAdminSession(cookies[COOKIE_NAME]);
}

/** Behind Caddy the app sees plain HTTP; trust its X-Forwarded-Proto. */
function isHttps(c: Context): boolean {
  return c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';
}

function setSessionCookie(c: Context): void {
  setCookie(c, COOKIE_NAME, createAdminSession(), {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: 'Lax',
    path: '/',
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
  });
}

// ── Login throttle ──────────────────────────────────────────────────────────
// Per-client failure counter: after LOGIN_MAX_FAILURES wrong passwords inside
// LOGIN_WINDOW_MS, further attempts are refused until the window expires.
// In-memory is fine — a restart only resets the counters.

const LOGIN_MAX_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map<string, { count: number; first: number }>();

/** Test hook: forget all recorded login failures. */
export function _resetLoginThrottle(): void {
  loginFailures.clear();
}

/** Client identity for throttling. Caddy appends the real peer address to
 *  X-Forwarded-For; without a proxy fall back to the socket address. */
function clientKey(c: Context): string {
  const xff = c.req.header('x-forwarded-for');
  if (xff) return xff.split(',').pop()!.trim();
  const server = (c.env as { server?: { requestIP(r: Request): { address: string } | null } } | undefined)?.server;
  return server?.requestIP(c.req.raw)?.address ?? 'unknown';
}

function loginBlocked(key: string): boolean {
  const f = loginFailures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > LOGIN_WINDOW_MS) { loginFailures.delete(key); return false; }
  return f.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(key: string): void {
  const f = loginFailures.get(key);
  if (f && Date.now() - f.first <= LOGIN_WINDOW_MS) f.count++;
  else loginFailures.set(key, { count: 1, first: Date.now() });
}

const pages = new Hono();

// Force browsers to revalidate HTML on every load — state changes server-side on every action
pages.use('*', async (c, next) => {
  await next();
  c.res.headers.set('Cache-Control', 'no-cache, no-store');
});

pages.get('/', (c) => {
  const state = getFullState();
  const isFragment = !!c.req.header('HX-Request');
  if (isFragment) return c.html(renderMain(state));
  const { game } = state;
  const modeBadge = game.active ? `<span class="mode-badge">${game.expert ? 'Expert' : 'Basic'}</span>` : '';
  const html = layout('Mega Empires Turn Tracker', renderMain(state) + `\n<script src="/js/main.js?v=${pkg.version}"></script>`, 'main', modeBadge);
  return c.html(html);
});

pages.get('/login', (c) => {
  const error = c.req.query('error');
  const html = layout('Admin Login', `
    <div class="login-page">
      <h2>Admin Login</h2>
      ${error === 'locked' ? '<p class="login-error">Too many failed attempts — try again later.</p>'
        : error ? '<p class="login-error">Incorrect password.</p>' : ''}
      <form method="POST" action="/login" class="login-form">
        <input type="password" name="password" placeholder="Password" autofocus class="login-input">
        <button type="submit" class="btn-primary">Login</button>
      </form>
    </div>
  `, undefined);
  return c.html(html);
});

pages.post('/login', async (c) => {
  const key = clientKey(c);
  if (loginBlocked(key)) return c.redirect('/login?error=locked');
  const body = await c.req.parseBody();
  const password = String(body.password ?? '');
  // Reject empty input unconditionally and mismatches via timing-safe verify.
  if (!password || !verifyAdminPassword(password)) {
    recordLoginFailure(key);
    return c.redirect('/login?error=1');
  }
  loginFailures.delete(key);
  setSessionCookie(c);
  return c.redirect('/admin');
});

pages.post('/admin/change-password', async (c) => {
  if (!isAdminAuthed(c.req.raw)) return c.redirect('/login');
  const body = await c.req.parseBody();
  const current = String(body.current ?? '');
  const next = String(body.next ?? '').trim();
  if (!current || !verifyAdminPassword(current)) {
    return c.redirect('/admin?pwd_error=1');
  }
  if (!next) return c.redirect('/admin?pwd_error=2');
  setAdminPassword(next);
  // Log out every other admin session; keep this browser signed in.
  clearAdminSessions();
  setSessionCookie(c);
  return c.redirect('/admin?pwd_ok=1');
});

pages.get('/admin', (c) => {
  if (!isAdminAuthed(c.req.raw)) return c.redirect('/login');
  const state = getFullState();
  const allCivs = getAllCivs();
  const prevCensus = state.game.current_round > 1 ? getCensusForRound(state.game.current_round - 1) : [];
  const defaultPwd = isUsingDefaultPassword();
  const html = layout('Admin', renderAdmin(state, allCivs, c.req.url, prevCensus, defaultPwd), 'admin');
  return c.html(html);
});


// Individual civ pages — must come after named routes
pages.get('/:slug', (c) => {
  const slug = c.req.param('slug');
  // Ensure it's a known civ slug
  const civ = CIVS.find(cv => cv.slug === slug);
  if (!civ) return c.notFound();

  const state = getFullState();
  const player = state.players.find(p => p.civ_slug === slug);
  const prevCensus = (player && state.game.current_round > 1)
    ? getPlayerCensus(player.id, state.game.current_round - 1)
    : null;

  const isFragment = !!c.req.header('HX-Request');
  if (isFragment) {
    const fragment = renderCivFragment(state, slug, prevCensus);
    if (!fragment) {
      // Game ended while player had the page open — return a minimal fragment
      return c.html(`<div id="civ-content" hx-get="/${slug}" hx-trigger="mett:my-state from:window" hx-swap="outerHTML"><div class="not-in-game"><p>This empire is not part of the current game.</p><p><a href="/">Back to overview</a></p></div></div>`);
    }
    return c.html(fragment);
  }

  const body = renderCiv(state, slug, prevCensus);
  if (!body) {
    // Civ exists but not in active game
    const html = layout(civ.name, `
      <div class="not-in-game">
        <h2 style="color:${civ.color}">${civ.name}</h2>
        <p>This empire is not part of the current game.</p>
        <p><a href="/">Back to overview</a></p>
      </div>
      <script>window.addEventListener('mett:state', (e) => {
        // Reload only once this empire joins a game, not on every broadcast.
        if (e.detail?.players?.some(p => p.civ_slug === '${slug}')) location.reload();
      });</script>
    `, undefined);
    return c.html(html);
  }

  const html = layout(civ.name, body, slug);
  return c.html(html);
});

export default pages;
