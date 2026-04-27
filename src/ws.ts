import type { ServerWebSocket } from 'bun';
import { getFullState } from './db.js';

export interface WsData {
  id: string;
}

const clients = new Set<ServerWebSocket<WsData>>();

export function addClient(ws: ServerWebSocket<WsData>): void {
  clients.add(ws);
}

export function removeClient(ws: ServerWebSocket<WsData>): void {
  clients.delete(ws);
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

export function broadcastState(targetPlayerId?: number): void {
  broadcast('state_update', buildStatePayload(targetPlayerId ?? null));
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
