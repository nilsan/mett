import type { FullState, PlayerRow, AstLevelRow, CensusRow } from '../db.js';
import { getCivAstProfile } from '../civs.js';
import { sortCensusOrder } from './main.js';
import { playerTotalVp, compareScores, sameScoreGroup, makeScoreEntry } from '../models/game.js';
import { getAdvanceRequirement, advancesOfTier, type AstRequirement } from '../models/ast.js';

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

export function renderCivFragment(
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
  const nextLevel = levels[currentLevelIdx + 1] ?? null;
  const { stoneEnd } = getCivAstProfile(player.civ_number, expert);

  // Structured advance requirement from model (null = no requirement / already at max)
  const advReq: AstRequirement | null = nextLevel
    ? getAdvanceRequirement(player, levels, expert)
    : null;

  const regionLabel = player.region === 'west' ? 'West block' : 'East block';

  // Leaderboard position — same algorithm as status page
  const censusMap = new Map(state.census.map(c => [c.player_id, c.city_count ?? 0]));
  const leaderboardSorted = [...state.players].sort((a, b) =>
    compareScores(makeScoreEntry(a, censusMap.get(a.id) ?? 0), makeScoreEntry(b, censusMap.get(b.id) ?? 0))
  );
  const playerIdx = leaderboardSorted.findIndex(p => p.id === player.id);
  const playerScore = makeScoreEntry(leaderboardSorted[playerIdx]!, censusMap.get(leaderboardSorted[playerIdx]!.id) ?? 0);
  let groupStart = playerIdx;
  while (groupStart > 0 && sameScoreGroup(makeScoreEntry(leaderboardSorted[groupStart - 1]!, censusMap.get(leaderboardSorted[groupStart - 1]!.id) ?? 0), playerScore)) groupStart--;
  let groupEnd = playerIdx;
  while (groupEnd + 1 < leaderboardSorted.length && sameScoreGroup(playerScore, makeScoreEntry(leaderboardSorted[groupEnd + 1]!, censusMap.get(leaderboardSorted[groupEnd + 1]!.id) ?? 0))) groupEnd++;
  const lbTied = groupEnd > playerIdx || playerIdx > groupStart;
  const lbResolved = lbTied && leaderboardSorted.slice(groupStart, groupEnd + 1).every(p => p.rank_order !== 0);
  const lbPos = lbResolved ? playerIdx + 1 : groupStart + 1;

  // Final rank (game-over only): tie-group start position, matching status/admin pages
  const finalRank = (game.active !== 0 || !game.started_at) ? null : lbPos;

  // Move order (only shown after reveal)
  let moveOrderHtml = '';
  if (game.census_revealed && submitted) {
    const sorted = sortCensusOrder(
      state.players.map(p => ({
        ...p,
        census: state.census.find(c => c.player_id === p.id) ?? null,
      })),
    );
    const pos = sorted.findIndex(p => p.id === player.id) + 1;
    moveOrderHtml = `<p class="move-order">You move <strong>${pos}${ordinal(pos)}</strong> of ${sorted.length} this round.</p>`;
  }

  // Census input: show submitted value, otherwise empty (player must enter explicitly each round)
  const censusDefault = submitted ? String(census!.population) : '';

  return /* html */`
<div id="civ-content" data-player-id="${player.id}" data-game-active="${game.active}" hx-get="/${slug}" hx-trigger="mett:my-state from:window" hx-swap="outerHTML">
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
      <p class="phase-hint">${game.cities_phase === 1 ? 'Post-calamity — enter city count after calamities resolve' : 'Pre-trade — enter city count before buying trade cards'}</p>
      <div class="census-form">
        ${cityCountSubmitted
          ? `<p class="census-submitted">✓ Cities: <strong>${census!.city_count}</strong></p>`
          : '<p class="census-pending">Not yet entered</p>'
        }
        <div class="census-input-row">
          <button id="city-dec" class="adv-btn">−</button>
          <select id="city-input" class="census-input" data-server-value="${cityCountSubmitted ? census!.city_count : ''}">
            ${Array.from({length: 10}, (_, i) =>
              `<option value="${i}"${(cityCountSubmitted ? census!.city_count === i : i === (prevCensus?.city_count ?? 0)) ? ' selected' : ''}>${i}</option>`
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
      <h3>Military &amp; Wonder</h3>
      <div class="mil-won-row">
        <button id="mil-toggle" class="mil-toggle-civ ${player.military ? 'mil-on' : 'mil-off'}">
          ${player.military ? '⚔ Has Military — tap to remove' : '✕ No Military — tap to grant'}
        </button>
        <button id="won-toggle" class="won-toggle-civ ${player.wonder ? 'won-on' : 'won-off'}">
          ${player.wonder ? '★ Has Wonder — tap to remove' : '✕ No Wonder — tap to grant'}
        </button>
      </div>
    </section>

    <section class="civ-section ast-section">
      <h3>A.S.T. Progress</h3>
      <div class="ast-current">
        <span class="ast-level-label">Leaderboard position:</span>
        <span class="ast-level-value">${lbTied && !lbResolved ? '=' : ''}${lbPos}${ordinal(lbPos)}</span>
        <span class="ast-era">of ${state.players.length}</span>
      </div>
      <div class="ast-current">
        <span class="ast-level-label">Total VP:</span>
        <span class="ast-level-value">${playerTotalVp(player, census?.city_count)}</span>
      </div>
      ${player.late_iron_age_bonus ? `<div class="ast-current lia-bonus-row"><span class="ast-level-label">LIA bonus:</span> <span class="lia-bonus-chip">★ +5 VP at game end</span></div>` : ''}
      ${nextLevel ? (() => {
        const cityCount = census?.city_count ?? null;
        const effectiveCities = cityCount !== null ? cityCount + (player.wonder ? 1 : 0) : null;
        const inStoneAge = player.ast_level <= stoneEnd;

        // Regression: expert mode, 0 effective cities, outside Stone Age
        if (expert && effectiveCities === 0 && !inStoneAge && currentLevelIdx > 0) {
          const regrессLevel = levels[currentLevelIdx - 1]?.level ?? 0;
          return `<div class="ast-next req-not-met">
            <h4>To advance to ${nextLevel.level}:</h4>
            <p class="ast-warn-regress">⚠ 0 cities — will regress to ${regrессLevel} next round</p>
          </div>`;
        }

        const rows: string[] = [];
        let allMet = true;
        if (advReq && !advReq.impossible) {
          // Cities
          if (advReq.cities > 0) {
            const meetsCities = effectiveCities !== null ? effectiveCities >= advReq.cities : null;
            if (meetsCities === null) {
              rows.push(`<span class="req-row req-unknown">? ${advReq.cities} cities <span class="req-have">(not yet submitted)</span></span>`);
              // unknown doesn't set allMet=false — we just show "?"
            } else {
              const cityNote = player.wonder && cityCount !== null && cityCount < effectiveCities!
                ? `${cityCount} + ★`
                : `${effectiveCities}`;
              rows.push(`<span class="req-row${meetsCities ? ' req-ok' : ' req-fail'}">${meetsCities ? '✓' : '✗'} ${advReq.cities} cities <span class="req-have">(you have ${cityNote})</span></span>`);
              if (!meetsCities) allMet = false;
            }
          }
          // Advance count
          if (advReq.advCount !== undefined) {
            const haveAdv = advancesOfTier(player, advReq.advTier);
            const meetsAdv = haveAdv >= advReq.advCount;
            if (!meetsAdv) allMet = false;
            const tierLabel = advReq.advTier === 'cheap' ? ' cheap (<100)' : advReq.advTier === 'medium' ? ' mid (≥100)' : advReq.advTier === 'expensive' ? ' expensive (≥200)' : '';
            rows.push(`<span class="req-row${meetsAdv ? ' req-ok' : ' req-fail'}">${meetsAdv ? '✓' : '✗'} ${advReq.advCount === 17 ? 'all 17' : advReq.advCount} advances${tierLabel} <span class="req-have">(you have ${haveAdv})</span></span>`);
          }
          // VP-in-advances requirement (MBA expert: "5 VP in advances")
          if (advReq.advVpTotal !== undefined) {
            const meets = player.adv_points >= advReq.advVpTotal;
            if (!meets) allMet = false;
            rows.push(`<span class="req-row${meets ? ' req-ok' : ' req-fail'}">${meets ? '✓' : '✗'} ${advReq.advVpTotal} VP in advances <span class="req-have">(you have ${player.adv_points})</span></span>`);
          }
          // Total VP floor (EIA/LIA expert)
          if (advReq.totalVp !== undefined) {
            const meets = player.adv_points >= advReq.totalVp;
            if (!meets) allMet = false;
            rows.push(`<span class="req-row${meets ? ' req-ok' : ' req-fail'}">${meets ? '✓' : '✗'} ${advReq.totalVp} total VP <span class="req-have">(you have ${player.adv_points})</span></span>`);
          }
        }

        const borderClass = advReq ? (allMet ? ' req-all-ok' : ' req-not-met') : '';
        const body = rows.length
          ? `<div class="ast-req-status">${rows.join('')}</div>`
          : `<p class="ast-req-text">None</p>`;
        return `<div class="ast-next${borderClass}">
          <h4>To advance to ${nextLevel.level}:</h4>
          ${body}
        </div>`;
      })() : (() => {
        if (finalRank === 1) return '<p class="ast-complete">🥇 Gold!</p>';
        if (finalRank === 2) return '<p class="ast-complete">🥈 Silver!</p>';
        if (finalRank === 3) return '<p class="ast-complete">🥉 Bronze!</p>';
        return '<p class="ast-complete">Maximum A.S.T. position reached!</p>';
      })()}
      ${astBar(levels, player.ast_level, expert, player.civ_number)}
    </section>

  </div><!-- .civ-body -->
</div><!-- .civ-page -->
</div><!-- #civ-content -->
`;}

export function renderCiv(
  state: FullState,
  slug: string,
  prevCensus: CensusRow | null = null,
): string | null {
  const fragment = renderCivFragment(state, slug, prevCensus);
  if (!fragment) return null;
  const player = state.players.find(p => p.civ_slug === slug)!;
  return `<script>window.PLAYER_ID = ${player.id};</script>
${fragment}
<script src="/js/civ.js"></script>
`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? 'th';
}
