/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// State updates are handled by HTMX (#main-content hx-trigger="mett:state from:window"),
// which re-fetches the rendered page — the JSON state is never read here. Ask
// ws-client.js (loaded after this file) for ping-only frames instead.
window.METT_WS_PING = true;

// ── Keep the TV awake ────────────────────────────────────────────────────────
// The status page is a display nobody touches for hours; without a wake lock
// the TV computer dims or sleeps mid-game. The browser drops the lock whenever
// the page is hidden, so take it again on every return to visible, and on any
// click in case the browser wanted a user gesture first.
(function keepScreenAwake() {
  if (!('wakeLock' in navigator)) return;
  let lock = null;
  async function acquire() {
    if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
    try {
      lock = await navigator.wakeLock.request('screen');
    } catch {
      // Not allowed right now (battery saver, insecure origin, no gesture yet).
    }
  }
  document.addEventListener('visibilitychange', acquire);
  document.addEventListener('click', acquire);
  acquire();
})();

// ── Full-screen toggle ───────────────────────────────────────────────────────
// The button is re-rendered with #main-content on every state change, so the
// click handler is delegated and its visibility hangs off a class on <html>.
if (document.fullscreenEnabled) {
  document.documentElement.classList.add('fs-supported');
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#fullscreen-toggle')) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
}
