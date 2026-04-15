/**
 * Main page — live updates via WebSocket state events.
 * When state changes, reload the page (simplest reliable approach for
 * server-rendered HTML; avoids complex client-side diffing).
 */
(function () {
  let currentRound = null;
  let currentRevealed = null;
  let currentPlayerCount = null;

  window.addEventListener('mett:state', () => {
    // A state change occurred — reload to get fresh server-rendered tables.
    // We debounce slightly to avoid thrashing during rapid updates.
    scheduleReload();
  });

  let reloadTimer = null;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      location.reload();
    }, 300);
  }
})();
