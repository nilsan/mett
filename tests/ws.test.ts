/**
 * WebSocket broadcast tests:
 *   1. Payload contract — `state_update` carries the full state shape plus a
 *      `targetPlayerId` routing hint.
 *   2. Routing — broadcastState(playerId) skips civ-page sockets owned by other
 *      players; non-civ sockets (playerId === null) and the targeted player's
 *      own sockets always receive it.
 *
 * Drives ws.ts directly with a minimal ServerWebSocket-shaped fake. No live
 * server, no real Bun.serve.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { ServerWebSocket } from 'bun';

import { makeDb, addPlayer } from './_helpers.js';
import { _setTestDb } from '../src/services/db.js';
import { addClient, removeClient, broadcastState, type WsData } from '../src/ws.js';

interface FakeSocket {
  data: WsData;
  sent: string[];
}

function fakeWs(playerId: number | null = null): FakeSocket & ServerWebSocket<WsData> {
  const sent: string[] = [];
  return {
    data: { id: `id-${Math.random()}`, playerId },
    sent,
    send: (msg: string | Buffer) => { sent.push(typeof msg === 'string' ? msg : msg.toString()); return 1; },
  } as unknown as FakeSocket & ServerWebSocket<WsData>;
}

function lastPayload(ws: FakeSocket & ServerWebSocket<WsData>): any {
  const raw = ws.sent[ws.sent.length - 1];
  return raw ? JSON.parse(raw) : null;
}

describe('broadcastState — payload contract', () => {
  beforeEach(() => { _setTestDb(makeDb()); });

  it('global broadcast carries state_update with all top-level keys + targetPlayerId=null', () => {
    const ws = fakeWs(null);
    addClient(ws);

    broadcastState();

    const msg = lastPayload(ws);
    expect(msg.type).toBe('state_update');
    expect(msg.data).toEqual(expect.objectContaining({
      game: expect.any(Object),
      players: expect.any(Array),
      census: expect.any(Array),
      astLevels: expect.any(Array),
      astStatus: expect.any(Object),
      targetPlayerId: null,
    }));

    removeClient(ws);
  });

  it('targeted broadcast sets targetPlayerId to the passed player id', () => {
    const db = makeDb();
    _setTestDb(db);
    const pid = addPlayer(db, 17, 'Egypt');

    const ws = fakeWs(null);
    addClient(ws);

    broadcastState(pid);

    expect(lastPayload(ws).data.targetPlayerId).toBe(pid);
    removeClient(ws);
  });
});

describe('broadcastState — per-player routing', () => {
  beforeEach(() => { _setTestDb(makeDb()); });

  it('global broadcast reaches every connected socket regardless of playerId', () => {
    const main = fakeWs(null);     // status/admin page
    const civA = fakeWs(1);
    const civB = fakeWs(2);
    addClient(main); addClient(civA); addClient(civB);

    broadcastState();

    expect(main.sent).toHaveLength(1);
    expect(civA.sent).toHaveLength(1);
    expect(civB.sent).toHaveLength(1);

    removeClient(main); removeClient(civA); removeClient(civB);
  });

  it('targeted broadcast skips civ-page sockets owned by a different player', () => {
    const main = fakeWs(null);
    const civA = fakeWs(1);
    const civB = fakeWs(2);
    addClient(main); addClient(civA); addClient(civB);

    broadcastState(1); // target player 1 — civB (player 2) must not receive

    expect(main.sent).toHaveLength(1); // main always gets it
    expect(civA.sent).toHaveLength(1); // own socket gets it
    expect(civB.sent).toHaveLength(0); // skipped

    removeClient(main); removeClient(civA); removeClient(civB);
  });

  it('a player with two open tabs receives the broadcast on both', () => {
    const tabA = fakeWs(7);
    const tabB = fakeWs(7);
    addClient(tabA); addClient(tabB);

    broadcastState(7);

    expect(tabA.sent).toHaveLength(1);
    expect(tabB.sent).toHaveLength(1);

    removeClient(tabA); removeClient(tabB);
  });
});
