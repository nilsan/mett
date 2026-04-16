import type { FullState, PlayerRow, AstLevelRow } from '../db.js';
import type { CivRefRow } from '../db.js';
import { LATE_BRONZE_BASIC, LATE_BRONZE_EXPERT } from '../civs.js';

type AstStatus = 'advance' | 'stay' | 'regress' | 'unknown';

function nextAstStatus(p: PlayerRow, cityCount: number | null | undefined, levels: AstLevelRow[], expert: boolean): AstStatus {
  if (cityCount == null) return 'unknown';

  const AST_LEVELS = levels.map(l => l.level);
  const curIdx = AST_LEVELS.indexOf(p.ast_level);
  if (curIdx === -1) return 'unknown';

  const lateSet = expert ? LATE_BRONZE_EXPERT : LATE_BRONZE_BASIC;
  const stoneAgeMax = lateSet.has(p.civ_number) ? 20 : 15;
  const inStoneAge = p.ast_level <= stoneAgeMax;

  if (cityCount === 0 && !inStoneAge) return curIdx > 0 ? 'regress' : 'stay';
  if (curIdx >= AST_LEVELS.length - 1) return 'stay'; // already at max

  // Check the requirement stored AT THE CURRENT level — that's what you need to advance from it
  const currentLevel = levels[curIdx];
  // Slow-start empires treat level 20 as Stone Age — no requirement to advance from it
  if (currentLevel.level === 20 && lateSet.has(p.civ_number)) return 'advance';

  const req = expert ? currentLevel.expert_req : currentLevel.basic_req;
  if (!req || req === 'None') return 'advance';
  if (req === 'N/A') return 'stay';

  const cityMatch = req.match(/(\d+) cities/);
  if (cityMatch && cityCount < parseInt(cityMatch[1], 10)) return 'stay';

  if (req.includes('VP in advances')) {
    const vpM = req.match(/(\d+) VP in advances/);
    if (vpM && p.adv_points < parseInt(vpM[1], 10)) return 'stay';
    return 'advance';
  }
  if (req.includes('all 17 advances')) {
    if (p.adv_1vp < 17) return 'stay';
    const vpM = req.match(/\+ (\d+) VP/);
    if (vpM && p.adv_points < parseInt(vpM[1], 10)) return 'stay';
    return 'advance';
  }
  const advM = req.match(/(\d+) advances/);
  if (advM) {
    const n = parseInt(advM[1], 10);
    const have = req.includes('≥200 each') ? p.adv_6vp
      : req.includes('≥100 each') ? p.adv_3vp + p.adv_6vp
      : req.includes('<100 each') ? p.adv_1vp
      : p.adv_1vp + p.adv_3vp + p.adv_6vp;
    if (have < n) return 'stay';
    if (req.includes('<100 each')) {
      const vpM = req.match(/\+ (\d+) VP/);
      if (vpM && p.adv_points < parseInt(vpM[1], 10)) return 'stay';
    }
  }
  return 'advance';
}

function changePasswordSection(query: string): string {
  const error = query.includes('pwd_error=1') ? 'Current password is incorrect.'
    : query.includes('pwd_error=2') ? 'New password cannot be empty.'
    : '';
  const ok = query.includes('pwd_ok=1');
  return `
  <section class="admin-section danger-section">
    <h3>Change Password</h3>
    ${ok ? '<p class="pwd-ok">Password updated.</p>' : ''}
    ${error ? `<p class="login-error">${error}</p>` : ''}
    <form method="POST" action="/admin/change-password" class="change-pwd-form">
      <input type="password" name="current" placeholder="Current password" class="login-input" autocomplete="current-password">
      <input type="password" name="next" placeholder="New password" class="login-input" autocomplete="new-password">
      <button type="submit" class="btn-primary">Update Password</button>
    </form>
  </section>`;
}

export function renderAdmin(state: FullState, allCivs: CivRefRow[], query = ''): string {
  const { game, players } = state;

  if (!game.active) {
    if (players.length > 0) return renderGameOver(state, allCivs, query);
    return renderSetup(allCivs, query);
  }
  return renderActiveAdmin(state, allCivs, query);
}

function renderSetup(allCivs: CivRefRow[], query = ''): string {
  // Embed all civ data as JSON for JS to use — no visible grid needed
  const civData = JSON.stringify(allCivs.map(c => ({
    id: c.id, number: c.number, name: c.name,
    defRegion: c.def_region, color: c.color, text: c.text_color,
  })));

  return /* html */`
<div class="admin-page">
  <h2>Game Setup</h2>

  <section class="setup-section" style="border-color:#c0392b44;background:#c0392b11;display:flex;gap:0.75rem;flex-wrap:wrap">
    <button id="seed-test-game" class="btn-danger" style="opacity:0.7;font-size:0.8rem">
      [DEV] Seed 16-player game
    </button>
    <button id="seed-full-state" class="btn-danger" style="opacity:0.7;font-size:0.8rem">
      [DEV] Seed full game state (census + AST + ADV)
    </button>
  </section>

  <section class="setup-section">
    <h3>1. Game Mode</h3>
    <div class="mode-toggle-row">
      <label>
        <input type="radio" name="game-mode" value="0">
        <strong>Basic</strong>
      </label>
      <label>
        <input type="radio" name="game-mode" value="1" checked>
        <strong>Expert</strong>
      </label>
    </div>
  </section>

  <section class="setup-section">
    <h3>2. Player Count</h3>
    <div class="player-count-row">
      <label for="player-count">Number of players:</label>
      <select id="player-count" class="player-count-select">
        ${Array.from({length: 16}, (_, i) => i + 3).map(n =>
          `<option value="${n}" ${n === 18 ? 'selected' : ''}>${n}</option>`
        ).join('')}
      </select>
      <span class="setup-hint" id="setup-hint"></span>
    </div>
  </section>

  <section class="setup-section" id="name-section" style="display:none">
    <h3>3. Player Names</h3>
    <div id="name-inputs" class="name-inputs-grid2"></div>
  </section>

  <section class="setup-section">
    <button id="start-game" class="btn-primary" disabled>Start Game</button>
    <p id="start-error" class="error-msg"></p>
  </section>
  ${changePasswordSection(query)}
</div>
<script>window.ALL_CIVS = ${civData};</script>
<script src="/js/admin.js"></script>
`;
}

function renderGameOver(state: FullState, allCivs: CivRefRow[], query = ''): string {
  const { game, players, census } = state;
  const expert = game.expert === 1;

  // Compute final scores including Late Iron Age bonus (5VP)
  // City count does NOT contribute to final VP (cities are a resource, not a score)
  const scored = players.map(p => {
    const liaVp = p.late_iron_age_bonus ? 5 : 0;
    const total = p.ast_level + p.adv_points + liaVp;
    return { ...p, liaVp, total };
  }).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.ast_level !== a.ast_level) return b.ast_level - a.ast_level;
    if (b.adv_6vp !== a.adv_6vp) return b.adv_6vp - a.adv_6vp;
    if (b.adv_3vp !== a.adv_3vp) return b.adv_3vp - a.adv_3vp;
    return (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number);
  });

  // Detect unresolved ties; rank_order is a stable sort key only, not a tie resolver
  const tiedIds = new Set<number>();
  for (let i = 0; i < scored.length - 1; i++) {
    const a = scored[i], b = scored[i + 1];
    if (
      a.total === b.total &&
      a.ast_level === b.ast_level &&
      a.adv_6vp === b.adv_6vp &&
      a.adv_3vp === b.adv_3vp
    ) { tiedIds.add(a.id); tiedIds.add(b.id); }
  }

  // For each tie group, compute which actual leaderboard positions they span
  // e.g. players tied at 5th and 6th → groupPositions = [5, 6]
  const groupPositionsMap = new Map<number, number[]>(); // player id → [pos, pos+1, ...]
  let pos = 1;
  let gi = 0;
  while (gi < scored.length) {
    let gj = gi;
    while (
      gj + 1 < scored.length &&
      scored[gj + 1].total === scored[gi].total &&
      scored[gj + 1].ast_level === scored[gi].ast_level &&
      scored[gj + 1].adv_6vp === scored[gi].adv_6vp &&
      scored[gj + 1].adv_3vp === scored[gi].adv_3vp
    ) gj++;
    const groupPositions = Array.from({ length: gj - gi + 1 }, (_, k) => pos + k);
    for (let k = gi; k <= gj; k++) groupPositionsMap.set(scored[k].id, groupPositions);
    pos += gj - gi + 1;
    gi = gj + 1;
  }

  // A tie group is resolved when every member has rank_order !== 0
  const resolvedTiedIds = new Set<number>();
  { let gi = 0;
    while (gi < scored.length) {
      if (!tiedIds.has(scored[gi].id)) { gi++; continue; }
      let gj = gi;
      while (gj + 1 < scored.length && tiedIds.has(scored[gj + 1].id) &&
        scored[gj + 1].total === scored[gi].total &&
        scored[gj + 1].ast_level === scored[gi].ast_level &&
        scored[gj + 1].adv_6vp === scored[gi].adv_6vp &&
        scored[gj + 1].adv_3vp === scored[gi].adv_3vp
      ) gj++;
      const group = scored.slice(gi, gj + 1);
      if (group.every(p => p.rank_order !== 0)) group.forEach(p => resolvedTiedIds.add(p.id));
      gi = gj + 1;
    }
  }

  // Display rank: actual position, except unresolved ties share their group's starting rank
  const displayRanks: number[] = [];
  for (let i = 0; i < scored.length; i++) {
    if (i > 0) {
      const prev = scored[i - 1], curr = scored[i];
      const shareRank = tiedIds.has(prev.id) && tiedIds.has(curr.id) &&
        !resolvedTiedIds.has(prev.id) &&
        prev.total === curr.total && prev.ast_level === curr.ast_level &&
        prev.adv_6vp === curr.adv_6vp && prev.adv_3vp === curr.adv_3vp;
      displayRanks.push(shareRank ? displayRanks[i - 1] : i + 1);
    } else {
      displayRanks.push(1);
    }
  }

  const MEDALS: Record<number, string> = {
    1: '<span class="medal medal-gold">⚑</span>',
    2: '<span class="medal medal-silver">⚑</span>',
    3: '<span class="medal medal-bronze">⚑</span>',
  };

  const rows = scored.map((p, i) => {
    const unresolved = tiedIds.has(p.id) && !resolvedTiedIds.has(p.id);
    const medal = MEDALS[displayRanks[i]] ?? '';
    const star = p.late_iron_age_bonus
      ? `<button class="lia-star-btn lia-star-on" data-player-id="${p.id}" data-granted="1" title="Late Iron Age bonus (5VP) — click to remove">★</button>`
      : `<button class="lia-star-btn lia-star-off" data-player-id="${p.id}" data-granted="0" title="Grant Late Iron Age bonus (5VP)">★</button>`;
    let rankCell = '<td class="go-tie"></td>';
    if (tiedIds.has(p.id)) {
      const groupPositions = groupPositionsMap.get(p.id) ?? [];
      const groupKey = groupPositions.join(',');
      const groupPlayers = scored
        .filter(s => groupPositionsMap.get(s.id)?.join(',') === groupKey)
        .map(s => s.id)
        .join(',');
      // All tied players get an editable select — server clears conflicts on submit
      const currentValue = groupPositions.includes(p.rank_order) ? String(p.rank_order) : '';
      const options = ['<option value="">—</option>', ...groupPositions.map(gp =>
        `<option value="${gp}"${p.rank_order === gp ? ' selected' : ''}>${gp}</option>`)].join('');
      rankCell = `<td class="go-tie"><select class="rank-select" autocomplete="off" data-player-id="${p.id}" data-group-key="${groupKey}" data-group-players="${groupPlayers}" data-server-value="${currentValue}">${options}</select></td>`;
    }
    const liaDetail = p.late_iron_age_bonus ? ' +5★' : '';
    return `<tr${unresolved ? ' class="lb-tied"' : ''}>
      <td class="rank go-rank">${unresolved ? '=' : displayRanks[i]}</td>
      <td class="go-empire">
        <span class="civ-badge civ-badge-with-num" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num-in-badge">${p.civ_number}</span><span class="civ-badge-label">${p.civ_name}<span class="go-player-name">${p.name}</span></span></span>
      </td>
      <td class="total-vp go-total">${star}${medal} <strong>${p.total}</strong></td>
      ${rankCell}
    </tr>`;
  }).join('');

  const civData = JSON.stringify(allCivs.map(c => ({
    id: c.id, number: c.number, name: c.name,
    defRegion: c.def_region, color: c.color, text: c.text_color,
  })));

  const hasTies = tiedIds.size > 0;

  return /* html */`
<div class="admin-page">
  <div class="admin-header">
    <h2>Game Over — Final Scores</h2>
    <div class="admin-badges">
      <span class="mode-badge">${expert ? 'Expert' : 'Basic'}</span>
      <span class="mode-badge" style="background:#555">Round ${game.current_round}</span>
    </div>
  </div>

  ${hasTies ? '<div class="final-round-banner">Some players are tied — set tie-break rank numbers to resolve (lower number = higher position).</div>' : ''}

  <section class="admin-section go-section">
    <div class="table-scroll">
      <table class="mett-table game-over-table">
        <thead><tr>
          <th>#</th>
          <th>Empire</th>
          <th>Player</th>
          <th title="Total Victory Points">Total VP</th>
          ${hasTies ? '<th title="Tie-break rank">Tie</th>' : ''}
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No players</td></tr>'}</tbody>
      </table>
    </div>
    <p class="table-hint">★ = Late Iron Age bonus (5VP, first to reach Late Iron Age). Click ★ to reassign manually.</p>
  </section>

  <section class="admin-section danger-section">
    <h3>Start New Game</h3>
    <button id="reset-game" class="btn-danger">Reset &amp; New Game</button>
  </section>
  ${changePasswordSection(query)}
</div>
<script>window.ALL_CIVS = ${civData};</script>
<script src="/js/admin.js"></script>
`;
}

function renderActiveAdmin(state: FullState, allCivs: CivRefRow[], query = ''): string {
  const { game, players, census } = state;
  const expert = game.expert === 1;
  const AST_LEVELS = state.astLevels.map(l => l.level);
  const isFinalRound = game.is_final_round === 1;
  const citiesPhase = game.cities_phase === 1; // false=pre-trade, true=post-calamity
  const n = players.length;
  const censusCount = census.filter(c => c.population != null).length;
  const citiesCount = census.filter(c => c.city_count != null).length;
  const allCitiesReady = n > 0 && citiesCount === n;
  // Pre-trade phase complete = all cities in AND not yet cleared for post-calamity
  const showPrepareAst = allCitiesReady && !citiesPhase;

  const playerRows = players.map(p => {
    const c = census.find(x => x.player_id === p.id);
    const submitted = c?.population != null;
    const astOptions = AST_LEVELS.map(l =>
      `<option value="${l}" ${p.ast_level === l ? 'selected' : ''}>${l}</option>`
    ).join('');

    const astStatus = nextAstStatus(p, c?.city_count, state.astLevels, expert);
    const dotTitle = astStatus === 'advance' ? 'Will advance' : astStatus === 'regress' ? 'Will regress' : astStatus === 'stay' ? 'Requirements not met' : 'Post-calamity city count unknown';

    return `<tr data-player-id="${p.id}">
      <td data-label="Empire">
        <span class="civ-badge civ-badge-with-num" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num-in-badge">${p.civ_number}</span>${p.civ_name}</span>
      </td>
      <td data-label="Player">
        <input type="text" class="player-name-input" value="${p.name}" data-player-id="${p.id}">
      </td>
      <td data-label="Military">
        <button class="mil-toggle ${p.military ? 'mil-on' : 'mil-off'}" data-player-id="${p.id}"
          title="${p.military ? 'Has Military — click to remove' : 'No Military — click to grant'}">
          ⚔ ${p.military ? 'Yes' : 'No'}
        </button>
      </td>
      <td data-label="A.S.T.">
        <div class="ast-ctrl">
          <span class="ast-status-dot ast-status-${astStatus}" title="${dotTitle}"></span>
          <button class="ast-btn ast-dec" data-player-id="${p.id}" data-dir="-1">−</button>
          <select class="ast-select" data-player-id="${p.id}" data-server-value="${p.ast_level}">${astOptions}</select>
          <button class="ast-btn ast-inc" data-player-id="${p.id}" data-dir="1">+</button>
        </div>
      </td>
      <td data-label="Adv VP" class="adv-pts-cell">${p.adv_points}</td>
      <td data-label="Census">
        <input type="number" class="census-admin-input" min="1" max="55" autocomplete="off"
          value="${submitted ? c!.population : ''}"
          data-server-value="${submitted ? c!.population : ''}"
          placeholder="–" data-player-id="${p.id}">
      </td>
      <td data-label="Cities">
        <div class="ast-ctrl">
          <button class="ast-btn city-dec" data-player-id="${p.id}" data-dir="-1">−</button>
          <select class="city-admin-select" data-player-id="${p.id}" data-server-value="${c?.city_count ?? ''}">
            <option value="">—</option>
            ${Array.from({length: 10}, (_, i) =>
              `<option value="${i}"${c?.city_count === i ? ' selected' : ''}>${i}</option>`
            ).join('')}
          </select>
          <button class="ast-btn city-inc" data-player-id="${p.id}" data-dir="1">+</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return /* html */`
<div class="admin-page">
  <div class="admin-header">
    <h2>Admin — Round ${game.current_round}</h2>
    <div class="admin-badges">
      <span class="mode-badge">${expert ? 'Expert' : 'Basic'}</span>
      ${isFinalRound ? '<span class="final-round-badge">FINAL ROUND</span>' : ''}
      ${game.census_revealed ? '<span class="revealed-badge">Census Revealed</span>' : ''}
    </div>
  </div>

  ${isFinalRound ? '<div class="final-round-banner">⚑ Final Round — clicking End Game will close the game and reveal final scores.</div>' : ''}

  <section class="admin-section round-section">
    <div class="submission-progress">
      <div class="sub-prog-item${censusCount === n ? ' sub-prog-done' : ''}">
        <span class="sub-prog-label">Census</span>
        <span class="sub-prog-count">${censusCount}/${n}</span>
      </div>
      <div class="sub-prog-item${citiesCount === n ? ' sub-prog-done' : ''}">
        <span class="sub-prog-label">Cities ${citiesPhase ? '(post-calamity)' : '(pre-trade)'}</span>
        <span class="sub-prog-count">${citiesCount}/${n}</span>
      </div>
    </div>
    <div class="round-controls">
      ${showPrepareAst
        ? `<button id="prepare-ast" class="btn-primary">Prepare for AST — Round ${game.current_round}</button>`
        : `<button id="advance-round" class="${isFinalRound ? 'btn-danger' : 'btn-primary'}"${allCitiesReady ? '' : ' disabled'}>
        ${isFinalRound ? 'End Game' : `Advance to Round ${game.current_round + 1}`}
      </button>`
      }
      <span class="round-hint">
        ${citiesPhase
          ? 'All empires must submit post-calamity city count before advancing'
          : 'Submit city count before trading, then use Prepare for AST to collect post-calamity counts'
        }
      </span>
    </div>
    <div class="debug-controls">
      <button id="debug-census" class="btn-danger">⚄ Random Census</button>
      <button id="debug-cities" class="btn-danger">⚄ Random Cities</button>
      <button id="debug-advances" class="btn-danger">⚄ Simulate Advances</button>
    </div>
  </section>

  <section class="admin-section">
    <h3>Players</h3>
    <div class="table-scroll">
      <table class="mett-table admin-table">
        <thead><tr>
          <th>Empire</th>
          <th>Player Name</th>
          <th>Military</th>
          <th>A.S.T. Position</th>
          <th>Adv VP</th>
          <th>Census</th>
          <th title="Cities on board">Cities</th>
        </tr></thead>
        <tbody>${playerRows || '<tr><td colspan="6">No players</td></tr>'}</tbody>
      </table>
    </div>
  </section>

  <section class="admin-section ast-req-section">
    <h3>A.S.T. Requirements <span class="mode-badge" style="font-size:0.7rem">${expert ? 'Expert' : 'Basic'}</span></h3>
    <div class="table-scroll">
      <table class="mett-table ast-req-table">
        <thead><tr><th>VP</th><th>Era</th><th>Requirement</th></tr></thead>
        <tbody>
          ${state.astLevels.filter(l => l.level > 0).map(l => {
            const req = (expert ? l.expert_req : l.basic_req) ?? '—';
            return `<tr><td class="ast-req-vp">${l.level}</td><td class="ast-req-era">${l.era}</td><td>${req}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </section>

<section class="admin-section danger-section">
    <h3>Danger Zone</h3>
    <button id="reset-game" class="btn-danger">Reset / New Game</button>
  </section>
  ${changePasswordSection(query)}
</div>
<script>
  window.CURRENT_ROUND = ${game.current_round};
</script>
<script src="/js/admin.js"></script>
`;
}
