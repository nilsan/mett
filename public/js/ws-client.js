/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * me[tt] WebSocket client — shared by all pages.
 * Connects to the server, auto-reconnects on disconnect,
 * and dispatches a CustomEvent('mett:state') on every update.
 */
(function () {
  let ws = null;
  let reconnectDelay = 1000;
  const MAX_DELAY = 30000;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.addEventListener('open', () => {
      reconnectDelay = 1000;
      console.debug('[me[tt]] WebSocket connected');
      // Tell the server which civ page we're on so per-player broadcasts can
      // route past unrelated civ sockets. Non-civ pages (main, admin, login)
      // leave PLAYER_ID undefined; the server's playerId stays null and they
      // receive every broadcast (the default behaviour).
      const myId = window.PLAYER_ID != null ? Number(window.PLAYER_ID) : null;
      if (myId !== null) {
        try { ws.send(JSON.stringify({ type: 'identify', playerId: myId })); } catch {}
      }
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'state_update') {
        const targetPlayerId = msg.data?.targetPlayerId ?? null;
        window.dispatchEvent(new CustomEvent('mett:state', { detail: msg.data }));
        // mett:my-state: only fires when relevant to this player page (or for global events)
        const myId = window.PLAYER_ID != null ? Number(window.PLAYER_ID) : null;
        if (myId === null || targetPlayerId === null || targetPlayerId === myId) {
          window.dispatchEvent(new CustomEvent('mett:my-state', { detail: msg.data }));
        }
      }
    });

    ws.addEventListener('close', () => {
      console.debug(`[me[tt]] WebSocket closed — reconnecting in ${reconnectDelay}ms`);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    });

    ws.addEventListener('error', () => { ws.close(); });
  }

  connect();

  // Expose a helper for pages that need to re-fetch state on reconnect
  window.mettWs = { reconnect: connect };
})();
