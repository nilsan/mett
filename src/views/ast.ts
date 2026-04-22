import type { FullState } from '../db.js';
import { AST_LEVELS, getAgeBands, civBandClass, isAgeEnd } from '../models/ast.js';

export function renderAst(state: FullState): string {
  const { game, players, astLevels } = state;
  const expert = game.expert === 1;

  // ── Board view ───────────────────────────────────────────────────────────
  // Sort players by Empire number (matches the physical board)
  const sorted = [...players].sort((a, b) => a.civ_number - b.civ_number);

  // Basic mode only goes to level 75; expert uses all 17 columns (0–80)
  const boardLevels = expert ? AST_LEVELS : AST_LEVELS.filter(l => l <= 75);

  const AGE_BANDS = getAgeBands(expert);

  // Map each level → its default band class (for level number header cells)
  const levelBand: Record<number, string> = {};
  for (const b of AGE_BANDS) for (const l of b.levels) levelBand[l] = b.cls;

  // Age band header row — single-column bands show no text (color identifies them; legend below)
  const bandHeaders = AGE_BANDS.map(b =>
    `<th colspan="${b.levels.length}" class="ab-header ${b.cls}" title="${b.name}">
      ${b.shortName ? `<span class="ab-name">${b.shortName}</span>` : ''}
    </th>`
  ).join('');

  // Requirements legend (skip the pre-game Start entry and unnamed bands)
  const reqLegend = AGE_BANDS.filter(b => b.cls !== 'age-start' && b.name).map(b =>
    `<li><span class="ab-legend-dot ${b.cls}"></span><strong>${b.name}:</strong> ${expert ? b.expertReq : b.basicReq}</li>`
  ).join('');

  // Level number header row — level 0 is the START position, shown as "S"
  // Age-end borders are per the default (normal civ) boundaries
  // Default age-end column markers (for normal civs — slow/late-start show per-cell borders)
  const defaultAgeEnds = new Set([20, 35, 50, 65, 70, expert ? 80 : 75]);  // EIA ends at 70 in both modes
  const levelHeaders = boardLevels.map(l =>
    `<td class="ab-level-num ${levelBand[l] ?? 'age-liron'}${l === 0 ? ' ab-start-col' : ''}${defaultAgeEnds.has(l) ? ' ab-age-end' : ''}">${l === 0 ? 'S' : l}</td>`
  ).join('');

  // Round marker row — column i shows round i+1 (Start=1, level5=2, …, last=16+/17+)
  const roundBeyondBoard = game.current_round > boardLevels.length;
  const lastRoundIdx = boardLevels.length - 1;
  const roundCells = boardLevels.map((l, i) => {
    const num = i + 1;
    const displayRound = i === lastRoundIdx ? `${num}+` : `${num}`;
    const isCurrent = game.started_at !== null && !roundBeyondBoard && num === game.current_round;
    const startCls = l === 0 ? ' ab-start-col' : '';
    const endCls = defaultAgeEnds.has(l) ? ' ab-age-end' : '';
    return `<td class="ab-round-num${startCls}${endCls}${isCurrent ? ' ab-round-current' : ''}">${displayRound}</td>`;
  }).join('');

  // Player rows
  const boardRows = sorted.map(p => {
    const cells = boardLevels.map(l => {
      const here = p.ast_level === l;
      const bandCls = civBandClass(p.civ_number, l, expert);
      const startCls = l === 0 ? ' ab-start-col' : '';
      const endCls = isAgeEnd(p.civ_number, l, expert) ? ' ab-age-end' : '';
      return `<td class="ab-cell ${bandCls}${here ? ' ab-here' : ''}${startCls}${endCls}">` +
        (here ? `<span class="ab-magnet" style="background:${p.civ_color};color:${p.civ_text_color}" title="${p.civ_name} — ${p.name}"></span>` : '') +
        `</td>`;
    }).join('');

    return `<tr>
      <td class="ab-civ-label" title="${p.name} (${p.civ_name})">
        <span class="civ-badge civ-badge-with-num" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num-in-badge">${p.civ_number}</span>${p.civ_name}</span>
      </td>
      ${cells}
    </tr>`;
  }).join('');

  // Empty state for board when no players
  const boardEmpty = players.length === 0
    ? `<tr><td colspan="${boardLevels.length + 1}" style="text-align:center;padding:2rem;opacity:0.5">No active game</td></tr>`
    : '';

  return /* html */`
<div class="ast-page">
  <div class="mett-header">
    <h2>Archaeological Succession Table</h2>
    <div class="game-status">
      ${game.active ? `Round ${game.current_round} — ` : ''}
      <span class="mode-badge">${expert ? 'Expert' : 'Basic'} Mode</span>
    </div>
  </div>

  <div class="ab-scroll">
    <table class="ab-table">
      <thead>
        <tr>
          <th class="ab-civ-label ab-corner"></th>
          ${bandHeaders}
        </tr>
      </thead>
      <tbody>
        ${boardRows || boardEmpty}
      </tbody>
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
</div>
<script>
  window.addEventListener('mett:state', () => location.reload());
</script>
`;
}
