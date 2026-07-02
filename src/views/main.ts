/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FullState, PlayerRow, CensusRow } from '../db.js';
import { AST_LEVELS, getAgeBands, civBandClass, isAgeEnd, reqLegendItems } from '../models/ast.js';
import { playerTotalVp, compareScores, sameScoreGroup, makeScoreEntry, computeTieGroupMeta, sortCensusOrder } from '../models/game.js';
import { empireCell } from './empire.js';

export { empireCell };

interface PlayerWithCensus extends PlayerRow {
  census: CensusRow | null;
  city_count: number | null;
}

function cardChips(cityCount: number, wonder = false): string {
  const bonusChip = wonder && cityCount < 9;
  if (cityCount === 0 && !bonusChip) return '<span class="trade-no-cards">—</span>';
  const chips = Array.from({ length: cityCount }, (_, i) => `<span class="trade-chip">${i + 1}</span>`);
  if (bonusChip) chips.push(`<span class="trade-chip trade-chip-wonder">X</span>`);
  return `<div class="trade-chips">${chips.join('')}</div>`;
}

export function renderMain(state: FullState): string {
  const { game, players, census, astStatus } = state;
  const expert = game.expert === 1;

  const censusByPlayer = new Map(census.map(c => [c.player_id, c]));
  const pwc: PlayerWithCensus[] = players.map(p => {
    const c = censusByPlayer.get(p.id) ?? null;
    return { ...p, census: c, city_count: c?.city_count ?? null };
  });

  const revealed = game.census_revealed === 1;
  const citiesPhase = game.cities_phase === 1;
  const allCensusSubmitted = players.length > 0 && pwc.every(p => p.census?.population != null);
  const allCitiesSubmitted = players.length > 0 && pwc.every(p => p.city_count != null);

  // ── Census table ────────────────────────────────────────────────────────
  const censusOrdered = revealed
    ? sortCensusOrder(pwc)
    : [...pwc].sort((a, b) => a.civ_number - b.civ_number);

  const censusRows = censusOrdered.map(p => {
    const submitted = p.census?.population != null;
    const milCell = p.military ? `<td class="mil-col"><span class="mil-dot"></span></td>` : `<td class="mil-col"></td>`;
    let popCell: string;
    // Post-calamity: the census (population) was only needed earlier this round
    // for the move order — it isn't relevant again until next round's census.
    if (citiesPhase)    popCell = `<td class="census-pop cell-na">—</td>`;
    else if (!submitted)popCell = `<td class="census-pop not-submitted">?</td>`;
    else if (revealed)  popCell = `<td class="census-pop">${p.census!.population}</td>`;
    else                popCell = `<td class="census-pop submitted-hidden">✓</td>`;
    const cityCell = p.city_count != null
      ? `<td class="city-col">${p.city_count}</td>`
      : `<td class="city-col not-submitted">?</td>`;
    return `<tr>${empireCell(p)}${milCell}${cityCell}${popCell}</tr>`;
  }).join('');

  // ── Trade cards (West and East as separate tables) ───────────────────────
  // Order by trade-card count only while trade cards are actually live (trade
  // phase, all first city counts in). In every other state — census, pre-trade
  // collection, and the post-calamity recount — keep plain empire-number order,
  // since the count there feeds the A.S.T., not the trade hand.
  const tradeSorted = (!citiesPhase && allCitiesSubmitted)
    ? [...pwc].sort((a, b) => {
        const ca = a.city_count ?? Infinity, cb = b.city_count ?? Infinity;
        return ca !== cb ? ca - cb : a.civ_number - b.civ_number;
      })
    : [...pwc].sort((a, b) => a.civ_number - b.civ_number);

  const westTrade = tradeSorted.filter(p => p.region === 'west');
  const eastTrade = tradeSorted.filter(p => p.region === 'east');

  function tradeRegionRows(list: PlayerWithCensus[]): string {
    return list.map((p, i) => {
      let cardCell: string;
      if (citiesPhase) {
        // Post-calamity: trading is over and the count now being entered feeds
        // the A.S.T., not the trade hand — so don't recompute trade-card chips.
        cardCell = `<td class="trade-card-col trade-no-cards">—</td>`;
      } else if (!allCitiesSubmitted) {
        cardCell = p.city_count != null
          ? `<td class="trade-card-col submitted-hidden">✓</td>`
          : `<td class="trade-card-col not-submitted">?</td>`;
      } else {
        cardCell = p.city_count != null
          ? `<td class="trade-card-col">${cardChips(p.city_count, p.wonder === 1)}</td>`
          : `<td class="trade-card-col not-submitted">?</td>`;
      }
      // Trade-card count groupings only make sense while trade cards are live.
      const groupStart = !citiesPhase && allCitiesSubmitted && i > 0 && list[i - 1]!.city_count !== p.city_count;
      return `<tr${groupStart ? ' class="trade-group-start"' : ''}>${empireCell(p)}${cardCell}</tr>`;
    }).join('');
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────
  // City VP (1 per city) is only scored at end of game — during play it is excluded.
  const lbCityVp = (p: PlayerWithCensus) => game.active ? 0 : (p.city_count ?? 0);

  // During active play, rank by Total VP alone (final=false) — the advance-card
  // breakdown tiebreakers only apply at game over.
  const finalRanking = !game.active;
  const leaderboard = [...pwc].sort((a, b) =>
    compareScores(makeScoreEntry(a, lbCityVp(a)), makeScoreEntry(b, lbCityVp(b)), finalRanking)
  );

  const lbScores = leaderboard.map(p => ({ ...makeScoreEntry(p, lbCityVp(p)), rank_order: p.rank_order }));
  const lbMeta = computeTieGroupMeta(lbScores, finalRanking);

  const lbRows = leaderboard.map((p, i) => {
    const { displayRank, tied, groupStart, resolved } = lbMeta[i]!;
    const unresolved = tied && !resolved;
    const rankCell = unresolved
      ? `<td class="rank rank-tie" title="Manual resolution needed">=${displayRank}</td>`
      : `<td class="rank">${displayRank}</td>`;
    const rowClass = [unresolved ? 'lb-tied' : '', groupStart && i > 0 ? 'lb-group-start' : ''].filter(Boolean).join(' ');
    return `<tr${rowClass ? ` class="${rowClass}"` : ''}>
      ${rankCell}
      ${empireCell(p)}
      <td class="adv-pts">${p.adv_points}</td>
      <td class="ast-pts">${p.ast_level}</td>
      <td class="total-vp">${playerTotalVp(p, lbCityVp(p))}${p.late_iron_age_bonus ? ' <span class="lia-bonus-chip" title="Late Iron Age bonus: +5 VP">★</span>' : ''}</td>
    </tr>`;
  }).join('');

  // ── AST order (rightmost column) ────────────────────────────────────────
  const astOrderSorted = [...pwc].sort((a, b) =>
    b.ast_level !== a.ast_level ? b.ast_level - a.ast_level : a.civ_number - b.civ_number
  );
  const anySpecial = astOrderSorted.some(p => p.special);
  const astOrderRows = astOrderSorted.map((p, i) => {
    const groupStart = i > 0 && astOrderSorted[i - 1]!.ast_level !== p.ast_level;
    const dim = anySpecial && !p.special;
    const classes = [groupStart ? 'ast-order-group-start' : '', dim ? 'special-dim' : ''].filter(Boolean).join(' ');
    return `<tr${classes ? ` class="${classes}"` : ''}>${empireCell(p)}</tr>`;
  }).join('');

  // ── AST board ───────────────────────────────────────────────────────────
  const sorted = [...players].sort((a, b) => a.civ_number - b.civ_number);
  const boardLevels = expert ? AST_LEVELS : AST_LEVELS.filter(l => l <= 75);
  const AGE_BANDS = getAgeBands(expert);
  const levelBand: Record<number, string> = {};
  for (const b of AGE_BANDS) for (const l of b.levels) levelBand[l] = b.cls;

  const bandHeaders = AGE_BANDS.map(b =>
    `<th colspan="${b.levels.length}" class="ab-header ${b.cls}" title="${b.name}">
      ${b.shortName ? `<span class="ab-name">${b.shortName}</span>` : ''}
    </th>`
  ).join('');

  const reqLegend = reqLegendItems(expert);

  const defaultAgeEnds = new Set([20, 35, 50, 65, 70, expert ? 80 : 75]);
  const levelHeaders = boardLevels.map(l =>
    `<td class="ab-level-num ${levelBand[l] ?? 'age-liron'}${l === 0 ? ' ab-start-col' : ''}${defaultAgeEnds.has(l) ? ' ab-age-end' : ''}">${l === 0 ? 'S' : l}</td>`
  ).join('');

  const roundBeyondBoard = game.current_round > boardLevels.length;
  const lastRoundIdx = boardLevels.length - 1;
  const roundCells = boardLevels.map((l, i) => {
    const num = i + 1;
    const displayRound = i === lastRoundIdx ? `${num}+` : `${num}`;
    const isCurrent = game.started_at !== null && (
      (!roundBeyondBoard && num === game.current_round) ||
      (roundBeyondBoard && i === lastRoundIdx)
    );
    return `<td class="ab-round-num${l === 0 ? ' ab-start-col' : ''}${defaultAgeEnds.has(l) ? ' ab-age-end' : ''}${isCurrent ? ' ab-round-current' : ''}">${displayRound}</td>`;
  }).join('');

  const boardRows = sorted.map(p => {
    const status = astStatus[p.id];
    const willRegress = status === 'regress';
    const willAdvance = status === 'advance';
    const rowClass = willRegress ? 'will-regress' : willAdvance ? 'will-advance' : '';
    const titlePrefix = willRegress
      ? 'Will regress next round — '
      : willAdvance ? 'Will advance next round — ' : '';
    // Movement indicator in the start column (before S.A.), not in the empire
    // box: green → advance, orange = no change, red ← regress. Only meaningful
    // once calamities are resolved and the second (post-calamity) city count is
    // in — i.e. the Calamities phase (cities_phase=1). Before that (after only
    // the first city count) the prediction is premature, so it stays hidden.
    const moveKind = willAdvance ? 'advance' : willRegress ? 'regress' : 'stay';
    const moveGlyph = willAdvance ? '→' : willRegress ? '←' : '=';
    const moveTitle = willAdvance ? 'Will advance next round' : willRegress ? 'Will regress next round' : 'Will not advance';
    const showMove = game.current_round >= 2 && citiesPhase && (willAdvance || willRegress || status === 'stay');
    const moveInd = showMove
      ? `<span class="ab-move ab-move-${moveKind}" title="${moveTitle} — ${p.civ_name}">${moveGlyph}</span>`
      : '';
    const cells = boardLevels.map(l => {
      const here = p.ast_level === l;
      const band = civBandClass(p.civ_number, l, expert);
      // Late Iron Age cells take the empire's own colour (the "finish line").
      const lironStyle = band === 'age-liron' ? ` style="background:${p.civ_color}"` : '';
      return `<td class="ab-cell ${band}${here ? ' ab-here' : ''}${l === 0 ? ' ab-start-col' : ''}${isAgeEnd(p.civ_number, l, expert) ? ' ab-age-end' : ''}"${lironStyle}>` +
        (here ? `<span class="ab-magnet" style="background:${p.civ_color};color:${p.civ_text_color}" title="${titlePrefix}${p.civ_name}">${l === 0 ? 'S' : l}</span>` : '') +
        (l === 0 && !here ? moveInd : '') +
        `</td>`;
    }).join('');
    return `<tr${rowClass ? ` class="${rowClass}"` : ''}>
      ${empireCell(p, 'cell-ab')}
      ${cells}
    </tr>`;
  }).join('');

  const statusLabel = game.active ? `Round ${game.current_round}` : players.length > 0 ? 'Game over' : 'No active game';

  // The round has three player-input phases, keyed to (census_revealed,
  // cities_phase). Everything else (trading, calamities, AST advances) happens
  // on the physical board between these inputs.
  //   0 Census        — submit population (sets the move order)
  //   1 Pre-Trade     — first city count; opens the trade table, then trading
  //   2 Post-Calamity — re-enter city count after calamities; feeds the advances
  const phaseIndex = !game.active ? -1
    : !revealed    ? 0
    : !citiesPhase ? 1
    :                2;

  const phases = ['Census', 'Trade', 'Calamities'];
  const phaseSteps = phases.map((name, i) => {
    const cls = i < phaseIndex ? 'phase-done' : i === phaseIndex ? 'phase-active' : 'phase-future';
    return `<li class="phase-step ${cls}">${name}</li>`;
  }).join('<li class="phase-sep" aria-hidden="true">›</li>');

  return /* html */`
<div id="main-content" hx-get="/" hx-trigger="mett:state from:window" hx-swap="outerHTML">
<div class="mett-header status-header">
  <div class="phase-strip">
    <span class="phase-info">${statusLabel}</span>
    ${game.active ? `<ol class="phase-steps" aria-label="Game phase">${phaseSteps}</ol>` : ''}
  </div>
</div>

<div class="status-grid" id="main-tables">
  <section class="table-section">
    <h3>Census — Round ${game.current_round}</h3>
    <table class="mett-table census-table">
      <thead><tr>
        <th>Empire</th>
        <th class="mil-col" title="Military">MIL</th>
        <th class="city-col" title="Cities">CITY</th>
        <th class="census-pop">POP</th>
      </tr></thead>
      <tbody>${censusRows || '<tr><td colspan="4">No players</td></tr>'}</tbody>
    </table>
    ${allCensusSubmitted ? '' : `<p class="table-hint">${pwc.filter(p => p.census?.population != null).length} / ${players.length} submitted</p>`}
  </section>

  <section class="table-section">
    <h3>Trade Cards</h3>
    ${westTrade.length > 0 ? `<table class="mett-table trade-table">
      <colgroup><col class="trade-empire-col"><col class="trade-chip-col"></colgroup>
      <thead><tr><th colspan="2">${eastTrade.length > 0 ? 'West' : '&nbsp;'}</th></tr></thead>
      <tbody>${tradeRegionRows(westTrade)}</tbody>
    </table>` : ''}
    ${eastTrade.length > 0 ? `<table class="mett-table trade-table${westTrade.length > 0 ? ' trade-east' : ''}">
      <colgroup><col class="trade-empire-col"><col class="trade-chip-col"></colgroup>
      <thead><tr><th colspan="2">${westTrade.length > 0 ? 'East' : '&nbsp;'}</th></tr></thead>
      <tbody>${tradeRegionRows(eastTrade)}</tbody>
    </table>` : ''}
    ${allCitiesSubmitted ? '' : `<p class="table-hint">${pwc.filter(p => p.city_count != null).length} / ${players.length} submitted</p>`}
  </section>

  <section class="table-section ast-order-section">
    <h3>A.S.T. Progress Order</h3>
    <table class="mett-table ast-order-table">
      <thead><tr><th>&nbsp;</th></tr></thead>
      <tbody>${astOrderRows || '<tr><td style="opacity:0.4">—</td></tr>'}</tbody>
    </table>
  </section>

  <section class="table-section ast-section">
    <h3>Archaeological Succession Timeline</h3>
    <div class="ab-scroll">
      <table class="ab-table status-ast">
        <colgroup>
          <col class="ab-label-col">
          ${boardLevels.map(() => '<col class="ab-data-col">').join('')}
        </colgroup>
        <thead>
          <tr>
            <th class="ab-civ-label ab-corner"></th>
            ${bandHeaders}
          </tr>
        </thead>
        <tbody>${boardRows || `<tr><td colspan="${boardLevels.length + 1}" style="text-align:center;padding:2rem;opacity:0.5">No active game</td></tr>`}</tbody>
        <tfoot>
          <tr>
            <td class="ab-civ-label ab-corner ab-vp-label">VP →</td>
            ${levelHeaders}
          </tr>
          <tr>
            <td class="ab-civ-label ab-corner ab-round-label${roundBeyondBoard ? ' ab-round-current' : ''}">
              ${roundBeyondBoard ? `R${game.current_round} →` : 'Round →'}
            </td>
            ${roundCells}
          </tr>
        </tfoot>
      </table>
    </div>
    <ul class="ab-legend">${reqLegend}</ul>
  </section>

  <section class="table-section">
    <h3>Leaderboard</h3>
    <table class="mett-table lb-table">
      <colgroup>
        <col class="lb-rank-col">
        <col class="lb-empire-col">
        <col class="lb-adv-col">
        <col class="lb-ast-col">
        <col class="lb-total-col">
      </colgroup>
      <thead><tr>
        <th class="rank">#</th>
        <th>Empire</th>
        <th class="adv-pts" title="Advance Victory Points">ADV</th>
        <th class="ast-pts" title="A.S.T. Position">AST</th>
        <th class="total-vp" title="Total Victory Points">TOTAL</th>
      </tr></thead>
      <tbody>${lbRows || '<tr><td colspan="5">No players</td></tr>'}</tbody>
    </table>
  </section>
</div>
</div><!-- #main-content -->
`;
}
