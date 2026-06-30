/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Admin page JavaScript.
 * Handles both the game setup wizard and the active game admin controls.
 */
(function () {
  // ── Shared: Change Password toggle (all pages) ────────────────────────────
  const pwdToggle = document.getElementById('pwd-toggle');
  const pwdFormWrap = document.getElementById('pwd-form-wrap');
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
  const isSetup = !!document.getElementById('player-count');
  if (isSetup) initSetup();
  else initActive();

  // ─────────────────────────────────────────────────────────────────────────
  // SETUP WIZARD
  // ─────────────────────────────────────────────────────────────────────────
  function initSetup() {
    const allCivs = window.ALL_CIVS || [];  // injected by server
    let scenarioData = { west: {}, east: {}, combined: {} };
    // currentSelection: array of {id, number, name, color, text, region}
    let currentSelection = [];

    const playerCountSelect = document.getElementById('player-count');
    const scenarioToggleRow = document.getElementById('scenario-toggle-row');
    const hintEl = document.getElementById('setup-hint');
    const nameSection = document.getElementById('name-section');
    const nameInputsEl = document.getElementById('name-inputs');
    const startBtn = document.getElementById('start-game');
    const errorEl = document.getElementById('start-error');

    fetch('/api/setup-recommendations')
      .then(r => r.json())
      .then(data => {
        scenarioData = data;
        applyRecommendation();
      });

    playerCountSelect.addEventListener('change', () => {
      const n = parseInt(playerCountSelect.value, 10);
      scenarioToggleRow.style.display = n <= 9 ? '' : 'none';
      applyRecommendation();
    });

    document.querySelectorAll('input[name="scenario"]').forEach(radio => {
      radio.addEventListener('change', () => applyRecommendation());
    });

    function getScenario() {
      const n = parseInt(playerCountSelect.value, 10);
      if (n >= 10) return scenarioData.combined[n] ?? null;
      const side = document.querySelector('input[name="scenario"]:checked')?.value ?? 'west';
      return scenarioData[side]?.[n] ?? null;
    }

    function applyRecommendation() {
      const rec = getScenario();
      if (!rec) {
        hintEl.textContent = '';
        currentSelection = [];
        renderNameInputs();
        return;
      }
      currentSelection = rec.civNumbers
        .map(num => {
          const civ = allCivs.find(c => c.number === num);
          if (!civ) return null;
          const region = rec.regionOverrides[num] ?? civ.defRegion;
          return { ...civ, region };
        })
        .filter(Boolean)
        .sort((a, b) => a.number - b.number);

      hintEl.textContent = rec.note ?? '';
      renderNameInputs();
    }

    function renderNameInputs() {
      if (currentSelection.length === 0) {
        nameSection.style.display = 'none';
        startBtn.disabled = true;
        return;
      }

      // Preserve typed names across re-renders
      const saved = {};
      document.querySelectorAll('.name-text-input').forEach(inp => {
        if (inp.value.trim()) saved[inp.dataset.civId] = inp.value.trim();
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
        input.placeholder = `Player name`;
        input.autocomplete = 'off';
        input.dataset.civId = civ.id;
        input.dataset.region = civ.region;
        input.maxLength = 40;
        if (saved[civ.id]) input.value = saved[civ.id];

        row.appendChild(tag);
        row.appendChild(input);
        grid.appendChild(row);
      });

      nameInputsEl.innerHTML = '';
      nameInputsEl.appendChild(grid);
      startBtn.disabled = false;
    }

    // DEV: toggle sim section visibility
    const setupSimToggle = document.getElementById('setup-sim-toggle');
    const setupSimSection = document.getElementById('setup-sim-section');
    if (setupSimToggle && setupSimSection) {
      if (sessionStorage.getItem('setupSimVisible') === '1') {
        setupSimSection.style.display = '';
        setupSimToggle.textContent = 'Hide Dev Tools';
      }
      setupSimToggle.addEventListener('click', () => {
        const visible = setupSimSection.style.display !== 'none';
        setupSimSection.style.display = visible ? 'none' : '';
        setupSimToggle.textContent = visible ? 'Show Dev Tools' : 'Hide Dev Tools';
        sessionStorage.setItem('setupSimVisible', visible ? '0' : '1');
      });
    }

    // DEV: rounds slider display
    const simRoundsSlider = document.getElementById('sim-rounds');
    const simRoundsDisplay = document.getElementById('sim-rounds-display');
    if (simRoundsSlider && simRoundsDisplay) {
      simRoundsSlider.addEventListener('input', () => {
        simRoundsDisplay.textContent = simRoundsSlider.value;
      });
    }

    // DEV: simulate game
    const simBtn = document.getElementById('sim-game');
    if (simBtn) {
      simBtn.addEventListener('click', async () => {
        const origText = simBtn.textContent;
        simBtn.disabled = true;
        simBtn.textContent = 'Simulating…';
        const n = parseInt(playerCountSelect.value, 10);
        const expert = parseInt(document.querySelector('input[name="game-mode"]:checked')?.value ?? '1', 10);
        const rounds = parseInt(document.getElementById('sim-rounds')?.value ?? '8', 10);
        const scenario = n <= 9
          ? (document.querySelector('input[name="scenario"]:checked')?.value ?? 'west')
          : 'combined';
        const res = await mettPost('/api/debug/simulate', { expert, player_count: n, rounds, scenario, delay_ms: 300 });
        if (res.ok) location.reload();
        else { simBtn.textContent = origText; simBtn.disabled = false; }
      });
    }

    startBtn.addEventListener('click', async () => {
      errorEl.textContent = '';
      const players = Array.from(document.querySelectorAll('.name-text-input'))
        .map(inp => ({
          civ_id: parseInt(inp.dataset.civId, 10),
          name: inp.value.trim() || inp.placeholder,
          region: inp.dataset.region,
        }));
      if (!players.length) { errorEl.textContent = 'Select a player count first.'; return; }

      const expert = document.querySelector('input[name="game-mode"]:checked')?.value ?? '1';
      startBtn.disabled = true;
      const res = await mettPost('/api/game/start', { expert: parseInt(expert, 10), players });
      if (res.ok) location.reload();
      else startBtn.disabled = false;  // mettPost already toasted the failure reason
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVE GAME ADMIN
  // ─────────────────────────────────────────────────────────────────────────
  function initActive() {
    // Advance round. The button text is 'End Game' on the announced final
    // round in expert mode — irreversible from the UI, so confirm first.
    const advanceBtn = document.getElementById('advance-round');
    if (advanceBtn) {
      advanceBtn.addEventListener('click', async () => {
        const isEndGame = advanceBtn.textContent.trim().startsWith('End Game');
        if (isEndGame && !confirm('End the game now? Final scores will be revealed and the round counter stops here.')) return;
        advanceBtn.disabled = true;
        await mettPost('/api/game/round/next', {});
        location.reload();
      });
    }

    // Prepare for AST — clear city counts, switch to post-calamity phase
    const prepareAstBtn = document.getElementById('prepare-ast');
    if (prepareAstBtn) {
      prepareAstBtn.addEventListener('click', async () => {
        prepareAstBtn.disabled = true;
        await mettPost('/api/game/cities/clear', {});
        location.reload();
      });
    }


    // Reset game
    const resetBtn = document.getElementById('reset-game');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (!confirm('Reset the game? All current game data will be permanently deleted.')) return;
        await mettPost('/api/game/reset', { confirm: true });
        location.reload();
      });
    }

    // ── Simulation toggle (danger zone btn → round section buttons) ──────────
    const simToggle = document.getElementById('sim-toggle');
    const simControls = document.getElementById('sim-controls');
    if (simToggle && simControls) {
      // Restore visibility across reloads
      if (sessionStorage.getItem('simVisible') === '1') {
        simControls.style.display = '';
        simToggle.textContent = 'Hide Simulation';
      }
      simToggle.addEventListener('click', () => {
        const visible = simControls.style.display !== 'none';
        simControls.style.display = visible ? 'none' : '';
        simToggle.textContent = visible ? 'Show Simulation' : 'Hide Simulation';
        sessionStorage.setItem('simVisible', visible ? '0' : '1');
      });
    }
    document.getElementById('debug-census')?.addEventListener('click', async () => {
      await mettPost('/api/debug/census', {});
    });
    document.getElementById('debug-cities')?.addEventListener('click', async () => {
      await mettPost('/api/debug/cities', {});
    });
    document.getElementById('debug-advances')?.addEventListener('click', async () => {
      await mettPost('/api/debug/advances', {});
    });

    // Misclick recovery: roll the round counter back by one. Only present
    // when current_round > 1 (the server endpoint also clamps to >= 1).
    // This is the manual "undo the last round-advance" action.
    document.getElementById('debug-prev-round')?.addEventListener('click', async () => {
      if (!confirm('Roll the round counter back by one? Census + city counts for the current round will not be reverted.')) return;
      const cur = window.CURRENT_ROUND;
      if (typeof cur !== 'number' || cur < 2) return;
      const res = await mettPost('/api/debug/set-round', { round: cur - 1 });
      if (res.ok) location.reload();
    });

    // Player name edits (on blur)
    document.querySelectorAll('.player-name-input').forEach(inp => {
      let originalValue = inp.value;
      inp.addEventListener('focus', () => { originalValue = inp.value; });
      inp.addEventListener('blur', async () => {
        if (inp.value.trim() === originalValue.trim()) return;
        await mettPost(`/api/players/${inp.dataset.playerId}/name`, { name: inp.value.trim() || originalValue });
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    });

    // Military / Wonder / Special toggles — fire POST, let WS broadcast own the visual update.
    // No local optimistic update: the mett:state handler below re-syncs all three buttons
    // from the authoritative server state, so the click handler only needs to disable the
    // button (feedback while in-flight) and re-enable it if the request fails.
    for (const [cls, path] of [
      ['.mil-toggle', 'military'],
      ['.won-toggle', 'wonder'],
      ['.spc-toggle', 'special'],
    ]) {
      document.querySelectorAll(cls).forEach(btn => {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          const res = await mettPost(`/api/players/${btn.dataset.playerId}/${path}`, {});
          if (!res.ok) btn.disabled = false;
        });
      });
    }

    // AST controls
    document.querySelectorAll('.ast-select').forEach(sel => {
      sel.value = sel.dataset.serverValue ?? '';  // bypass browser form restoration
      sel.addEventListener('change', async () => {
        await mettPost(`/api/players/${sel.dataset.playerId}/ast`, { level: parseInt(sel.value, 10) });
      });
    });


    // Tie-break rank dropdowns (game-over view)
    document.querySelectorAll('select.rank-select').forEach(sel => {
      // Explicitly override Firefox form-state restoration with server-provided value
      sel.value = sel.dataset.serverValue ?? '';

      sel.addEventListener('change', async () => {
        const chosen = sel.value;
        if (!chosen) return;
        const groupPlayers = sel.dataset.groupPlayers.split(',').map(Number);
        const groupPositions = sel.dataset.groupKey.split(',').map(Number);
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
    document.querySelectorAll('input.census-admin-input').forEach(inp => {
      inp.value = inp.dataset.serverValue ?? '';  // force server value, bypass browser restore
      let original = inp.value;
      async function commit() {
        const raw = inp.value.trim();
        if (raw === original.trim()) return;
        if (raw === '') { inp.value = original; return; }
        let val = parseInt(raw, 10);
        if (isNaN(val)) { inp.value = original; return; }
        if (val < 0) val = 55 + val;  // negative shorthand
        if (val < 1 || val > 55) { inp.value = original; return; }
        inp.value = val;
        original = String(val);
        await mettPost(`/api/players/${inp.dataset.playerId}/census`, { population: val });
      }
      inp.addEventListener('focus', () => { original = inp.value; });
      inp.addEventListener('change', commit);
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    });

    // City count dropdowns — submit on change
    document.querySelectorAll('select.city-admin-select').forEach(sel => {
      if (sel.dataset.serverValue !== '') sel.value = sel.dataset.serverValue;
      sel.addEventListener('change', async () => {
        const val = parseInt(sel.value, 10);
        if (isNaN(val) || val < 0 || val > 9) return;
        await mettPost(`/api/players/${sel.dataset.playerId}/city-count`, { city_count: val });
      });
    });

    // Late Iron Age bonus star toggle. Skip the lia-star-ineligible spans
    // (rendered for players below LIA threshold) — they aren't <button>s.
    document.querySelectorAll('button.lia-star-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const currentlyGranted = btn.dataset.granted === '1';
        await mettPost(`/api/players/${btn.dataset.playerId}/late-iron-age-bonus`, { grant: !currentlyGranted });
        // No reload — the WS broadcast updates every star button in place
        // via the mett:state handler below.
      });
    });

    // React to state updates from WebSocket — update in place instead of reloading
    window.addEventListener('mett:state', (e) => {
      const data = e.detail;
      if (!data?.game || !data?.census || !data?.players) return;

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
      const sec = document.querySelector('.round-section');
      if (sec && Number(sec.dataset.phase) !== serverPhase) { location.reload(); return; }

      // Same phase — just refresh the current-phase submission count + button.
      const progEl = document.getElementById('round-progress-count');
      if (progEl) progEl.textContent = `${serverPhase === 0 ? censusCount : citiesCount}/${n}`;

      const prepBtn = document.getElementById('prepare-ast');
      const advBtn = document.getElementById('advance-round');
      if (prepBtn) prepBtn.disabled = !allCitiesReady;
      if (advBtn) advBtn.disabled = !allCitiesReady;

      // Update per-player AST movement indicator (green → advance,
      // orange = no change, red ← regress, · unknown).
      if (data.astStatus) {
        data.players.forEach(p => {
          const row = document.querySelector(`tr[data-player-id="${p.id}"]`);
          if (!row) return;
          const status = data.astStatus[p.id] ?? 'unknown';
          const title = status === 'advance' ? 'Will advance' : status === 'regress' ? 'Will regress' : status === 'stay' ? 'Requirements not met' : 'Post-calamity city count unknown';
          const glyph = status === 'advance' ? '→' : status === 'regress' ? '←' : status === 'stay' ? '=' : '·';
          const move = row.querySelector('.ast-move');
          if (move) {
            move.className = `ast-move ast-move-${status}`;
            move.title = title;
            move.textContent = glyph;
          }
        });
      }

      // Update per-player mil/won/spc toggles so changes from player pages
      // are reflected here without a full reload.
      data.players.forEach(p => {
        const row = document.querySelector(`tr[data-player-id="${p.id}"]`);
        if (!row) return;
        const toggles = [
          { sel: '.mil-toggle', val: p.military, onTitle: 'Has Military — click to remove',    offTitle: 'No Military — click to grant' },
          { sel: '.won-toggle', val: p.wonder,   onTitle: 'Has Wonder — click to remove',      offTitle: 'No Wonder — click to grant' },
          { sel: '.spc-toggle', val: p.special,  onTitle: 'Has special ability — click to remove', offTitle: 'No special ability — click to grant' },
        ];
        for (const { sel, val, onTitle, offTitle } of toggles) {
          const btn = row.querySelector(sel);
          if (!btn || btn.tagName !== 'BUTTON') continue;
          const prefix = sel.slice(1, 4); // 'mil', 'won', 'spc'
          const on = !!val;
          btn.classList.toggle(`${prefix}-on`, on);
          btn.classList.toggle(`${prefix}-off`, !on);
          btn.title = on ? onTitle : offTitle;
          btn.setAttribute('aria-pressed', on ? 'true' : 'false');
          btn.disabled = false;
        }
      });

      // Update per-player LIA-star buttons. Granting the bonus to one player
      // clears it from any others, so we refresh every eligible button on
      // every broadcast — not just the one that was clicked.
      data.players.forEach(p => {
        const row = document.querySelector(`tr[data-player-id="${p.id}"]`);
        if (!row) return;
        const lia = row.querySelector('.lia-star-btn');
        if (!lia || lia.tagName !== 'BUTTON') return;
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
      });

      // Update per-player census and city status icons
      data.census.forEach(c => {
        const row = document.querySelector(`tr[data-player-id="${c.player_id}"]`);
        if (!row) return;

        // Always reflect server submission state in the ✓/? icon, even when the
        // field still has focus — a <select> keeps focus after a change, so
        // gating the icon on activeElement made the checkmark intermittently
        // miss. Only the field *value* is guarded, to avoid clobbering an edit
        // the GM is still making.
        const censusInput = row.querySelector('.census-admin-input');
        if (censusInput) {
          const pop = c.population;
          if (document.activeElement !== censusInput) {
            censusInput.value = pop != null ? pop : '';
            censusInput.dataset.serverValue = pop != null ? String(pop) : '';
          }
          const icon = censusInput.closest('.ast-ctrl')?.querySelector('.status-icon-fixed');
          if (icon) {
            icon.textContent = pop != null ? '✓' : '?';
            icon.className = `${pop != null ? 'census-submitted' : 'census-pending'} status-icon-fixed`;
          }
        }

        const citySelect = row.querySelector('.city-admin-select');
        if (citySelect) {
          const count = c.city_count;
          if (document.activeElement !== citySelect) {
            if (count != null) citySelect.value = String(count);
            citySelect.dataset.serverValue = count != null ? String(count) : '';
          }
          const icon = citySelect.closest('.ast-ctrl')?.querySelector('.status-icon-fixed');
          if (icon) {
            icon.textContent = count != null ? '✓' : '?';
            icon.className = `${count != null ? 'census-submitted' : 'census-pending'} status-icon-fixed`;
          }
        }
      });
    });
  }

})();
