/**
 * me[tt] shared API helper. Loaded globally by layout.ts after toast.js.
 *
 * Usage:
 *   const res = await mettPost('/api/players/1/census', { population: 27 });
 *   if (res.ok) { ... }
 *
 * Behavior:
 *   - JSON-encodes the body and sets Content-Type.
 *   - On non-2xx, parses {error} from the response and toasts it.
 *   - On network failure, toasts "Network error" and returns a stub
 *     { ok: false } so callers don't need a try/catch around mettPost itself.
 */
(function () {
  window.mettPost = async function mettPost(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        let msg = 'Request failed';
        try { const d = await res.json(); if (d.error) msg = d.error; } catch {}
        showToast(msg);
      }
      return res;
    } catch {
      showToast('Network error — check connection');
      return { ok: false };
    }
  };
})();
