import type { ServerWebSocket } from 'bun';
import { getFullState } from './db.js';

export interface WsData {
  id: string;
  /** Set to the player id when the client identifies itself on a `/<slug>`
   *  page. null for non-civ clients (main display, admin, login). Used to
   *  route per-player broadcasts past unrelated civ-page sockets. */
  playerId: number | null;
}

const clients = new Set<ServerWebSocket<WsData>>();

export function addClient(ws: ServerWebSocket<WsData>): void {
  clients.add(ws);
}

export function removeClient(ws: ServerWebSocket<WsData>): void {
  clients.delete(ws);
}

/** Mark a socket as belonging to a specific civ-page client. Called from the
 *  Bun message handler in index.ts when the browser sends `{type:'identify'}`. */
export function identifyClient(ws: ServerWebSocket<WsData>, playerId: number | null): void {
  ws.data.playerId = typeof playerId === 'number' ? playerId : null;
}

export function broadcast(type: string, data?: unknown): void {
  const msg = JSON.stringify({ type, data: data ?? null });
  for (const ws of clients) {
    try {
      ws.send(msg);
    } catch {
      clients.delete(ws);
    }
  }
}

/** Build a state_update payload — shared by broadcastState and per-client pushes.
 *  state.astStatus is precomputed in getFullState(); we only attach the
 *  targetPlayerId routing hint here. */
function buildStatePayload(targetPlayerId: number | null = null) {
  return { ...getFullState(), targetPlayerId };
}

/** Send a state_update. When `targetPlayerId` is set, civ-page sockets owned by
 *  *other* players are skipped — they don't render anything from a state change
 *  that targets a different player. Non-civ clients (playerId === null) and the
 *  targeted player's own socket(s) always receive it. */
export function broadcastState(targetPlayerId?: number): void {
  const target = targetPlayerId ?? null;
  const msg = JSON.stringify({ type: 'state_update', data: buildStatePayload(target) });
  for (const ws of clients) {
    if (target !== null && ws.data.playerId !== null && ws.data.playerId !== target) continue;
    try {
      ws.send(msg);
    } catch {
      clients.delete(ws);
    }
  }
}

/** Push the current state to a single socket — used on WS open so reconnecting
 *  clients refresh immediately instead of waiting for the next server event. */
export function sendInitialState(ws: ServerWebSocket<WsData>): void {
  try {
    ws.send(JSON.stringify({ type: 'state_update', data: buildStatePayload() }));
  } catch {
    clients.delete(ws);
  }
}
