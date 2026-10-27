/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Admin page — the game setup wizard and the active-game GM controls.
 * Bundled by Bun into public/js/admin.js (see `bun run build:client`).
 */

import type { FullState, Region } from '../types.js';
import type { SetupRecommendation } from '../civs.js';
import type { CreditChoice } from '../shared/advances.js';
import { renderAdvancePicker } from '../shared/advance-picker.js';
import { bindPicker } from './picker.js';

type AdminCiv = NonNullable<Window['ALL_CIVS']>[number];
type SelectedCiv = AdminCiv & { region: Region };

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const qsa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T & Element>(sel)) as T[];
const checkedValue = (name: string, fallback: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? fallback;

// ── Shared: Change Password toggle (all pages) ────────────────────────────
const pwdToggle = byId('pwd-toggle');
const pwdFormWrap = byId('pwd-form-wrap');
if (pwdToggle && pwdFormWrap) {
  // If form is already visible (error/ok state), reflect that in button text
  if (pwdFormWrap.style.display !== 'none') pwdToggle.textContent = 'Hide Password Form';
  pwdToggle.addEventListener('click', () => {
    const visible = pwdFormWrap.style.display !== 'none';
    pwdFormWrap.style.display = visible ? 'none' : '';
    pwdToggle.textContent = visible ? 'Change Password' : 'Hide Password Form';
  });
}

// ── Detect which mode we're in ─────────────────────────────────────────────
if (byId('player-count')) initSetup();
else initActive();

/** Show/hide a dev section with a toggle button, remembering the choice for the tab. */
function bindVisibilityToggle(toggleId: string, sectionId: string, storageKey: string, showText: string, hideText: string): void {
  const toggle = byId(toggleId);
  const section = byId(sectionId);
  if (!toggle || !section) return;
  if (sessionStorage.getItem(storageKey) === '1') {
    section.style.display = '';
    toggle.textContent = hideText;
  }
  toggle.addEventListener('click', () => {
    const visible = section.style.display !== 'none';
    section.style.display = visible ? 'none' : '';
    toggle.textContent = visible ? showText : hideText;
    sessionStorage.setItem(storageKey, visible ? '0' : '1');
  });
}

// ─────────────────────────────────────────────────────────────────────────
// SETUP WIZARD
// ─────────────────────────────────────────────────────────────────────────
function initSetup(): void {
  const allCivs = window.ALL_CIVS ?? [];  // injected by server
  type Scenarios = Record<'west' | 'east' | 'combined', Record<number, SetupRecommendation>>;
  let scenarioData: Scenarios = { west: {}, east: {}, combined: {} };
  let currentSelection: SelectedCiv[] = [];

  const playerCountSelect = byId<HTMLSelectElement>('player-count')!;
  const scenarioToggleRow = byId('scenario-toggle-row')!;
  const hintEl = byId('setup-hint')!;
  const nameSection = byId('name-section')!;
  const nameInputsEl = byId('name-inputs')!;
  const startBtn = byId<HTMLButtonElement>('start-game')!;
  const errorEl = byId('start-error')!;

  fetch('/api/setup-recommendations')
    .then(r => r.json() as Promise<Scenarios>)
    .then(data => {
      scenarioData = data;
      applyRecommendation();
    });

  playerCountSelect.addEventListener('change', () => {
    const n = parseInt(playerCountSelect.value, 10);
    scenarioToggleRow.style.display = n <= 9 ? '' : 'none';
    applyRecommendation();
  });

  qsa<HTMLInputElement>('input[name="scenario"]').forEach(radio => {
    radio.addEventListener('change', () => applyRecommendation());
  });

  function getScenario(): SetupRecommendation | null {
    const n = parseInt(playerCountSelect.value, 10);
    if (n >= 10) return scenarioData.combined[n] ?? null;
    const side = checkedValue('scenario', 'west') === 'east' ? 'east' : 'west';
    return scenarioData[side][n] ?? null;
  }

  function applyRecommendation(): void {
    const rec = getScenario();
    if (!rec) {
      hintEl.textContent = '';
      currentSelection = [];
      renderNameInputs();
      return;
    }
    currentSelection = rec.civNumbers
      .map((num): SelectedCiv | null => {
        const civ = allCivs.find(c => c.number === num);
        if (!civ) return null;
        return { ...civ, region: rec.regionOverrides[num] ?? civ.defRegion };
      })
      .filter((c): c is SelectedCiv => c !== null)
      .sort((a, b) => a.number - b.number);

    hintEl.textContent = rec.note ?? '';
    renderNameInputs();
  }

  function renderNameInputs(): void {
    if (currentSelection.length === 0) {
      nameSection.style.display = 'none';
      startBtn.disabled = true;
      return;
    }

    // Preserve typed names across re-renders
    const saved: Record<string, string> = {};
    qsa<HTMLInputElement>('.name-text-input').forEach(inp => {
      if (inp.value.trim()) saved[inp.dataset.civId!] = inp.value.trim();
    });

    nameSection.style.display = '';
    const grid = document.createElement('div');
    grid.className = 'name-inputs-grid2';

    currentSelection.forEach(civ => {
      const row = document.createElement('div');
      row.className = 'name-input-row';

      const tag = document.createElement('span');
      tag.className = 'name-civ-tag';
      tag.style.background = civ.color;
      tag.style.color = civ.text;
      tag.textContent = civ.name;

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'name-text-input';
      input.placeholder = 'Player name';
      input.autocomplete = 'off';
      input.dataset.civId = String(civ.id);
      input.dataset.region = civ.region;
      input.maxLength = 40;
      const prev = saved[civ.id];
      if (prev) input.value = prev;

      row.appendChild(tag);
      row.appendChild(input);
      grid.appendChild(row);
    });

    nameInputsEl.replaceChildren(grid);
    startBtn.disabled = false;
  }

  // DEV: toggle sim section visibility
  bindVisibilityToggle('setup-sim-toggle', 'setup-sim-section', 'setupSimVisible', 'Show Dev Tools', 'Hide Dev Tools');

  // DEV: rounds slider display
  const simRoundsSlider = byId<HTMLInputElement>('sim-rounds');
  const simRoundsDisplay = byId('sim-rounds-display');
  if (simRoundsSlider && simRoundsDisplay) {
    simRoundsSlider.addEventListener('input', () => {
      simRoundsDisplay.textContent = simRoundsSlider.value;
    });
  }

  // DEV: simulate game
  const simBtn = byId<HTMLButtonElement>('sim-game');
  if (simBtn) {
    simBtn.addEventListener('click', async () => {
      const origText = simBtn.textContent;
      simBtn.disabled = true;
      simBtn.textContent = 'Simulating…';
      const n = parseInt(playerCountSelect.value, 10);
      const expert = parseInt(checkedValue('game-mode', '1'), 10);
      const rounds = parseInt(simRoundsSlider?.value ?? '8', 10);
      const scenario = n <= 9 ? checkedValue('scenario', 'west') : 'combined';
      const res = await mettPost('/api/debug/simulate', { expert, player_count: n, rounds, scenario, delay_ms: 300 });
      if (res.ok) location.reload();
      else { simBtn.textContent = origText; simBtn.disabled = false; }
    });
  }

  startBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const players = qsa<HTMLInputElement>('.name-text-input').map(inp => ({
      civ_id: parseInt(inp.dataset.civId!, 10),
      name: inp.value.trim() || inp.placeholder,
      region: inp.dataset.region,
    }));
    if (!players.length) { errorEl.textContent = 'Select a player count first.'; return; }

    const expert = parseInt(checkedValue('game-mode', '1'), 10);
    startBtn.disabled = true;
    const res = await mettPost('/api/game/start', { expert, players });
    if (res.ok) location.reload();
    else startBtn.disabled = false;  // mettPost already toasted the failure reason
  });
}

// ─────────────────────────────────────────────────────────────────────────
// ACTIVE GAME ADMIN
// ─────────────────────────────────────────────────────────────────────────
function initActive(): void {
  // Advance round. The button text is 'End Game' on the announced final
  // round in expert mode — irreversible from the UI, so confirm first.
  const advanceBtn = byId<HTMLButtonElement>('advance-round');
  if (advanceBtn) {
    advanceBtn.addEventListener('click', async () => {
      const isEndGame = (advanceBtn.textContent ?? '').trim().startsWith('End Game');
      if (isEndGame && !confirm('End the game now? Final scores will be revealed and the round counter stops here.')) return;
      advanceBtn.disabled = true;
      await mettPost('/api/game/round/next', {});
      location.reload();
    });
  }

  // Prepare for AST — clear city counts, switch to post-calamity phase
  const prepareAstBtn = byId<HTMLButtonElement>('prepare-ast');
  if (prepareAstBtn) {
    prepareAstBtn.addEventListener('click', async () => {
      prepareAstBtn.disabled = true;
      await mettPost('/api/game/cities/clear', {});
      location.reload();
    });
  }

  // Reset game
  byId('reset-game')?.addEventListener('click', async () => {
    if (!confirm('Reset the game? All current game data will be permanently deleted.')) return;
    await mettPost('/api/game/reset', { confirm: true });
    location.reload();
  });

  // ── Simulation toggle (danger zone btn → round section buttons) ──────────
  bindVisibilityToggle('sim-toggle', 'sim-controls', 'simVisible', 'Show Simulation', 'Hide Simulation');
  byId('debug-census')?.addEventListener('click', () => mettPost('/api/debug/census', {}));
  byId('debug-cities')?.addEventListener('click', () => mettPost('/api/debug/cities', {}));
  byId('debug-advances')?.addEventListener('click', () => mettPost('/api/debug/advances', {}));

  // Misclick recovery: restore the backup taken right before this round
  // started, which undoes the whole advance (A.S.T. moves, bonuses, flags).
  byId('undo-round')?.addEventListener('click', async () => {
    if (!confirm('Undo the last round advance? The game goes back to exactly how it was before "Next round" was clicked.')) return;
    const res = await mettPost('/api/game/round/undo', {});
    if (res.ok) location.reload();
  });

  // Backups: restore any listed snapshot (a backup of the current state is
  // taken first, so this is itself undoable from the same list).
  qsa<HTMLButtonElement>('.backup-restore').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Restore the backup "${btn.dataset.label}"? The current game state is backed up first.`)) return;
      const res = await mettPost('/api/backups/restore', { file: btn.dataset.file });
      if (res.ok) location.reload();
    });
  });
  qsa<HTMLTimeElement>('time[data-local]').forEach(t => {
    t.textContent = new Date(t.dateTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  });

  // Player name edits (on blur)
  qsa<HTMLInputElement>('.player-name-input').forEach(inp => {
    let originalValue = inp.value;
    inp.addEventListener('focus', () => { originalValue = inp.value; });
    inp.addEventListener('blur', async () => {
      if (inp.value.trim() === originalValue.trim()) return;
      await mettPost(`/api/players/${inp.dataset.playerId}/name`, { name: inp.value.trim() || originalValue });
    });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  // AST controls
  qsa<HTMLSelectElement>('.ast-select').forEach(sel => {
    sel.value = sel.dataset.serverValue ?? '';  // bypass browser form restoration
    sel.addEventListener('change', async () => {
      await mettPost(`/api/players/${sel.dataset.playerId}/ast`, { level: parseInt(sel.value, 10) });
    });
  });

  // Calamity regression — drop the empire one AST step. The WS broadcast
  // updates the AST select, the movement indicator, and the status board's
  // red token marker; here we only disable the button while in-flight.
  qsa<HTMLButtonElement>('.regress-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.disabled) return;
      btn.disabled = true;
      const res = await mettPost(`/api/players/${btn.dataset.playerId}/regress`, {});
      if (!res.ok) btn.disabled = false;  // else the mett:state handler re-syncs it
    });
  });

  // Tie-break rank dropdowns (game-over view)
  qsa<HTMLSelectElement>('select.rank-select').forEach(sel => {
    // Explicitly override Firefox form-state restoration with server-provided value
    sel.value = sel.dataset.serverValue ?? '';

    sel.addEventListener('change', async () => {
      const chosen = sel.value;
      if (!chosen) return;
      const groupPlayers = (sel.dataset.groupPlayers ?? '').split(',').map(Number);
      const groupPositions = (sel.dataset.groupKey ?? '').split(',').map(Number);
      await mettPost(`/api/players/${sel.dataset.playerId}/rank`, {
        rank_order: parseInt(chosen, 10),
        group_players: groupPlayers,
        group_positions: groupPositions,
      });
      // Use navigation instead of reload to prevent Firefox restoring old form state
      window.location.replace(window.location.pathname);
    });
  });

  // Census inputs — override browser form restoration from server value.
  // Commit on both `change` and `blur`: `change` fires on the native up/down
  // spinner (and Enter / keyboard), which never blurs the field, so a blur-only
  // handler would silently drop spinner edits. The `original` guard dedupes the
  // change→blur double-fire when typing then tabbing out.
  qsa<HTMLInputElement>('input.census-admin-input').forEach(inp => {
    inp.value = inp.dataset.serverValue ?? '';  // force server value, bypass browser restore
    let original = inp.value;
    async function commit(): Promise<void> {
      const raw = inp.value.trim();
      if (raw === original.trim()) return;
      if (raw === '') { inp.value = original; return; }
      let val = parseInt(raw, 10);
      if (isNaN(val)) { inp.value = original; return; }
      if (val < 0) val = 55 + val;  // negative shorthand
      if (val < 1 || val > 55) { inp.value = original; return; }
      inp.value = String(val);
      original = String(val);
      await mettPost(`/api/players/${inp.dataset.playerId}/census`, { population: val });
    }
    inp.addEventListener('focus', () => { original = inp.value; });
    inp.addEventListener('change', commit);
    inp.addEventListener('blur', commit);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
  });

  // City count dropdowns — submit on change
  qsa<HTMLSelectElement>('select.city-admin-select').forEach(sel => {
    if (sel.dataset.serverValue) sel.value = sel.dataset.serverValue;
    sel.addEventListener('change', async () => {
      const val = parseInt(sel.value, 10);
      if (isNaN(val) || val < 0 || val > 9) return;
      await mettPost(`/api/players/${sel.dataset.playerId}/city-count`, { city_count: val });
    });
  });

  // Late Iron Age bonus star toggle. Skip the lia-star-ineligible spans
  // (rendered for players below LIA threshold) — they aren't <button>s.
  qsa<HTMLButtonElement>('button.lia-star-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const currentlyGranted = btn.dataset.granted === '1';
      await mettPost(`/api/players/${btn.dataset.playerId}/late-iron-age-bonus`, { grant: !currentlyGranted });
      // No reload — the WS broadcast updates every star button in place
      // via the mett:state handler below.
    });
  });

  // GM card correction: Adv VP opens a player's cards in a dialog, where
  // every card can be ticked or unticked (locked or not, in any phase) and
  // a colour choice changed. Saves go through the admin session.
  const gmDialog = document.getElementById('gm-cards') as HTMLDialogElement | null;
  const gmPicker = document.getElementById('gm-picker');
  let gmPlayer = 0;
  let gmState: FullState | null = null;
  const gmDrafts = new Map<string, CreditChoice>();
  const renderGmCards = () => {
    if (!gmPicker || !gmState || !gmDialog?.open) return;
    gmPicker.innerHTML = renderAdvancePicker(gmState.advances[gmPlayer] ?? [], gmState.game.current_round,
      { canBuy: true, gm: true, drafts: gmDrafts });
  };
  if (gmDialog && gmPicker) {
    bindPicker(gmPicker, {
      playerId: () => gmPlayer,
      held: () => gmState?.advances[gmPlayer] ?? [],
      rerender: renderGmCards,
      drafts: gmDrafts,
    });
    qsa<HTMLButtonElement>('.adv-pts-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        gmPlayer = Number(btn.dataset.playerId);
        gmDrafts.clear();
        document.getElementById('gm-cards-title')!.textContent = `Correct cards: ${btn.dataset.civName}`;
        gmState = await (await fetch('/api/state')).json() as FullState;
        gmDialog.showModal();
        renderGmCards();
      });
    });
    gmDialog.querySelector('.gm-cards-close')!.addEventListener('click', () => gmDialog.close());
  }

  // React to state updates from WebSocket — update in place instead of reloading
  window.addEventListener('mett:state', (e: Event) => {
    const data = (e as CustomEvent<FullState | undefined>).detail;
    if (!data?.game || !data?.census || !data?.players) return;
    gmState = data;
    renderGmCards();

    const n = data.players.length;
    const censusCount = data.census.filter(c => c.population != null).length;
    const citiesCount = data.census.filter(c => c.city_count != null).length;
    const revealed = data.game.census_revealed === 1;
    const citiesPhase = data.game.cities_phase === 1;
    const allCitiesReady = n > 0 && citiesCount === n;

    // If the phase changed under us (e.g. census auto-revealed when the last
    // population came in), reload so the stepper + action button re-render for
    // the new phase. GM-initiated transitions already reload.
    const serverPhase = !revealed ? 0 : !citiesPhase ? 1 : 2;
    const sec = document.querySelector<HTMLElement>('.round-section');
    if (sec && Number(sec.dataset.phase) !== serverPhase) { location.reload(); return; }

    // Same phase — just refresh the current-phase submission count + button.
    const progEl = byId('round-progress-count');
    if (progEl) progEl.textContent = `${serverPhase === 0 ? censusCount : citiesCount}/${n}`;

    const prepBtn = byId<HTMLButtonElement>('prepare-ast');
    const advBtn = byId<HTMLButtonElement>('advance-round');
    if (prepBtn) prepBtn.disabled = !allCitiesReady;
    if (advBtn) advBtn.disabled = !allCitiesReady;

    for (const p of data.players) {
      const row = document.querySelector<HTMLElement>(`tr[data-player-id="${p.id}"]`);
      if (!row) continue;

      // Per-player AST movement indicator (green → advance, orange = no
      // change, red ← regress, · unknown).
      const status = data.astStatus?.[p.id] ?? 'unknown';
      const move = row.querySelector<HTMLElement>('.ast-move');
      if (move) {
        move.className = `ast-move ast-move-${status}`;
        move.title = status === 'advance' ? 'Will advance' : status === 'regress' ? 'Will regress' : status === 'stay' ? 'Requirements not met' : 'Post-calamity city count unknown';
        move.textContent = status === 'advance' ? '→' : status === 'regress' ? '←' : status === 'stay' ? '=' : '·';
      }

      // Sync AST level select + calamity regression button from server state.
      // A regression (or manual set) lands here so the dropdown and the button's
      // disabled/active state stay authoritative without a full reload. Guard the
      // select value on focus so we don't clobber a GM mid-selection.
      const astSel = row.querySelector<HTMLSelectElement>('.ast-select');
      if (astSel) {
        astSel.dataset.serverValue = String(p.ast_level);
        if (document.activeElement !== astSel) astSel.value = String(p.ast_level);
      }
      const reg = row.querySelector<HTMLButtonElement>('.regress-btn');
      if (reg) {
        reg.disabled = p.ast_level === 0;
        reg.classList.toggle('regress-active', !!p.regressed);
      }

      // The advance VP follows the player's cards, which change on the
      // player pages.
      const pts = row.querySelector<HTMLElement>('.adv-pts-btn');
      if (pts) pts.textContent = String(p.adv_points);

      // LIA-star buttons. Granting the bonus to one player clears it from any
      // others, so every eligible button is refreshed on every broadcast.
      const lia = row.querySelector<HTMLButtonElement>('.lia-star-btn');
      if (lia && lia.tagName === 'BUTTON') {
        const granted = !!p.late_iron_age_bonus;
        lia.className = `lia-star-btn ${granted ? 'lia-star-on' : 'lia-star-off'}`;
        lia.dataset.granted = granted ? '1' : '0';
        lia.title = granted ? 'LIA bonus (5VP) — click to remove' : 'Grant LIA bonus (5VP)';
        lia.setAttribute('aria-pressed', granted ? 'true' : 'false');
        lia.setAttribute(
          'aria-label',
          granted ? `Remove Late Iron Age bonus (5 VP) from ${p.name}` : `Grant Late Iron Age bonus (5 VP) to ${p.name}`,
        );
        lia.disabled = false;
      }
    }

    // Per-player census and city status icons
    for (const c of data.census) {
      const row = document.querySelector(`tr[data-player-id="${c.player_id}"]`);
      if (!row) continue;

      // Always reflect server submission state in the ✓/? icon, even when the
      // field still has focus — a <select> keeps focus after a change, so
      // gating the icon on activeElement made the checkmark intermittently
      // miss. Only the field *value* is guarded, to avoid clobbering an edit
      // the GM is still making.
      const censusInput = row.querySelector<HTMLInputElement>('.census-admin-input');
      if (censusInput) {
        const pop = c.population;
        if (document.activeElement !== censusInput) {
          censusInput.value = pop != null ? String(pop) : '';
          censusInput.dataset.serverValue = pop != null ? String(pop) : '';
        }
        setStatusIcon(censusInput, pop != null);
      }

      const citySelect = row.querySelector<HTMLSelectElement>('.city-admin-select');
      if (citySelect) {
        const count = c.city_count;
        if (document.activeElement !== citySelect) {
          if (count != null) citySelect.value = String(count);
          citySelect.dataset.serverValue = count != null ? String(count) : '';
        }
        setStatusIcon(citySelect, count != null);
      }
    }
  });
}

function setStatusIcon(field: Element, submitted: boolean): void {
  const icon = field.closest('.ast-ctrl')?.querySelector('.status-icon-fixed');
  if (!icon) return;
  icon.textContent = submitted ? '✓' : '?';
  icon.className = `${submitted ? 'census-submitted' : 'census-pending'} status-icon-fixed`;
}
