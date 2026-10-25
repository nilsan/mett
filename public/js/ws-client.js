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

  // Connection-state indicator. Dropped briefly during reconnect attempts
  // (sub-second drops are silent — only show the pill once we've been
  // disconnected long enough for the user to notice page staleness).
  const SHOW_OFFLINE_AFTER_MS = 1500;
  let offlineTimer = null;
  let pillEl = null;

  function ensurePill() {
    if (pillEl) return pillEl;
    pillEl = document.createElement('div');
    pillEl.className = 'mett-offline-pill';
    pillEl.setAttribute('role', 'status');
    pillEl.setAttribute('aria-live', 'polite');
    pillEl.textContent = '● offline — reconnecting…';
    pillEl.hidden = true;
    document.body.appendChild(pillEl);
    return pillEl;
  }

  function showOffline() {
    ensurePill().hidden = false;
  }

  function hideOffline() {
    if (offlineTimer) { clearTimeout(offlineTimer); offlineTimer = null; }
    if (pillEl) pillEl.hidden = true;
  }

  function scheduleOffline() {
    if (offlineTimer) return;
    offlineTimer = setTimeout(() => { offlineTimer = null; showOffline(); }, SHOW_OFFLINE_AFTER_MS);
  }

  function connect() {
    // Never stack sockets: a pending reconnect timer and a manual reconnect()
    // call would otherwise each open one.
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.addEventListener('open', () => {
      reconnectDelay = 1000;
      hideOffline();
      console.debug('[me[tt]] WebSocket connected');
      // Tell the server which civ page we're on so per-player broadcasts can
      // route past unrelated civ sockets. Non-civ pages (main, admin, login)
      // leave PLAYER_ID undefined; the server's playerId stays null and they
      // receive every broadcast (the default behaviour). Pages that only
      // re-fetch HTML on change (METT_WS_PING, the status page) ask for
      // lightweight `state_changed` frames instead of the full state.
      const myId = window.PLAYER_ID != null ? Number(window.PLAYER_ID) : null;
      const ping = window.METT_WS_PING === true;
      if (myId !== null || ping) {
        try { ws.send(JSON.stringify({ type: 'identify', playerId: myId, ping })); } catch {}
      }
    });

    ws.addEventListener('message', (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'state_changed') {
        // Ping-only client: no payload, just re-fetch.
        window.dispatchEvent(new CustomEvent('mett:state'));
        window.dispatchEvent(new CustomEvent('mett:my-state'));
      } else if (msg.type === 'state_update') {
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
      scheduleOffline();
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    });

    ws.addEventListener('error', () => { ws.close(); });
  }

  connect();

  // Expose a helper for pages that need to re-fetch state on reconnect
  window.mettWs = { reconnect: connect };
})();
