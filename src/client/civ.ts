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

import type { FullState, PlayerRow, AstLevelRow } from '../types.js';
import { playerTotalVp, makeScoreEntry, compareScores, sameScoreGroup, sortCensusOrder, ordinal } from '../shared/scoring.js';
import { advancesOfTier, getAdvanceRequirement, type AstRequirement } from '../shared/ast-pure.js';
import { getCivAstProfile } from '../civs.js';

const civEl = document.getElementById('civ-content');
if (civEl) {
  const playerId = Number(civEl.dataset.playerId) || window.PLAYER_ID!;

  bindCensus();
  bindCity();
  bindAdv();
  bindMilWon();

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

  let advTypingTimer: ReturnType<typeof setTimeout> | undefined;
  function bindAdv(): void {
    const adv1 = document.getElementById('adv-1vp') as HTMLInputElement | null;
    const adv3 = document.getElementById('adv-3vp') as HTMLInputElement | null;
    const adv6 = document.getElementById('adv-6vp') as HTMLInputElement | null;
    const advTotal = document.getElementById('adv-total');

    function calcAdvTotal(): number {
      const v1 = parseInt(adv1?.value ?? '0', 10) || 0;
      const v3 = parseInt(adv3?.value ?? '0', 10) || 0;
      const v6 = parseInt(adv6?.value ?? '0', 10) || 0;
      return v1 + v3 * 3 + v6 * 6;
    }
    function refreshAdvTotal(): void { if (advTotal) advTotal.textContent = String(calcAdvTotal()); }
    async function submitAdv(): Promise<void> {
      const v1 = Math.max(0, parseInt(adv1?.value ?? '0', 10) || 0);
      const v3 = Math.max(0, parseInt(adv3?.value ?? '0', 10) || 0);
      const v6 = Math.max(0, parseInt(adv6?.value ?? '0', 10) || 0);
      const res = await mettPost(`/api/players/${playerId}/adv`, { adv_1vp: v1, adv_3vp: v3, adv_6vp: v6 });
      if (res.ok && adv1) mettFlash(adv1.closest('.civ-section'));
    }
    function submitAdvDebounced(): void {
      clearTimeout(advTypingTimer);
      advTypingTimer = setTimeout(submitAdv, 400);
    }

    for (const inp of [adv1, adv3, adv6]) {
      if (!inp) continue;
      inp.addEventListener('input', () => { refreshAdvTotal(); submitAdvDebounced(); });
      inp.addEventListener('blur', () => { clearTimeout(advTypingTimer); submitAdv(); });
    }
    document.querySelectorAll<HTMLButtonElement>('.adv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target!) as HTMLInputElement | null;
        if (!inp) return;
        const dir = parseInt(btn.dataset.dir!, 10);
        const cur = parseInt(inp.value, 10) || 0;
        inp.value = String(Math.max(0, cur + dir));
        refreshAdvTotal();
        clearTimeout(advTypingTimer);
        submitAdv();
      });
    });
  }

  function bindMilWon(): void {
    const milBtn = document.getElementById('mil-toggle') as HTMLButtonElement | null;
    if (milBtn) {
      milBtn.addEventListener('click', async () => {
        milBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/military`);
        if (!res.ok) milBtn.disabled = false;
      });
    }
    const wonBtn = document.getElementById('won-toggle') as HTMLButtonElement | null;
    if (wonBtn) {
      wonBtn.addEventListener('click', async () => {
        wonBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/wonder`);
        if (!res.ok) wonBtn.disabled = false;
      });
    }
    const spcBtn = document.getElementById('spc-toggle') as HTMLButtonElement | null;
    if (spcBtn) {
      spcBtn.addEventListener('click', async () => {
        spcBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/special`);
        if (!res.ok) spcBtn.disabled = false;
      });
    }
  }

  // ── Live render from WS state ───────────────────────────────────────────────

  function renderFromState(state: FullState): void {
    if (!state?.game || !state?.players) return;
    const player = state.players.find(p => p.id === playerId);
    if (!player) { location.reload(); return; }

    const census = state.census.find(c => c.player_id === playerId) ?? null;
    const game = state.game;
    const expert = game.expert === 1;
    const revealed = game.census_revealed === 1;
    const citiesPhase = game.cities_phase === 1;
    const submitted = census != null && census.population != null;
    const cityCountSubmitted = census != null && census.city_count != null;

    for (const id of ['mil-toggle', 'won-toggle', 'spc-toggle']) {
      const btn = document.getElementById(id) as HTMLButtonElement | null;
      if (btn) btn.disabled = false;
    }

    // The round-number heading is rendered once by the server; without this it
    // would stay on the previous round until a manual page reload.
    const roundEl = document.getElementById('census-round');
    if (roundEl) roundEl.textContent = String(game.current_round);

    syncMilWon(player);
    syncCensus(player, census, submitted, revealed, state);
    syncCity(census, cityCountSubmitted, citiesPhase);
    syncAdv(player);
    syncAst(player, census, game, state, expert);
  }

  function syncMilWon(player: PlayerRow): void {
    const milBtn = document.getElementById('mil-toggle') as HTMLButtonElement | null;
    if (milBtn) {
      milBtn.classList.toggle('mil-on', !!player.military);
      milBtn.classList.toggle('mil-off', !player.military);
      milBtn.textContent = player.military
        ? '⚔ Has Military — tap to remove'
        : '✕ No Military — tap to grant';
    }
    const wonBtn = document.getElementById('won-toggle') as HTMLButtonElement | null;
    if (wonBtn) {
      wonBtn.classList.toggle('won-on', !!player.wonder);
      wonBtn.classList.toggle('won-off', !player.wonder);
      wonBtn.textContent = player.wonder
        ? '★ Has Wonder — tap to remove'
        : '✕ No Wonder — tap to grant';
    }
    const spcBtn = document.getElementById('spc-toggle') as HTMLButtonElement | null;
    if (spcBtn) {
      spcBtn.classList.toggle('spc-on', !!player.special);
      spcBtn.classList.toggle('spc-off', !player.special);
      spcBtn.textContent = player.special
        ? '⚡ Special ability — tap to remove'
        : '✕ No special ability — tap to grant';
    }
  }

  function syncCensus(
    player: PlayerRow,
    census: { population: number | null; city_count: number | null } | null,
    submitted: boolean,
    revealed: boolean,
    state: FullState,
  ): void {
    const formEl = document.getElementById('census-form');
    if (!formEl) return;

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
  }

  function syncAdv(player: PlayerRow): void {
    const adv1 = document.getElementById('adv-1vp') as HTMLInputElement | null;
    const adv3 = document.getElementById('adv-3vp') as HTMLInputElement | null;
    const adv6 = document.getElementById('adv-6vp') as HTMLInputElement | null;
    const advTotal = document.getElementById('adv-total');
    const focused = document.activeElement;
    if (adv1 && adv1 !== focused) adv1.value = String(player.adv_1vp);
    if (adv3 && adv3 !== focused) adv3.value = String(player.adv_3vp);
    if (adv6 && adv6 !== focused) adv6.value = String(player.adv_6vp);
    if (advTotal) {
      const v1 = parseInt(adv1?.value ?? '0', 10) || 0;
      const v3 = parseInt(adv3?.value ?? '0', 10) || 0;
      const v6 = parseInt(adv6?.value ?? '0', 10) || 0;
      advTotal.textContent = String(v1 + v3 * 3 + v6 * 6);
    }
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
    const lb = computeLbInfo(player, state);
    const finalRank = (game.active === 0 && game.started_at) ? lb.pos : null;
    const lbValue = (lb.tied && !lb.resolved ? '=' : '') + lb.pos + ordinal(lb.pos);
    const totalVp = playerTotalVp(player, game.active ? null : cityCount);

    const lia = player.late_iron_age_bonus
      ? `<div class="ast-current lia-bonus-row"><span class="ast-level-label">LIA bonus:</span> <span class="lia-bonus-chip">★ +5 VP at game end</span></div>`
      : '';

    const levels = state.astLevels ?? [];
    const curIdx = levels.findIndex(l => l.level === player.ast_level);
    const nextLevel = curIdx >= 0 ? levels[curIdx + 1] : null;
    const stoneEnd = getCivAstProfile(player.civ_number, expert).stoneEnd;

    let middle = '';
    if (nextLevel) {
      const effectiveCities = cityCount != null
        ? cityCount + (player.wonder ? 1 : 0)
        : null;
      const inStoneAge = player.ast_level <= stoneEnd;
      if (expert && effectiveCities === 0 && !inStoneAge && curIdx > 0) {
        const regressLevel = levels[curIdx - 1]?.level ?? 0;
        middle = `<div class="ast-next req-not-met">
          <h4>To advance to ${nextLevel.level}:</h4>
          <p class="ast-warn-regress">⚠ 0 cities — will regress to ${regressLevel} next round</p>
        </div>`;
      } else {
        const advReq = getAdvanceRequirement(player, levels, expert);
        middle = renderRequirementBlock(player, census, advReq, effectiveCities, nextLevel.level);
      }
    } else {
      if (finalRank === 1) middle = '<p class="ast-complete">🥇 Gold!</p>';
      else if (finalRank === 2) middle = '<p class="ast-complete">🥈 Silver!</p>';
      else if (finalRank === 3) middle = '<p class="ast-complete">🥉 Bronze!</p>';
      else middle = '<p class="ast-complete">Maximum A.S.T. position reached!</p>';
    }

    const bar = renderAstBar(levels, player.ast_level, expert);

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

  function renderAstBar(levels: AstLevelRow[], currentLevel: number, expert: boolean): string {
    const filtered = expert ? levels : levels.filter(l => l.level <= 75);
    const N = filtered.length;
    const nodes = filtered.map(l => {
      const cls = l.level === currentLevel ? 'ast-node active'
        : l.level < currentLevel ? 'ast-node past'
        : 'ast-node future';
      const label = l.level === 0 ? 'S' : l.level;
      const req = expert ? l.expert_req : l.basic_req;
      return `<div class="${cls}" title="${escapeHtml(l.era)}: ${escapeHtml(req ?? '')}">${label}</div>`;
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

  function escapeHtml(s: string): string {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }
}
