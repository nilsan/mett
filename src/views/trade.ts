import type { FullState, PlayerRow, CensusRow } from '../db.js';

function tradeSort(a: { civ_number: number; city_count: number | null }, b: { civ_number: number; city_count: number | null }): number {
  // No city count goes last (treat as max); otherwise ascending city count, then ascending empire number
  const ca = a.city_count ?? Infinity;
  const cb = b.city_count ?? Infinity;
  if (ca !== cb) return ca - cb;
  return a.civ_number - b.civ_number;
}

function cardChips(cityCount: number): string {
  if (cityCount === 0) return '<span class="trade-no-cards">—</span>';
  const chips = Array.from({ length: cityCount }, (_, i) =>
    `<span class="trade-chip">${i + 1}</span>`
  ).join('');
  return `<div class="trade-chips">${chips}</div>`;
}

function renderTable(title: string, rows: Array<PlayerRow & { city_count: number | null }>, allSubmitted: boolean): string {
  if (rows.length === 0) return '';

  const bodyRows = rows.map((p, i) => {
    let cardCell: string;
    if (!allSubmitted) {
      if (p.city_count != null) {
        cardCell = `<td class="trade-card-col submitted-hidden" title="Submitted — waiting for all players">✓</td>`;
      } else {
        cardCell = `<td class="trade-card-col not-submitted">?</td>`;
      }
    } else {
      cardCell = p.city_count != null
        ? `<td class="trade-card-col">${cardChips(p.city_count)}</td>`
        : `<td class="trade-card-col not-submitted">?</td>`;
    }
    const groupStart = allSubmitted && i > 0 && rows[i - 1]!.city_count !== p.city_count;
    return `<tr${groupStart ? ' class="trade-group-start"' : ''}>
      <td>
        <span class="civ-badge civ-badge-with-num" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num-in-badge">${p.civ_number}</span>${p.civ_name}</span>
      </td>
      ${cardCell}
    </tr>`;
  }).join('');

  const submittedCount = rows.filter(p => p.city_count != null).length;
  const hint = allSubmitted
    ? ''
    : `<p class="table-hint">${submittedCount} / ${rows.length} submitted</p>`;

  return `
<section class="table-section trade-section">
  <h3>${title}</h3>
  <table class="mett-table trade-table">
    <thead>
      <tr>
        <th>Empire</th>
        <th class="trade-card-col">Cards</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  ${hint}
</section>`;
}

export function renderTrade(state: FullState): string {
  const { game, players, census } = state;

  if (!game.active && players.length === 0) {
    return /* html */`
<div class="trade-page">
  <div class="mett-header">
    <h2>Trade Cards</h2>
  </div>
  <p class="trade-no-game">No active game. <a href="/admin">Start one in Admin.</a></p>
</div>
<script>window.addEventListener('mett:state', () => location.reload());</script>
`;
  }

  // Attach city_count from current round census to each player
  const withCities = players.map(p => ({
    ...p,
    city_count: census.find(c => c.player_id === p.id)?.city_count ?? null,
  }));

  const allSubmitted = withCities.length > 0 && withCities.every(p => p.city_count != null);

  const sortFn = allSubmitted ? tradeSort : (a: typeof withCities[0], b: typeof withCities[0]) => a.civ_number - b.civ_number;

  const west = withCities.filter(p => p.region === 'west').sort(sortFn);
  const east = withCities.filter(p => p.region === 'east').sort(sortFn);

  const hasBothRegions = west.length > 0 && east.length > 0;

  const tables = hasBothRegions
    ? renderTable('West', west, allSubmitted) + renderTable('East', east, allSubmitted)
    : renderTable('All Empires', [...withCities].sort(sortFn), allSubmitted);

  return /* html */`
<div class="trade-page">
  <div class="mett-header">
    <h2>Trade Cards</h2>
    <div class="game-status">
      ${game.active ? `Round ${game.current_round} — ` : 'Game over — '}
      <span class="mode-badge">${game.expert ? 'Expert' : 'Basic'} Mode</span>
    </div>
  </div>
  <p class="trade-hint">Delivery order: fewest cities first, then lowest empire number. Cards delivered to West and East separately.</p>
  <div class="trade-grid${hasBothRegions ? ' trade-split' : ''}">
    ${tables}
  </div>
</div>
<script>window.addEventListener('mett:state', () => location.reload());</script>
`;
}
