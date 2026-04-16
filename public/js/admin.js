/**
 * Admin page JavaScript.
 * Handles both the game setup wizard and the active game admin controls.
 */
(function () {
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

    // DEV seed data
    const SEED_PLAYERS = [
      { civ_id: 1,  name: 'Alexander',  region: 'west' },
      { civ_id: 2,  name: 'Emil',       region: 'east' },
      { civ_id: 3,  name: 'Tarjei',     region: 'east' },
      { civ_id: 5,  name: 'Katja',      region: 'west' },
      { civ_id: 6,  name: 'Malin',      region: 'east' },
      { civ_id: 7,  name: 'Roe',        region: 'west' },
      { civ_id: 9,  name: 'Thomas',     region: 'west' },
      { civ_id: 10, name: 'Dag',        region: 'east' },
      { civ_id: 11, name: 'Fridtjof',   region: 'west' },
      { civ_id: 12, name: 'Stefan',     region: 'east' },
      { civ_id: 13, name: 'Trine',      region: 'west' },
      { civ_id: 14, name: 'Ulf',        region: 'east' },
      { civ_id: 15, name: 'Nils-Anders',region: 'west' },
      { civ_id: 16, name: 'Eric',       region: 'east' },
      { civ_id: 17, name: 'Magnus',     region: 'west' },
      { civ_id: 18, name: 'Ael',        region: 'east' },
    ];

    // keyed by civ_id (= civ number, since civs seeded in order 1–18)
    // ADV constraints (expert): AST≥70 → adv_1vp=17 (all 17 <100 each advances)
    //                           AST≥65 → adv_1vp≥10 (cleared "10 <100 each" req at lvl 60)
    //                           AST≥50 → total advances ≥ 12 (cleared "12 advances" req)
    // Real game final scores (total = ast + adv + lia, city VP does NOT count):
    //   Carthage 184 (incl. 5VP LIA), Celt 153, Saba+Hellas 145, Kushan+Nubia 126,
    //   Hatti+Egypt 124, Persia 109, Indus 103, Minoa 100, Assyria 89,
    //   Rome+Iberia 87, Babylon 76, Parthia 58
    //   Saba vs Hellas resolved by adv_6vp: Hellas(4) > Saba(3)
    // census values from actual last-round population tokens (old tool data)
    // adv splits chosen so v1*1+v3*3+v6*6 = exact adv total; all v≤17 (max 17 low-VP cards)
    const SEED_STATE = {
      1:  { military: false, census: 36, ast: 65, adv_1vp: 11, adv_3vp:  2, adv_6vp:  3, city_count: 4 },  // Minoa    35VP  → 65+35=100
      2:  { military: false, census: 39, ast: 75, adv_1vp: 16, adv_3vp: 12, adv_6vp:  3, city_count: 6 },  // Saba     70VP  → 75+70=145 (tied Hellas, loses adv_6vp 3 vs 4)
      3:  { military: false, census: 27, ast: 55, adv_1vp:  7, adv_3vp:  1, adv_6vp:  4, city_count: 7 },  // Assyria  34VP  → 55+34=89
      5:  { military: true,  census: 24, ast: 75, adv_1vp: 15, adv_3vp:  7, adv_6vp:  7, city_count: 7 },  // Celt     78VP  → 75+78=153
      6:  { military: false, census: 45, ast: 55, adv_1vp: 12, adv_3vp:  3, adv_6vp:  0, city_count: 5 },  // Babylon  21VP  → 55+21=76
      7:  { military: false, census: 30, ast: 80, adv_1vp: 15, adv_3vp:  6, adv_6vp: 11, city_count: 7, lia: true },  // Carthage 99VP+5LIA → 80+99+5=184
      9:  { military: false, census: 26, ast: 70, adv_1vp: 15, adv_3vp:  5, adv_6vp:  4, city_count: 7 },  // Hatti    54VP  → 70+54=124 (tied Egypt)
      10: { military: false, census: 31, ast: 70, adv_1vp: 17, adv_3vp:  3, adv_6vp:  5, city_count: 6 },  // Kushan   56VP  → 70+56=126 (tied Nubia)
      11: { military: false, census: 31, ast: 60, adv_1vp:  9, adv_3vp:  2, adv_6vp:  2, city_count: 6 },  // Rome     27VP  → 60+27=87  (tied Iberia)
      12: { military: true,  census: 34, ast: 65, adv_1vp: 11, adv_3vp:  3, adv_6vp:  4, city_count: 5 },  // Persia   44VP  → 65+44=109
      13: { military: false, census: 44, ast: 60, adv_1vp:  9, adv_3vp:  2, adv_6vp:  2, city_count: 6 },  // Iberia   27VP  → 60+27=87  (tied Rome)
      14: { military: false, census: 43, ast: 70, adv_1vp: 17, adv_3vp:  3, adv_6vp:  5, city_count: 6 },  // Nubia    56VP  → 70+56=126 (tied Kushan)
      15: { military: false, census: 39, ast: 75, adv_1vp: 16, adv_3vp: 10, adv_6vp:  4, city_count: 6 },  // Hellas   70VP  → 75+70=145 (tied Saba, wins adv_6vp 4 vs 3)
      16: { military: false, census: 39, ast: 65, adv_1vp: 11, adv_3vp:  3, adv_6vp:  3, city_count: 7 },  // Indus    38VP  → 65+38=103
      17: { military: false, census: 36, ast: 70, adv_1vp: 15, adv_3vp:  5, adv_6vp:  4, city_count: 7 },  // Egypt    54VP  → 70+54=124 (tied Hatti)
      18: { military: false, census: 26, ast: 45, adv_1vp:  4, adv_3vp:  1, adv_6vp:  1, city_count: 3 },  // Parthia  13VP  → 45+13=58
    };

    // DEV: seed game (players only)
    const seedBtn = document.getElementById('seed-test-game');
    if (seedBtn) {
      seedBtn.addEventListener('click', async () => {
        seedBtn.disabled = true;
        try {
          const res = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expert: 1, players: SEED_PLAYERS }),
          });
          const data = await res.json();
          if (data.ok) { location.reload(); }
          else { alert(data.error ?? 'Seed failed.'); seedBtn.disabled = false; }
        } catch { alert('Network error.'); seedBtn.disabled = false; }
      });
    }

    // DEV: seed full game state (reset → start → census + military + AST + ADV → reveal)
    const seedFullBtn = document.getElementById('seed-full-state');
    if (seedFullBtn) {
      seedFullBtn.addEventListener('click', async () => {
        seedFullBtn.disabled = true;
        try {
          await post('/api/game/reset', { confirm: true });
          const startRes = await fetch('/api/game/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expert: 1, players: SEED_PLAYERS }),
          });
          const startData = await startRes.json();
          if (!startData.ok) { alert(startData.error ?? 'Start failed.'); seedFullBtn.disabled = false; return; }

          const state = await fetch('/api/state').then(r => r.json());
          let liaPlayerId = null;
          for (const player of state.players) {
            const s = SEED_STATE[player.civ_id];
            if (!s) continue;
            await post(`/api/players/${player.id}/ast`, { level: s.ast });
            await post(`/api/players/${player.id}/adv`, { adv_1vp: s.adv_1vp, adv_3vp: s.adv_3vp, adv_6vp: s.adv_6vp });
            if (s.military) await post(`/api/players/${player.id}/military`, {});
            if (s.lia) liaPlayerId = player.id;
          }
          // Apply LIA bonus explicitly last, overriding any auto-grant from the seed loop
          if (liaPlayerId) await post(`/api/players/${liaPlayerId}/late-iron-age-bonus`, { grant: true });
          // Set round BEFORE census so census rows land in the correct round
          await post('/api/debug/set-round', { round: 16 });
          const state2 = await fetch('/api/state').then(r => r.json());
          for (const player of state2.players) {
            const s = SEED_STATE[player.civ_id];
            if (!s) continue;
            await post(`/api/players/${player.id}/census`, { population: s.census });
            await post(`/api/players/${player.id}/city-count`, { city_count: s.city_count });
          }
          await post('/api/census/reveal', {});
          location.reload();
        } catch (e) { alert('Error: ' + e.message); seedFullBtn.disabled = false; }
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
      try {
        const res = await fetch('/api/game/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expert: parseInt(expert, 10), players }),
        });
        const data = await res.json();
        if (data.ok) {
          location.reload();
        } else {
          errorEl.textContent = data.error ?? 'Failed to start game.';
          startBtn.disabled = false;
        }
      } catch {
        errorEl.textContent = 'Network error.';
        startBtn.disabled = false;
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVE GAME ADMIN
  // ─────────────────────────────────────────────────────────────────────────
  function initActive() {
    // Advance round
    const advanceBtn = document.getElementById('advance-round');
    if (advanceBtn) {
      advanceBtn.addEventListener('click', async () => {
        advanceBtn.disabled = true;
        await post('/api/game/round/next', {});
        location.reload();
      });
    }

    // Prepare for AST — clear city counts, switch to post-calamity phase
    const prepareAstBtn = document.getElementById('prepare-ast');
    if (prepareAstBtn) {
      prepareAstBtn.addEventListener('click', async () => {
        prepareAstBtn.disabled = true;
        await post('/api/game/cities/clear', {});
        location.reload();
      });
    }


    // Reset game
    const resetBtn = document.getElementById('reset-game');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        await post('/api/game/reset', { confirm: true });
        location.reload();
      });
    }

    // ── Debug buttons ──────────────────────────────────────────────────────
    document.getElementById('debug-census')?.addEventListener('click', async () => {
      await post('/api/debug/census', {});
    });
    document.getElementById('debug-cities')?.addEventListener('click', async () => {
      await post('/api/debug/cities', {});
    });
    document.getElementById('debug-advances')?.addEventListener('click', async () => {
      await post('/api/debug/advances', {});
    });

    // Player name edits (on blur)
    document.querySelectorAll('.player-name-input').forEach(inp => {
      let originalValue = inp.value;
      inp.addEventListener('focus', () => { originalValue = inp.value; });
      inp.addEventListener('blur', async () => {
        if (inp.value.trim() === originalValue.trim()) return;
        await post(`/api/players/${inp.dataset.playerId}/name`, { name: inp.value.trim() || originalValue });
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    });

    // Military toggles
    document.querySelectorAll('.mil-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await post(`/api/players/${btn.dataset.playerId}/military`, {});
        location.reload();
      });
    });

    // AST controls
    document.querySelectorAll('.ast-select').forEach(sel => {
      sel.value = sel.dataset.serverValue ?? '';  // bypass browser form restoration
      sel.addEventListener('change', async () => {
        await post(`/api/players/${sel.dataset.playerId}/ast`, { level: parseInt(sel.value, 10) });
      });
    });

    document.querySelectorAll('.ast-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sel = document.querySelector(`.ast-select[data-player-id="${btn.dataset.playerId}"]`);
        if (!sel) return;
        const AST_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
        const cur = parseInt(sel.value, 10);
        const idx = AST_LEVELS.indexOf(cur);
        const dir = parseInt(btn.dataset.dir, 10);
        const next = AST_LEVELS[idx + dir];
        if (next == null) return;
        sel.value = next;
        await post(`/api/players/${btn.dataset.playerId}/ast`, { level: next });
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
        await post(`/api/players/${sel.dataset.playerId}/rank`, {
          rank_order: parseInt(chosen, 10),
          group_players: groupPlayers,
          group_positions: groupPositions,
        });
        // Use navigation instead of reload to prevent Firefox restoring old form state
        window.location.replace(window.location.pathname);
      });
    });

    // Census inputs (on blur / enter) — override browser form restoration from server value
    document.querySelectorAll('input.census-admin-input').forEach(inp => {
      inp.value = inp.dataset.serverValue ?? '';  // force server value, bypass browser restore
      let original = inp.value;
      inp.addEventListener('focus', () => { original = inp.value; });
      inp.addEventListener('blur', async () => {
        const raw = inp.value.trim();
        if (raw === original.trim()) return;
        if (raw === '') { inp.value = original; return; }
        let val = parseInt(raw, 10);
        if (isNaN(val)) { inp.value = original; return; }
        if (val < 0) val = 55 + val;  // negative shorthand
        if (val < 1 || val > 55) { inp.value = original; return; }
        inp.value = val;
        original = String(val);
        await post(`/api/players/${inp.dataset.playerId}/census`, { population: val });
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    });

    // City count dropdowns — submit on change
    document.querySelectorAll('select.city-admin-select').forEach(sel => {
      sel.value = sel.dataset.serverValue ?? '';  // bypass browser form restoration
      sel.addEventListener('change', async () => {
        const val = parseInt(sel.value, 10);
        if (isNaN(val) || val < 0 || val > 9) return;
        await post(`/api/players/${sel.dataset.playerId}/city-count`, { city_count: val });
      });
    });

    // City count +/- buttons
    document.querySelectorAll('.city-dec, .city-inc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const sel = document.querySelector(`.city-admin-select[data-player-id="${btn.dataset.playerId}"]`);
        if (!sel) return;
        const dir = parseInt(btn.dataset.dir, 10);
        const cur = parseInt(sel.value, 10);
        const base = isNaN(cur) ? (dir > 0 ? -1 : null) : cur;
        if (base === null) return;
        const next = base + dir;
        if (next < 0 || next > 9) return;
        sel.value = next;
        await post(`/api/players/${btn.dataset.playerId}/city-count`, { city_count: next });
      });
    });

    // Late Iron Age bonus star toggle (game-over view)
    document.querySelectorAll('.lia-star-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const currentlyGranted = btn.dataset.granted === '1';
        await post(`/api/players/${btn.dataset.playerId}/late-iron-age-bonus`, { grant: !currentlyGranted });
        location.reload();
      });
    });

    // Reload on state update (from other admin actions or player census)
    let reloadTimer = null;
    window.addEventListener('mett:state', () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => location.reload(), 600);
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────
  async function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
})();
