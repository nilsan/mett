import type { FullState, PlayerRow, CensusRow } from '../db.js';

interface PlayerWithCensus extends PlayerRow {
  census: CensusRow | null;
}

function moveOrder(players: PlayerWithCensus[], revealed: boolean): PlayerWithCensus[] {
  if (!revealed) return [...players].sort((a, b) => a.civ_number - b.civ_number);
  return [...players].sort((a, b) => {
    // Military moves last
    if (a.military !== b.military) return a.military - b.military;
    // Within group, lowest census first; tie → lowest empire number first
    const pa = a.census?.population ?? Infinity;
    const pb = b.census?.population ?? Infinity;
    if (pa !== pb) return pa - pb;
    return a.civ_number - b.civ_number;
  });
}

function civBadge(p: PlayerRow, withNum = false): string {
  const regionClass = p.region === 'west' ? 'region-west' : 'region-east';
  if (withNum) {
    return `<span class="civ-badge civ-badge-with-num ${regionClass}" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num-in-badge">${p.civ_number}</span>${p.civ_name}</span>`;
  }
  return `<span class="civ-badge ${regionClass}" style="background:${p.civ_color};color:${p.civ_text_color}">${p.civ_name}</span>`;
}

export function renderMain(state: FullState): string {
  const { game, players, census } = state;

  const pwc: PlayerWithCensus[] = players.map(p => ({
    ...p,
    census: census.find(c => c.player_id === p.id) ?? null,
  }));

  const allSubmitted = players.length > 0 && pwc.every(p => p.census?.population != null);
  const revealed = game.census_revealed === 1;
  const statusLabel = game.active ? `Round ${game.current_round}` : players.length > 0 ? 'Game over' : 'No active game';

  // Census table
  const censusOrdered = moveOrder(pwc, revealed);
  const censusRows = censusOrdered.map(p => {
    const submitted = p.census?.population != null;
    const milCell = p.military
      ? `<td class="mil-col"><span class="mil-dot" title="Has Military advance"></span></td>`
      : `<td class="mil-col"></td>`;
    // Population cell: number when revealed, green ✓ when submitted+hidden, red ? when pending
    let popCell: string;
    if (!submitted) {
      popCell = `<td class="census-pop not-submitted">?</td>`;
    } else if (revealed) {
      popCell = `<td class="census-pop">${p.census!.population}</td>`;
    } else {
      popCell = `<td class="census-pop submitted-hidden">✓</td>`;
    }
    const cityCount = p.census?.city_count;
    const cityCell = `<td class="city-col">${cityCount != null ? cityCount : ''}</td>`;
    return `<tr>
      <td class="empire-col"><div class="empire-col-inner">${civBadge(p, true)}</div></td>
      ${cityCell}
      ${milCell}
      ${popCell}
    </tr>`;
  }).join('');

  // Leaderboard sort: total VP → AST level → 6VP cards → 3VP cards → true tie (=)
  const leaderboard = [...pwc].sort((a, b) => {
    const tA = a.ast_level + a.adv_points, tB = b.ast_level + b.adv_points;
    if (tB !== tA) return tB - tA;
    if (b.ast_level !== a.ast_level) return b.ast_level - a.ast_level;
    if (b.adv_6vp !== a.adv_6vp) return b.adv_6vp - a.adv_6vp;
    if (b.adv_3vp !== a.adv_3vp) return b.adv_3vp - a.adv_3vp;
    return (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number);
  });

  // Build rank groups: each entry gets {displayRank, tied, groupStart, resolved}
  function sameTieGroup(a: typeof leaderboard[0], b: typeof leaderboard[0]): boolean {
    return a.ast_level + a.adv_points === b.ast_level + b.adv_points &&
      a.ast_level === b.ast_level &&
      a.adv_6vp === b.adv_6vp &&
      a.adv_3vp === b.adv_3vp;
  }
  const lbMeta: Array<{ displayRank: number; tied: boolean; groupStart: boolean; resolved: boolean }> = new Array(leaderboard.length);
  let pos = 1, gi = 0;
  while (gi < leaderboard.length) {
    // Find extent of this rank group
    let gj = gi;
    while (gj + 1 < leaderboard.length && sameTieGroup(leaderboard[gi], leaderboard[gj + 1])) gj++;
    const groupSize = gj - gi + 1;
    const tied = groupSize > 1;
    const resolved = tied && leaderboard.slice(gi, gj + 1).every(p => p.rank_order !== 0);
    for (let k = gi; k <= gj; k++) {
      lbMeta[k] = { displayRank: pos, tied, groupStart: k === gi, resolved };
    }
    pos += groupSize;
    gi = gj + 1;
  }

  const lbRows = leaderboard.map((p, i) => {
    const { displayRank, tied, groupStart, resolved } = lbMeta[i];
    const unresolved = tied && !resolved;
    const rankCell = tied
      ? `<td class="rank rank-tie" title="${unresolved ? 'Manual resolution needed' : ''}">${unresolved ? `=${displayRank}` : displayRank}</td>`
      : `<td class="rank">${displayRank}</td>`;
    const rowClass = [unresolved ? 'lb-tied' : '', groupStart && i > 0 ? 'lb-group-start' : ''].filter(Boolean).join(' ');
    return `<tr${rowClass ? ` class="${rowClass}"` : ''}>
      ${rankCell}
      <td>
        <span class="civ-badge lb-emp-badge ${p.region === 'west' ? 'region-west' : 'region-east'}" style="background:${p.civ_color};color:${p.civ_text_color}">
          <span class="lb-emp-top"><span class="civ-num-in-badge">${p.civ_number}</span>${p.civ_name}</span>
          <span class="lb-badge-name">${p.name}</span>
        </span>
      </td>
      <td class="player-name lb-player-col">${p.name}</td>
      <td class="adv-pts">${p.adv_points}</td>
      <td class="ast-pts">${p.ast_level}</td>
      <td class="total-vp">${p.ast_level + p.adv_points}</td>
    </tr>`;
  }).join('');

  // AST ranking: highest AST first, then lowest civ_number within group
  const astRanking = [...pwc].sort((a, b) =>
    b.ast_level - a.ast_level || a.civ_number - b.civ_number
  );

  const expert = game.expert === 1;
  const levels = state.astLevels;

  // Build full requirement legend from ALL AST levels (levels 5–80 have requirements)
  // Assign sequential numbers to unique requirement texts
  const allReqMap = new Map<string, number>(); // req text → number
  levels.forEach(l => {
    if (l.level === 0) return; // no requirement for starting level
    const req = (expert ? l.expert_req : l.basic_req) ?? '—';
    if (!allReqMap.has(req)) allReqMap.set(req, allReqMap.size + 1);
  });
  allReqMap.set('Completed', allReqMap.size + 1);

  const astRows = astRanking.map((p, i) => {
    const nextLevel = levels.find(l => l.level > p.ast_level);
    const req = nextLevel
      ? (expert ? nextLevel.expert_req : nextLevel.basic_req) ?? '—'
      : 'Completed';
    const label = allReqMap.get(req) ?? '?';
    return `<tr>
      <td class="rank">${i + 1}</td>
      <td>${civBadge(p, true)}</td>
      <td class="ast-pts">${p.ast_level}</td>
      <td class="req-label">${label}</td>
    </tr>`;
  }).join('');

  // Full requirement legend — all AST requirements numbered
  const reqLegend = Array.from(allReqMap.entries()).map(([req, num]) =>
    `<li><strong>${num}.</strong> ${req}</li>`
  ).join('');

  // Final scores (game over, players still in DB)
  let finalScoresSection = '';
  if (!game.active && players.length > 0) {
    const scored = [...pwc].map(p => {
      const liaVp = p.late_iron_age_bonus ? 5 : 0;
      return { ...p, liaVp, total: p.ast_level + p.adv_points + liaVp };
    }).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.ast_level !== a.ast_level) return b.ast_level - a.ast_level;
      if (b.adv_6vp !== a.adv_6vp) return b.adv_6vp - a.adv_6vp;
      if (b.adv_3vp !== a.adv_3vp) return b.adv_3vp - a.adv_3vp;
      return (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number);
    });
    // Detect ties (same criteria as game-over admin)
    const finalTiedIds = new Set<number>();
    for (let i = 0; i < scored.length - 1; i++) {
      const a = scored[i], b = scored[i + 1];
      if (
        a.total === b.total &&
        a.ast_level === b.ast_level &&
        a.adv_6vp === b.adv_6vp &&
        a.adv_3vp === b.adv_3vp
      ) { finalTiedIds.add(a.id); finalTiedIds.add(b.id); }
    }
    // A tie group is resolved when every member has rank_order !== 0
    const finalResolvedTiedIds = new Set<number>();
    { let gi = 0;
      while (gi < scored.length) {
        if (!finalTiedIds.has(scored[gi].id)) { gi++; continue; }
        let gj = gi;
        while (gj + 1 < scored.length && finalTiedIds.has(scored[gj + 1].id) &&
          scored[gj + 1].total === scored[gi].total &&
          scored[gj + 1].ast_level === scored[gi].ast_level &&
          scored[gj + 1].adv_6vp === scored[gi].adv_6vp &&
          scored[gj + 1].adv_3vp === scored[gi].adv_3vp
        ) gj++;
        const group = scored.slice(gi, gj + 1);
        if (group.every(p => p.rank_order !== 0)) group.forEach(p => finalResolvedTiedIds.add(p.id));
        gi = gj + 1;
      }
    }
    // Display rank: i+1 for everyone, except unresolved tied players share their group's starting rank
    const finalDisplayRanks: number[] = [];
    for (let i = 0; i < scored.length; i++) {
      if (i > 0) {
        const prev = scored[i - 1], curr = scored[i];
        const shareRank = finalTiedIds.has(prev.id) && finalTiedIds.has(curr.id) &&
          !finalResolvedTiedIds.has(prev.id) &&
          prev.total === curr.total && prev.ast_level === curr.ast_level &&
          prev.adv_6vp === curr.adv_6vp && prev.adv_3vp === curr.adv_3vp;
        finalDisplayRanks.push(shareRank ? finalDisplayRanks[i - 1] : i + 1);
      } else {
        finalDisplayRanks.push(1);
      }
    }
    const FINAL_MEDALS: Record<number, string> = {
      1: '<span class="medal medal-gold">⚑</span>',
      2: '<span class="medal medal-silver">⚑</span>',
      3: '<span class="medal medal-bronze">⚑</span>',
    };
    const finalRows = scored.map((p, i) => {
      const unresolved = finalTiedIds.has(p.id) && !finalResolvedTiedIds.has(p.id);
      const medal = FINAL_MEDALS[finalDisplayRanks[i]] ?? '';
      const star = p.late_iron_age_bonus ? ' <span class="lia-star" title="Late Iron Age bonus (5VP)">★</span>' : '';
      const liaDetail = p.late_iron_age_bonus ? ' +5★' : '';
      return `<tr${unresolved ? ' class="lb-tied"' : ''}>
        <td class="rank${unresolved ? ' rank-tie' : ''} go-rank" ${unresolved ? 'title="Unresolved tie"' : ''}>${unresolved ? '=' : finalDisplayRanks[i]}</td>
        <td class="go-empire">
          <span class="civ-badge civ-badge-with-num" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num-in-badge">${p.civ_number}</span><span class="civ-badge-label">${p.civ_name}<span class="go-player-name">${p.name}</span></span></span>
        </td>
        <td class="player-name lb-player-col">${p.name}</td>
        <td class="ast-pts go-ast">${p.ast_level}</td>
        <td class="adv-pts go-adv">${p.adv_points}</td>
        <td class="total-vp go-total">${star}${medal} <strong>${p.total}</strong></td>
      </tr>`;
    }).join('');
    finalScoresSection = `
    <section class="table-section final-scores-section go-section">
      <h3>Final Scores</h3>
      <table class="mett-table lb-table game-over-table">
        <thead><tr>
          <th>#</th><th>Empire</th><th class="lb-player-col">Player</th>
          <th class="go-ast" title="A.S.T. VP">AST</th>
          <th class="go-adv" title="Advance VP">ADV</th>
          <th title="Total VP">TOTAL</th>
        </tr></thead>
        <tbody>${finalRows}</tbody>
      </table>
    </section>`;
  }

  const showingFinalScores = !game.active && players.length > 0;

  const noGame = !game.active && !showingFinalScores ? `
    <div class="no-game-banner">
      <p>No active game. <a href="/admin">Go to Admin</a> to start one.</p>
    </div>` : '';

  const finalRoundBanner = game.active && game.is_final_round
    ? '<div class="final-round-banner">⚑ Final Round</div>' : '';

  const revealedBanner = !showingFinalScores && (revealed && !allSubmitted ? '' :
    !revealed && allSubmitted ? '<div class="census-ready-banner">All players submitted — census revealed!</div>' : '');

  return /* html */`
<div class="mett-header">
  <h2>Mega Empires Turn Tracker</h2>
  <div class="game-status">
    ${statusLabel}
    ${game.active ? `<span class="mode-badge">${game.expert ? 'Expert' : 'Basic'}</span>` : ''}
    ${game.active && game.is_final_round ? '<span class="final-round-badge">FINAL ROUND</span>' : ''}
    ${game.active && revealed ? '<span class="revealed-badge">Census Revealed</span>' : ''}
  </div>
</div>
${noGame}
${finalScoresSection}
${finalRoundBanner}
${revealedBanner}
${game.active ? `
<div class="main-grid" id="main-tables">
  <section class="table-section">
    <h3>Census — Round ${game.current_round}</h3>
    <table class="mett-table census-table">
      <thead><tr>
        <th>Empire</th>
        <th class="city-col" title="Cities">🏛</th>
        <th class="mil-col" title="Military">⚔</th>
        <th class="census-pop">POP</th>
      </tr></thead>
      <tbody>${censusRows || '<tr><td colspan="4">No players</td></tr>'}</tbody>
    </table>
    <div class="table-spacer"></div>
    <p class="table-hint census-hint">
      ${allSubmitted ? '✓ All submitted' : `${pwc.filter(p => p.census?.population != null).length} / ${players.length} submitted`}
    </p>
  </section>

  <section class="table-section">
    <h3>Leaderboard</h3>
    <table class="mett-table lb-table">
      <thead><tr>
        <th>#</th>
        <th>Empire</th>
        <th class="lb-player-col">Player</th>
        <th title="Advance Victory Points">ADV</th>
        <th title="A.S.T. Position">AST</th>
        <th title="Total Victory Points">TOTAL</th>
      </tr></thead>
      <tbody>${lbRows || '<tr><td colspan="6">No players</td></tr>'}</tbody>
    </table>
    <div class="table-spacer"></div>
  </section>

  <section class="table-section">
    <h3>A.S.T. Progress</h3>
    <table class="mett-table">
      <thead><tr>
        <th>#</th>
        <th>Empire</th>
        <th title="A.S.T. Position">A.S.T.</th>
        <th title="Next requirement (see legend below)">Req</th>
      </tr></thead>
      <tbody>${astRows || '<tr><td colspan="4">No players</td></tr>'}</tbody>
    </table>
    <div class="table-spacer"></div>
    <ol class="req-legend">${reqLegend}</ol>
  </section>
</div>
` : ''}
<script src="/js/main.js"></script>
`;
}
