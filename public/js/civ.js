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
 * Keeping the rendering helpers in lockstep with the server is the
 * trade-off for not destroying the user's input on every update — both
 * sides need to agree on the leaderboard sort, AST progression rules,
 * and requirement-row formatting. See the matching exports in
 *   src/models/game.ts (compareScores, sameScoreGroup, playerTotalVp)
 *   src/models/ast.ts  (advancesOfTier, getAdvanceRequirement)
 *   src/civs.ts        (getCivAstProfile)
 */
(function () {
  const civEl = document.getElementById('civ-content');
  if (!civEl) return;
  const playerId = Number(civEl.dataset.playerId) || window.PLAYER_ID;

  // ─── Constants mirrored from server ──────────────────────────────────────
  const LATE_BRONZE_BASIC  = new Set([1, 2]);
  const LATE_BRONZE_EXPERT = new Set([1, 2, 10, 13]);
  const LATE_START         = new Set([5, 7, 13, 18]);

  // ─── Event bindings (one-time, since the DOM is no longer swapped) ───────
  bindCensus();
  bindCity();
  bindAdv();
  bindMilWon();

  // ─── Live update from WebSocket ──────────────────────────────────────────
  window.addEventListener('mett:my-state', (e) => {
    try { renderFromState(e.detail); }
    catch (err) { console.error('[civ.js] renderFromState failed', err); }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  Event bindings
  // ─────────────────────────────────────────────────────────────────────────

  function bindCensus() {
    const submitBtn = document.getElementById('submit-census');
    const popInput = document.getElementById('pop-input');
    if (!submitBtn || !popInput) return;

    submitBtn.addEventListener('click', async () => {
      let value = parseInt(popInput.value, 10);
      if (isNaN(value)) { popInput.focus(); return; }
      // Negative shorthand: -27 means 55 - 27 = 28 tokens remaining
      if (value < 0) value = 55 + value;
      if (value < 1 || value > 55) { popInput.focus(); return; }
      popInput.value = value;
      submitBtn.disabled = true;
      await mettPost(`/api/players/${playerId}/census`, { population: value });
      submitBtn.disabled = false;
    });
    popInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitBtn.click(); });
  }

  function bindCity() {
    const cityInput = document.getElementById('city-input');
    const cityBtn = document.getElementById('submit-city');
    if (!cityInput || !cityBtn) return;
    if (cityInput.dataset.serverValue !== '') cityInput.value = cityInput.dataset.serverValue;

    document.getElementById('city-dec')?.addEventListener('click', () => {
      const cur = parseInt(cityInput.value, 10);
      const next = isNaN(cur) ? 0 : cur - 1;
      if (next >= 0) cityInput.value = next;
    });
    document.getElementById('city-inc')?.addEventListener('click', () => {
      const cur = parseInt(cityInput.value, 10);
      const next = isNaN(cur) ? 0 : cur + 1;
      if (next <= 9) cityInput.value = next;
    });
    cityBtn.addEventListener('click', async () => {
      const value = parseInt(cityInput.value, 10);
      if (isNaN(value) || value < 0 || value > 9) return;
      cityBtn.disabled = true;
      await mettPost(`/api/players/${playerId}/city-count`, { city_count: value });
      cityBtn.disabled = false;
    });
  }

  let advTypingTimer;
  function bindAdv() {
    const adv1 = document.getElementById('adv-1vp');
    const adv3 = document.getElementById('adv-3vp');
    const adv6 = document.getElementById('adv-6vp');
    const advTotal = document.getElementById('adv-total');

    function calcAdvTotal() {
      const v1 = parseInt(adv1?.value ?? '0', 10) || 0;
      const v3 = parseInt(adv3?.value ?? '0', 10) || 0;
      const v6 = parseInt(adv6?.value ?? '0', 10) || 0;
      return v1 + v3 * 3 + v6 * 6;
    }
    function refreshAdvTotal() { if (advTotal) advTotal.textContent = String(calcAdvTotal()); }
    async function submitAdv() {
      const v1 = Math.max(0, parseInt(adv1?.value ?? '0', 10) || 0);
      const v3 = Math.max(0, parseInt(adv3?.value ?? '0', 10) || 0);
      const v6 = Math.max(0, parseInt(adv6?.value ?? '0', 10) || 0);
      await mettPost(`/api/players/${playerId}/adv`, { adv_1vp: v1, adv_3vp: v3, adv_6vp: v6 });
    }
    function submitAdvDebounced() {
      clearTimeout(advTypingTimer);
      advTypingTimer = setTimeout(submitAdv, 400);
    }

    [adv1, adv3, adv6].forEach(inp => {
      if (!inp) return;
      inp.addEventListener('input', () => { refreshAdvTotal(); submitAdvDebounced(); });
      inp.addEventListener('blur', () => { clearTimeout(advTypingTimer); submitAdv(); });
    });
    document.querySelectorAll('.adv-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        if (!inp) return;
        const dir = parseInt(btn.dataset.dir, 10);
        const cur = parseInt(inp.value, 10) || 0;
        inp.value = Math.max(0, cur + dir);
        refreshAdvTotal();
        clearTimeout(advTypingTimer);
        submitAdv();
      });
    });
  }

  function bindMilWon() {
    const milBtn = document.getElementById('mil-toggle');
    if (milBtn) {
      milBtn.addEventListener('click', async () => {
        milBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/military`);
        if (!res.ok) milBtn.disabled = false;
      });
    }
    const wonBtn = document.getElementById('won-toggle');
    if (wonBtn) {
      wonBtn.addEventListener('click', async () => {
        wonBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/wonder`);
        if (!res.ok) wonBtn.disabled = false;
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Live render from WS state — patches DOM in place, preserving focus
  // ─────────────────────────────────────────────────────────────────────────

  function renderFromState(state) {
    if (!state || !state.game || !state.players) return;
    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      // The current game no longer includes us (reset / new setup) —
      // a full reload picks up the not-in-game view.
      location.reload();
      return;
    }
    const census = state.census.find(c => c.player_id === playerId) || null;
    const game = state.game;
    const expert = game.expert === 1;
    const revealed = game.census_revealed === 1;
    const citiesPhase = game.cities_phase === 1;
    const submitted = census && census.population != null;
    const cityCountSubmitted = census && census.city_count != null;

    // Re-enable interactive buttons that were optimistically disabled.
    for (const id of ['mil-toggle', 'won-toggle']) {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = false;
    }

    syncMilWon(player);
    syncCensus(player, census, submitted, revealed, state);
    syncCity(census, cityCountSubmitted, citiesPhase);
    syncAdv(player);
    syncAst(player, census, game, state, expert);
  }

  function syncMilWon(player) {
    const milBtn = document.getElementById('mil-toggle');
    if (milBtn) {
      milBtn.classList.toggle('mil-on', !!player.military);
      milBtn.classList.toggle('mil-off', !player.military);
      milBtn.textContent = player.military
        ? '⚔ Has Military — tap to remove'
        : '✕ No Military — tap to grant';
    }
    const wonBtn = document.getElementById('won-toggle');
    if (wonBtn) {
      wonBtn.classList.toggle('won-on', !!player.wonder);
      wonBtn.classList.toggle('won-off', !player.wonder);
      wonBtn.textContent = player.wonder
        ? '★ Has Wonder — tap to remove'
        : '✕ No Wonder — tap to grant';
    }
  }

  function syncCensus(player, census, submitted, revealed, state) {
    const formEl = document.getElementById('census-form');
    if (!formEl) return;

    // Submitted/pending status line
    const statusEl = formEl.querySelector('.census-submitted, .census-pending');
    if (statusEl) {
      if (submitted) {
        statusEl.className = 'census-submitted';
        statusEl.innerHTML = '✓ Submitted: <strong>' + escapeHtml(String(census.population)) + '</strong>';
      } else {
        statusEl.className = 'census-pending';
        statusEl.textContent = 'Not yet submitted';
      }
    }

    // Sync pop-input value when not focused — never clobber the user's typing
    const popInput = document.getElementById('pop-input');
    if (popInput && document.activeElement !== popInput) {
      popInput.value = submitted ? String(census.population) : '';
    }

    // Hint paragraph: shown only when not submitted
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

    // Move-order line (after reveal)
    const existing = formEl.querySelector('.move-order');
    if (revealed && submitted) {
      const sorted = sortCensusOrder(state);
      const pos = sorted.findIndex(p => p.id === player.id) + 1;
      const html = `You move <strong>${pos}${ordinalSuffix(pos)}</strong> of ${sorted.length} this round.`;
      if (existing) existing.innerHTML = html;
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

  function syncCity(census, submitted, citiesPhase) {
    const phaseEl = document.querySelector('.phase-hint');
    if (phaseEl) {
      phaseEl.textContent = citiesPhase
        ? 'Post-calamity — enter city count after calamities resolve'
        : 'Pre-trade — enter city count before buying trade cards';
    }
    // Status line — sit in the same .census-form as the city input row
    const cityInput = document.getElementById('city-input');
    if (!cityInput) return;
    const formEl = cityInput.closest('.census-form');
    if (!formEl) return;
    const statusEl = formEl.querySelector('.census-submitted, .census-pending');
    if (statusEl) {
      if (submitted) {
        statusEl.className = 'census-submitted';
        statusEl.innerHTML = '✓ Cities: <strong>' + escapeHtml(String(census.city_count)) + '</strong>';
      } else {
        statusEl.className = 'census-pending';
        statusEl.textContent = 'Not yet entered';
      }
    }
    // Sync select value when not focused
    if (document.activeElement !== cityInput && submitted) {
      cityInput.value = String(census.city_count);
    }
    cityInput.dataset.serverValue = submitted ? String(census.city_count) : '';
  }

  function syncAdv(player) {
    const adv1 = document.getElementById('adv-1vp');
    const adv3 = document.getElementById('adv-3vp');
    const adv6 = document.getElementById('adv-6vp');
    const advTotal = document.getElementById('adv-total');
    // Only overwrite values when the user isn't actively editing — don't lose typing
    const focused = document.activeElement;
    if (adv1 && adv1 !== focused) adv1.value = String(player.adv_1vp);
    if (adv3 && adv3 !== focused) adv3.value = String(player.adv_3vp);
    if (adv6 && adv6 !== focused) adv6.value = String(player.adv_6vp);
    // Total reflects the displayed input values, not the server's adv_points,
    // so we recompute from the inputs (which include the user's in-flight edits).
    if (advTotal) {
      const v1 = parseInt(adv1?.value ?? '0', 10) || 0;
      const v3 = parseInt(adv3?.value ?? '0', 10) || 0;
      const v6 = parseInt(adv6?.value ?? '0', 10) || 0;
      advTotal.textContent = String(v1 + v3 * 3 + v6 * 6);
    }
  }

  function syncAst(player, census, game, state, expert) {
    const sec = document.querySelector('.ast-section');
    if (!sec) return;
    const h3 = sec.querySelector('h3');
    if (!h3) return;
    // Build the dynamic part as HTML and replace everything after the static h3.
    const html = buildAstSectionInner(player, census, game, state, expert);
    while (h3.nextSibling) h3.nextSibling.remove();
    h3.insertAdjacentHTML('afterend', html);
  }

  function buildAstSectionInner(player, census, game, state, expert) {
    const cityCount = census ? census.city_count : null;
    const lb = computeLbInfo(player, state);
    const finalRank = (game.active === 0 && game.started_at) ? lb.pos : null;
    const lbValue = (lb.tied && !lb.resolved ? '=' : '') + lb.pos + ordinalSuffix(lb.pos);
    const totalVp = playerTotalVp(player, cityCount);

    const lia = player.late_iron_age_bonus
      ? `<div class="ast-current lia-bonus-row"><span class="ast-level-label">LIA bonus:</span> <span class="lia-bonus-chip">★ +5 VP at game end</span></div>`
      : '';

    const levels = state.astLevels || [];
    const curIdx = levels.findIndex(l => l.level === player.ast_level);
    const nextLevel = curIdx >= 0 ? levels[curIdx + 1] : null;
    const stoneEnd = getCivAstProfile(player.civ_number, expert).stoneEnd;

    let middle = '';
    if (nextLevel) {
      const effectiveCities = cityCount !== null && cityCount !== undefined
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
      // Player already at max AST
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

  function renderRequirementBlock(player, census, advReq, effectiveCities, nextLevelNum) {
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
    const rows = [];
    let allMet = true;

    if (advReq.cities > 0) {
      const meetsCities = effectiveCities !== null && effectiveCities !== undefined
        ? effectiveCities >= advReq.cities
        : null;
      if (meetsCities === null) {
        rows.push(`<span class="req-row req-unknown">? ${advReq.cities} cities <span class="req-have">(not yet submitted)</span></span>`);
      } else {
        const note = player.wonder && cityCount !== null && cityCount < effectiveCities
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

  function renderAstBar(levels, currentLevel, expert) {
    const filtered = expert ? levels : levels.filter(l => l.level <= 75);
    const N = filtered.length;
    const nodes = filtered.map(l => {
      const cls = l.level === currentLevel ? 'ast-node active'
        : l.level < currentLevel ? 'ast-node past'
        : 'ast-node future';
      const label = l.level === 0 ? 'S' : l.level;
      const req = expert ? l.expert_req : l.basic_req;
      return `<div class="${cls}" title="${escapeHtml(l.era)}: ${escapeHtml(req || '')}">${label}</div>`;
    }).join('');
    // Age band labels are static for this empire (per-civ Stone/EBA spans
    // computed at initial render). They're already present in the DOM —
    // we only need to refresh the node row. To keep the existing labels,
    // find the existing wrap and replace just the inner node div, not the labels.
    // Simpler: include the labels by querying current DOM and reusing them.
    const existing = document.querySelector('.ast-bar-wrap .ast-progress-grid');
    if (existing) {
      // Pull the existing label divs (everything before the first .ast-node)
      const labels = Array.from(existing.children)
        .filter(el => el.classList.contains('ast-age-label'))
        .map(el => el.outerHTML)
        .join('');
      const cols = existing.style.gridTemplateColumns || `repeat(${N},var(--ast-node-size))`;
      return `<div class="ast-bar-wrap"><div class="ast-progress-grid" style="grid-template-columns:${cols}">${labels}${nodes}</div></div>`;
    }
    // First-render fallback (shouldn't happen since the page was server-rendered)
    return `<div class="ast-bar-wrap"><div class="ast-progress-grid" style="grid-template-columns:repeat(${N},var(--ast-node-size))">${nodes}</div></div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  Pure helpers (mirror server-side game logic)
  // ─────────────────────────────────────────────────────────────────────────

  function ordinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return s[(v - 20) % 10] ?? s[v] ?? 'th';
  }

  function makeScoreEntry(p, cityVp) {
    return {
      total: p.ast_level + p.adv_points + (cityVp || 0) + (p.late_iron_age_bonus ? 5 : 0),
      ast_level: p.ast_level,
      adv_6vp: p.adv_6vp,
      adv_3vp: p.adv_3vp,
      rank_order: p.rank_order,
      civ_number: p.civ_number,
    };
  }

  function compareScores(a, b) {
    if (b.total !== a.total) return b.total - a.total;
    if (b.ast_level !== a.ast_level) return b.ast_level - a.ast_level;
    if (b.adv_6vp !== a.adv_6vp) return b.adv_6vp - a.adv_6vp;
    if (b.adv_3vp !== a.adv_3vp) return b.adv_3vp - a.adv_3vp;
    return (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number);
  }

  function sameScoreGroup(a, b) {
    return a.total === b.total && a.ast_level === b.ast_level
      && a.adv_6vp === b.adv_6vp && a.adv_3vp === b.adv_3vp;
  }

  function playerTotalVp(p, cityCount) {
    return p.ast_level + p.adv_points + (cityCount || 0) + (p.late_iron_age_bonus ? 5 : 0);
  }

  function advancesOfTier(p, tier) {
    if (tier === 'expensive') return p.adv_6vp;
    if (tier === 'medium')    return p.adv_3vp + p.adv_6vp;
    if (tier === 'cheap')     return p.adv_1vp;
    return p.adv_1vp + p.adv_3vp + p.adv_6vp;
  }

  function getCivAstProfile(civNumber, expert) {
    if (expert) {
      if (LATE_BRONZE_EXPERT.has(civNumber)) return { stoneEnd: 25, ebaEnd: 35 };
      return { stoneEnd: 20, ebaEnd: 35 };
    }
    if (LATE_BRONZE_BASIC.has(civNumber)) return { stoneEnd: 25, ebaEnd: 40 };
    if (LATE_START.has(civNumber))        return { stoneEnd: 20, ebaEnd: 40 };
    return { stoneEnd: 20, ebaEnd: 35 };
  }

  function sortCensusOrder(state) {
    return [...state.players].sort((a, b) => {
      if (a.military !== b.military) return a.military - b.military;
      const ca = state.census.find(c => c.player_id === a.id);
      const cb = state.census.find(c => c.player_id === b.id);
      const pa = ca?.population ?? -Infinity;
      const pb = cb?.population ?? -Infinity;
      if (pa !== pb) return pb - pa;
      return a.civ_number - b.civ_number;
    });
  }

  function computeLbInfo(player, state) {
    const censusByPlayer = new Map(state.census.map(c => [c.player_id, c.city_count ?? 0]));
    const sorted = [...state.players].sort((a, b) =>
      compareScores(
        makeScoreEntry(a, censusByPlayer.get(a.id) ?? 0),
        makeScoreEntry(b, censusByPlayer.get(b.id) ?? 0),
      )
    );
    const idx = sorted.findIndex(p => p.id === player.id);
    if (idx === -1) return { pos: 1, tied: false, resolved: false };
    const myScore = makeScoreEntry(player, censusByPlayer.get(player.id) ?? 0);
    let groupStart = idx;
    while (groupStart > 0 && sameScoreGroup(makeScoreEntry(sorted[groupStart - 1], censusByPlayer.get(sorted[groupStart - 1].id) ?? 0), myScore)) groupStart--;
    let groupEnd = idx;
    while (groupEnd + 1 < sorted.length && sameScoreGroup(myScore, makeScoreEntry(sorted[groupEnd + 1], censusByPlayer.get(sorted[groupEnd + 1].id) ?? 0))) groupEnd++;
    const tied = groupEnd > idx || idx > groupStart;
    const resolved = tied && sorted.slice(groupStart, groupEnd + 1).every(p => p.rank_order !== 0);
    const pos = resolved ? idx + 1 : groupStart + 1;
    return { pos, tied, resolved };
  }

  function getAdvanceRequirement(player, levels, expert) {
    const curIdx = levels.findIndex(l => l.level === player.ast_level);
    if (curIdx < 0 || curIdx >= levels.length - 1) return null;
    const currentLevel = levels[curIdx];
    const profile = getCivAstProfile(player.civ_number, expert);
    if (profile.stoneEnd > 20 && currentLevel.level < profile.stoneEnd) return null;
    if (!expert && (currentLevel.level === 35 || currentLevel.level === 40)) {
      if (currentLevel.level < profile.ebaEnd) return { cities: 2 };
    }
    const reqJson = expert ? currentLevel.expert_req_json : currentLevel.basic_req_json;
    return reqJson ? JSON.parse(reqJson) : null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
})();
