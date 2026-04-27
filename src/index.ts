import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import api from './routes/api.js';
import pages from './routes/pages.js';
import { addClient, removeClient, broadcastState, sendInitialState, type WsData } from './ws.js';
import { getDb } from './db.js';
import { DB_PATH } from './services/db.js';

// Ensure data directory exists alongside the DB file the service will open.
mkdirSync(dirname(DB_PATH), { recursive: true });

// Write PID file for easy process management
writeFileSync('.pid', String(process.pid));

// Initialise DB (runs schema)
getDb();

const app = new Hono();

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

// Top-level error handler — never leak stack traces to clients
app.onError((err, c) => {
  console.error(`[me[tt]] ${c.req.method} ${c.req.path} →`, err);
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
      const upgraded = server.upgrade(req, { data: { id } } as never);
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
    message(_ws, _msg) {
      // Clients are receive-only for now
    },
    close(ws) {
      removeClient(ws as any);
    },
  },
});

console.log(`me[tt] running on http://localhost:${PORT}`);
