import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { layout } from '../views/layout.js';
import { renderMain } from '../views/main.js';
import { renderAdmin } from '../views/admin.js';
import { renderCiv } from '../views/civ.js';
import { renderAst } from '../views/ast.js';
import { renderTrade } from '../views/trade.js';
import { getFullState, getAllCivs, getPlayerCensus, getCensusForRound, getAdminPassword, setAdminPassword } from '../db.js';
import { CIVS } from '../civs.js';

const COOKIE_NAME = 'mett_admin';

export function isAdminAuthed(req: Request): boolean {
  const password = getAdminPassword();
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(/(?:^|;\s*)mett_admin=([^;]*)/);
  return match?.[1] === password;
}

const pages = new Hono();

// Force browsers to revalidate HTML on every load — state changes server-side on every action
pages.use('*', async (c, next) => {
  await next();
  c.res.headers.set('Cache-Control', 'no-cache, no-store');
});

pages.get('/', (c) => {
  const state = getFullState();
  const html = layout('Mega Empires Turn Tracker', renderMain(state), 'main');
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
  const stored = getAdminPassword();
  if (stored && password !== stored) {
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
  const stored = getAdminPassword();
  if (stored && current !== stored) {
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
  const html = layout('Admin', renderAdmin(state, allCivs, c.req.url, prevCensus), 'admin');
  return c.html(html);
});

pages.get('/ast', (c) => {
  const state = getFullState();
  const html = layout('A.S.T.', renderAst(state), 'ast');
  return c.html(html);
});

pages.get('/trade', (c) => {
  const state = getFullState();
  const html = layout('Trade', renderTrade(state), 'trade');
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
