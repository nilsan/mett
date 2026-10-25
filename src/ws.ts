/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ServerWebSocket } from 'bun';
import { getFullState } from './db.js';

export interface WsData {
  id: string;
  /** Set to the player id when the client identifies itself on a `/<slug>`
   *  page. null for non-civ clients (main display, admin, login). Used to
   *  route per-player broadcasts past unrelated civ-page sockets. */
  playerId: number | null;
  /** True for clients that only need to know *that* state changed — the
   *  status page re-fetches its HTML via HTMX and never reads the JSON. They
   *  get a tiny `state_changed` frame instead of the full state. */
  pingOnly: boolean;
}

const clients = new Set<ServerWebSocket<WsData>>();

export function addClient(ws: ServerWebSocket<WsData>): void {
  clients.add(ws);
}

export function removeClient(ws: ServerWebSocket<WsData>): void {
  clients.delete(ws);
}

/** Record what a client is: a specific civ page (playerId) and/or a
 *  ping-only consumer. Called from the Bun message handler in index.ts when
 *  the browser sends `{type:'identify'}`. */
export function identifyClient(ws: ServerWebSocket<WsData>, playerId: number | null, pingOnly = false): void {
  ws.data.playerId = typeof playerId === 'number' ? playerId : null;
  ws.data.pingOnly = pingOnly === true;
}

const PING_MSG = JSON.stringify({ type: 'state_changed' });

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
  // Built lazily: a broadcast that only reaches ping-only sockets skips the
  // full-state query and serialisation entirely.
  let full: string | null = null;
  for (const ws of clients) {
    if (target !== null && ws.data.playerId !== null && ws.data.playerId !== target) continue;
    try {
      ws.send(ws.data.pingOnly ? PING_MSG : (full ??= JSON.stringify({ type: 'state_update', data: buildStatePayload(target) })));
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
