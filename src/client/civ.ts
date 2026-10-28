/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Individual empire page — live-updated from the WebSocket state stream.
 *
 * The page is rendered server-side once on load (renderCivFragment in
 * src/views/civ.ts). After that, every state change comes in via WS as
 * a `mett:my-state` event; renderFromState() patches the DOM in place
 * so the user's focus, scroll, and typing are preserved.
 *
 * Imports shared pure game logic from src/shared/ — bundled by Bun so
 * server and client are guaranteed to use identical rules.
 */

import type { FullState, PlayerRow } from '../types.js';
import { playerTotalVp, makeScoreEntry, compareScores, sameScoreGroup, sortCensusOrder, ordinal } from '../shared/scoring.js';
import { AST_LEVELS, boardLevels, astNodeTitle, advancesOfTier, getAdvanceRequirement, renderAgeRequirementsList, type AstRequirement } from '../shared/ast-pure.js';
import { getCivAstProfile } from '../civs.js';
import { escapeHtml } from '../shared/html.js';
import { DEFAULT_DIR, isCardSort, isReversible, isSortDir, renderAdvancePicker, renderCardOverview, renderAdvanceReference, sortLabel, type CardSort, type SortDir } from '../shared/advance-picker.js';
import type { CreditChoice } from '../shared/advances.js';
import { bindPicker } from './picker.js';
import { renderCivSummary } from '../shared/civ-summary.js';
import { renderCalamityReference } from '../shared/calamity-panel.js';

const civEl = document.getElementById('civ-content');
if (civEl) {
  const playerId = Number(civEl.dataset.playerId) || window.PLAYER_ID!;

  // Colour splits being edited in a Monument / Written Record chooser, kept
  // here so a live re-render of the Cards tab doesn't wipe them.
  const choiceDrafts = new Map<string, CreditChoice>();

  // The card order this viewer picked on the Cards tab, remembered in this
  // browser. The server renders by colour; the first state applies the choice.
  const CARD_SORT_KEY = 'mett.cardSort';
  let cardSort: CardSort = 'group';
  let cardDir: SortDir = 'asc';
  try {
    const [sort, dir] = (localStorage.getItem(CARD_SORT_KEY) ?? '').split(':');
    if (isCardSort(sort)) { cardSort = sort; cardDir = isSortDir(dir) && isReversible(sort) ? dir : DEFAULT_DIR[sort]; }
  } catch { /* storage blocked: default order */ }

  bindTabs();
  bindCensus();
  bindCity();
  bindCards();
  bindMov();

  window.addEventListener('mett:my-state', (e: Event) => {
    try { renderFromState((e as CustomEvent<FullState>).detail); }
    catch (err) { console.error('[civ.ts] renderFromState failed', err); }
  });

  // ── Event bindings ──────────────────────────────────────────────────────────

  function bindCensus(): void {
    const submitBtn = document.getElementById('submit-census') as HTMLButtonElement | null;
    const popInput = document.getElementById('pop-input') as HTMLInputElement | null;
    if (!submitBtn || !popInput) return;

    submitBtn.addEventListener('click', async () => {
      let value = parseInt(popInput.value, 10);
      if (isNaN(value)) { popInput.focus(); return; }
      if (value < 0) value = 55 + value;
      if (value < 1 || value > 55) { popInput.focus(); return; }
      (popInput as HTMLInputElement).value = String(value);
      submitBtn.disabled = true;
      const res = await mettPost(`/api/players/${playerId}/census`, { population: value });
      submitBtn.disabled = false;
      if (res.ok) mettFlash(submitBtn.closest('.civ-section'));
    });
    popInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') submitBtn.click(); });
  }

  function bindCity(): void {
    const cityInput = document.getElementById('city-input') as HTMLInputElement | null;
    const cityBtn = document.getElementById('submit-city') as HTMLButtonElement | null;
    if (!cityInput || !cityBtn) return;
    if ((cityInput as HTMLInputElement & { dataset: DOMStringMap }).dataset.serverValue !== '') {
      cityInput.value = cityInput.dataset.serverValue!;
    }

    document.getElementById('city-dec')?.addEventListener('click', () => {
      const cur = parseInt(cityInput.value, 10);
      const next = isNaN(cur) ? 0 : cur - 1;
      if (next >= 0) cityInput.value = String(next);
    });
    document.getElementById('city-inc')?.addEventListener('click', () => {
      const cur = parseInt(cityInput.value, 10);
      const next = isNaN(cur) ? 0 : cur + 1;
      if (next <= 9) cityInput.value = String(next);
    });
    cityBtn.addEventListener('click', async () => {
      const value = parseInt(cityInput.value, 10);
      if (isNaN(value) || value < 0 || value > 9) return;
      cityBtn.disabled = true;
      const res = await mettPost(`/api/players/${playerId}/city-count`, { city_count: value });
      cityBtn.disabled = false;
      if (res.ok) mettFlash(cityBtn.closest('.civ-section'));
    });
  }

  // Tabs: Round · Cards · A.S.T. · Calamities. The open tab lives in the URL hash, so a
  // reload or a bookmark (…/egypt#cards) comes back to it.
  function bindTabs(): void {
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.civ-tab'));
    const show = (tab: HTMLButtonElement, focus = false): void => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = document.getElementById(t.getAttribute('aria-controls')!);
        if (panel) panel.hidden = !on;
      }
      if (focus) tab.focus();
      history.replaceState(null, '', `#${tab.id.replace('tab-btn-', '')}`);
    };
    for (const t of tabs) {
      t.addEventListener('click', () => show(t));
      t.addEventListener('keydown', (e: KeyboardEvent) => {
        const i = tabs.indexOf(t);
        const next = e.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
          : e.key === 'ArrowLeft' ? tabs[(i + tabs.length - 1) % tabs.length] : null;
        if (next) { e.preventDefault(); show(next, true); }
      });
    }
    const fromHash = document.getElementById(`tab-btn-${location.hash.slice(1)}`);
    if (fromHash && tabs.includes(fromHash as HTMLButtonElement)) show(fromHash as HTMLButtonElement);
  }


  // Cards: tap a card to hold or drop it (src/client/picker.ts).
  function bindCards(): void {
    const picker = document.getElementById('adv-picker');
    if (!picker) return;
    bindPicker(picker, {
      playerId: () => playerId,
      held: () => lastState?.advances[playerId] ?? [],
      round: () => lastState?.game.current_round ?? 0,
      rerender: () => { if (lastState) syncPicker(lastState.advances[playerId] ?? [], lastState.game); },
      drafts: choiceDrafts,
    });
    const bar = document.querySelector<HTMLElement>('.adv-sort');
    bar?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-card-sort]');
      const sort = btn?.dataset.cardSort;
      if (!isCardSort(sort)) return;
      // The active button turns the order round; another starts in its usual direction.
      if (sort === cardSort && isReversible(sort)) cardDir = cardDir === 'asc' ? 'desc' : 'asc';
      else { cardSort = sort; cardDir = DEFAULT_DIR[sort]; }
      try { localStorage.setItem(CARD_SORT_KEY, `${cardSort}:${cardDir}`); } catch { /* private window: this visit only */ }
      showCardSort();
      if (lastState) syncPicker(lastState.advances[playerId] ?? [], lastState.game);
    });
    showCardSort();
  }

  function showCardSort(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-card-sort]').forEach(b => {
      const sort = b.dataset.cardSort as CardSort;
      const [label, title] = sortLabel(sort, sort === cardSort ? cardDir : DEFAULT_DIR[sort]);
      b.setAttribute('aria-pressed', String(sort === cardSort));
      b.textContent = label;
      b.title = title;
    });
  }

  function bindMov(): void {
    const movBtn = document.getElementById('mov-toggle') as HTMLButtonElement | null;
    if (!movBtn) return;
    movBtn.addEventListener('click', async () => {
      if (movBtn.disabled) return;
      movBtn.disabled = true;
      const res = await mettPost(`/api/players/${playerId}/move`);
      // On success, the broadcast triggers syncCensus which re-enables + repaints.
      // On failure, re-enable here so the user can retry.
      if (!res.ok) movBtn.disabled = false;
    });
  }

  // ── Live render from WS state ───────────────────────────────────────────────

  // Latest state from the server, for re-rendering the Cards tab on a local
  // change (opening a colour chooser) without waiting for a broadcast.
  let lastState: FullState | null = null;

  function renderFromState(state: FullState): void {
    if (!state?.game || !state?.players) return;
    lastState = state;
    const player = state.players.find(p => p.id === playerId);
    if (!player) { location.reload(); return; }

    const census = state.census.find(c => c.player_id === playerId) ?? null;
    const game = state.game;
    const expert = game.expert === 1;
    const revealed = game.census_revealed === 1;
    const citiesPhase = game.cities_phase === 1;
    const submitted = census != null && census.population != null;
    const cityCountSubmitted = census != null && census.city_count != null;

    // The round-number heading is rendered once by the server; without this it
    // would stay on the previous round until a manual page reload.
    const roundEl = document.getElementById('census-round');
    if (roundEl) roundEl.textContent = String(game.current_round);

    syncSummary(player, census, game);
    syncCensus(player, census, submitted, revealed, citiesPhase, state);
    syncCity(census, cityCountSubmitted, citiesPhase, revealed);
    syncPicker(state.advances[playerId] ?? [], game);
    const overview = document.getElementById('adv-overview');
    if (overview) overview.innerHTML = renderCardOverview(state.advances[playerId] ?? [], game.current_round,
      { level: player.ast_level, civNumber: player.civ_number, expert });
    syncCalamities((state.advances[playerId] ?? []).map(h => h.id), state.players.length);
    syncAst(player, census, game, state, expert);
  }

  function syncCalamities(heldIds: string[], playerCount: number): void {
    rerenderKeepingOpen('cal-ref', 'calamity', open => renderCalamityReference(heldIds, playerCount, open));
  }

  function syncSummary(player: PlayerRow, census: { city_count: number | null } | null, game: FullState['game']): void {
    const el = document.getElementById('civ-summary');
    if (el) el.outerHTML = renderCivSummary(player, playerTotalVp(player, game.active ? null : census?.city_count));
  }

  function syncPicker(held: FullState['advances'][number], game: FullState['game']): void {
    const picker = document.getElementById('adv-picker');
    if (picker) {
      const focused = (document.activeElement as HTMLElement | null)?.dataset?.advance;
      picker.innerHTML = renderAdvancePicker(held, game.current_round, { canBuy: game.cities_phase === 1, drafts: choiceDrafts, sort: cardSort, dir: cardDir });
      if (focused) picker.querySelector<HTMLElement>(`[data-advance="${focused}"]`)?.focus();
    }
    rerenderKeepingOpen('adv-ref', 'advanceRef', open => renderAdvanceReference(held, open, game.current_round, cardSort, cardDir));
  }

  /** Re-render a list of <details> rows; the rows the player has expanded
   *  (named by data-<key>) stay expanded. */
  function rerenderKeepingOpen(id: string, key: string, render: (open: ReadonlySet<string>) => string): void {
    const el = document.getElementById(id);
    if (!el) return;
    const open = new Set(Array.from(el.querySelectorAll<HTMLDetailsElement>('details[open]'), d => d.dataset[key] ?? ''));
    el.innerHTML = render(open);
  }

  function syncCensus(
    player: PlayerRow,
    census: { population: number | null; city_count: number | null; moved?: number } | null,
    submitted: boolean,
    revealed: boolean,
    citiesPhase: boolean,
    state: FullState,
  ): void {
    const formEl = document.getElementById('census-form');
    if (!formEl) return;

    // Post-calamity (cities phase): the census population is locked — it only
    // mattered earlier this round for the move order. The submit control is
    // disabled until the next round reopens the census.
    const popInputEl = document.getElementById('pop-input') as HTMLInputElement | null;
    if (popInputEl) popInputEl.disabled = citiesPhase;
    const submitBtn = document.getElementById('submit-census') as HTMLButtonElement | null;
    if (submitBtn) submitBtn.disabled = citiesPhase;

    // MOV: optional "units moved" toggle — enabled once census is revealed, and
    // hidden in the post-calamity phase (units are long since placed by then).
    const movRow = formEl.querySelector('.mov-row') as HTMLElement | null;
    if (movRow) (movRow as HTMLElement).hidden = citiesPhase;
    const movBtn = document.getElementById('mov-toggle') as HTMLButtonElement | null;
    if (movBtn) {
      const moved = !!census?.moved;
      movBtn.disabled = !revealed;
      movBtn.classList.toggle('mov-on', moved);
      movBtn.classList.toggle('mov-off', !moved);
      movBtn.textContent = moved ? '✓ Units moved — neighbours can start' : '⊙ Mark units moved';
      const movHint = formEl.querySelector('.mov-hint');
      if (movHint) {
        movHint.textContent = revealed
          ? 'Let your neighbours know your units are placed.'
          : 'Available once the census is revealed.';
      }
    }

    const statusEl = formEl.querySelector<HTMLElement>('.census-submitted, .census-pending');
    if (statusEl) {
      if (submitted) {
        statusEl.className = 'census-submitted';
        statusEl.innerHTML = '✓ Submitted: <strong>' + escapeHtml(String(census!.population)) + '</strong>';
      } else {
        statusEl.className = 'census-pending';
        statusEl.textContent = 'Not yet submitted';
      }
    }

    const popInput = document.getElementById('pop-input') as HTMLInputElement | null;
    if (popInput && document.activeElement !== popInput) {
      popInput.value = submitted ? String(census!.population) : '';
    }

    const hint = formEl.querySelector('.census-hint');
    if (!submitted && !hint) {
      const row = formEl.querySelector('.census-input-row');
      if (row) {
        const h = document.createElement('small');
        h.className = 'census-hint';
        h.textContent = 'Tip: -27 = 28 tokens remaining';
        row.after(h);
      }
    } else if (submitted && hint) {
      hint.remove();
    }

    const existing = formEl.querySelector('.move-order');
    if (revealed && submitted) {
      // Reshape players to embed census for sortCensusOrder
      const playersWithCensus = state.players.map(p => ({
        ...p,
        census: state.census.find(c => c.player_id === p.id) ?? null,
      }));
      const sorted = sortCensusOrder(playersWithCensus);
      const pos = sorted.findIndex(p => p.id === player.id) + 1;
      const html = `You move <strong>${pos}${ordinal(pos)}</strong> of ${sorted.length} this round.`;
      if (existing) (existing as HTMLElement).innerHTML = html;
      else {
        const p = document.createElement('p');
        p.className = 'move-order';
        p.innerHTML = html;
        formEl.appendChild(p);
      }
    } else if (existing) {
      existing.remove();
    }
  }

  function syncCity(
    census: { city_count: number | null } | null,
    submitted: boolean,
    citiesPhase: boolean,
    revealed: boolean,
  ): void {
    const phaseEl = document.querySelector('.phase-hint');
    if (phaseEl) {
      phaseEl.textContent = citiesPhase
        ? 'Enter city count after calamities resolve. This is the count used for A.S.T. progression.'
        : 'Enter city count before buying trade cards. You will re-enter after calamities resolve.';
    }
    const phaseBadge = document.querySelector('.phase-badge');
    if (phaseBadge) {
      phaseBadge.textContent = citiesPhase
        ? 'Phase 2 of 2 — post-calamity'
        : 'Phase 1 of 2 — pre-trade';
    }
    const cityInput = document.getElementById('city-input') as HTMLInputElement | null;
    if (!cityInput) return;
    const formEl = cityInput.closest('.census-form');
    if (!formEl) return;
    const statusEl = formEl.querySelector<HTMLElement>('.census-submitted, .census-pending');
    if (statusEl) {
      if (submitted) {
        statusEl.className = 'census-submitted';
        statusEl.innerHTML = '✓ Cities: <strong>' + escapeHtml(String(census!.city_count)) + '</strong>';
      } else {
        statusEl.className = 'census-pending';
        statusEl.textContent = 'Not yet entered';
      }
    }
    if (document.activeElement !== cityInput && submitted) {
      cityInput.value = String(census!.city_count);
    }
    cityInput.dataset.serverValue = submitted ? String(census!.city_count) : '';

    // Lock the city-count controls until the census is revealed — after a new
    // round starts (census hidden) players must not submit a count too early.
    cityInput.disabled = !revealed;
    for (const id of ['city-dec', 'city-inc', 'submit-city']) {
      const el = document.getElementById(id) as HTMLButtonElement | null;
      if (el) el.disabled = !revealed;
    }
    const cityHint = formEl.querySelector('.city-hint') as HTMLElement | null;
    if (cityHint) cityHint.hidden = revealed;
  }

  function syncAst(
    player: PlayerRow,
    census: { city_count: number | null } | null,
    game: FullState['game'],
    state: FullState,
    expert: boolean,
  ): void {
    const sec = document.querySelector('.ast-section');
    if (!sec) return;
    // The section has no heading (removed by request); rebuild its whole body.
    sec.innerHTML = buildAstSectionInner(player, census, game, state, expert);
  }

  interface LbInfo { pos: number; tied: boolean; resolved: boolean; }

  function computeLbInfo(player: PlayerRow, state: FullState): LbInfo {
    const game = state.game;
    const censusByPlayer = new Map(state.census.map(c => [c.player_id, c.city_count ?? 0]));
    // During active play, cities and the advance-card tiebreakers are excluded —
    // rank by Total VP alone (final=false).
    const finalRanking = !game.active;
    const cityVp = (p: PlayerRow) => game.active ? 0 : (censusByPlayer.get(p.id) ?? 0);
    const sorted = [...state.players].sort((a, b) =>
      compareScores(makeScoreEntry(a, cityVp(a)), makeScoreEntry(b, cityVp(b)), finalRanking)
    );
    const idx = sorted.findIndex(p => p.id === player.id);
    if (idx === -1) return { pos: 1, tied: false, resolved: false };
    const myScore = makeScoreEntry(player, cityVp(player));
    let groupStart = idx;
    while (groupStart > 0 && sameScoreGroup(makeScoreEntry(sorted[groupStart - 1]!, cityVp(sorted[groupStart - 1]!)), myScore, finalRanking)) groupStart--;
    let groupEnd = idx;
    while (groupEnd + 1 < sorted.length && sameScoreGroup(myScore, makeScoreEntry(sorted[groupEnd + 1]!, cityVp(sorted[groupEnd + 1]!)), finalRanking)) groupEnd++;
    const tied = groupEnd > idx || idx > groupStart;
    const resolved = tied && sorted.slice(groupStart, groupEnd + 1).every(p => p.rank_order !== 0);
    const pos = resolved ? idx + 1 : groupStart + 1;
    return { pos, tied, resolved };
  }

  function buildAstSectionInner(
    player: PlayerRow,
    census: { city_count: number | null } | null,
    game: FullState['game'],
    state: FullState,
    expert: boolean,
  ): string {
    const cityCount = census ? census.city_count : null;
    // Last-known city count for the all-ages requirement colouring: this round's
    // if submitted, else the previous round's (the cities still on the board).
    const prevCityCount = state.prevCensus?.find(c => c.player_id === player.id)?.city_count ?? null;
    const legendCityCount = cityCount ?? prevCityCount;
    const lb = computeLbInfo(player, state);
    const finalRank = (game.active === 0 && game.started_at) ? lb.pos : null;
    const lbValue = (lb.tied && !lb.resolved ? '=' : '') + lb.pos + ordinal(lb.pos);
    const totalVp = playerTotalVp(player, game.active ? null : cityCount);

    const lia = player.late_iron_age_bonus
      ? `<div class="ast-current lia-bonus-row"><span class="ast-level-label">LIA bonus:</span> <span class="lia-bonus-chip">★ +5 VP at game end</span></div>`
      : '';

    const curIdx = AST_LEVELS.indexOf(player.ast_level);
    const nextLevel = curIdx >= 0 ? AST_LEVELS[curIdx + 1] ?? null : null;
    const stoneEnd = getCivAstProfile(player.civ_number, expert).stoneEnd;

    let middle = '';
    if (nextLevel !== null) {
      // Use the last-known city count (this round's, else previous round's) so
      // the city requirement is coloured green/red — never a white "not yet
      // submitted" — matching the all-ages legend below.
      const effectiveCities = legendCityCount != null
        ? legendCityCount + (player.wonder ? 1 : 0)
        : null;
      const inStoneAge = player.ast_level <= stoneEnd;
      if (expert && effectiveCities === 0 && !inStoneAge && curIdx > 0) {
        const regressLevel = AST_LEVELS[curIdx - 1] ?? 0;
        middle = `<div class="ast-next req-not-met">
          <h4>To advance to ${nextLevel}:</h4>
          <p class="ast-warn-regress">⚠ 0 cities — will regress to ${regressLevel} next round</p>
        </div>`;
      } else {
        const advReq = getAdvanceRequirement(player, expert);
        middle = renderRequirementBlock(player, { city_count: legendCityCount }, advReq, effectiveCities, nextLevel);
      }
    } else {
      if (finalRank === 1) middle = '<p class="ast-complete">🥇 Gold!</p>';
      else if (finalRank === 2) middle = '<p class="ast-complete">🥈 Silver!</p>';
      else if (finalRank === 3) middle = '<p class="ast-complete">🥉 Bronze!</p>';
      else middle = '<p class="ast-complete">Maximum A.S.T. position reached!</p>';
    }

    const bar = renderAstBar(player.ast_level, expert);

    return `
      <div class="ast-current">
        <span class="ast-level-label">Leaderboard position:</span>
        <span class="ast-level-value">${lbValue}</span>
        <span class="ast-era">of ${state.players.length}</span>
      </div>
      <div class="ast-current">
        <span class="ast-level-label">Total VP:</span>
        <span class="ast-level-value">${totalVp}</span>
      </div>
      ${lia}
      ${middle}
      ${bar}
      <ul class="ab-legend ast-req-legend">${renderAgeRequirementsList(player, legendCityCount, expert)}</ul>
    `;
  }

  function renderRequirementBlock(
    player: PlayerRow,
    census: { city_count: number | null } | null,
    advReq: AstRequirement | null,
    effectiveCities: number | null,
    nextLevelNum: number,
  ): string {
    if (!advReq) {
      return `<div class="ast-next">
        <h4>To advance to ${nextLevelNum}:</h4>
        <p class="ast-req-text">None</p>
      </div>`;
    }
    if (advReq.impossible) {
      return `<div class="ast-next">
        <h4>To advance to ${nextLevelNum}:</h4>
        <p class="ast-req-text">N/A</p>
      </div>`;
    }
    const cityCount = census ? census.city_count : null;
    const rows: string[] = [];
    let allMet = true;

    if (advReq.cities > 0) {
      const meetsCities = effectiveCities != null ? effectiveCities >= advReq.cities : null;
      if (meetsCities === null) {
        rows.push(`<span class="req-row req-unknown">? ${advReq.cities} cities <span class="req-have">(not yet submitted)</span></span>`);
      } else {
        const note = player.wonder && cityCount != null && effectiveCities != null && cityCount < effectiveCities
          ? `${cityCount} + ★`
          : `${effectiveCities}`;
        rows.push(`<span class="req-row${meetsCities ? ' req-ok' : ' req-fail'}">${meetsCities ? '✓' : '✗'} ${advReq.cities} cities <span class="req-have">(you have ${note})</span></span>`);
        if (!meetsCities) allMet = false;
      }
    }
    if (advReq.advCount !== undefined) {
      const haveAdv = advancesOfTier(player, advReq.advTier);
      const meetsAdv = haveAdv >= advReq.advCount;
      if (!meetsAdv) allMet = false;
      const tierLabel = advReq.advTier === 'cheap' ? ' cheap (<100)'
        : advReq.advTier === 'medium' ? ' mid (≥100)'
        : advReq.advTier === 'expensive' ? ' expensive (≥200)'
        : '';
      rows.push(`<span class="req-row${meetsAdv ? ' req-ok' : ' req-fail'}">${meetsAdv ? '✓' : '✗'} ${advReq.advCount === 17 ? 'all 17' : advReq.advCount} advances${tierLabel} <span class="req-have">(you have ${haveAdv})</span></span>`);
    }
    if (advReq.advVpTotal !== undefined) {
      const meets = player.adv_points >= advReq.advVpTotal;
      if (!meets) allMet = false;
      rows.push(`<span class="req-row${meets ? ' req-ok' : ' req-fail'}">${meets ? '✓' : '✗'} ${advReq.advVpTotal} VP in advances <span class="req-have">(you have ${player.adv_points})</span></span>`);
    }
    if (advReq.totalVp !== undefined) {
      const meets = player.adv_points >= advReq.totalVp;
      if (!meets) allMet = false;
      rows.push(`<span class="req-row${meets ? ' req-ok' : ' req-fail'}">${meets ? '✓' : '✗'} ${advReq.totalVp} total VP <span class="req-have">(you have ${player.adv_points})</span></span>`);
    }

    const borderClass = rows.length ? (allMet ? ' req-all-ok' : ' req-not-met') : '';
    const body = rows.length
      ? `<div class="ast-req-status">${rows.join('')}</div>`
      : `<p class="ast-req-text">None</p>`;
    return `<div class="ast-next${borderClass}">
      <h4>To advance to ${nextLevelNum}:</h4>
      ${body}
    </div>`;
  }

  function renderAstBar(currentLevel: number, expert: boolean): string {
    const filtered = boardLevels(expert);
    const N = filtered.length;
    const nodes = filtered.map(l => {
      const cls = l === currentLevel ? 'ast-node active'
        : l < currentLevel ? 'ast-node past'
        : 'ast-node future';
      const label = l === 0 ? 'S' : l;
      return `<div class="${cls}" title="${astNodeTitle(l, expert)}">${label}</div>`;
    }).join('');
    const existing = document.querySelector('.ast-bar-wrap .ast-progress-grid');
    if (existing) {
      const labels = Array.from(existing.children)
        .filter(el => el.classList.contains('ast-age-label'))
        .map(el => el.outerHTML)
        .join('');
      const cols = (existing as HTMLElement).style.gridTemplateColumns || `repeat(${N},minmax(0,1fr))`;
      return `<div class="ast-bar-wrap"><div class="ast-progress-grid" style="grid-template-columns:${cols}">${labels}${nodes}</div></div>`;
    }
    return `<div class="ast-bar-wrap"><div class="ast-progress-grid" style="grid-template-columns:repeat(${N},minmax(0,1fr))">${nodes}</div></div>`;
  }
}
