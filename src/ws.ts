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

export function broadcastState(): void {
  const state = getFullState();
  broadcast('state_update', state);
}
