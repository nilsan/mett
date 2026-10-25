/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Hono, type Context, type Next } from 'hono';
import { serveStatic } from 'hono/bun';
import { etag } from 'hono/etag';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import api from './routes/api.js';
import pages from './routes/pages.js';
import { addClient, removeClient, sendInitialState, identifyClient } from './ws.js';
import { getDb } from './db.js';
import { DB_PATH } from './services/db.js';

// Ensure data directory exists alongside the DB file the service will open.
mkdirSync(dirname(DB_PATH), { recursive: true });

// Write PID file for local dev process management. Skipped in production: the
// container runs as an unprivileged user that can't write to /app.
if (process.env.NODE_ENV !== 'production') writeFileSync('.pid', String(process.pid));

// Initialise DB (runs schema)
getDb();

const app = new Hono();

// Request logger — runs first so even 404s and errors get a line. Skips static
// asset paths so the log isn't drowned in /css/ + /js/ noise.
app.use('*', async (c, next) => {
  const path = c.req.path;
  if (path.startsWith('/css/') || path.startsWith('/js/') || path.startsWith('/vendor/') || path === '/healthz') return next();
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  const status = c.res.status;
  // ISO timestamp + method + path + status + duration. Single line, parseable.
  console.log(`${new Date().toISOString()} ${c.req.method.padEnd(4)} ${path} ${status} ${ms}ms`);
});

// Static files — ETag + no-cache: browsers keep a copy but revalidate on every
// load, so an edited file is picked up immediately (dev, deploys) while an
// unchanged one costs only a 304.
const revalidate = async (c: Context, next: Next) => { await next(); c.res.headers.set('Cache-Control', 'no-cache'); };
for (const prefix of ['/css/*', '/js/*', '/vendor/*']) app.use(prefix, revalidate, etag());
app.use('/css/*', serveStatic({ root: './public' }));
app.use('/js/*', serveStatic({ root: './public' }));
// Third-party front-end libraries, served from node_modules so their versions
// live in package.json/bun.lock (audited, updatable) and the app needs no CDN.
app.get('/vendor/htmx.min.js', serveStatic({ path: './node_modules/htmx.org/dist/htmx.min.js' }));
app.get('/vendor/pico.min.css', serveStatic({ path: './node_modules/@picocss/pico/css/pico.min.css' }));

// Liveness probe for the container HEALTHCHECK — also proves the DB answers.
app.get('/healthz', (c) => {
  getDb().query('SELECT 1').get();
  return c.text('ok');
});

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
      const upgraded = server.upgrade(req, { data: { id, playerId: null, pingOnly: false } } as never);
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
      // The only client message we accept is `{type:'identify',playerId,ping}`
      // — sent by ws-client.js so per-player broadcasts can route past
      // unrelated civ sockets, and the status page gets ping frames only.
      try {
        const parsed = typeof msg === 'string' ? JSON.parse(msg) : null;
        if (parsed?.type === 'identify') {
          identifyClient(ws as any, typeof parsed.playerId === 'number' ? parsed.playerId : null, parsed.ping === true);
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
