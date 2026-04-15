import type { FullState } from '../db.js';
import { LATE_BRONZE_BASIC, LATE_BRONZE_EXPERT } from '../civs.js';

const AST_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];

interface AgeBand {
  name: string;
  shortName: string;   // used when column span is too narrow for full name
  expertReq: string;
  basicReq: string;
  levels: number[];
  cls: string;
}

const AGE_BANDS: AgeBand[] = [
  { name: 'Start',             shortName: '',            expertReq: '',                                      basicReq: '',                                 levels: [0],            cls: 'age-start'   },
  { name: 'Stone Age',         shortName: 'Stone',       expertReq: 'No requirements',                       basicReq: 'No requirements',                  levels: [5, 10, 15, 20],  cls: 'age-stone'   },
  { name: 'Early Bronze Age',  shortName: 'E. Bronze',   expertReq: '3 Cities',                              basicReq: '2 Cities',                         levels: [25, 30, 35],   cls: 'age-ebronze' },
  { name: 'Middle Bronze Age', shortName: 'M. Bronze',   expertReq: '3 Cities + 5 VP in Advances',           basicReq: '3 Cities + 3 Advances',            levels: [40, 45, 50],   cls: 'age-mbronze' },
  { name: 'Late Bronze Age',   shortName: 'L. Bronze',   expertReq: '4 Cities + 12 Advances',                basicReq: '3 Cities + 3 Advances (>100 VP)',  levels: [55, 60, 65],   cls: 'age-lbronze' },
  { name: 'Early Iron Age',    shortName: 'E. Iron',     expertReq: '5 Cities + 10 Advances ≤100 + 38 VP',  basicReq: '4 Cities + 2 Advances >200 VP',    levels: [70],           cls: 'age-eiron'   },
  { name: 'Late Iron Age',     shortName: 'L. Iron',     expertReq: '6 Cities + 17 Advances ≤100 + 56 VP',  basicReq: '5 Cities + 3 Advances >200 VP',    levels: [75, 80],       cls: 'age-liron'   },
];

// Map each level → its band class (default for all empires)
const levelBand: Record<number, string> = {};
for (const b of AGE_BANDS) for (const l of b.levels) levelBand[l] = b.cls;

// Per-empire band class: slow-start empires treat level 25 as Stone Age (5 stone age rounds)
function civBandClass(civNumber: number, level: number, expert: boolean): string {
  if (level === 25) {
    const lateSet = expert ? LATE_BRONZE_EXPERT : LATE_BRONZE_BASIC;
    if (lateSet.has(civNumber)) return 'age-stone';
  }
  return levelBand[level] ?? '';
}

// Returns true when this cell is the LAST cell of its age band for this empire
function isAgeEnd(civNumber: number, level: number, expert: boolean): boolean {
  const lateSet = expert ? LATE_BRONZE_EXPERT : LATE_BRONZE_BASIC;
  const stoneEnd = lateSet.has(civNumber) ? 25 : 20;
  // Boundaries: end of Stone Age (per-empire), then fixed ends for all later ages
  return level === stoneEnd || level === 35 || level === 50 || level === 65 || level === 70 || level === 80;
}

export function renderAst(state: FullState): string {
  const { game, players, astLevels } = state;
  const expert = game.expert === 1;

  // ── List view (existing) ─────────────────────────────────────────────────
  const atLevel: Record<number, typeof players> = {};
  for (const p of players) {
    if (!atLevel[p.ast_level]) atLevel[p.ast_level] = [];
    atLevel[p.ast_level].push(p);
  }
  for (const level in atLevel) {
    atLevel[level].sort((a, b) => b.adv_points - a.adv_points || (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number));
  }

  const listRows = [...astLevels].reverse().map(l => {
    const civsHere = (atLevel[l.level] ?? []).map(p =>
      `<span class="civ-badge civ-badge-with-num" style="background:${p.civ_color};color:${p.civ_text_color}"><span class="civ-num-in-badge">${p.civ_number}</span>${p.civ_name}</span>`
    ).join('');
    const rowClass = (atLevel[l.level] ?? []).length ? 'ast-row-occupied' : '';
    const req = (expert ? l.expert_req : l.basic_req) ?? '—';
    return `<tr class="${rowClass}">
      <td><div class="ast-civs-cell">${civsHere || ''}</div></td>
      <td class="ast-era-cell">${l.era}</td>
      <td class="ast-level-cell">${l.level}</td>
      <td class="ast-req-cell">${req}</td>
    </tr>`;
  }).join('');

  // ── Board view ───────────────────────────────────────────────────────────
  // Sort players by Empire number (matches the physical board)
  const sorted = [...players].sort((a, b) => a.civ_number - b.civ_number);

  // Age band header row — single-column bands show no text (color identifies them; legend below)
  const bandHeaders = AGE_BANDS.map(b =>
    `<th colspan="${b.levels.length}" class="ab-header ${b.cls}" title="${b.name}">
      ${b.levels.length > 1 ? `<span class="ab-name">${b.shortName}</span>` : ''}
    </th>`
  ).join('');

  // Requirements legend (skip the pre-game Start entry)
  const reqLegend = AGE_BANDS.filter(b => b.cls !== 'age-start').map(b =>
    `<li><span class="ab-legend-dot ${b.cls}"></span><strong>${b.name}:</strong> ${expert ? b.expertReq : b.basicReq}</li>`
  ).join('');

  // Level number header row — level 0 is the START position, shown as "S"
  const fixedAgeEnds = new Set([20, 35, 50, 65, 70, 80]);
  const levelHeaders = AST_LEVELS.map(l =>
    `<th class="ab-level-num ${levelBand[l]}${l === 0 ? ' ab-start-col' : ''}${fixedAgeEnds.has(l) ? ' ab-age-end' : ''}">${l === 0 ? 'S' : l}</th>`
  ).join('');

  // Round marker row — 0-indexed: column i shows round i (S=0, level5=1, level10=2, …)
  // current_round in DB starts at 1, so the active column is index current_round-1
  const roundBeyondBoard = game.active && game.current_round - 1 >= AST_LEVELS.length;
  const roundCells = AST_LEVELS.map((l, i) => {
    const displayRound = i; // 0 at START, 1 at level 5, etc.
    const isCurrent = game.active && !roundBeyondBoard && displayRound === game.current_round - 1;
    const startCls = l === 0 ? ' ab-start-col' : '';
    const endCls = fixedAgeEnds.has(l) ? ' ab-age-end' : '';
    return `<td class="ab-round-num${startCls}${endCls}${isCurrent ? ' ab-round-current' : ''}">${displayRound}</td>`;
  }).join('');

  // Player rows
  const boardRows = sorted.map(p => {
    const cells = AST_LEVELS.map(l => {
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
    ? `<tr><td colspan="${AST_LEVELS.length + 1}" style="text-align:center;padding:2rem;opacity:0.5">No active game</td></tr>`
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

  <div class="ast-view-toggle">
    <button id="btn-list-view" class="ast-toggle-btn">List</button>
    <button id="btn-board-view" class="ast-toggle-btn active-toggle">Board</button>
  </div>

  <div id="ast-list-view" style="display:none">
    <div class="ast-mode-toggle">
      <p>Showing: <strong>${expert ? 'Expert' : 'Basic'} requirements</strong>
      ${game.active ? '(set in game config)' : ''}
      — C = cities, ADV = advances, VP = victory points</p>
    </div>
    <div class="ast-table-wrap">
      <table class="mett-table ast-full-table">
        <thead>
          <tr>
            <th>Empires</th>
            <th>Era</th>
            <th>Position</th>
            <th>${expert ? 'Expert' : 'Basic'} Requirement</th>
          </tr>
        </thead>
        <tbody>${listRows}</tbody>
      </table>
    </div>
  </div>

  <div id="ast-board-view">
    <div class="ab-scroll">
      <table class="ab-table">
        <thead>
          <tr>
            <th class="ab-civ-label ab-corner"></th>
            ${bandHeaders}
          </tr>
          <tr>
            <th class="ab-civ-label ab-corner ab-vp-label">VP →</th>
            ${levelHeaders}
          </tr>
        </thead>
        <tbody>
          ${boardRows || boardEmpty}
        </tbody>
        <tfoot>
          <tr>
            <td class="ab-civ-label ab-corner ab-round-label${roundBeyondBoard ? ' ab-round-current' : ''}">
              ${roundBeyondBoard ? `R${game.current_round - 1} →` : 'Round →'}
            </td>
            ${roundCells}
          </tr>
        </tfoot>
      </table>
    </div>
    <ul class="ab-legend">${reqLegend}</ul>
  </div>
</div>
<script>
  const btnList  = document.getElementById('btn-list-view');
  const btnBoard = document.getElementById('btn-board-view');
  const listView  = document.getElementById('ast-list-view');
  const boardView = document.getElementById('ast-board-view');
  // Default to board view; list only if explicitly chosen
  const stored = localStorage.getItem('ast-view');
  if (stored !== 'list') { listView.style.display='none'; boardView.style.display=''; btnList.classList.remove('active-toggle'); btnBoard.classList.add('active-toggle'); }
  btnList.addEventListener('click', () => {
    listView.style.display=''; boardView.style.display='none';
    btnList.classList.add('active-toggle'); btnBoard.classList.remove('active-toggle');
    localStorage.setItem('ast-view', 'list');
  });
  btnBoard.addEventListener('click', () => {
    listView.style.display='none'; boardView.style.display='';
    btnBoard.classList.add('active-toggle'); btnList.classList.remove('active-toggle');
    localStorage.setItem('ast-view', 'board');
  });
  // Live updates
  window.addEventListener('mett:state', () => location.reload());
</script>
`;
}
