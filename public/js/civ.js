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
  var AST_LEVELS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80];
  function maxAstLevel(expert) {
    return expert ? 80 : 75;
  }
  function boardLevels(expert) {
    return AST_LEVELS.filter((l) => l <= maxAstLevel(expert));
  }
  var AGE_TABLE = [
    {
      name: "Start",
      shortName: "",
      levels: [0],
      cls: "age-start",
      req: { expert: null, basic: null }
    },
    {
      name: "Stone Age",
      shortName: "S.A.",
      levels: [5, 10, 15, 20],
      cls: "age-stone",
      req: { expert: null, basic: null }
    },
    {
      name: "Early Bronze Age",
      shortName: "E.B.",
      levels: [25, 30, 35],
      cls: "age-ebronze",
      req: {
        expert: { cities: 3 },
        basic: { cities: 2 }
      }
    },
    {
      name: "Middle Bronze Age",
      shortName: "M.B.",
      levels: [40, 45, 50],
      cls: "age-mbronze",
      req: {
        expert: { cities: 3, advVpTotal: 5 },
        basic: { cities: 3, advCount: 3, advTier: "any" }
      }
    },
    {
      name: "Late Bronze Age",
      shortName: "L.B.",
      levels: [55, 60, 65],
      cls: "age-lbronze",
      req: {
        expert: { cities: 4, advCount: 12, advTier: "any" },
        basic: { cities: 3, advCount: 3, advTier: "medium" }
      }
    },
    {
      name: "Early Iron Age",
      shortName: "E.I.",
      levels: [70],
      cls: "age-eiron",
      req: {
        expert: { cities: 5, advCount: 10, advTier: "cheap", totalVp: 38 },
        basic: { cities: 4, advCount: 2, advTier: "expensive" }
      }
    },
    {
      name: "Late Iron Age",
      shortName: "L.I.",
      levels: [75, 80],
      cls: "age-liron",
      req: {
        expert: { cities: 6, advCount: 17, advTier: "cheap", totalVp: 56 },
        basic: { cities: 5, advCount: 3, advTier: "expensive" }
      }
    }
  ];
  function ageOfLevel(level) {
    return AGE_TABLE.find((b) => b.levels.includes(level)) ?? AGE_TABLE[AGE_TABLE.length - 1];
  }
  function requirementFor(level, expert) {
    const next = level + 5;
    if (next > maxAstLevel(expert))
      return { cities: 0, impossible: true };
    return ageOfLevel(next).req[expert ? "expert" : "basic"];
  }
  var TIER_LABEL = {
    any: (n) => `${n} Advances`,
    medium: (n) => `${n} Adv ≥100`,
    expensive: (n) => `${n} Adv ≥200`,
    cheap: (n) => `${n} Adv <100`
  };
  function requirementParts(req) {
    if (!req || req.impossible)
      return [];
    const parts = [];
    if (req.cities > 0)
      parts.push({ type: "cities", n: req.cities, label: `${req.cities} Cities` });
    if (req.advVpTotal !== undefined)
      parts.push({ type: "vp", n: req.advVpTotal, label: `${req.advVpTotal} VP in Advances` });
    if (req.advCount !== undefined) {
      const tier = req.advTier ?? "any";
      parts.push({ type: "adv", n: req.advCount, tier, label: TIER_LABEL[tier](req.advCount) });
    }
    if (req.totalVp !== undefined)
      parts.push({ type: "vp", n: req.totalVp, label: `${req.totalVp} VP` });
    return parts;
  }
  function describeRequirement(req) {
    if (req?.impossible)
      return "N/A";
    const parts = requirementParts(req);
    return parts.length ? parts.map((p) => p.label).join(" + ") : "No requirements";
  }
  function astNodeTitle(level, expert) {
    const band = ageOfLevel(level);
    return level === 0 ? band.name : `${band.name}: ${describeRequirement(band.req[expert ? "expert" : "basic"])}`;
  }
  function ageRequirements(expert) {
    return AGE_TABLE.filter((b) => b.cls !== "age-start").map((b) => ({ cls: b.cls, name: b.name, parts: requirementParts(b.req[expert ? "expert" : "basic"]) }));
  }
  function renderAgeRequirementsList(player, cityCount, expert) {
    const effCities = cityCount == null ? null : cityCount + (player.wonder ? 1 : 0);
    return ageRequirements(expert).map((line) => {
      const dot = `<span class="ab-legend-dot ${line.cls}"></span><strong>${line.name}:</strong>`;
      if (!line.parts.length) {
        return `<li>${dot} <span class="req-part-none">No requirements</span></li>`;
      }
      const parts = line.parts.map((part) => {
        let met;
        if (part.type === "cities")
          met = effCities == null ? null : effCities >= part.n;
        else if (part.type === "adv")
          met = advancesOfTier(player, part.tier) >= part.n;
        else
          met = player.adv_points >= part.n;
        const state = met == null ? "unknown" : met ? "ok" : "fail";
        return `<span class="req-part req-part-${state}">${part.label}</span>`;
      }).join('<span class="req-sep"> + </span>');
      return `<li>${dot} ${parts}</li>`;
    }).join("");
  }
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
  function civRequirementFor(civNumber, level, expert) {
    const { stoneEnd, ebaEnd } = getCivAstProfile(civNumber, expert);
    if (stoneEnd > 20 && level < stoneEnd)
      return null;
    if (!expert && (level === 35 || level === 40) && level < ebaEnd)
      return { cities: 2 };
    return requirementFor(level, expert);
  }
  function getAdvanceRequirement(player, expert) {
    return civRequirementFor(player.civ_number, player.ast_level, expert);
  }

  // src/shared/html.ts
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
    }, bindMov = function() {
      const movBtn = document.getElementById("mov-toggle");
      if (!movBtn)
        return;
      movBtn.addEventListener("click", async () => {
        if (movBtn.disabled)
          return;
        movBtn.disabled = true;
        const res = await mettPost(`/api/players/${playerId}/move`);
        if (!res.ok)
          movBtn.disabled = false;
      });
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
      syncCensus(player, census, submitted, revealed, citiesPhase, state);
      syncCity(census, cityCountSubmitted, citiesPhase, revealed);
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
    }, syncCensus = function(player, census, submitted, revealed, citiesPhase, state) {
      const formEl = document.getElementById("census-form");
      if (!formEl)
        return;
      const popInputEl = document.getElementById("pop-input");
      if (popInputEl)
        popInputEl.disabled = citiesPhase;
      const submitBtn = document.getElementById("submit-census");
      if (submitBtn)
        submitBtn.disabled = citiesPhase;
      const movRow = formEl.querySelector(".mov-row");
      if (movRow)
        movRow.hidden = citiesPhase;
      const movBtn = document.getElementById("mov-toggle");
      if (movBtn) {
        const moved = !!census?.moved;
        movBtn.disabled = !revealed;
        movBtn.classList.toggle("mov-on", moved);
        movBtn.classList.toggle("mov-off", !moved);
        movBtn.textContent = moved ? "✓ Units moved — neighbours can start" : "⊙ Mark units moved";
        const movHint = formEl.querySelector(".mov-hint");
        if (movHint) {
          movHint.textContent = revealed ? "Let your neighbours know your units are placed." : "Available once the census is revealed.";
        }
      }
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
    }, syncCity = function(census, submitted, citiesPhase, revealed) {
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
      cityInput.disabled = !revealed;
      for (const id of ["city-dec", "city-inc", "submit-city"]) {
        const el = document.getElementById(id);
        if (el)
          el.disabled = !revealed;
      }
      const cityHint = formEl.querySelector(".city-hint");
      if (cityHint)
        cityHint.hidden = revealed;
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
      const prevCityCount = state.prevCensus?.find((c) => c.player_id === player.id)?.city_count ?? null;
      const legendCityCount = cityCount ?? prevCityCount;
      const lb = computeLbInfo(player, state);
      const finalRank = game.active === 0 && game.started_at ? lb.pos : null;
      const lbValue = (lb.tied && !lb.resolved ? "=" : "") + lb.pos + ordinal(lb.pos);
      const totalVp = playerTotalVp(player, game.active ? null : cityCount);
      const lia = player.late_iron_age_bonus ? `<div class="ast-current lia-bonus-row"><span class="ast-level-label">LIA bonus:</span> <span class="lia-bonus-chip">★ +5 VP at game end</span></div>` : "";
      const curIdx = AST_LEVELS.indexOf(player.ast_level);
      const nextLevel = curIdx >= 0 ? AST_LEVELS[curIdx + 1] ?? null : null;
      const stoneEnd = getCivAstProfile(player.civ_number, expert).stoneEnd;
      let middle = "";
      if (nextLevel !== null) {
        const effectiveCities = legendCityCount != null ? legendCityCount + (player.wonder ? 1 : 0) : null;
        const inStoneAge = player.ast_level <= stoneEnd;
        if (expert && effectiveCities === 0 && !inStoneAge && curIdx > 0) {
          const regressLevel = AST_LEVELS[curIdx - 1] ?? 0;
          middle = `<div class="ast-next req-not-met">
          <h4>To advance to ${nextLevel}:</h4>
          <p class="ast-warn-regress">⚠ 0 cities — will regress to ${regressLevel} next round</p>
        </div>`;
        } else {
          const advReq = getAdvanceRequirement(player, expert);
          middle = renderRequirementBlock(player, { city_count: legendCityCount }, advReq, effectiveCities, nextLevel);
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
      const bar = renderAstBar(player.ast_level, expert);
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
      <ul class="ab-legend ast-req-legend">${renderAgeRequirementsList(player, legendCityCount, expert)}</ul>
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
    }, renderAstBar = function(currentLevel, expert) {
      const filtered = boardLevels(expert);
      const N = filtered.length;
      const nodes = filtered.map((l) => {
        const cls = l === currentLevel ? "ast-node active" : l < currentLevel ? "ast-node past" : "ast-node future";
        const label = l === 0 ? "S" : l;
        return `<div class="${cls}" title="${astNodeTitle(l, expert)}">${label}</div>`;
      }).join("");
      const existing = document.querySelector(".ast-bar-wrap .ast-progress-grid");
      if (existing) {
        const labels = Array.from(existing.children).filter((el) => el.classList.contains("ast-age-label")).map((el) => el.outerHTML).join("");
        const cols = existing.style.gridTemplateColumns || `repeat(${N},minmax(0,1fr))`;
        return `<div class="ast-bar-wrap"><div class="ast-progress-grid" style="grid-template-columns:${cols}">${labels}${nodes}</div></div>`;
      }
      return `<div class="ast-bar-wrap"><div class="ast-progress-grid" style="grid-template-columns:repeat(${N},minmax(0,1fr))">${nodes}</div></div>`;
    };
    const playerId = Number(civEl.dataset.playerId) || window.PLAYER_ID;
    bindCensus();
    bindCity();
    bindAdv();
    bindMilWon();
    bindMov();
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
