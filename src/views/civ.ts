import type { FullState, PlayerRow, AstLevelRow, CensusRow } from '../db.js';
import { getCivAstProfile } from '../civs.js';

interface ReqStatus {
  willRegress: boolean;          // city_count === 0 and not at floor
  regrессLevel: number;          // what level they'd regress to
  meetsCities: boolean | null;   // null when city count unknown
  meetsAdvances: boolean;
  meetsVP: boolean;
  reqCities: number;
  reqAdvCount: number;
  reqAdvType: string;            // 'any' | '<100' | '≥100' | '≥200' | 'all17'
  reqVP: number;                 // 0 if no VP requirement
  haveCities: number | null;     // null when city count unknown
  haveAdv: number;               // relevant card count per type
  haveVP: number;
}

function checkReq(reqText: string | null, player: PlayerRow, cityCount: number | null, currentLevelIdx: number, expert: boolean): ReqStatus | null {
  const AST_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
  const regrессLevel = currentLevelIdx > 0 ? AST_LEVELS[currentLevelIdx - 1] : AST_LEVELS[0];

  // stoneEnd level itself is still safe from regression; regression only outside Stone Age
  const { stoneEnd } = getCivAstProfile(player.civ_number, expert);
  const inStoneAge = player.ast_level <= stoneEnd;

  if (cityCount === 0 && !inStoneAge) {
    return {
      willRegress: currentLevelIdx > 0,
      regrессLevel,
      meetsCities: false, meetsAdvances: true, meetsVP: true,
      reqCities: 1, reqAdvCount: 0, reqAdvType: 'any', reqVP: 0,
      haveCities: 0, haveAdv: 0, haveVP: player.adv_points,
    };
  }

  if (!reqText || reqText === 'None') return null; // no requirement — will always advance

  const cityMatch = reqText.match(/(\d+) cities/);
  const reqCities = cityMatch ? parseInt(cityMatch[1], 10) : 0;
  // null city count = unknown; don't mark as failing (but show "?" in UI)
  const meetsCities = cityCount !== null ? cityCount >= reqCities : null;

  let reqAdvCount = 0, reqAdvType = 'any', haveAdv = 0, meetsAdvances = true;
  let reqVP = 0, haveVP = player.adv_points, meetsVP = true;

  if (reqText.includes('all 17 advances')) {
    reqAdvCount = 17; reqAdvType = '<100'; haveAdv = player.adv_1vp;
    meetsAdvances = player.adv_1vp >= 17;
    const vpM = reqText.match(/\+ (\d+) VP/);
    if (vpM) { reqVP = parseInt(vpM[1], 10); meetsVP = player.adv_points >= reqVP; }
  } else {
    const advM = reqText.match(/(\d+) advances/);
    const vpInAdvM = reqText.match(/(\d+) VP in advances/);
    if (advM) {
      reqAdvCount = parseInt(advM[1], 10);
      if (reqText.includes('≥200 each')) {
        reqAdvType = '≥200'; haveAdv = player.adv_6vp;
        meetsAdvances = player.adv_6vp >= reqAdvCount;
      } else if (reqText.includes('≥100 each')) {
        reqAdvType = '≥100'; haveAdv = player.adv_3vp + player.adv_6vp;
        meetsAdvances = haveAdv >= reqAdvCount;
      } else if (reqText.includes('<100 each')) {
        reqAdvType = '<100'; haveAdv = player.adv_1vp;
        meetsAdvances = player.adv_1vp >= reqAdvCount;
        const vpM = reqText.match(/\+ (\d+) VP/);
        if (vpM) { reqVP = parseInt(vpM[1], 10); meetsVP = player.adv_points >= reqVP; }
      } else {
        reqAdvType = 'any';
        haveAdv = player.adv_1vp + player.adv_3vp + player.adv_6vp;
        meetsAdvances = haveAdv >= reqAdvCount;
      }
    } else if (vpInAdvM) {
      reqVP = parseInt(vpInAdvM[1], 10); meetsVP = player.adv_points >= reqVP;
    }
  }

  return {
    willRegress: false, regrессLevel,
    meetsCities, meetsAdvances, meetsVP,
    reqCities, reqAdvCount, reqAdvType, reqVP,
    haveCities: cityCount ?? null, haveAdv, haveVP,
  };
}

function getCivAgeBands(civNumber: number, expert: boolean) {
  const { stoneEnd, ebaEnd } = getCivAstProfile(civNumber, expert);
  // stoneSpan: Stone Age columns after Start (levels 5 to stoneEnd, step 5)
  const stoneSpan = stoneEnd / 5;              // 20→4 or 25→5
  // ebaSpan: EBA columns (from stoneEnd+5 to ebaEnd)
  const ebaSpan   = (ebaEnd - stoneEnd) / 5;  // varies per group
  // mbaSpan: MBA columns (from ebaEnd+5 to 50, always ends at 50)
  const mbaSpan   = (50 - ebaEnd) / 5;
  // EIA = 1 column (level 70) in both modes; LIA = 1 (basic) or 2 (expert)
  const liaSpan   = expert ? 2 : 1;
  return [
    { label: '',          span: 1,        cls: 'age-start'   },
    { label: 'Stone',     span: stoneSpan, cls: 'age-stone'   },
    { label: 'E. Bronze', span: ebaSpan,  cls: 'age-ebronze' },
    { label: 'M. Bronze', span: mbaSpan,  cls: 'age-mbronze' },
    { label: 'L. Bronze', span: 3,        cls: 'age-lbronze' },
    { label: 'E. Iron',   span: 1,        cls: 'age-eiron'   },
    { label: 'L. Iron',   span: liaSpan,  cls: 'age-liron'   },
  ];
}

function astBar(levels: AstLevelRow[], currentLevel: number, expert: boolean, civNumber: number): string {
  // Basic mode stops at 75 — level 80 is unreachable and not shown
  if (!expert) levels = levels.filter(l => l.level <= 75);
  const N = levels.length;

  const labelDivs = getCivAgeBands(civNumber, expert).map(b =>
    `<div class="ast-age-label ${b.cls}" style="grid-column:span ${b.span}">${b.label}</div>`
  ).join('');

  const nodeDivs = levels.map(l => {
    const active = l.level === currentLevel;
    const past = l.level < currentLevel;
    const cls = active ? 'ast-node active' : past ? 'ast-node past' : 'ast-node future';
    return `<div class="${cls}" title="${l.era}: ${expert ? l.expert_req : l.basic_req}">${l.level === 0 ? 'S' : l.level}</div>`;
  }).join('');

  return `<div class="ast-bar-wrap">
    <div class="ast-progress-grid" style="grid-template-columns:repeat(${N},var(--ast-node-size))">
      ${labelDivs}
      ${nodeDivs}
    </div>
  </div>`;
}

export function renderCiv(
  state: FullState,
  slug: string,
  prevCensus: CensusRow | null = null,
): string | null {
  const player = state.players.find(p => p.civ_slug === slug);
  if (!player) return null;

  const game = state.game;
  const expert = game.expert === 1;
  const census = state.census.find(c => c.player_id === player.id);
  const submitted = census?.population != null;
  const cityCountSubmitted = census?.city_count != null;

  const levels = state.astLevels;
  const currentLevelIdx = levels.findIndex(l => l.level === player.ast_level);
  const currentLevel = levels[currentLevelIdx] ?? null;
  const nextLevel = levels[currentLevelIdx + 1] ?? null;
  const { stoneEnd } = getCivAstProfile(player.civ_number, expert);
  // The requirement stored AT the current level is what you need to advance FROM it.
  const nextReq = nextLevel
    ? (() => {
        // Slow-start civs (stoneEnd=25): level 20 is mid-Stone-Age — no requirement
        // Level 25 (stoneEnd) uses the DB value — EBA entry requirement applies there
        if (stoneEnd > 20 && (currentLevel?.level ?? 0) < stoneEnd) return 'None';
        // In basic mode, override stored MBA req for slow/late civs still in EBA at 35 or 40
        if (!expert && (currentLevel?.level === 35 || currentLevel?.level === 40)) {
          const { ebaEnd } = getCivAstProfile(player.civ_number, false);
          if ((currentLevel?.level ?? 0) < ebaEnd) return '2 cities';
        }
        const req = (expert ? currentLevel?.expert_req : currentLevel?.basic_req) ?? null;
        if (!req || req === 'None' || req === 'N/A') return 'None';
        return req;
      })()
    : null;

  const regionLabel = player.region === 'west' ? 'West block' : 'East block';

  // Leaderboard position — same algorithm as status page
  const leaderboardSorted = [...state.players].sort((a, b) => {
    const tA = a.ast_level + a.adv_points, tB = b.ast_level + b.adv_points;
    if (tB !== tA) return tB - tA;
    if (b.ast_level !== a.ast_level) return b.ast_level - a.ast_level;
    if (b.adv_6vp !== a.adv_6vp) return b.adv_6vp - a.adv_6vp;
    if (b.adv_3vp !== a.adv_3vp) return b.adv_3vp - a.adv_3vp;
    return a.rank_order - b.rank_order;
  });
  const lbPos = leaderboardSorted.findIndex(p => p.id === player.id) + 1;

  // Move order (only shown after reveal)
  let moveOrderHtml = '';
  if (game.census_revealed && submitted) {
    const sorted = [...state.players]
      .map(p => ({
        ...p,
        pop: state.census.find(c => c.player_id === p.id)?.population ?? -Infinity,
      }))
      .sort((a, b) => {
        if (a.military !== b.military) return a.military - b.military;
        if (a.pop !== b.pop) return b.pop - a.pop;
        return a.civ_number - b.civ_number;
      });
    const pos = sorted.findIndex(p => p.id === player.id) + 1;
    moveOrderHtml = `<p class="move-order">You move <strong>${pos}${ordinal(pos)}</strong> of ${sorted.length} this round.</p>`;
  }

  // Census input: show submitted value, otherwise empty (player must enter explicitly each round)
  const censusDefault = submitted ? String(census!.population) : '';

  return /* html */`
<div class="civ-page" style="--civ-color:${player.civ_color};--civ-text:${player.civ_text_color}">
  <div class="civ-hero">
    <div class="civ-hero-content">
      <span class="civ-region-tag">${regionLabel}</span>
      <h2>${player.civ_name} <span class="civ-player-name">${player.name}</span></h2>
    </div>
  </div>

  <div class="civ-body">

    <section class="civ-section">
      <h3>Round ${game.current_round} Census</h3>
      ${game.active ? `
      <div class="census-form" id="census-form">
        ${submitted
          ? `<p class="census-submitted">✓ Submitted: <strong>${census!.population}</strong></p>`
          : '<p class="census-pending">Not yet submitted</p>'
        }
        <div class="census-input-row">
          <input type="number" id="pop-input" min="-54" max="55"
            value="${censusDefault}"
            placeholder="1–55"
            class="census-input">
          <button id="submit-census" class="btn-submit">Submit</button>
        </div>
        ${!submitted ? '<small class="census-hint">Tip: -27 = 28 tokens remaining</small>' : ''}
        ${moveOrderHtml}
      </div>
      ` : '<p>No active game.</p>'}
    </section>

    <section class="civ-section">
      <h3>Cities</h3>
      <div class="census-form">
        ${cityCountSubmitted
          ? `<p class="census-submitted">✓ Cities: <strong>${census!.city_count}</strong></p>`
          : '<p class="census-pending">Not yet entered</p>'
        }
        <div class="census-input-row">
          <button id="city-dec" class="adv-btn">−</button>
          <select id="city-input" class="census-input" data-server-value="${cityCountSubmitted ? census!.city_count : ''}">
            ${Array.from({length: 10}, (_, i) =>
              `<option value="${i}"${(cityCountSubmitted ? census!.city_count === i : i === 0) ? ' selected' : ''}>${i}</option>`
            ).join('')}
          </select>
          <button id="city-inc" class="adv-btn">+</button>
          <button id="submit-city" class="btn-submit">Submit</button>
        </div>
      </div>
    </section>

    <section class="civ-section">
      <h3>VP</h3>
      <div class="adv-cards">
        <div class="adv-card-row">
          <span class="adv-card-label">1 VP</span>
          <button class="adv-btn" data-target="adv-1vp" data-dir="-1">−</button>
          <input type="number" id="adv-1vp" min="0" value="${player.adv_1vp}" class="adv-card-input">
          <button class="adv-btn" data-target="adv-1vp" data-dir="1">+</button>
        </div>
        <div class="adv-card-row">
          <span class="adv-card-label">3 VP</span>
          <button class="adv-btn" data-target="adv-3vp" data-dir="-1">−</button>
          <input type="number" id="adv-3vp" min="0" value="${player.adv_3vp}" class="adv-card-input">
          <button class="adv-btn" data-target="adv-3vp" data-dir="1">+</button>
        </div>
        <div class="adv-card-row">
          <span class="adv-card-label">6 VP</span>
          <button class="adv-btn" data-target="adv-6vp" data-dir="-1">−</button>
          <input type="number" id="adv-6vp" min="0" value="${player.adv_6vp}" class="adv-card-input">
          <button class="adv-btn" data-target="adv-6vp" data-dir="1">+</button>
        </div>
        <div class="adv-total-row">
          <span class="adv-total-label">Card VP</span>
          <span id="adv-total" class="adv-total-value">${player.adv_points}</span>
          <button id="submit-adv" class="btn-submit">Update</button>
        </div>
      </div>
    </section>

    <section class="civ-section">
      <h3>Military</h3>
      <button id="mil-toggle" class="mil-toggle-civ ${player.military ? 'mil-on' : 'mil-off'}">
        ${player.military ? '⚔ Has Military — tap to remove' : '✕ No Military — tap to grant'}
      </button>
    </section>

    <section class="civ-section ast-section">
      <h3>A.S.T. Progress</h3>
      <div class="ast-current">
        <span class="ast-level-label">Leaderboard position:</span>
        <span class="ast-level-value">${lbPos}${ordinal(lbPos)}</span>
        <span class="ast-era">of ${state.players.length}</span>
      </div>
      <div class="ast-current">
        <span class="ast-level-label">Total VP:</span>
        <span class="ast-level-value">${player.ast_level + player.adv_points}</span>
      </div>
      ${nextLevel ? (() => {
        const cityCount = census?.city_count ?? null;
        // Always run checkReq — advances/VP are always evaluable even without city count
        const status = checkReq(nextReq, player, cityCount, currentLevelIdx, expert);

        if (status?.willRegress) {
          return `<div class="ast-next req-not-met">
            <h4>To advance to ${nextLevel.level}:</h4>
            <p class="ast-warn-regress">⚠ 0 cities — will regress to ${status.regrессLevel} next round</p>
          </div>`;
        }

        const rows: string[] = [];
        let allMet = true;
        if (status) {
          // meetsCities null = unknown; treat as not-failing for allMet but show "?" in row
          allMet = (status.meetsCities !== false) && status.meetsAdvances && status.meetsVP;
          if (status.reqCities > 0) {
            if (status.meetsCities === null) {
              rows.push(`<span class="req-row req-unknown">? ${status.reqCities} cities <span class="req-have">(not yet submitted)</span></span>`);
            } else {
              const ok = status.meetsCities;
              rows.push(`<span class="req-row${ok ? ' req-ok' : ' req-fail'}">${ok ? '✓' : '✗'} ${status.reqCities} cities <span class="req-have">(you have ${status.haveCities})</span></span>`);
            }
          }
          if (status.reqAdvCount > 0) {
            const ok = status.meetsAdvances;
            const typeLabel = status.reqAdvType === '<100' ? ' cheap (<100)' : status.reqAdvType === '≥100' ? ' mid (≥100)' : status.reqAdvType === '≥200' ? ' expensive (≥200)' : '';
            rows.push(`<span class="req-row${ok ? ' req-ok' : ' req-fail'}">${ok ? '✓' : '✗'} ${status.reqAdvCount === 17 ? 'all 17' : status.reqAdvCount} advances${typeLabel} <span class="req-have">(you have ${status.haveAdv})</span></span>`);
          }
          if (status.reqVP > 0) {
            const ok = status.meetsVP;
            rows.push(`<span class="req-row${ok ? ' req-ok' : ' req-fail'}">${ok ? '✓' : '✗'} ${status.reqVP} total VP <span class="req-have">(you have ${status.haveVP})</span></span>`);
          }
        }

        const borderClass = status ? (allMet ? ' req-all-ok' : ' req-not-met') : '';
        const body = rows.length
          ? `<div class="ast-req-status">${rows.join('')}</div>`
          : `<p class="ast-req-text">${nextReq ?? 'None'}</p>`;
        return `<div class="ast-next${borderClass}">
          <h4>To advance to ${nextLevel.level}:</h4>
          ${body}
        </div>`;
      })() : '<p class="ast-complete">🏆 Maximum A.S.T. position reached!</p>'}
      ${astBar(levels, player.ast_level, expert, player.civ_number)}
    </section>

  </div><!-- .civ-body -->
</div>

<script>
  window.PLAYER_ID = ${player.id};
  window.GAME_ACTIVE = ${game.active};
  window.MILITARY = ${player.military};
</script>
<script src="/js/civ.js"></script>
`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0];
}
