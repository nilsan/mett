/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// State updates are handled by HTMX (#main-content hx-trigger="mett:state from:window"),
// which re-fetches the rendered page — the JSON state is never read here. Ask
// ws-client.js (loaded after this file) for ping-only frames instead.
window.METT_WS_PING = true;
