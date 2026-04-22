import type { ServerWebSocket } from 'bun';
import { getFullState } from './db.js';
import { nextAstStatus } from './models/ast.js';

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

/** Build a state_update payload — shared by broadcastState and per-client pushes. */
function buildStatePayload(targetPlayerId: number | null = null) {
  const state = getFullState();
  const expert = state.game.expert === 1;
  const astStatus: Record<number, string> = {};
  for (const player of state.players) {
    const c = state.census.find(r => r.player_id === player.id);
    astStatus[player.id] = nextAstStatus(player, c?.city_count, state.astLevels, expert);
  }
  return { ...state, astStatus, targetPlayerId };
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
