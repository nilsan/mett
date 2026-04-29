/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { layout } from '../views/layout.js';
import { renderAdmin } from '../views/admin.js';
import { renderCiv, renderCivFragment } from '../views/civ.js';
import { renderMain } from '../views/main.js';
import { getFullState, getAllCivs, getPlayerCensus, getCensusForRound, setAdminPassword, verifyAdminPassword, isUsingDefaultPassword } from '../db.js';
import { CIVS } from '../civs.js';

const COOKIE_NAME = 'mett_admin';

export function isAdminAuthed(req: Request): boolean {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)mett_admin=([^;]*)/);
  const submitted = match?.[1];
  if (!submitted) return false;
  return verifyAdminPassword(decodeURIComponent(submitted));
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
  const html = layout('Mega Empires Turn Tracker', renderMain(state) + '\n<script src="/js/main.js"></script>', 'main');
  return c.html(html);
});

pages.get('/login', (c) => {
  const error = c.req.query('error');
  const html = layout('Admin Login', `
    <div class="login-page">
      <h2>Admin Login</h2>
      ${error ? '<p class="login-error">Incorrect password.</p>' : ''}
      <form method="POST" action="/login" class="login-form">
        <input type="password" name="password" placeholder="Password" autofocus class="login-input">
        <button type="submit" class="btn-primary">Login</button>
      </form>
    </div>
  `, undefined);
  return c.html(html);
});

pages.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const password = String(body.password ?? '');
  // Reject empty input unconditionally and mismatches via timing-safe verify.
  if (!password || !verifyAdminPassword(password)) {
    return c.redirect('/login?error=1');
  }
  setCookie(c, COOKIE_NAME, password, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
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
  // Update cookie to new password so admin stays logged in
  setCookie(c, COOKIE_NAME, next, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
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
      <script>window.addEventListener('mett:state', () => location.reload());</script>
    `, undefined);
    return c.html(html);
  }

  const html = layout(civ.name, body, slug);
  return c.html(html);
});

export default pages;
