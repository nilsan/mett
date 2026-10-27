/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Clicks in an advance card picker (renderAdvancePicker): tap a card to hold
// or drop it, and the Monument / Written Record colour chooser. Shared by the
// player's Cards tab and the GM's card correction dialog on the admin page.

import type { CreditChoice, HeldAdvance } from '../shared/advances.js';

export interface PickerBinding {
  /** Whose cards the picker shows right now. */
  playerId: () => number;
  /** The cards that player holds in the latest state. */
  held: () => readonly HeldAdvance[];
  /** Re-render the picker from the latest state (keeps `drafts`). */
  rerender: () => void;
  /** Colour splits being edited, kept across live re-renders. */
  drafts: Map<string, CreditChoice>;
}

/** The button flips at once; the whole held set is sent, and the broadcast
 *  that follows re-renders the picker. */
export function bindPicker(picker: HTMLElement, b: PickerBinding): void {
  picker.addEventListener('click', async (e: Event) => {
    const target = e.target as HTMLElement;
    const chooser = target.closest<HTMLElement>('.adv-choice');
    if (chooser) { await onChooserClick(chooser, target, b); return; }
    const change = target.closest<HTMLButtonElement>('[data-choice-change]');
    if (change) {
      const id = change.dataset.choiceChange!;
      b.drafts.set(id, { ...(b.held().find(h => h.id === id)?.choice ?? {}) });
      b.rerender();
      return;
    }
    const btn = target.closest<HTMLButtonElement>('.adv-pick');
    // Locked (earlier round) or not buyable yet (before calamities).
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    const on = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('adv-held', on);
    const ids = Array.from(picker.querySelectorAll<HTMLButtonElement>('.adv-pick[aria-pressed="true"]'))
      .map(el => el.dataset.advance!);
    const res = await mettPost(`/api/players/${b.playerId()}/advances`, { ids });
    if (!res.ok) {
      btn.setAttribute('aria-pressed', String(!on));
      btn.classList.toggle('adv-held', !on);
    }
  });
}

async function onChooserClick(chooser: HTMLElement, target: HTMLElement, b: PickerBinding): Promise<void> {
  const cardId = chooser.dataset.choiceFor!;
  const total = Number(chooser.dataset.total);
  const read = (): CreditChoice => Object.fromEntries(
    Array.from(chooser.querySelectorAll<HTMLOutputElement>('.adv-choice-val'))
      .map(o => [o.dataset.group!, Number(o.textContent)]).filter(([, n]) => n),
  );
  const step = target.closest<HTMLButtonElement>('[data-choice-step]');
  if (step) {
    const out = chooser.querySelector<HTMLOutputElement>(`.adv-choice-val[data-group="${step.dataset.group}"]`)!;
    const sum = Object.values(read()).reduce((a, n) => a + (n ?? 0), 0);
    const delta = Number(step.dataset.choiceStep);
    const next = Number(out.textContent) + delta;
    if (next < 0 || sum + delta > total) return;
    out.textContent = String(next);
    b.drafts.set(cardId, read());
    const newSum = sum + delta;
    chooser.querySelector('.adv-choice-sum')!.textContent = String(newSum);
    chooser.querySelector<HTMLButtonElement>('.adv-choice-save')!.disabled = newSum !== total;
    return;
  }
  const save = target.closest<HTMLButtonElement>('.adv-choice-save');
  if (!save) return;
  save.disabled = true;
  const res = await mettPost(`/api/players/${b.playerId()}/advances/${cardId}/choice`, { choice: read() });
  if (res.ok) b.drafts.delete(cardId);
  else save.disabled = false;
}
