/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Clicks in an advance card picker: Buy a card or undo it (the player's
// Cards tab, renderCardList), tap a tile to hold or drop it (the GM's card
// correction dialog, renderAdvancePicker), Confirm or Clear this round's
// purchase (the GM may Reopen a confirmed one), and the Monument / Written
// Record colour chooser.

import type { CreditChoice, HeldAdvance } from '../shared/advances.js';

export interface PickerBinding {
  /** Whose cards the picker shows right now. */
  playerId: () => number;
  /** The cards that player holds in the latest state. */
  held: () => readonly HeldAdvance[];
  /** The round being played. */
  round: () => number;
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
    if (target.closest('.adv-basket-confirm')) {
      // Done buying: the purchase locks now, not when the GM ends the round.
      if (!confirm('Confirm this round’s cards? After this only the GM can change them.')) return;
      await mettPost(`/api/players/${b.playerId()}/advances/confirm`, { confirm: true });
      return;
    }
    if (target.closest('.adv-basket-reopen')) {
      await mettPost(`/api/players/${b.playerId()}/advances/confirm`, { confirm: false });
      return;
    }
    if (target.closest('.adv-basket-clear')) {
      // Untick everything bought this round; the broadcast re-renders.
      await mettPost(`/api/players/${b.playerId()}/advances`, { ids: b.held().filter(h => h.round !== b.round()).map(h => h.id) });
      return;
    }
    const btn = target.closest<HTMLButtonElement>('.adv-pick, .adv-buy');
    if (!btn) return;
    // A Buy button sits in a card row's <summary>: don't open the row too.
    e.preventDefault();
    const on = btn.getAttribute('aria-pressed') !== 'true';
    flip(btn, on);
    // The cards with a button on screen as they now show, plus held cards
    // without one (locked rows on the Cards tab).
    const toggles = Array.from(picker.querySelectorAll<HTMLButtonElement>('[data-advance][aria-pressed]'));
    const shown = new Set(toggles.map(el => el.dataset.advance!));
    const ids = [
      ...toggles.filter(el => el.getAttribute('aria-pressed') === 'true').map(el => el.dataset.advance!),
      ...b.held().map(h => h.id).filter(id => !shown.has(id)),
    ];
    const res = await mettPost(`/api/players/${b.playerId()}/advances`, { ids });
    if (!res.ok) flip(btn, !on);
  });
}

/** Show a card as held or not at once, before the broadcast re-renders. */
function flip(btn: HTMLButtonElement, on: boolean): void {
  btn.setAttribute('aria-pressed', String(on));
  btn.closest('.adv-pick, .adv-ref-item')?.classList.toggle('adv-held', on);
  if (btn.classList.contains('adv-buy')) btn.textContent = on ? '✓ Buying' : 'Buy';
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
