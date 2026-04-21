/**
 * METT WebSocket client — shared by all pages.
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
      console.debug('[METT] WebSocket connected');
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
      console.debug(`[METT] WebSocket closed — reconnecting in ${reconnectDelay}ms`);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    });

    ws.addEventListener('error', () => { ws.close(); });
  }

  connect();

  // Expose a helper for pages that need to re-fetch state on reconnect
  window.mettWs = { reconnect: connect };
})();
