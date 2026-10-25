(() => {
  // src/client/admin.ts
  var byId = (id) => document.getElementById(id);
  var qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  var checkedValue = (name, fallback) => document.querySelector(`input[name="${name}"]:checked`)?.value ?? fallback;
  var pwdToggle = byId("pwd-toggle");
  var pwdFormWrap = byId("pwd-form-wrap");
  if (pwdToggle && pwdFormWrap) {
    if (pwdFormWrap.style.display !== "none")
      pwdToggle.textContent = "Hide Password Form";
    pwdToggle.addEventListener("click", () => {
      const visible = pwdFormWrap.style.display !== "none";
      pwdFormWrap.style.display = visible ? "none" : "";
      pwdToggle.textContent = visible ? "Change Password" : "Hide Password Form";
    });
  }
  if (byId("player-count"))
    initSetup();
  else
    initActive();
  function bindVisibilityToggle(toggleId, sectionId, storageKey, showText, hideText) {
    const toggle = byId(toggleId);
    const section = byId(sectionId);
    if (!toggle || !section)
      return;
    if (sessionStorage.getItem(storageKey) === "1") {
      section.style.display = "";
      toggle.textContent = hideText;
    }
    toggle.addEventListener("click", () => {
      const visible = section.style.display !== "none";
      section.style.display = visible ? "none" : "";
      toggle.textContent = visible ? showText : hideText;
      sessionStorage.setItem(storageKey, visible ? "0" : "1");
    });
  }
  function initSetup() {
    const allCivs = window.ALL_CIVS ?? [];
    let scenarioData = { west: {}, east: {}, combined: {} };
    let currentSelection = [];
    const playerCountSelect = byId("player-count");
    const scenarioToggleRow = byId("scenario-toggle-row");
    const hintEl = byId("setup-hint");
    const nameSection = byId("name-section");
    const nameInputsEl = byId("name-inputs");
    const startBtn = byId("start-game");
    const errorEl = byId("start-error");
    fetch("/api/setup-recommendations").then((r) => r.json()).then((data) => {
      scenarioData = data;
      applyRecommendation();
    });
    playerCountSelect.addEventListener("change", () => {
      const n = parseInt(playerCountSelect.value, 10);
      scenarioToggleRow.style.display = n <= 9 ? "" : "none";
      applyRecommendation();
    });
    qsa('input[name="scenario"]').forEach((radio) => {
      radio.addEventListener("change", () => applyRecommendation());
    });
    function getScenario() {
      const n = parseInt(playerCountSelect.value, 10);
      if (n >= 10)
        return scenarioData.combined[n] ?? null;
      const side = checkedValue("scenario", "west") === "east" ? "east" : "west";
      return scenarioData[side][n] ?? null;
    }
    function applyRecommendation() {
      const rec = getScenario();
      if (!rec) {
        hintEl.textContent = "";
        currentSelection = [];
        renderNameInputs();
        return;
      }
      currentSelection = rec.civNumbers.map((num) => {
        const civ = allCivs.find((c) => c.number === num);
        if (!civ)
          return null;
        return { ...civ, region: rec.regionOverrides[num] ?? civ.defRegion };
      }).filter((c) => c !== null).sort((a, b) => a.number - b.number);
      hintEl.textContent = rec.note ?? "";
      renderNameInputs();
    }
    function renderNameInputs() {
      if (currentSelection.length === 0) {
        nameSection.style.display = "none";
        startBtn.disabled = true;
        return;
      }
      const saved = {};
      qsa(".name-text-input").forEach((inp) => {
        if (inp.value.trim())
          saved[inp.dataset.civId] = inp.value.trim();
      });
      nameSection.style.display = "";
      const grid = document.createElement("div");
      grid.className = "name-inputs-grid2";
      currentSelection.forEach((civ) => {
        const row = document.createElement("div");
        row.className = "name-input-row";
        const tag = document.createElement("span");
        tag.className = "name-civ-tag";
        tag.style.background = civ.color;
        tag.style.color = civ.text;
        tag.textContent = civ.name;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "name-text-input";
        input.placeholder = "Player name";
        input.autocomplete = "off";
        input.dataset.civId = String(civ.id);
        input.dataset.region = civ.region;
        input.maxLength = 40;
        const prev = saved[civ.id];
        if (prev)
          input.value = prev;
        row.appendChild(tag);
        row.appendChild(input);
        grid.appendChild(row);
      });
      nameInputsEl.replaceChildren(grid);
      startBtn.disabled = false;
    }
    bindVisibilityToggle("setup-sim-toggle", "setup-sim-section", "setupSimVisible", "Show Dev Tools", "Hide Dev Tools");
    const simRoundsSlider = byId("sim-rounds");
    const simRoundsDisplay = byId("sim-rounds-display");
    if (simRoundsSlider && simRoundsDisplay) {
      simRoundsSlider.addEventListener("input", () => {
        simRoundsDisplay.textContent = simRoundsSlider.value;
      });
    }
    const simBtn = byId("sim-game");
    if (simBtn) {
      simBtn.addEventListener("click", async () => {
        const origText = simBtn.textContent;
        simBtn.disabled = true;
        simBtn.textContent = "Simulating…";
        const n = parseInt(playerCountSelect.value, 10);
        const expert = parseInt(checkedValue("game-mode", "1"), 10);
        const rounds = parseInt(simRoundsSlider?.value ?? "8", 10);
        const scenario = n <= 9 ? checkedValue("scenario", "west") : "combined";
        const res = await mettPost("/api/debug/simulate", { expert, player_count: n, rounds, scenario, delay_ms: 300 });
        if (res.ok)
          location.reload();
        else {
          simBtn.textContent = origText;
          simBtn.disabled = false;
        }
      });
    }
    startBtn.addEventListener("click", async () => {
      errorEl.textContent = "";
      const players = qsa(".name-text-input").map((inp) => ({
        civ_id: parseInt(inp.dataset.civId, 10),
        name: inp.value.trim() || inp.placeholder,
        region: inp.dataset.region
      }));
      if (!players.length) {
        errorEl.textContent = "Select a player count first.";
        return;
      }
      const expert = parseInt(checkedValue("game-mode", "1"), 10);
      startBtn.disabled = true;
      const res = await mettPost("/api/game/start", { expert, players });
      if (res.ok)
        location.reload();
      else
        startBtn.disabled = false;
    });
  }
  function initActive() {
    const advanceBtn = byId("advance-round");
    if (advanceBtn) {
      advanceBtn.addEventListener("click", async () => {
        const isEndGame = (advanceBtn.textContent ?? "").trim().startsWith("End Game");
        if (isEndGame && !confirm("End the game now? Final scores will be revealed and the round counter stops here."))
          return;
        advanceBtn.disabled = true;
        await mettPost("/api/game/round/next", {});
        location.reload();
      });
    }
    const prepareAstBtn = byId("prepare-ast");
    if (prepareAstBtn) {
      prepareAstBtn.addEventListener("click", async () => {
        prepareAstBtn.disabled = true;
        await mettPost("/api/game/cities/clear", {});
        location.reload();
      });
    }
    byId("reset-game")?.addEventListener("click", async () => {
      if (!confirm("Reset the game? All current game data will be permanently deleted."))
        return;
      await mettPost("/api/game/reset", { confirm: true });
      location.reload();
    });
    bindVisibilityToggle("sim-toggle", "sim-controls", "simVisible", "Show Simulation", "Hide Simulation");
    byId("debug-census")?.addEventListener("click", () => mettPost("/api/debug/census", {}));
    byId("debug-cities")?.addEventListener("click", () => mettPost("/api/debug/cities", {}));
    byId("debug-advances")?.addEventListener("click", () => mettPost("/api/debug/advances", {}));
    byId("undo-round")?.addEventListener("click", async () => {
      if (!confirm('Undo the last round advance? The game goes back to exactly how it was before "Next round" was clicked.'))
        return;
      const res = await mettPost("/api/game/round/undo", {});
      if (res.ok)
        location.reload();
    });
    qsa(".backup-restore").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`Restore the backup "${btn.dataset.label}"? The current game state is backed up first.`))
          return;
        const res = await mettPost("/api/backups/restore", { file: btn.dataset.file });
        if (res.ok)
          location.reload();
      });
    });
    qsa("time[data-local]").forEach((t) => {
      t.textContent = new Date(t.dateTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    });
    qsa(".player-name-input").forEach((inp) => {
      let originalValue = inp.value;
      inp.addEventListener("focus", () => {
        originalValue = inp.value;
      });
      inp.addEventListener("blur", async () => {
        if (inp.value.trim() === originalValue.trim())
          return;
        await mettPost(`/api/players/${inp.dataset.playerId}/name`, { name: inp.value.trim() || originalValue });
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          inp.blur();
      });
    });
    for (const [cls, path] of [
      [".mil-toggle", "military"],
      [".won-toggle", "wonder"],
      [".spc-toggle", "special"]
    ]) {
      qsa(cls).forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          const res = await mettPost(`/api/players/${btn.dataset.playerId}/${path}`, {});
          if (!res.ok)
            btn.disabled = false;
        });
      });
    }
    qsa(".ast-select").forEach((sel) => {
      sel.value = sel.dataset.serverValue ?? "";
      sel.addEventListener("change", async () => {
        await mettPost(`/api/players/${sel.dataset.playerId}/ast`, { level: parseInt(sel.value, 10) });
      });
    });
    qsa(".regress-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (btn.disabled)
          return;
        btn.disabled = true;
        const res = await mettPost(`/api/players/${btn.dataset.playerId}/regress`, {});
        if (!res.ok)
          btn.disabled = false;
      });
    });
    qsa("select.rank-select").forEach((sel) => {
      sel.value = sel.dataset.serverValue ?? "";
      sel.addEventListener("change", async () => {
        const chosen = sel.value;
        if (!chosen)
          return;
        const groupPlayers = (sel.dataset.groupPlayers ?? "").split(",").map(Number);
        const groupPositions = (sel.dataset.groupKey ?? "").split(",").map(Number);
        await mettPost(`/api/players/${sel.dataset.playerId}/rank`, {
          rank_order: parseInt(chosen, 10),
          group_players: groupPlayers,
          group_positions: groupPositions
        });
        window.location.replace(window.location.pathname);
      });
    });
    qsa("input.census-admin-input").forEach((inp) => {
      inp.value = inp.dataset.serverValue ?? "";
      let original = inp.value;
      async function commit() {
        const raw = inp.value.trim();
        if (raw === original.trim())
          return;
        if (raw === "") {
          inp.value = original;
          return;
        }
        let val = parseInt(raw, 10);
        if (isNaN(val)) {
          inp.value = original;
          return;
        }
        if (val < 0)
          val = 55 + val;
        if (val < 1 || val > 55) {
          inp.value = original;
          return;
        }
        inp.value = String(val);
        original = String(val);
        await mettPost(`/api/players/${inp.dataset.playerId}/census`, { population: val });
      }
      inp.addEventListener("focus", () => {
        original = inp.value;
      });
      inp.addEventListener("change", commit);
      inp.addEventListener("blur", commit);
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter")
          inp.blur();
      });
    });
    qsa("select.city-admin-select").forEach((sel) => {
      if (sel.dataset.serverValue)
        sel.value = sel.dataset.serverValue;
      sel.addEventListener("change", async () => {
        const val = parseInt(sel.value, 10);
        if (isNaN(val) || val < 0 || val > 9)
          return;
        await mettPost(`/api/players/${sel.dataset.playerId}/city-count`, { city_count: val });
      });
    });
    qsa("button.lia-star-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        const currentlyGranted = btn.dataset.granted === "1";
        await mettPost(`/api/players/${btn.dataset.playerId}/late-iron-age-bonus`, { grant: !currentlyGranted });
      });
    });
    window.addEventListener("mett:state", (e) => {
      const data = e.detail;
      if (!data?.game || !data?.census || !data?.players)
        return;
      const n = data.players.length;
      const censusCount = data.census.filter((c) => c.population != null).length;
      const citiesCount = data.census.filter((c) => c.city_count != null).length;
      const revealed = data.game.census_revealed === 1;
      const citiesPhase = data.game.cities_phase === 1;
      const allCitiesReady = n > 0 && citiesCount === n;
      const serverPhase = !revealed ? 0 : !citiesPhase ? 1 : 2;
      const sec = document.querySelector(".round-section");
      if (sec && Number(sec.dataset.phase) !== serverPhase) {
        location.reload();
        return;
      }
      const progEl = byId("round-progress-count");
      if (progEl)
        progEl.textContent = `${serverPhase === 0 ? censusCount : citiesCount}/${n}`;
      const prepBtn = byId("prepare-ast");
      const advBtn = byId("advance-round");
      if (prepBtn)
        prepBtn.disabled = !allCitiesReady;
      if (advBtn)
        advBtn.disabled = !allCitiesReady;
      for (const p of data.players) {
        const row = document.querySelector(`tr[data-player-id="${p.id}"]`);
        if (!row)
          continue;
        const status = data.astStatus?.[p.id] ?? "unknown";
        const move = row.querySelector(".ast-move");
        if (move) {
          move.className = `ast-move ast-move-${status}`;
          move.title = status === "advance" ? "Will advance" : status === "regress" ? "Will regress" : status === "stay" ? "Requirements not met" : "Post-calamity city count unknown";
          move.textContent = status === "advance" ? "→" : status === "regress" ? "←" : status === "stay" ? "=" : "·";
        }
        const astSel = row.querySelector(".ast-select");
        if (astSel) {
          astSel.dataset.serverValue = String(p.ast_level);
          if (document.activeElement !== astSel)
            astSel.value = String(p.ast_level);
        }
        const reg = row.querySelector(".regress-btn");
        if (reg) {
          reg.disabled = p.ast_level === 0;
          reg.classList.toggle("regress-active", !!p.regressed);
        }
        const toggles = [
          { sel: ".mil-toggle", val: p.military, onTitle: "Has Military — click to remove", offTitle: "No Military — click to grant" },
          { sel: ".won-toggle", val: p.wonder, onTitle: "Has Wonder — click to remove", offTitle: "No Wonder — click to grant" },
          { sel: ".spc-toggle", val: p.special, onTitle: "Has special ability — click to remove", offTitle: "No special ability — click to grant" }
        ];
        for (const { sel, val, onTitle, offTitle } of toggles) {
          const btn = row.querySelector(sel);
          if (!btn || btn.tagName !== "BUTTON")
            continue;
          const prefix = sel.slice(1, 4);
          const on = !!val;
          btn.classList.toggle(`${prefix}-on`, on);
          btn.classList.toggle(`${prefix}-off`, !on);
          btn.title = on ? onTitle : offTitle;
          btn.setAttribute("aria-pressed", on ? "true" : "false");
          btn.disabled = false;
        }
        const lia = row.querySelector(".lia-star-btn");
        if (lia && lia.tagName === "BUTTON") {
          const granted = !!p.late_iron_age_bonus;
          lia.className = `lia-star-btn ${granted ? "lia-star-on" : "lia-star-off"}`;
          lia.dataset.granted = granted ? "1" : "0";
          lia.title = granted ? "LIA bonus (5VP) — click to remove" : "Grant LIA bonus (5VP)";
          lia.setAttribute("aria-pressed", granted ? "true" : "false");
          lia.setAttribute("aria-label", granted ? `Remove Late Iron Age bonus (5 VP) from ${p.name}` : `Grant Late Iron Age bonus (5 VP) to ${p.name}`);
          lia.disabled = false;
        }
      }
      for (const c of data.census) {
        const row = document.querySelector(`tr[data-player-id="${c.player_id}"]`);
        if (!row)
          continue;
        const censusInput = row.querySelector(".census-admin-input");
        if (censusInput) {
          const pop = c.population;
          if (document.activeElement !== censusInput) {
            censusInput.value = pop != null ? String(pop) : "";
            censusInput.dataset.serverValue = pop != null ? String(pop) : "";
          }
          setStatusIcon(censusInput, pop != null);
        }
        const citySelect = row.querySelector(".city-admin-select");
        if (citySelect) {
          const count = c.city_count;
          if (document.activeElement !== citySelect) {
            if (count != null)
              citySelect.value = String(count);
            citySelect.dataset.serverValue = count != null ? String(count) : "";
          }
          setStatusIcon(citySelect, count != null);
        }
      }
    });
  }
  function setStatusIcon(field, submitted) {
    const icon = field.closest(".ast-ctrl")?.querySelector(".status-icon-fixed");
    if (!icon)
      return;
    icon.textContent = submitted ? "✓" : "?";
    icon.className = `${submitted ? "census-submitted" : "census-pending"} status-icon-fixed`;
  }
})();
