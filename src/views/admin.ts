import type { FullState, PlayerRow, AstLevelRow, CensusRow } from '../db.js';
import type { CivRefRow } from '../db.js';
import { playerTotalVp, compareScores, makeScoreEntry, computeTieGroupMeta } from '../models/game.js';
import { empireCell } from './empire.js';
import { LIA_THRESHOLD } from '../models/ast.js';

function pwdFormHtml(query: string): string {
  const error = query.includes('pwd_error=1') ? 'Current password is incorrect.'
    : query.includes('pwd_error=2') ? 'New password cannot be empty.'
    : '';
  const ok = query.includes('pwd_ok=1');
  const showOpen = !!(error || ok);
  return `<div id="pwd-form-wrap" style="${showOpen ? '' : 'display:none'}">
    ${ok ? '<p class="pwd-ok" style="margin:0.5rem 0 0">Password updated.</p>' : ''}
    ${error ? `<p class="login-error" style="margin:0.5rem 0 0">${error}</p>` : ''}
    <form method="POST" action="/admin/change-password" class="change-pwd-form" style="margin-top:0.5rem">
      <input type="password" name="current" placeholder="Current password" class="login-input" autocomplete="current-password">
      <input type="password" name="next" placeholder="New password" class="login-input" autocomplete="new-password">
      <button type="submit" class="btn-primary">Update Password</button>
    </form>
  </div>`;
}

export function renderAdmin(state: FullState, allCivs: CivRefRow[], query = '', prevCensus: CensusRow[] = [], defaultPassword = false): string {
  const { game, players } = state;

  if (!game.active) {
    if (players.length > 0) return renderGameOver(state, allCivs, query, defaultPassword);
    return renderSetup(allCivs, query, defaultPassword);
  }
  return renderActiveAdmin(state, allCivs, query, prevCensus, defaultPassword);
}

/** Small informational strip shown when the admin password is still the default 'PASSWORD'. */
function defaultPasswordNag(show: boolean): string {
  if (!show) return '';
  return /* html */`
  <p class="default-pwd-nag">
    Using the default admin password. Rotate it in <strong>Change Password</strong> above.
  </p>`;
}

function renderSetup(allCivs: CivRefRow[], query = '', defaultPassword = false): string {
  // Embed all civ data as JSON for JS to use — no visible grid needed
  const civData = JSON.stringify(allCivs.map(c => ({
    id: c.id, number: c.number, name: c.name,
    defRegion: c.def_region, color: c.color, text: c.text_color,
  })));

  return /* html */`
<div class="admin-page">
  <h2>Game Setup</h2>

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
    <h3>2. Player Count &amp; Scenario</h3>
    <div class="player-count-row">
      <label for="player-count">Number of players:</label>
      <select id="player-count" class="player-count-select">
        ${Array.from({length: 16}, (_, i) => i + 3).map(n =>
          `<option value="${n}" ${n === 18 ? 'selected' : ''}>${n}</option>`
        ).join('')}
      </select>
    </div>
    <div class="scenario-toggle-row" id="scenario-toggle-row" style="display:none">
      <span class="scenario-toggle-label">Scenario:</span>
      <div class="mode-toggle-row">
        <label>
          <input type="radio" name="scenario" value="west" checked>
          <strong>West</strong>
        </label>
        <label>
          <input type="radio" name="scenario" value="east">
          <strong>East</strong>
        </label>
      </div>
    </div>
    <span class="setup-hint" id="setup-hint"></span>
  </section>

  <section class="setup-section" id="name-section" style="display:none">
    <h3>3. Player Names</h3>
    <div id="name-inputs" class="name-inputs-grid2"></div>
  </section>

  <section class="setup-section">
    <button id="start-game" class="btn-primary" disabled>Start Game</button>
    <p id="start-error" class="error-msg"></p>
  </section>

  <section class="setup-section" id="setup-sim-section" style="display:none;border-color:#c0392b44;background:#c0392b11">
    <h4 style="margin:0 0 0.75rem;font-size:0.85rem;opacity:0.8">[DEV] Simulate Game</h4>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-end">
      <div>
        <div style="font-size:0.8rem;opacity:0.7;margin-bottom:0.4rem">Rounds to simulate: <strong id="sim-rounds-display">8</strong></div>
        <input type="range" id="sim-rounds" min="1" max="16" value="8" style="width:10rem;accent-color:#c0392b">
      </div>
      <button id="sim-game" class="btn-danger" style="opacity:0.8">Simulate</button>
    </div>
  </section>

  <section class="setup-section danger-section">
    <h3>Danger Zone</h3>
    <div class="danger-row">
      <button id="setup-sim-toggle" class="btn-danger">Show Dev Tools</button>
      <button id="pwd-toggle" class="btn-danger">Change Password</button>
    </div>
    ${pwdFormHtml(query)}
  </section>
  ${defaultPasswordNag(defaultPassword)}
</div>
<script>window.ALL_CIVS = ${civData};</script>
<script src="/js/admin.js"></script>
`;
}

function renderGameOver(state: FullState, allCivs: CivRefRow[], query = '', defaultPassword = false): string {
  const { game, players, census } = state;
  const expert = game.expert === 1;

  // Final VP = AST VP + ADV VP + City VP (1 per city) + LIA bonus (5VP)
  // Wonder of the World does not count as a city for scoring
  const cityCountByPlayer = new Map(census.map(c => [c.player_id, c.city_count ?? 0]));
  const scored = players.map(p => {
    const cityVp = cityCountByPlayer.get(p.id) ?? 0;
    const total = playerTotalVp(p, cityVp);
    return { ...p, cityVp, total, _score: makeScoreEntry(p, cityVp) };
  }).sort((a, b) => compareScores(a._score, b._score));

  const tieMeta = computeTieGroupMeta(
    scored.map(p => ({ ...p._score, rank_order: p.rank_order }))
  );
  const hasTies = tieMeta.some(m => m.tied);

  const MEDALS: Record<number, string> = {
    1: '<span class="medal medal-gold">⚑</span>',
    2: '<span class="medal medal-silver">⚑</span>',
    3: '<span class="medal medal-bronze">⚑</span>',
  };

  const rows = scored.map((p, i) => {
    const meta = tieMeta[i]!;
    const unresolved = meta.tied && !meta.resolved;
    const medal = MEDALS[meta.displayRank] ?? '';
    const star = p.late_iron_age_bonus
      ? `<button class="lia-star-btn lia-star-on" data-player-id="${p.id}" data-granted="1" aria-label="Remove Late Iron Age bonus (5 VP) from ${p.name}" aria-pressed="true" title="Late Iron Age bonus (5VP) — click to remove"><span aria-hidden="true">★</span></button>`
      : `<button class="lia-star-btn lia-star-off" data-player-id="${p.id}" data-granted="0" aria-label="Grant Late Iron Age bonus (5 VP) to ${p.name}" aria-pressed="false" title="Grant Late Iron Age bonus (5VP)"><span aria-hidden="true">★</span></button>`;
    let rankCell = '<td class="go-tie"></td>';
    if (meta.tied) {
      const groupKey = meta.groupPositions.join(',');
      const groupPlayers = meta.groupMemberIndices.map(idx => scored[idx]!.id).join(',');
      // All tied players get an editable select — server clears conflicts on submit
      const currentValue = meta.groupPositions.includes(p.rank_order) ? String(p.rank_order) : '';
      const options = ['<option value="">—</option>', ...meta.groupPositions.map(gp =>
        `<option value="${gp}"${p.rank_order === gp ? ' selected' : ''}>${gp}</option>`)].join('');
      rankCell = `<td class="go-tie"><select class="rank-select" autocomplete="off" data-player-id="${p.id}" data-group-key="${groupKey}" data-group-players="${groupPlayers}" data-server-value="${currentValue}">${options}</select></td>`;
    }
    return `<tr${unresolved ? ' class="lb-tied"' : ''}>
      <td class="rank go-rank">${unresolved ? '=' : meta.displayRank}</td>
      <td class="go-empire">
        ${empireCell(p, 'badge-with-player')}
      </td>
      <td class="go-ast">${p.ast_level}</td>
      <td class="go-adv">${p.adv_points}</td>
      <td class="go-city">${p.cityVp}</td>
      <td class="go-lia">${star}</td>
      <td class="total-vp go-total">${medal} <strong>${p.total}</strong></td>
      ${rankCell}
    </tr>`;
  }).join('');

  const civData = JSON.stringify(allCivs.map(c => ({
    id: c.id, number: c.number, name: c.name,
    defRegion: c.def_region, color: c.color, text: c.text_color,
  })));

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
          <th title="AST Victory Points">AST</th>
          <th title="Advance Victory Points">ADV</th>
          <th title="City Victory Points (1 VP per city)">Cities</th>
          <th title="Late Iron Age bonus (5 VP)">★</th>
          <th title="Total Victory Points">Total VP</th>
          ${hasTies ? '<th title="Tie-break rank">Tie</th>' : ''}
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="7">No players</td></tr>'}</tbody>
      </table>
    </div>
    <p class="table-hint">★ = Late Iron Age bonus (5VP, first to reach Late Iron Age). Click ★ to reassign manually.</p>
  </section>

  <section class="admin-section danger-section">
    <h3>Danger Zone</h3>
    <div class="danger-row">
      <button id="reset-game" class="btn-danger">Reset &amp; New Game</button>
      <button id="pwd-toggle" class="btn-danger">Change Password</button>
    </div>
    ${pwdFormHtml(query)}
  </section>
  ${defaultPasswordNag(defaultPassword)}
</div>
<script>window.ALL_CIVS = ${civData};</script>
<script src="/js/admin.js"></script>
`;
}

function renderActiveAdmin(state: FullState, allCivs: CivRefRow[], query = '', prevCensus: CensusRow[] = [], defaultPassword = false): string {
  const { game, players, census } = state;
  const expert = game.expert === 1;
  const AST_LEVELS = state.astLevels.map(l => l.level);
  const isFinalRound = game.is_final_round === 1;
  const citiesPhase = game.cities_phase === 1; // false=pre-trade, true=post-calamity
  const n = players.length;
  const censusCount = census.filter(c => c.population != null).length;
  const citiesCount = census.filter(c => c.city_count != null).length;
  const allCitiesReady = n > 0 && citiesCount === n;

  const censusByPlayer = new Map(census.map(c => [c.player_id, c]));
  const prevCensusByPlayer = new Map(prevCensus.map(c => [c.player_id, c]));
  const playerRows = players.map(p => {
    const c = censusByPlayer.get(p.id);
    const prev = prevCensusByPlayer.get(p.id);
    const submitted = c?.population != null;
    const astOptions = AST_LEVELS.map(l =>
      `<option value="${l}" ${p.ast_level === l ? 'selected' : ''}>${l}</option>`
    ).join('');

    const astStatus = state.astStatus[p.id] ?? 'unknown';
    const dotTitle = astStatus === 'advance' ? 'Will advance' : astStatus === 'regress' ? 'Will regress' : astStatus === 'stay' ? 'Requirements not met' : 'Post-calamity city count unknown';

    return `<tr data-player-id="${p.id}">
      <td data-label="Empire">
        ${empireCell(p, 'badge')}
      </td>
      <td data-label="Player">
        <input type="text" class="player-name-input" value="${p.name}" data-player-id="${p.id}">
      </td>
      <td data-label="Census">
        <div class="ast-ctrl">
          <input type="number" class="census-admin-input" min="1" max="55" autocomplete="off"
            value="${submitted ? c!.population : ''}"
            data-server-value="${submitted ? c!.population : ''}"
            placeholder="–" data-player-id="${p.id}">
          <span class="${submitted ? 'census-submitted' : 'census-pending'} status-icon-fixed" aria-hidden="true">${submitted ? '✓' : '?'}</span>
        </div>
      </td>
      <td data-label="Cities">
        <div class="ast-ctrl">
          <select class="city-admin-select" data-player-id="${p.id}" data-server-value="${c?.city_count ?? ''}">
            ${Array.from({length: 10}, (_, i) =>
              `<option value="${i}"${(c?.city_count ?? prev?.city_count ?? 0) === i ? ' selected' : ''}>${i}</option>`
            ).join('')}
          </select>
          <span class="${c?.city_count != null ? 'census-submitted' : 'census-pending'} status-icon-fixed" aria-hidden="true">${c?.city_count != null ? '✓' : '?'}</span>
        </div>
      </td>
      <td data-label="Mil / Won">
        <div class="mil-won-cell">
          <button class="mil-toggle icon-toggle ${p.military ? 'mil-on' : 'mil-off'}" data-player-id="${p.id}"
            aria-label="${p.military ? `Remove Military from ${p.name}` : `Grant Military to ${p.name}`}"
            aria-pressed="${p.military ? 'true' : 'false'}"
            title="${p.military ? 'Has Military — click to remove' : 'No Military — click to grant'}"><span aria-hidden="true">⚔</span></button>
          <button class="won-toggle icon-toggle ${p.wonder ? 'won-on' : 'won-off'}" data-player-id="${p.id}"
            aria-label="${p.wonder ? `Remove Wonder from ${p.name}` : `Grant Wonder to ${p.name}`}"
            aria-pressed="${p.wonder ? 'true' : 'false'}"
            title="${p.wonder ? 'Has Wonder — click to remove' : 'No Wonder — click to grant'}"><span aria-hidden="true">★</span></button>
        </div>
      </td>
      <td data-label="Adv VP" class="adv-pts-cell">${p.adv_points}</td>
      <td data-label="A.S.T.">
        <div class="ast-ctrl">
          <select class="ast-select" data-player-id="${p.id}" data-server-value="${p.ast_level}">${astOptions}</select>
          <div class="ast-status-dots">
            <span class="ast-status-dot ast-status-${astStatus}" title="${dotTitle}"></span>
            <span class="ast-status-dot ${astStatus === 'regress' ? 'ast-status-regress' : 'ast-status-hidden'}" title="${dotTitle}"></span>
          </div>
        </div>
      </td>
      <td data-label="★">
        ${p.ast_level >= LIA_THRESHOLD
          ? `<button class="lia-star-btn ${p.late_iron_age_bonus ? 'lia-star-on' : 'lia-star-off'}" data-player-id="${p.id}" data-granted="${p.late_iron_age_bonus ? '1' : '0'}"
              aria-label="${p.late_iron_age_bonus ? `Remove Late Iron Age bonus (5 VP) from ${p.name}` : `Grant Late Iron Age bonus (5 VP) to ${p.name}`}"
              aria-pressed="${p.late_iron_age_bonus ? 'true' : 'false'}"
              title="${p.late_iron_age_bonus ? 'LIA bonus (5VP) — click to remove' : 'Grant LIA bonus (5VP)'}"><span aria-hidden="true">★</span></button>`
          : `<span class="lia-star-btn lia-star-ineligible" aria-hidden="true" title="Not yet in Late Iron Age">★</span>`
        }
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
      ${citiesPhase
        ? `<button id="advance-round" class="${isFinalRound ? 'btn-danger' : 'btn-primary'}"${allCitiesReady ? '' : ' disabled'}>
          ${isFinalRound ? 'End Game' : `Advance to Round ${game.current_round + 1}`}
        </button>`
        : `<button id="prepare-ast" class="btn-primary"${allCitiesReady ? '' : ' disabled'}>Trading done →</button>`
      }
      <span class="round-hint">
        ${citiesPhase
          ? 'Each empire re-enters city count after calamities. Click Advance when all are submitted.'
          : 'Each empire submits pre-trade city count. Click the button above after trading is done.'
        }
      </span>
    </div>
    <div id="sim-controls" style="display:none">
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
          <th>Census</th>
          <th title="Cities on board">Cities</th>
          <th>Mil / Won</th>
          <th>Adv VP</th>
          <th>A.S.T. Position</th>
          <th title="Late Iron Age bonus (5 VP) — first to reach LIA alone">★</th>
        </tr></thead>
        <tbody>${playerRows || '<tr><td colspan="7">No players</td></tr>'}</tbody>
      </table>
    </div>
  </section>


  <section class="admin-section danger-section">
    <h3>Danger Zone</h3>
    <div class="danger-row">
      <button id="reset-game" class="btn-danger">Reset / New Game</button>
      <button id="pwd-toggle" class="btn-danger">Change Password</button>
      <button id="sim-toggle" class="btn-danger">Show Simulation</button>
    </div>
    ${pwdFormHtml(query)}
  </section>
  ${defaultPasswordNag(defaultPassword)}
</div>
<script>
  window.CURRENT_ROUND = ${game.current_round};
</script>
<script src="/js/admin.js"></script>
`;
}
