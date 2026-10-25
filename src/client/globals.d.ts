/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Global functions exposed by the separately-loaded script bundles.
// api.js sets mettPost + mettFlash; toast.js sets showToast.

declare function mettPost(url: string, body?: unknown): Promise<{ ok: boolean }>;
declare function mettFlash(el: Element | null | undefined): void;
declare function showToast(msg: string): void;

interface Window {
  PLAYER_ID?: number;
  /** Set by main.js on the status page: request ping-only WS frames. */
  METT_WS_PING?: boolean;
  CURRENT_ROUND?: number;
  ALL_CIVS?: Array<{
    id: number;
    number: number;
    name: string;
    color: string;
    text: string;
    defRegion: 'west' | 'east';
  }>;
}
