import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import api from './routes/api.js';
import pages from './routes/pages.js';
import { addClient, removeClient, broadcastState, sendInitialState, identifyClient, type WsData } from './ws.js';
import { getDb } from './db.js';
import { DB_PATH } from './services/db.js';

// Ensure data directory exists alongside the DB file the service will open.
mkdirSync(dirname(DB_PATH), { recursive: true });

// Write PID file for easy process management
writeFileSync('.pid', String(process.pid));

// Initialise DB (runs schema)
getDb();

const app = new Hono();

// Request logger — runs first so even 404s and errors get a line. Skips static
// asset paths so the log isn't drowned in /css/ + /js/ noise.
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/css/') || path.startsWith('/js/')) return next();
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  // ISO timestamp + method + path + status + duration. Single line, parseable.
  console.log(`${new Date().toISOString()} ${c.req.method.padEnd(4)} ${path} ${status} ${ms}ms`);
});

// Static files — no-store so browsers always fetch fresh after server-side changes
app.use('/css/*', async (c, next) => { await next(); c.res.headers.set('Cache-Control', 'no-store'); });
app.use('/js/*', async (c, next) => { await next(); c.res.headers.set('Cache-Control', 'no-store'); });
app.use('/css/*', serveStatic({ root: './public' }));
app.use('/js/*', serveStatic({ root: './public' }));

// API routes
app.route('/api', api);

// Page routes
app.route('/', pages);

// 404 handler — JSON for API paths, minimal HTML otherwise
app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not found' }, 404);
  }
  return c.html('<!doctype html><meta charset="utf-8"><title>Not found</title><p>Not found. <a href="/">Back to overview</a>.</p>', 404);
});

// Top-level error handler — never leak stack traces to clients. Same line
// format as the request logger above so log scrapers can match either by
// timestamp + path; the ERROR marker + stack trace come on the next lines.
app.onError((err, c) => {
  console.error(`${new Date().toISOString()} ERROR ${c.req.method} ${c.req.path}`);
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Internal server error' }, 500);
  }
  return c.html('<!doctype html><meta charset="utf-8"><title>Error</title><p>Something went wrong. <a href="/">Back to overview</a>.</p>', 500);
});

const PORT = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port: PORT,
  hostname: '0.0.0.0',
  fetch(req, server) {
    // Upgrade WebSocket connections
    if (req.headers.get('upgrade') === 'websocket') {
      const id = crypto.randomUUID();
      const upgraded = server.upgrade(req, { data: { id, playerId: null } } as never);
      if (upgraded) return undefined;
      return new Response('WebSocket upgrade failed', { status: 500 });
    }
    return app.fetch(req, { server });
  },
  websocket: {
    open(ws) {
      addClient(ws as any);
      sendInitialState(ws as any);
    },
    message(ws, msg) {
      // The only client message we accept is `{type:'identify',playerId}` —
      // sent by ws-client.js on civ pages so per-player broadcasts can route
      // past unrelated civ sockets.
      try {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : null;
        if (parsed?.type === 'identify') {
          identifyClient(ws as any, typeof parsed.playerId === 'number' ? parsed.playerId : null);
        }
      } catch {
        // Ignore malformed payloads — clients are otherwise receive-only.
      }
    },
    close(ws) {
      removeClient(ws as any);
    },
  },
});

console.log(`me[tt] running on http://localhost:${PORT}`);
