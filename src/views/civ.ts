/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { FullState, PlayerRow, CensusRow } from '../db.js';
import { getCivAstProfile } from '../civs.js';
import { escapeHtml } from '../shared/html.js';
import { sortCensusOrder, playerTotalVp, compareScores, sameScoreGroup, makeScoreEntry } from '../models/game.js';
import pkg from '../../package.json' with { type: 'json' };
const V = `?v=${pkg.version}`;
import { AST_LEVELS, boardLevels, getAgeBands, civBandClass, astNodeTitle, getAdvanceRequirement, advancesOfTier, renderAgeRequirementsList, type AstRequirement } from '../models/ast.js';


function getCivAgeBands(civNumber: number, expert: boolean) {
  // Column span per age = how many of this civ's board squares fall in it
  // (slow/late-start civs shift the Stone/EBA boundaries).
  const levels = boardLevels(expert);
  return getAgeBands(expert).map(b => ({
    label: b.cls === 'age-start' ? '' : b.name,
    span: levels.filter(l => civBandClass(civNumber, l, expert) === b.cls).length,
    cls: b.cls,
  }));
}

// ─── Requirement-row rendering ───────────────────────────────────────────────
//
// The "To advance to N" box on the civ page lists 1–4 criteria (cities,
// advance count, advance-VP total, total VP). Each is rendered the same way
// — icon + label + "(you have X)" hint — but with different sources. Build
// a list of {status, label, have} objects, then map to HTML.

type ReqStatus = 'ok' | 'fail' | 'unknown';
interface ReqRow { status: ReqStatus; label: string; have: string }

function reqRowHtml(r: ReqRow): string {
  const cls = r.status === 'unknown' ? 'req-unknown' : r.status === 'ok' ? 'req-ok' : 'req-fail';
  const icon = r.status === 'unknown' ? '?' : r.status === 'ok' ? '✓' : '✗';
  return `<span class="req-row ${cls}">${icon} ${r.label} <span class="req-have">(${r.have})</span></span>`;
}

function buildRequirementRows(
  player: PlayerRow,
  advReq: AstRequirement | null,
  cityCount: number | null,
  effectiveCities: number | null,
): ReqRow[] {
  if (!advReq || advReq.impossible) return [];
  const rows: ReqRow[] = [];

  if (advReq.cities > 0) {
    if (effectiveCities === null) {
      rows.push({ status: 'unknown', label: `${advReq.cities} cities`, have: 'not yet submitted' });
    } else {
      const note = player.wonder && cityCount !== null && cityCount < effectiveCities
        ? `${cityCount} + ★`
        : `${effectiveCities}`;
      rows.push({
        status: effectiveCities >= advReq.cities ? 'ok' : 'fail',
        label: `${advReq.cities} cities`,
        have: `you have ${note}`,
      });
    }
  }

  if (advReq.advCount !== undefined) {
    const haveAdv = advancesOfTier(player, advReq.advTier);
    const tierLabel = advReq.advTier === 'cheap' ? ' cheap (<100)'
      : advReq.advTier === 'medium' ? ' mid (≥100)'
      : advReq.advTier === 'expensive' ? ' expensive (≥200)'
      : '';
    rows.push({
      status: haveAdv >= advReq.advCount ? 'ok' : 'fail',
      label: `${advReq.advCount === 17 ? 'all 17' : advReq.advCount} advances${tierLabel}`,
      have: `you have ${haveAdv}`,
    });
  }

  if (advReq.advVpTotal !== undefined) {
    rows.push({
      status: player.adv_points >= advReq.advVpTotal ? 'ok' : 'fail',
      label: `${advReq.advVpTotal} VP in advances`,
      have: `you have ${player.adv_points}`,
    });
  }

  if (advReq.totalVp !== undefined) {
    rows.push({
      status: player.adv_points >= advReq.totalVp ? 'ok' : 'fail',
      label: `${advReq.totalVp} total VP`,
      have: `you have ${player.adv_points}`,
    });
  }

  return rows;
}

function astBar(currentLevel: number, expert: boolean, civNumber: number): string {
  // Basic mode stops at 75 — level 80 is unreachable and not shown
  const levels = boardLevels(expert);
  const N = levels.length;

  const labelDivs = getCivAgeBands(civNumber, expert).map(b =>
    `<div class="ast-age-label ${b.cls}" style="grid-column:span ${b.span}">${b.label}</div>`
  ).join('');

  const nodeDivs = levels.map(l => {
    const active = l === currentLevel;
    const past = l < currentLevel;
    const cls = active ? 'ast-node active' : past ? 'ast-node past' : 'ast-node future';
    return `<div class="${cls}" title="${astNodeTitle(l, expert)}">${l === 0 ? 'S' : l}</div>`;
  }).join('');

  return `<div class="ast-bar-wrap">
    <div class="ast-progress-grid" style="grid-template-columns:repeat(${N},minmax(0,1fr))">
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
  const revealed = game.census_revealed === 1;
  const citiesPhase = game.cities_phase === 1;
  const moved = !!census?.moved;

  const currentLevelIdx = AST_LEVELS.indexOf(player.ast_level);
  const nextLevel = AST_LEVELS[currentLevelIdx + 1] ?? null;
  const { stoneEnd } = getCivAstProfile(player.civ_number, expert);

  // Structured advance requirement from model (null = no requirement / already at max)
  const advReq: AstRequirement | null = nextLevel !== null
    ? getAdvanceRequirement(player, expert)
    : null;

  const regionLabel = player.region === 'west' ? 'West block' : 'East block';

  // Leaderboard position — same algorithm as status page. City VP and the
  // advance-card tiebreakers are excluded during active play (final=false).
  const finalRanking = !game.active;
  const censusMap = new Map(state.census.map(c => [c.player_id, c.city_count ?? 0]));
  const lbCityVp = (p: { id: number }) => game.active ? 0 : (censusMap.get(p.id) ?? 0);
  const leaderboardSorted = [...state.players].sort((a, b) =>
    compareScores(makeScoreEntry(a, lbCityVp(a)), makeScoreEntry(b, lbCityVp(b)), finalRanking)
  );
  const playerIdx = leaderboardSorted.findIndex(p => p.id === player.id);
  const playerScore = makeScoreEntry(leaderboardSorted[playerIdx]!, lbCityVp(leaderboardSorted[playerIdx]!));
  let groupStart = playerIdx;
  while (groupStart > 0 && sameScoreGroup(makeScoreEntry(leaderboardSorted[groupStart - 1]!, lbCityVp(leaderboardSorted[groupStart - 1]!)), playerScore, finalRanking)) groupStart--;
  let groupEnd = playerIdx;
  while (groupEnd + 1 < leaderboardSorted.length && sameScoreGroup(playerScore, makeScoreEntry(leaderboardSorted[groupEnd + 1]!, lbCityVp(leaderboardSorted[groupEnd + 1]!)), finalRanking)) groupEnd++;
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
<div id="civ-content" data-player-id="${player.id}" data-game-active="${game.active}">
<div class="civ-page" style="--civ-color:${player.civ_color};--civ-text:${player.civ_text_color}">
  <div class="civ-hero">
    <div class="civ-hero-content">
      <span class="civ-region-tag">${regionLabel}</span>
      <h2>${player.civ_name} <span class="civ-player-name">${escapeHtml(player.name)}</span></h2>
    </div>
  </div>

  <div class="civ-body">

    <section class="civ-section">
      <h3>Round <span id="census-round">${game.current_round}</span> Census</h3>
      ${game.active ? `
      <div class="census-form" id="census-form">
        ${submitted
          ? `<p class="census-submitted">✓ Submitted: <strong>${census!.population}</strong></p>`
          : '<p class="census-pending">Not yet submitted</p>'
        }
        <div class="census-input-row census-pop-row">
          <input type="number" id="pop-input" min="-54" max="55"
            value="${censusDefault}"
            placeholder="1–55"
            inputmode="numeric"
            class="census-input"${citiesPhase ? ' disabled' : ''}>
          <button id="submit-census" class="btn-submit"${citiesPhase ? ' disabled' : ''}>Submit</button>
        </div>
        ${!submitted ? '<small class="census-hint">Tip: -27 = 28 tokens remaining</small>' : ''}
        ${moveOrderHtml}
        <div class="mov-row"${citiesPhase ? ' hidden' : ''}>
          <button id="mov-toggle" class="mov-toggle-civ ${moved ? 'mov-on' : 'mov-off'}"${revealed ? '' : ' disabled'}>
            ${moved ? '✓ Units moved — neighbours can start' : '⊙ Mark units moved'}
          </button>
          <small class="mov-hint">${revealed ? 'Let your neighbours know your units are placed.' : 'Available once the census is revealed.'}</small>
        </div>
      </div>
      ` : '<p>No active game.</p>'}
    </section>

    <section class="civ-section">
      <h3>Cities <span class="phase-badge">${game.cities_phase === 1 ? 'Phase 2 of 2 — post-calamity' : 'Phase 1 of 2 — pre-trade'}</span></h3>
      <p class="phase-hint">${game.cities_phase === 1 ? 'Enter city count after calamities resolve. This is the count used for A.S.T. progression.' : 'Enter city count before buying trade cards. You will re-enter after calamities resolve.'}</p>
      <div class="census-form">
        ${cityCountSubmitted
          ? `<p class="census-submitted">✓ Cities: <strong>${census!.city_count}</strong></p>`
          : '<p class="census-pending">Not yet entered</p>'
        }
        <div class="census-input-row city-count-row">
          <button id="city-dec" class="adv-btn" aria-label="Decrease city count"${revealed ? '' : ' disabled'}>−</button>
          <select id="city-input" class="census-input" aria-label="City count" data-server-value="${cityCountSubmitted ? census!.city_count : ''}"${revealed ? '' : ' disabled'}>
            ${Array.from({length: 10}, (_, i) =>
              `<option value="${i}"${(cityCountSubmitted ? census!.city_count === i : i === (prevCensus?.city_count ?? 0)) ? ' selected' : ''}>${i}</option>`
            ).join('')}
          </select>
          <button id="city-inc" class="adv-btn" aria-label="Increase city count"${revealed ? '' : ' disabled'}>+</button>
          <button id="submit-city" class="btn-submit"${revealed ? '' : ' disabled'}>Submit</button>
        </div>
        <small class="city-hint census-hint"${revealed ? ' hidden' : ''}>Available once the census is revealed.</small>
      </div>
    </section>

    <section class="civ-section">
      <h3>VP</h3>
      <div class="adv-cards">
        <div class="adv-card-row">
          <button class="adv-btn" data-target="adv-1vp" data-dir="-1" aria-label="Decrease 1 VP advance count">−</button>
          <input type="number" id="adv-1vp" min="0" value="${player.adv_1vp}" inputmode="numeric" class="adv-card-input" aria-labelledby="adv-1vp-label">
          <button class="adv-btn" data-target="adv-1vp" data-dir="1" aria-label="Increase 1 VP advance count">+</button>
          <span class="adv-card-label" id="adv-1vp-label">1 VP</span>
        </div>
        <div class="adv-card-row">
          <button class="adv-btn" data-target="adv-3vp" data-dir="-1" aria-label="Decrease 3 VP advance count">−</button>
          <input type="number" id="adv-3vp" min="0" value="${player.adv_3vp}" inputmode="numeric" class="adv-card-input" aria-labelledby="adv-3vp-label">
          <button class="adv-btn" data-target="adv-3vp" data-dir="1" aria-label="Increase 3 VP advance count">+</button>
          <span class="adv-card-label" id="adv-3vp-label">3 VP</span>
        </div>
        <div class="adv-card-row">
          <button class="adv-btn" data-target="adv-6vp" data-dir="-1" aria-label="Decrease 6 VP advance count">−</button>
          <input type="number" id="adv-6vp" min="0" value="${player.adv_6vp}" inputmode="numeric" class="adv-card-input" aria-labelledby="adv-6vp-label">
          <button class="adv-btn" data-target="adv-6vp" data-dir="1" aria-label="Increase 6 VP advance count">+</button>
          <span class="adv-card-label" id="adv-6vp-label">6 VP</span>
        </div>
        <div class="adv-total-row">
          <span class="adv-total-label">SUM</span>
          <span class="adv-total-value"><span id="adv-total">${player.adv_points}</span> VP</span>
        </div>
      </div>
    </section>

    <section class="civ-section">
      <h3>Military, Wonder &amp; Special</h3>
      <div class="mil-won-row">
        <button id="mil-toggle" class="mil-toggle-civ ${player.military ? 'mil-on' : 'mil-off'}">
          ${player.military ? '⚔ Has Military — tap to remove' : '✕ No Military — tap to grant'}
        </button>
        <button id="won-toggle" class="won-toggle-civ ${player.wonder ? 'won-on' : 'won-off'}">
          ${player.wonder ? '★ Has Wonder — tap to remove' : '✕ No Wonder — tap to grant'}
        </button>
        <button id="spc-toggle" class="spc-toggle-civ ${player.special ? 'spc-on' : 'spc-off'}">
          ${player.special ? '⚡ Special ability — tap to remove' : '✕ No special ability — tap to grant'}
        </button>
      </div>
    </section>

    <section class="civ-section ast-section">
      <div class="ast-current">
        <span class="ast-level-label">Leaderboard position:</span>
        <span class="ast-level-value">${lbTied && !lbResolved ? '=' : ''}${lbPos}${ordinal(lbPos)}</span>
        <span class="ast-era">of ${state.players.length}</span>
      </div>
      <div class="ast-current">
        <span class="ast-level-label">Total VP:</span>
        <span class="ast-level-value">${playerTotalVp(player, game.active ? null : census?.city_count)}</span>
      </div>
      ${player.late_iron_age_bonus ? `<div class="ast-current lia-bonus-row"><span class="ast-level-label">LIA bonus:</span> <span class="lia-bonus-chip">★ +5 VP at game end</span></div>` : ''}
      ${nextLevel !== null ? (() => {
        // Fall back to the previous round's count so the city requirement is
        // coloured green/red (never a white "not yet submitted"), consistent
        // with the all-ages legend below — the cities on the board don't vanish
        // just because this round's count isn't in yet.
        const cityCount = census?.city_count ?? prevCensus?.city_count ?? null;
        const effectiveCities = cityCount !== null ? cityCount + (player.wonder ? 1 : 0) : null;
        const inStoneAge = player.ast_level <= stoneEnd;

        // Regression: expert mode, 0 effective cities, outside Stone Age
        if (expert && effectiveCities === 0 && !inStoneAge && currentLevelIdx > 0) {
          const regressLevel = AST_LEVELS[currentLevelIdx - 1] ?? 0;
          return `<div class="ast-next req-not-met">
            <h4>To advance to ${nextLevel}:</h4>
            <p class="ast-warn-regress">⚠ 0 cities — will regress to ${regressLevel} next round</p>
          </div>`;
        }

        const rows = buildRequirementRows(player, advReq, cityCount, effectiveCities);
        // 'unknown' doesn't fail the all-met check — only an explicit 'fail' does.
        const allMet = rows.every(r => r.status !== 'fail');
        const borderClass = advReq ? (allMet ? ' req-all-ok' : ' req-not-met') : '';
        const body = rows.length
          ? `<div class="ast-req-status">${rows.map(reqRowHtml).join('')}</div>`
          : `<p class="ast-req-text">None</p>`;
        return `<div class="ast-next${borderClass}">
          <h4>To advance to ${nextLevel}:</h4>
          ${body}
        </div>`;
      })() : (() => {
        if (finalRank === 1) return '<p class="ast-complete">🥇 Gold!</p>';
        if (finalRank === 2) return '<p class="ast-complete">🥈 Silver!</p>';
        if (finalRank === 3) return '<p class="ast-complete">🥉 Bronze!</p>';
        return '<p class="ast-complete">Maximum A.S.T. position reached!</p>';
      })()}
      ${astBar(player.ast_level, expert, player.civ_number)}
      <ul class="ab-legend ast-req-legend">${renderAgeRequirementsList(player, census?.city_count ?? prevCensus?.city_count ?? null, expert)}</ul>
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
<script src="/js/civ.js${V}"></script>
`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? 'th';
}
