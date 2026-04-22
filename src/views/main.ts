import type { FullState, PlayerRow, CensusRow } from '../db.js';
import { getCivAstProfile } from '../civs.js';

interface PlayerWithCensus extends PlayerRow {
  census: CensusRow | null;
  city_count: number | null;
}

const AST_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];

interface AgeBand { name: string; shortName: string; expertReq: string; basicReq: string; levels: number[]; cls: string; }

function getAgeBands(expert: boolean): AgeBand[] {
  return [
    { name: 'Start',             shortName: '',          expertReq: '',                                basicReq: '',                                levels: [0],             cls: 'age-start'   },
    { name: 'Stone Age',         shortName: 'Stone',     expertReq: 'No requirements',                 basicReq: 'No requirements',                 levels: [5, 10, 15, 20], cls: 'age-stone'   },
    { name: 'Early Bronze Age',  shortName: 'E. Bronze', expertReq: '3 Cities',                        basicReq: '2 Cities',                        levels: [25, 30, 35],    cls: 'age-ebronze' },
    { name: 'Middle Bronze Age', shortName: 'M. Bronze', expertReq: '3 Cities + 5 VP in Advances',     basicReq: '3 Cities + 3 Advances',           levels: [40, 45, 50],    cls: 'age-mbronze' },
    { name: 'Late Bronze Age',   shortName: 'L. Bronze', expertReq: '4 Cities + 12 Advances',          basicReq: '3 Cities + 3 Adv (≥100 VP each)', levels: [55, 60, 65],    cls: 'age-lbronze' },
    ...(expert ? [
      { name: 'Early Iron Age',  shortName: 'E.I.',      expertReq: '5 Cities + 10 Adv ≤100 + 38 VP', basicReq: '',                                levels: [70],            cls: 'age-eiron'   },
      { name: 'Late Iron Age',   shortName: 'L. Iron',   expertReq: '6 Cities + 17 Adv ≤100 + 56 VP', basicReq: '',                                levels: [75, 80],        cls: 'age-liron'   },
    ] : [
      { name: 'Early Iron Age',  shortName: 'E.I.',      expertReq: '',                                basicReq: '4 Cities + 2 Adv ≥200 VP each',  levels: [70],            cls: 'age-eiron'   },
      { name: 'Late Iron Age',   shortName: 'L. Iron',   expertReq: '',                                basicReq: '5 Cities + 3 Adv ≥200 VP each',  levels: [75],            cls: 'age-liron'   },
    ]),
  ] as AgeBand[];
}

function civBandClass(civNumber: number, level: number, expert: boolean): string {
  if (level === 0) return 'age-start';
  const { stoneEnd, ebaEnd } = getCivAstProfile(civNumber, expert);
  if (level <= stoneEnd) return 'age-stone';
  if (level <= ebaEnd)   return 'age-ebronze';
  if (level <= 50)       return 'age-mbronze';
  if (level <= 65)       return 'age-lbronze';
  if (level === 70)      return 'age-eiron';
  return 'age-liron';
}

function isAgeEnd(civNumber: number, level: number, expert: boolean): boolean {
  const { stoneEnd, ebaEnd } = getCivAstProfile(civNumber, expert);
  const liaEnd = expert ? 80 : 75;
  return level === stoneEnd || level === ebaEnd || level === 50 || level === 65 || level === 70 || level === liaEnd;
}

function empireCell(p: PlayerRow): string {
  return `<td class="empire-cell" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num">${p.civ_number}</span>${p.civ_name}</td>`;
}

/**
 * Sort order for the revealed census table and per-player move-order indicator.
 * Non-military civs first (highest population first), military civs last (highest population first).
 * Ties broken by civ number ascending.
 */
export function sortCensusOrder<T extends {
  military: number;
  civ_number: number;
  census?: { population?: number | null } | null;
}>(players: T[]): T[] {
  return [...players].sort((a, b) => {
    if (a.military !== b.military) return a.military - b.military;
    const pa = a.census?.population ?? -Infinity;
    const pb = b.census?.population ?? -Infinity;
    if (pa !== pb) return pb - pa;
    return a.civ_number - b.civ_number;
  });
}

function cardChips(cityCount: number, wonder = false): string {
  const bonusChip = wonder && cityCount < 9;
  if (cityCount === 0 && !bonusChip) return '<span class="trade-no-cards">—</span>';
  const chips = Array.from({ length: cityCount }, (_, i) => `<span class="trade-chip">${i + 1}</span>`);
  if (bonusChip) chips.push(`<span class="trade-chip trade-chip-wonder">X</span>`);
  return `<div class="trade-chips">${chips.join('')}</div>`;
}

export function renderMain(state: FullState): string {
  const { game, players, census } = state;
  const expert = game.expert === 1;

  const pwc: PlayerWithCensus[] = players.map(p => ({
    ...p,
    census: census.find(c => c.player_id === p.id) ?? null,
    city_count: census.find(c => c.player_id === p.id)?.city_count ?? null,
  }));

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
    if (!submitted)     popCell = `<td class="census-pop not-submitted">?</td>`;
    else if (revealed)  popCell = `<td class="census-pop">${p.census!.population}</td>`;
    else                popCell = `<td class="census-pop submitted-hidden">✓</td>`;
    const cityCell = p.city_count != null
      ? `<td class="city-col">${p.city_count}</td>`
      : `<td class="city-col not-submitted">?</td>`;
    const wonCell = p.wonder ? `<td class="won-col won-active">★</td>` : `<td class="won-col"></td>`;
    return `<tr>${empireCell(p)}${wonCell}${milCell}${cityCell}${popCell}</tr>`;
  }).join('');

  // ── Trade cards (West and East as separate tables) ───────────────────────
  const tradeSorted = allCitiesSubmitted
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
      if (!allCitiesSubmitted) {
        cardCell = p.city_count != null
          ? `<td class="trade-card-col submitted-hidden">✓</td>`
          : `<td class="trade-card-col not-submitted">?</td>`;
      } else {
        cardCell = p.city_count != null
          ? `<td class="trade-card-col">${cardChips(p.city_count, p.wonder === 1)}</td>`
          : `<td class="trade-card-col not-submitted">?</td>`;
      }
      const groupStart = allCitiesSubmitted && i > 0 && list[i - 1].city_count !== p.city_count;
      return `<tr${groupStart ? ' class="trade-group-start"' : ''}>${empireCell(p)}${cardCell}</tr>`;
    }).join('');
  }

  // ── Leaderboard ─────────────────────────────────────────────────────────
  const leaderboard = [...pwc].sort((a, b) => {
    const tA = a.ast_level + a.adv_points, tB = b.ast_level + b.adv_points;
    if (tB !== tA) return tB - tA;
    if (b.ast_level !== a.ast_level) return b.ast_level - a.ast_level;
    if (b.adv_6vp !== a.adv_6vp) return b.adv_6vp - a.adv_6vp;
    if (b.adv_3vp !== a.adv_3vp) return b.adv_3vp - a.adv_3vp;
    return (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number);
  });

  function sameTieGroup(a: typeof leaderboard[0], b: typeof leaderboard[0]): boolean {
    return a.ast_level + a.adv_points === b.ast_level + b.adv_points &&
      a.ast_level === b.ast_level &&
      a.adv_6vp === b.adv_6vp &&
      a.adv_3vp === b.adv_3vp;
  }
  const lbMeta: Array<{ displayRank: number; tied: boolean; groupStart: boolean; resolved: boolean }> = new Array(leaderboard.length);
  let lbPos = 1, lbGi = 0;
  while (lbGi < leaderboard.length) {
    let lbGj = lbGi;
    while (lbGj + 1 < leaderboard.length && sameTieGroup(leaderboard[lbGi], leaderboard[lbGj + 1])) lbGj++;
    const groupSize = lbGj - lbGi + 1;
    const tied = groupSize > 1;
    const resolved = tied && leaderboard.slice(lbGi, lbGj + 1).every(p => p.rank_order !== 0);
    for (let k = lbGi; k <= lbGj; k++) {
      lbMeta[k] = { displayRank: lbPos, tied, groupStart: k === lbGi, resolved };
    }
    lbPos += groupSize;
    lbGi = lbGj + 1;
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
      ${empireCell(p)}
      <td class="player-name-col">${p.name}</td>
      <td class="adv-pts">${p.adv_points}</td>
      <td class="ast-pts">${p.ast_level}</td>
      <td class="total-vp">${p.ast_level + p.adv_points}</td>
    </tr>`;
  }).join('');

  // ── AST order (rightmost column) ────────────────────────────────────────
  const astOrderSorted = [...pwc].sort((a, b) =>
    b.ast_level !== a.ast_level ? b.ast_level - a.ast_level : a.civ_number - b.civ_number
  );
  const astOrderRows = astOrderSorted.map((p, i) => {
    const groupStart = i > 0 && astOrderSorted[i - 1].ast_level !== p.ast_level;
    return `<tr${groupStart ? ' class="ast-order-group-start"' : ''}>${empireCell(p)}</tr>`;
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

  const reqLegend = AGE_BANDS.filter(b => b.cls !== 'age-start' && b.name).map(b =>
    `<li><span class="ab-legend-dot ${b.cls}"></span><strong>${b.name}:</strong> ${expert ? b.expertReq : b.basicReq}</li>`
  ).join('');

  const defaultAgeEnds = new Set([20, 35, 50, 65, 70, expert ? 80 : 75]);
  const levelHeaders = boardLevels.map(l =>
    `<td class="ab-level-num ${levelBand[l] ?? 'age-liron'}${l === 0 ? ' ab-start-col' : ''}${defaultAgeEnds.has(l) ? ' ab-age-end' : ''}">${l === 0 ? 'S' : l}</td>`
  ).join('');

  const roundBeyondBoard = game.current_round > boardLevels.length;
  const lastRoundIdx = boardLevels.length - 1;
  const roundCells = boardLevels.map((l, i) => {
    const num = i + 1;
    const displayRound = i === lastRoundIdx ? `${num}+` : `${num}`;
    const isCurrent = game.started_at !== null && !roundBeyondBoard && num === game.current_round;
    return `<td class="ab-round-num${l === 0 ? ' ab-start-col' : ''}${defaultAgeEnds.has(l) ? ' ab-age-end' : ''}${isCurrent ? ' ab-round-current' : ''}">${displayRound}</td>`;
  }).join('');

  const boardRows = sorted.map(p => {
    const cells = boardLevels.map(l => {
      const here = p.ast_level === l;
      return `<td class="ab-cell ${civBandClass(p.civ_number, l, expert)}${here ? ' ab-here' : ''}${l === 0 ? ' ab-start-col' : ''}${isAgeEnd(p.civ_number, l, expert) ? ' ab-age-end' : ''}">` +
        (here ? `<span class="ab-magnet" style="background:${p.civ_color};color:${p.civ_text_color}" title="${p.civ_name}">${l === 0 ? 'S' : l}</span>` : '') +
        `</td>`;
    }).join('');
    return `<tr>
      <td class="ab-civ-label empire-cell" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num">${p.civ_number}</span>${p.civ_name}</td>
      ${cells}
    </tr>`;
  }).join('');

  const statusLabel = game.active ? `Round ${game.current_round}` : players.length > 0 ? 'Game over' : 'No active game';

  return /* html */`
<div id="main-content" hx-get="/" hx-trigger="mett:state from:window" hx-swap="outerHTML">
<div class="mett-header status-header">
  <div class="game-status">
    ${statusLabel}
    ${game.active ? `<span class="mode-badge">${expert ? 'Expert' : 'Basic'}</span>` : ''}
    ${game.active && revealed ? '<span class="revealed-badge">Census Revealed</span>' : ''}
  </div>
</div>

<div class="status-grid" id="main-tables">
  <section class="table-section">
    <h3>Leaderboard</h3>
    <table class="mett-table lb-table">
      <thead><tr>
        <th class="rank">#</th>
        <th>Empire</th>
        <th class="player-name-col">Player</th>
        <th title="Advance Victory Points">ADV</th>
        <th title="A.S.T. Position">AST</th>
        <th title="Total Victory Points">TOTAL</th>
      </tr></thead>
      <tbody>${lbRows || '<tr><td colspan="6">No players</td></tr>'}</tbody>
    </table>
  </section>

  <section class="table-section">
    <h3>Census — Round ${game.current_round}</h3>
    <table class="mett-table census-table">
      <thead><tr>
        <th>Empire</th>
        <th class="won-col" title="Wonder of the World">WON</th>
        <th class="mil-col" title="Military">MIL</th>
        <th class="city-col" title="Cities">CITY</th>
        <th class="census-pop">POP</th>
      </tr></thead>
      <tbody>${censusRows || '<tr><td colspan="5">No players</td></tr>'}</tbody>
    </table>
    <p class="table-hint">${allCensusSubmitted ? '✓ All submitted' : `${pwc.filter(p => p.census?.population != null).length} / ${players.length} submitted`}</p>
  </section>

  <section class="table-section">
    <h3>Trade Cards</h3>
    ${citiesPhase
      ? `<p class="trade-locked-msg">Trading complete</p>`
      : `${westTrade.length > 0 ? `<table class="mett-table trade-table">
      <colgroup><col class="trade-empire-col"><col class="trade-chip-col"></colgroup>
      ${westTrade.length > 0 && eastTrade.length > 0 ? `<thead><tr><th colspan="2">West</th></tr></thead>` : ''}
      <tbody>${tradeRegionRows(westTrade)}</tbody>
    </table>` : ''}
    ${eastTrade.length > 0 ? `<table class="mett-table trade-table${westTrade.length > 0 ? ' trade-east' : ''}">
      <colgroup><col class="trade-empire-col"><col class="trade-chip-col"></colgroup>
      ${westTrade.length > 0 && eastTrade.length > 0 ? `<thead><tr><th colspan="2">East</th></tr></thead>` : ''}
      <tbody>${tradeRegionRows(eastTrade)}</tbody>
    </table>` : ''}
    <p class="table-hint">${allCitiesSubmitted ? '✓ All submitted' : `${pwc.filter(p => p.city_count != null).length} / ${players.length} submitted`}</p>`
    }
  </section>

  <section class="table-section ast-section">
    <h3>A.S.T. Progress</h3>
    <div class="ab-scroll">
      <table class="ab-table status-ast">
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

  <section class="table-section ast-order-section">
    <h3>A.S.T. Order</h3>
    <table class="mett-table ast-order-table">
      <thead><tr><th>&nbsp;</th></tr></thead>
      <tbody>${astOrderRows || '<tr><td style="opacity:0.4">—</td></tr>'}</tbody>
    </table>
  </section>
</div>
</div><!-- #main-content -->
`;
}
