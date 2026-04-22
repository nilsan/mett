import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import api from './routes/api.js';
import pages from './routes/pages.js';
import { addClient, removeClient, broadcastState, type WsData } from './ws.js';
import { getDb } from './db.js';

// Ensure data directory exists
const dbPath = process.env.DATABASE_PATH ?? './data/mett.db';
mkdirSync(dirname(dbPath), { recursive: true });

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
