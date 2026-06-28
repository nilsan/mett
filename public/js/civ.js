(() => {
  // src/shared/scoring.ts
  function playerTotalVp(p, cityCount) {
    return p.ast_level + p.adv_points + (cityCount ?? 0) + (p.late_iron_age_bonus ? 5 : 0);
  }
  function makeScoreEntry(p, cityVp) {
    return {
      total: playerTotalVp(p, cityVp),
      ast_level: p.ast_level,
      adv_6vp: p.adv_6vp,
      adv_3vp: p.adv_3vp,
      rank_order: p.rank_order,
      civ_number: p.civ_number
    };
  }
  function compareScores(a, b, final = true) {
    if (b.total !== a.total)
      return b.total - a.total;
    if (final) {
      if (b.ast_level !== a.ast_level)
        return b.ast_level - a.ast_level;
      if (b.adv_6vp !== a.adv_6vp)
        return b.adv_6vp - a.adv_6vp;
      if (b.adv_3vp !== a.adv_3vp)
        return b.adv_3vp - a.adv_3vp;
    }
    return (a.rank_order || a.civ_number) - (b.rank_order || b.civ_number);
  }
  function sameScoreGroup(a, b, final = true) {
    if (a.total !== b.total)
      return false;
    if (!final)
      return true;
    return a.ast_level === b.ast_level && a.adv_6vp === b.adv_6vp && a.adv_3vp === b.adv_3vp;
  }
  function sortCensusOrder(players) {
    return [...players].sort((a, b) => {
      if (a.military !== b.military)
        return a.military - b.military;
      const pa = a.census?.population ?? -Infinity;
      const pb = b.census?.population ?? -Infinity;
      if (pa !== pb)
        return pb - pa;
      return a.civ_number - b.civ_number;
    });
  }
  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return s[(v - 20) % 10] ?? s[v] ?? "th";
  }

  // src/civs.ts
  var LATE_BRONZE_BASIC = new Set([1, 2]);
  var LATE_BRONZE_EXPERT = new Set([1, 2, 10, 13]);
  var LATE_START = new Set([5, 7, 13, 18]);
  function getCivAstProfile(civNumber, expert) {
    if (expert) {
      if (LATE_BRONZE_EXPERT.has(civNumber))
        return { stoneEnd: 25, ebaEnd: 35 };
      return { stoneEnd: 20, ebaEnd: 35 };
    } else {
      if (LATE_BRONZE_BASIC.has(civNumber))
        return { stoneEnd: 25, ebaEnd: 40 };
      if (LATE_START.has(civNumber))
        return { stoneEnd: 20, ebaEnd: 40 };
      return { stoneEnd: 20, ebaEnd: 35 };
    }
  }

  // src/shared/ast-pure.ts
  function advancesOfTier(player, tier) {
    switch (tier) {
      case "expensive":
        return player.adv_6vp;
      case "medium":
        return player.adv_3vp + player.adv_6vp;
      case "cheap":
        return player.adv_1vp;
      default:
        return player.adv_1vp + player.adv_3vp + player.adv_6vp;
    }
  }
  function getAdvanceRequirement(player, levels, expert) {
    const curIdx = levels.findIndex((l) => l.level === player.ast_level);
    if (curIdx < 0 || curIdx >= levels.length - 1)
      return null;
    const currentLevel = levels[curIdx];
    const { stoneEnd, ebaEnd } = getCivAstProfile(player.civ_number, expert);
    if (stoneEnd > 20 && currentLevel.level < stoneEnd)
      return null;
    if (!expert && (currentLevel.level === 35 || currentLevel.level === 40)) {
      if (currentLevel.level < ebaEnd)
        return { cities: 2 };
    }
    const reqJson = expert ? currentLevel.expert_req_json : currentLevel.basic_req_json;
    return reqJson ? JSON.parse(reqJson) : null;
  }

  // src/client/civ.ts
  var civEl = document.getElementById("civ-content");
  if (civEl) {
    let bindCensus = function() {
      const submitBtn = document.getElementById("submit-census");
      const popInput = document.getElementById("pop-input");
      if (!submitBtn || !popInput)
        return;
      submitBtn.addEventListener("click", async () => {
        let value = parseInt(popInput.value, 10);
        if (isNaN(value)) {
          popInput.focus();
          return;
        }
        if (value < 0)
          value = 55 + value;
        if (value < 1 || value > 55) {
          popInput.focus();
          return;
        }
        popInput.value = String(value);
        submitBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/census`, { population: value });
        submitBtn.disabled = false;
        if (res.ok)
          mettFlash(submitBtn.closest(".civ-section"));
      });
      popInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          submitBtn.click();
      });
    }, bindCity = function() {
      const cityInput = document.getElementById("city-input");
      const cityBtn = document.getElementById("submit-city");
      if (!cityInput || !cityBtn)
        return;
      if (cityInput.dataset.serverValue !== "") {
        cityInput.value = cityInput.dataset.serverValue;
      }
      document.getElementById("city-dec")?.addEventListener("click", () => {
        const cur = parseInt(cityInput.value, 10);
        const next = isNaN(cur) ? 0 : cur - 1;
        if (next >= 0)
          cityInput.value = String(next);
      });
      document.getElementById("city-inc")?.addEventListener("click", () => {
        const cur = parseInt(cityInput.value, 10);
        const next = isNaN(cur) ? 0 : cur + 1;
        if (next <= 9)
          cityInput.value = String(next);
      });
      cityBtn.addEventListener("click", async () => {
        const value = parseInt(cityInput.value, 10);
        if (isNaN(value) || value < 0 || value > 9)
          return;
        cityBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/city-count`, { city_count: value });
        cityBtn.disabled = false;
        if (res.ok)
          mettFlash(cityBtn.closest(".civ-section"));
      });
    }, bindAdv = function() {
      const adv1 = document.getElementById("adv-1vp");
      const adv3 = document.getElementById("adv-3vp");
      const adv6 = document.getElementById("adv-6vp");
      const advTotal = document.getElementById("adv-total");
      function calcAdvTotal() {
        const v1 = parseInt(adv1?.value ?? "0", 10) || 0;
        const v3 = parseInt(adv3?.value ?? "0", 10) || 0;
        const v6 = parseInt(adv6?.value ?? "0", 10) || 0;
        return v1 + v3 * 3 + v6 * 6;
      }
      function refreshAdvTotal() {
        if (advTotal)
          advTotal.textContent = String(calcAdvTotal());
      }
      async function submitAdv() {
        const v1 = Math.max(0, parseInt(adv1?.value ?? "0", 10) || 0);
        const v3 = Math.max(0, parseInt(adv3?.value ?? "0", 10) || 0);
        const v6 = Math.max(0, parseInt(adv6?.value ?? "0", 10) || 0);
        const res = await mettPost(`/api/players/${playerId}/adv`, { adv_1vp: v1, adv_3vp: v3, adv_6vp: v6 });
        if (res.ok && adv1)
          mettFlash(adv1.closest(".civ-section"));
      }
      function submitAdvDebounced() {
        clearTimeout(advTypingTimer);
        advTypingTimer = setTimeout(submitAdv, 400);
      }
      for (const inp of [adv1, adv3, adv6]) {
        if (!inp)
          continue;
        inp.addEventListener("input", () => {
          refreshAdvTotal();
          submitAdvDebounced();
        });
        inp.addEventListener("blur", () => {
          clearTimeout(advTypingTimer);
          submitAdv();
        });
      }
      document.querySelectorAll(".adv-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const inp = document.getElementById(btn.dataset.target);
          if (!inp)
            return;
          const dir = parseInt(btn.dataset.dir, 10);
          const cur = parseInt(inp.value, 10) || 0;
          inp.value = String(Math.max(0, cur + dir));
          refreshAdvTotal();
          clearTimeout(advTypingTimer);
          submitAdv();
        });
      });
    }, bindMilWon = function() {
      const milBtn = document.getElementById("mil-toggle");
      if (milBtn) {
        milBtn.addEventListener("click", async () => {
          milBtn.disabled = true;
          const res = await mettPost(`/api/players/${playerId}/military`);
          if (!res.ok)
            milBtn.disabled = false;
        });
      }
      const wonBtn = document.getElementById("won-toggle");
      if (wonBtn) {
        wonBtn.addEventListener("click", async () => {
          wonBtn.disabled = true;
          const res = await mettPost(`/api/players/${playerId}/wonder`);
          if (!res.ok)
            wonBtn.disabled = false;
        });
      }
      const spcBtn = document.getElementById("spc-toggle");
      if (spcBtn) {
        spcBtn.addEventListener("click", async () => {
          spcBtn.disabled = true;
          const res = await mettPost(`/api/players/${playerId}/special`);
          if (!res.ok)
            spcBtn.disabled = false;
        });
      }
    }, renderFromState = function(state) {
      if (!state?.game || !state?.players)
        return;
      const player = state.players.find((p) => p.id === playerId);
      if (!player) {
        location.reload();
        return;
      }
      const census = state.census.find((c) => c.player_id === playerId) ?? null;
      const game = state.game;
      const expert = game.expert === 1;
      const revealed = game.census_revealed === 1;
      const citiesPhase = game.cities_phase === 1;
      const submitted = census != null && census.population != null;
      const cityCountSubmitted = census != null && census.city_count != null;
      for (const id of ["mil-toggle", "won-toggle", "spc-toggle"]) {
        const btn = document.getElementById(id);
        if (btn)
          btn.disabled = false;
      }
      const roundEl = document.getElementById("census-round");
      if (roundEl)
        roundEl.textContent = String(game.current_round);
      syncMilWon(player);
      syncCensus(player, census, submitted, revealed, state);
      syncCity(census, cityCountSubmitted, citiesPhase);
      syncAdv(player);
      syncAst(player, census, game, state, expert);
    }, syncMilWon = function(player) {
      const milBtn = document.getElementById("mil-toggle");
      if (milBtn) {
        milBtn.classList.toggle("mil-on", !!player.military);
        milBtn.classList.toggle("mil-off", !player.military);
        milBtn.textContent = player.military ? "⚔ Has Military — tap to remove" : "✕ No Military — tap to grant";
      }
      const wonBtn = document.getElementById("won-toggle");
      if (wonBtn) {
        wonBtn.classList.toggle("won-on", !!player.wonder);
        wonBtn.classList.toggle("won-off", !player.wonder);
        wonBtn.textContent = player.wonder ? "★ Has Wonder — tap to remove" : "✕ No Wonder — tap to grant";
      }
      const spcBtn = document.getElementById("spc-toggle");
      if (spcBtn) {
        spcBtn.classList.toggle("spc-on", !!player.special);
        spcBtn.classList.toggle("spc-off", !player.special);
        spcBtn.textContent = player.special ? "⚡ Special ability — tap to remove" : "✕ No special ability — tap to grant";
      }
    }, syncCensus = function(player, census, submitted, revealed, state) {
      const formEl = document.getElementById("census-form");
      if (!formEl)
        return;
      const statusEl = formEl.querySelector(".census-submitted, .census-pending");
      if (statusEl) {
        if (submitted) {
          statusEl.className = "census-submitted";
          statusEl.innerHTML = "✓ Submitted: <strong>" + escapeHtml(String(census.population)) + "</strong>";
        } else {
          statusEl.className = "census-pending";
          statusEl.textContent = "Not yet submitted";
        }
      }
      const popInput = document.getElementById("pop-input");
      if (popInput && document.activeElement !== popInput) {
        popInput.value = submitted ? String(census.population) : "";
      }
      const hint = formEl.querySelector(".census-hint");
      if (!submitted && !hint) {
        const row = formEl.querySelector(".census-input-row");
        if (row) {
          const h = document.createElement("small");
          h.className = "census-hint";
          h.textContent = "Tip: -27 = 28 tokens remaining";
          row.after(h);
        }
      } else if (submitted && hint) {
        hint.remove();
      }
      const existing = formEl.querySelector(".move-order");
      if (revealed && submitted) {
        const playersWithCensus = state.players.map((p) => ({
          ...p,
          census: state.census.find((c) => c.player_id === p.id) ?? null
        }));
        const sorted = sortCensusOrder(playersWithCensus);
        const pos = sorted.findIndex((p) => p.id === player.id) + 1;
        const html = `You move <strong>${pos}${ordinal(pos)}</strong> of ${sorted.length} this round.`;
        if (existing)
          existing.innerHTML = html;
        else {
          const p = document.createElement("p");
          p.className = "move-order";
          p.innerHTML = html;
          formEl.appendChild(p);
        }
      } else if (existing) {
        existing.remove();
      }
    }, syncCity = function(census, submitted, citiesPhase) {
      const phaseEl = document.querySelector(".phase-hint");
      if (phaseEl) {
        phaseEl.textContent = citiesPhase ? "Enter city count after calamities resolve. This is the count used for A.S.T. progression." : "Enter city count before buying trade cards. You will re-enter after calamities resolve.";
      }
      const phaseBadge = document.querySelector(".phase-badge");
      if (phaseBadge) {
        phaseBadge.textContent = citiesPhase ? "Phase 2 of 2 — post-calamity" : "Phase 1 of 2 — pre-trade";
      }
      const cityInput = document.getElementById("city-input");
      if (!cityInput)
        return;
      const formEl = cityInput.closest(".census-form");
      if (!formEl)
        return;
      const statusEl = formEl.querySelector(".census-submitted, .census-pending");
      if (statusEl) {
        if (submitted) {
          statusEl.className = "census-submitted";
          statusEl.innerHTML = "✓ Cities: <strong>" + escapeHtml(String(census.city_count)) + "</strong>";
        } else {
          statusEl.className = "census-pending";
          statusEl.textContent = "Not yet entered";
        }
      }
      if (document.activeElement !== cityInput && submitted) {
        cityInput.value = String(census.city_count);
      }
      cityInput.dataset.serverValue = submitted ? String(census.city_count) : "";
    }, syncAdv = function(player) {
      const adv1 = document.getElementById("adv-1vp");
      const adv3 = document.getElementById("adv-3vp");
      const adv6 = document.getElementById("adv-6vp");
      const advTotal = document.getElementById("adv-total");
      const focused = document.activeElement;
      if (adv1 && adv1 !== focused)
        adv1.value = String(player.adv_1vp);
      if (adv3 && adv3 !== focused)
        adv3.value = String(player.adv_3vp);
      if (adv6 && adv6 !== focused)
        adv6.value = String(player.adv_6vp);
      if (advTotal) {
        const v1 = parseInt(adv1?.value ?? "0", 10) || 0;
        const v3 = parseInt(adv3?.value ?? "0", 10) || 0;
        const v6 = parseInt(adv6?.value ?? "0", 10) || 0;
        advTotal.textContent = String(v1 + v3 * 3 + v6 * 6);
      }
    }, syncAst = function(player, census, game, state, expert) {
      const sec = document.querySelector(".ast-section");
      if (!sec)
        return;
      sec.innerHTML = buildAstSectionInner(player, census, game, state, expert);
    }, computeLbInfo = function(player, state) {
      const game = state.game;
      const censusByPlayer = new Map(state.census.map((c) => [c.player_id, c.city_count ?? 0]));
      const finalRanking = !game.active;
      const cityVp = (p) => game.active ? 0 : censusByPlayer.get(p.id) ?? 0;
      const sorted = [...state.players].sort((a, b) => compareScores(makeScoreEntry(a, cityVp(a)), makeScoreEntry(b, cityVp(b)), finalRanking));
      const idx = sorted.findIndex((p) => p.id === player.id);
      if (idx === -1)
        return { pos: 1, tied: false, resolved: false };
      const myScore = makeScoreEntry(player, cityVp(player));
      let groupStart = idx;
      while (groupStart > 0 && sameScoreGroup(makeScoreEntry(sorted[groupStart - 1], cityVp(sorted[groupStart - 1])), myScore, finalRanking))
        groupStart--;
      let groupEnd = idx;
      while (groupEnd + 1 < sorted.length && sameScoreGroup(myScore, makeScoreEntry(sorted[groupEnd + 1], cityVp(sorted[groupEnd + 1])), finalRanking))
        groupEnd++;
      const tied = groupEnd > idx || idx > groupStart;
      const resolved = tied && sorted.slice(groupStart, groupEnd + 1).every((p) => p.rank_order !== 0);
      const pos = resolved ? idx + 1 : groupStart + 1;
      return { pos, tied, resolved };
    }, buildAstSectionInner = function(player, census, game, state, expert) {
      const cityCount = census ? census.city_count : null;
      const lb = computeLbInfo(player, state);
      const finalRank = game.active === 0 && game.started_at ? lb.pos : null;
      const lbValue = (lb.tied && !lb.resolved ? "=" : "") + lb.pos + ordinal(lb.pos);
      const totalVp = playerTotalVp(player, game.active ? null : cityCount);
      const lia = player.late_iron_age_bonus ? `<div class="ast-current lia-bonus-row"><span class="ast-level-label">LIA bonus:</span> <span class="lia-bonus-chip">★ +5 VP at game end</span></div>` : "";
      const levels = state.astLevels ?? [];
      const curIdx = levels.findIndex((l) => l.level === player.ast_level);
      const nextLevel = curIdx >= 0 ? levels[curIdx + 1] : null;
      const stoneEnd = getCivAstProfile(player.civ_number, expert).stoneEnd;
      let middle = "";
      if (nextLevel) {
        const effectiveCities = cityCount != null ? cityCount + (player.wonder ? 1 : 0) : null;
        const inStoneAge = player.ast_level <= stoneEnd;
        if (expert && effectiveCities === 0 && !inStoneAge && curIdx > 0) {
          const regressLevel = levels[curIdx - 1]?.level ?? 0;
          middle = `<div class="ast-next req-not-met">
          <h4>To advance to ${nextLevel.level}:</h4>
          <p class="ast-warn-regress">⚠ 0 cities — will regress to ${regressLevel} next round</p>
        </div>`;
        } else {
          const advReq = getAdvanceRequirement(player, levels, expert);
          middle = renderRequirementBlock(player, census, advReq, effectiveCities, nextLevel.level);
        }
      } else {
        if (finalRank === 1)
          middle = '<p class="ast-complete">\uD83E\uDD47 Gold!</p>';
        else if (finalRank === 2)
          middle = '<p class="ast-complete">\uD83E\uDD48 Silver!</p>';
        else if (finalRank === 3)
          middle = '<p class="ast-complete">\uD83E\uDD49 Bronze!</p>';
        else
          middle = '<p class="ast-complete">Maximum A.S.T. position reached!</p>';
      }
      const bar = renderAstBar(levels, player.ast_level, expert);
      return `
      <div class="ast-current">
        <span class="ast-level-label">Leaderboard position:</span>
        <span class="ast-level-value">${lbValue}</span>
        <span class="ast-era">of ${state.players.length}</span>
      </div>
      <div class="ast-current">
        <span class="ast-level-label">Total VP:</span>
        <span class="ast-level-value">${totalVp}</span>
      </div>
      ${lia}
      ${middle}
      ${bar}
    `;
    }, renderRequirementBlock = function(player, census, advReq, effectiveCities, nextLevelNum) {
      if (!advReq) {
        return `<div class="ast-next">
        <h4>To advance to ${nextLevelNum}:</h4>
        <p class="ast-req-text">None</p>
      </div>`;
      }
      if (advReq.impossible) {
        return `<div class="ast-next">
        <h4>To advance to ${nextLevelNum}:</h4>
        <p class="ast-req-text">N/A</p>
      </div>`;
      }
      const cityCount = census ? census.city_count : null;
      const rows = [];
      let allMet = true;
      if (advReq.cities > 0) {
        const meetsCities = effectiveCities != null ? effectiveCities >= advReq.cities : null;
        if (meetsCities === null) {
          rows.push(`<span class="req-row req-unknown">? ${advReq.cities} cities <span class="req-have">(not yet submitted)</span></span>`);
        } else {
          const note = player.wonder && cityCount != null && effectiveCities != null && cityCount < effectiveCities ? `${cityCount} + ★` : `${effectiveCities}`;
          rows.push(`<span class="req-row${meetsCities ? " req-ok" : " req-fail"}">${meetsCities ? "✓" : "✗"} ${advReq.cities} cities <span class="req-have">(you have ${note})</span></span>`);
          if (!meetsCities)
            allMet = false;
        }
      }
      if (advReq.advCount !== undefined) {
        const haveAdv = advancesOfTier(player, advReq.advTier);
        const meetsAdv = haveAdv >= advReq.advCount;
        if (!meetsAdv)
          allMet = false;
        const tierLabel = advReq.advTier === "cheap" ? " cheap (<100)" : advReq.advTier === "medium" ? " mid (≥100)" : advReq.advTier === "expensive" ? " expensive (≥200)" : "";
        rows.push(`<span class="req-row${meetsAdv ? " req-ok" : " req-fail"}">${meetsAdv ? "✓" : "✗"} ${advReq.advCount === 17 ? "all 17" : advReq.advCount} advances${tierLabel} <span class="req-have">(you have ${haveAdv})</span></span>`);
      }
      if (advReq.advVpTotal !== undefined) {
        const meets = player.adv_points >= advReq.advVpTotal;
        if (!meets)
          allMet = false;
        rows.push(`<span class="req-row${meets ? " req-ok" : " req-fail"}">${meets ? "✓" : "✗"} ${advReq.advVpTotal} VP in advances <span class="req-have">(you have ${player.adv_points})</span></span>`);
      }
      if (advReq.totalVp !== undefined) {
        const meets = player.adv_points >= advReq.totalVp;
        if (!meets)
          allMet = false;
        rows.push(`<span class="req-row${meets ? " req-ok" : " req-fail"}">${meets ? "✓" : "✗"} ${advReq.totalVp} total VP <span class="req-have">(you have ${player.adv_points})</span></span>`);
      }
      const borderClass = rows.length ? allMet ? " req-all-ok" : " req-not-met" : "";
      const body = rows.length ? `<div class="ast-req-status">${rows.join("")}</div>` : `<p class="ast-req-text">None</p>`;
      return `<div class="ast-next${borderClass}">
      <h4>To advance to ${nextLevelNum}:</h4>
      ${body}
    </div>`;
    }, renderAstBar = function(levels, currentLevel, expert) {
      const filtered = expert ? levels : levels.filter((l) => l.level <= 75);
      const N = filtered.length;
      const nodes = filtered.map((l) => {
        const cls = l.level === currentLevel ? "ast-node active" : l.level < currentLevel ? "ast-node past" : "ast-node future";
        const label = l.level === 0 ? "S" : l.level;
        const req = expert ? l.expert_req : l.basic_req;
        return `<div class="${cls}" title="${escapeHtml(l.era)}: ${escapeHtml(req ?? "")}">${label}</div>`;
      }).join("");
      const existing = document.querySelector(".ast-bar-wrap .ast-progress-grid");
      if (existing) {
        const labels = Array.from(existing.children).filter((el) => el.classList.contains("ast-age-label")).map((el) => el.outerHTML).join("");
        const cols = existing.style.gridTemplateColumns || `repeat(${N},minmax(0,1fr))`;
        return `<div class="ast-bar-wrap"><div class="ast-progress-grid" style="grid-template-columns:${cols}">${labels}${nodes}</div></div>`;
      }
      return `<div class="ast-bar-wrap"><div class="ast-progress-grid" style="grid-template-columns:repeat(${N},minmax(0,1fr))">${nodes}</div></div>`;
    }, escapeHtml = function(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    };
    const playerId = Number(civEl.dataset.playerId) || window.PLAYER_ID;
    bindCensus();
    bindCity();
    bindAdv();
    bindMilWon();
    window.addEventListener("mett:my-state", (e) => {
      try {
        renderFromState(e.detail);
      } catch (err) {
        console.error("[civ.ts] renderFromState failed", err);
      }
    });
    let advTypingTimer;
  }
})();
