import { Hono } from 'hono';
import { layout } from '../views/layout.js';
import { renderMain } from '../views/main.js';
import { renderAdmin } from '../views/admin.js';
import { renderCiv } from '../views/civ.js';
import { renderAst } from '../views/ast.js';
import { renderTrade } from '../views/trade.js';
import { getFullState, getAllCivs, getPlayerCensus } from '../db.js';
import { CIVS } from '../civs.js';

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

pages.get('/admin', (c) => {
  const state = getFullState();
  const allCivs = getAllCivs();
  const html = layout('Admin', renderAdmin(state, allCivs), 'admin');
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
