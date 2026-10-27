(() => {
  // src/shared/html.ts
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  // src/shared/advances.ts
  var ADVANCE_GROUPS = ["science", "arts", "crafts", "civics", "religion"];
  var ADVANCES = [
    { id: "mysticism", name: "Mysticism", cost: 50, vp: 1, groups: ["arts", "religion"], credits: { arts: 5, religion: 5 }, special: { monument: 10 } },
    { id: "monument", name: "Monument", cost: 180, vp: 3, groups: ["crafts", "religion"], credits: { crafts: 10, religion: 10 }, special: { "wonder-of-the-world": 20 }, choiceCredits: 20 },
    { id: "wonder-of-the-world", name: "Wonder of the World", cost: 290, vp: 6, groups: ["arts", "crafts"], credits: { arts: 20, crafts: 20 }, special: {} },
    { id: "sculpture", name: "Sculpture", cost: 50, vp: 1, groups: ["arts"], credits: { arts: 10, civics: 5 }, special: { architecture: 10 } },
    { id: "architecture", name: "Architecture", cost: 140, vp: 3, groups: ["arts"], credits: { science: 5, arts: 10 }, special: { mining: 20 } },
    { id: "mining", name: "Mining", cost: 230, vp: 6, groups: ["crafts"], credits: { science: 5, crafts: 20 }, special: {} },
    { id: "cloth-making", name: "Cloth Making", cost: 50, vp: 1, groups: ["crafts"], credits: { arts: 5, crafts: 10 }, special: { "naval-warfare": 10 } },
    { id: "naval-warfare", name: "Naval Warfare", cost: 160, vp: 3, groups: ["civics"], credits: { crafts: 5, civics: 10 }, special: { diaspora: 20 } },
    { id: "diaspora", name: "Diaspora", cost: 270, vp: 6, groups: ["religion"], credits: { arts: 5, religion: 20 }, special: {} },
    { id: "urbanism", name: "Urbanism", cost: 50, vp: 1, groups: ["civics"], credits: { science: 5, civics: 10 }, special: { diplomacy: 10 } },
    { id: "diplomacy", name: "Diplomacy", cost: 160, vp: 3, groups: ["arts"], credits: { arts: 10, civics: 5 }, special: { "provincial-empire": 20 } },
    { id: "provincial-empire", name: "Provincial Empire", cost: 260, vp: 6, groups: ["civics"], credits: { civics: 20, religion: 5 }, special: {} },
    { id: "monarchy", name: "Monarchy", cost: 60, vp: 1, groups: ["civics"], credits: { civics: 10, religion: 5 }, special: { law: 10 } },
    { id: "law", name: "Law", cost: 150, vp: 3, groups: ["civics"], credits: { civics: 10, religion: 5 }, special: { "cultural-ascendancy": 20 } },
    { id: "cultural-ascendancy", name: "Cultural Ascendancy", cost: 280, vp: 6, groups: ["arts"], credits: { arts: 20, religion: 5 }, special: {} },
    { id: "written-record", name: "Written Record", cost: 60, vp: 1, groups: ["civics", "science"], credits: { science: 5, civics: 5 }, special: { cartography: 10 }, choiceCredits: 10 },
    { id: "cartography", name: "Cartography", cost: 160, vp: 3, groups: ["science"], credits: { science: 10, arts: 5 }, special: { library: 20 } },
    { id: "library", name: "Library", cost: 220, vp: 6, groups: ["science"], credits: { science: 20, arts: 5 }, special: {} },
    { id: "pottery", name: "Pottery", cost: 60, vp: 1, groups: ["crafts"], credits: { arts: 5, crafts: 10 }, special: { agriculture: 10 } },
    { id: "agriculture", name: "Agriculture", cost: 120, vp: 3, groups: ["crafts"], credits: { science: 5, crafts: 10 }, special: { democracy: 20 } },
    { id: "democracy", name: "Democracy", cost: 220, vp: 6, groups: ["civics"], credits: { arts: 5, civics: 20 }, special: {} },
    { id: "masonry", name: "Masonry", cost: 60, vp: 1, groups: ["crafts"], credits: { science: 5, crafts: 10 }, special: { engineering: 10 } },
    { id: "engineering", name: "Engineering", cost: 160, vp: 3, groups: ["crafts", "science"], credits: { science: 10, crafts: 10 }, special: { roadbuilding: 20 } },
    { id: "roadbuilding", name: "Roadbuilding", cost: 220, vp: 6, groups: ["crafts"], credits: { science: 5, crafts: 20 }, special: {} },
    { id: "mythology", name: "Mythology", cost: 60, vp: 1, groups: ["religion"], credits: { arts: 5, religion: 10 }, special: { literacy: 10 } },
    { id: "literacy", name: "Literacy", cost: 110, vp: 3, groups: ["arts", "civics"], credits: { science: 5, arts: 10, crafts: 5, civics: 10, religion: 5 }, special: { mathematics: 20 } },
    { id: "mathematics", name: "Mathematics", cost: 250, vp: 6, groups: ["arts", "science"], credits: { science: 20, arts: 20, crafts: 10, civics: 10, religion: 10 }, special: {} },
    { id: "empiricism", name: "Empiricism", cost: 60, vp: 1, groups: ["science"], credits: { science: 10, arts: 5, crafts: 5, civics: 5, religion: 5 }, special: { medicine: 10 } },
    { id: "medicine", name: "Medicine", cost: 140, vp: 3, groups: ["science"], credits: { science: 10, crafts: 5 }, special: { anatomy: 20 } },
    { id: "anatomy", name: "Anatomy", cost: 270, vp: 6, groups: ["science"], credits: { science: 20, crafts: 5 }, special: {} },
    { id: "deism", name: "Deism", cost: 70, vp: 1, groups: ["religion"], credits: { crafts: 5, religion: 10 }, special: { fundamentalism: 10 } },
    { id: "fundamentalism", name: "Fundamentalism", cost: 150, vp: 3, groups: ["religion"], credits: { arts: 5, religion: 10 }, special: { monotheism: 20 } },
    { id: "monotheism", name: "Monotheism", cost: 240, vp: 6, groups: ["religion"], credits: { civics: 5, religion: 20 }, special: {} },
    { id: "theocracy", name: "Theocracy", cost: 80, vp: 1, groups: ["civics", "religion"], credits: { civics: 5, religion: 5 }, special: { "universal-doctrine": 10 } },
    { id: "universal-doctrine", name: "Universal Doctrine", cost: 160, vp: 3, groups: ["religion"], credits: { civics: 5, religion: 10 }, special: { theology: 20 } },
    { id: "theology", name: "Theology", cost: 250, vp: 6, groups: ["religion"], credits: { science: 5, religion: 20 }, special: {} },
    { id: "drama-and-poetry", name: "Drama and Poetry", cost: 80, vp: 1, groups: ["arts"], credits: { arts: 10, religion: 5 }, special: { rhetoric: 10 } },
    { id: "rhetoric", name: "Rhetoric", cost: 130, vp: 3, groups: ["arts"], credits: { arts: 10, civics: 5 }, special: { politics: 20 } },
    { id: "politics", name: "Politics", cost: 230, vp: 6, groups: ["arts"], credits: { arts: 20, religion: 5 }, special: {} },
    { id: "music", name: "Music", cost: 80, vp: 1, groups: ["arts"], credits: { arts: 10, religion: 5 }, special: { enlightenment: 10 } },
    { id: "enlightenment", name: "Enlightenment", cost: 160, vp: 3, groups: ["religion"], credits: { crafts: 5, religion: 10 }, special: { philosophy: 20 } },
    { id: "philosophy", name: "Philosophy", cost: 220, vp: 6, groups: ["religion", "science"], credits: { science: 20, religion: 20 }, special: {} },
    { id: "astronavigation", name: "Astronavigation", cost: 80, vp: 1, groups: ["science"], credits: { science: 10, religion: 5 }, special: { calendar: 10 } },
    { id: "calendar", name: "Calendar", cost: 180, vp: 3, groups: ["science"], credits: { science: 10, civics: 5 }, special: { "public-works": 20 } },
    { id: "public-works", name: "Public Works", cost: 230, vp: 6, groups: ["civics"], credits: { crafts: 5, civics: 20 }, special: {} },
    { id: "coinage", name: "Coinage", cost: 90, vp: 1, groups: ["science"], credits: { science: 10, civics: 5 }, special: { "trade-routes": 10 } },
    { id: "trade-routes", name: "Trade Routes", cost: 180, vp: 3, groups: ["crafts"], credits: { crafts: 10, religion: 5 }, special: { "trade-empire": 20 } },
    { id: "trade-empire", name: "Trade Empire", cost: 260, vp: 6, groups: ["crafts"], credits: { crafts: 20, civics: 5 }, special: {} },
    { id: "metalworking", name: "Metalworking", cost: 90, vp: 1, groups: ["crafts"], credits: { crafts: 10, civics: 5 }, special: { military: 10 } },
    { id: "military", name: "Military", cost: 170, vp: 3, groups: ["civics"], credits: { crafts: 5, civics: 10 }, special: { "advanced-military": 20 } },
    { id: "advanced-military", name: "Advanced Military", cost: 240, vp: 6, groups: ["civics"], credits: { science: 5, civics: 20 }, special: {} }
  ];
  var ADVANCE_BY_ID = new Map(ADVANCES.map((a) => [a.id, a]));
  function creditChoiceOpen(held, round) {
    return !held.choice || held.round === round;
  }
  function advanceLocked(held, round) {
    return held.round < round;
  }
  function advanceTotals(ids, catalogue = ADVANCE_BY_ID) {
    const t = { adv_1vp: 0, adv_3vp: 0, adv_6vp: 0, adv_points: 0 };
    for (const id of new Set(ids)) {
      const card = catalogue.get(id);
      if (!card)
        continue;
      if (card.vp === 1)
        t.adv_1vp++;
      else if (card.vp === 3)
        t.adv_3vp++;
      else
        t.adv_6vp++;
      t.adv_points += card.vp;
    }
    return t;
  }
  function advanceCost(cardId, held, round, catalogue = ADVANCE_BY_ID) {
    const card = catalogue.get(cardId);
    if (!card)
      throw new Error(`Unknown advance: ${cardId}`);
    const groupCredit = {};
    let special = 0;
    for (const h of held) {
      if (h.round >= round || h.id === cardId)
        continue;
      const from = catalogue.get(h.id);
      if (!from)
        continue;
      for (const g of ADVANCE_GROUPS) {
        groupCredit[g] = (groupCredit[g] ?? 0) + (from.credits[g] ?? 0) + (h.choice?.[g] ?? 0);
      }
      special += from.special[cardId] ?? 0;
    }
    const bestGroup = Math.max(0, ...card.groups.map((g) => groupCredit[g] ?? 0));
    return Math.max(0, card.cost - bestGroup - special);
  }

  // src/shared/advance-picker.ts
  var GROUP_LABEL = {
    science: "Science",
    arts: "Arts",
    crafts: "Crafts",
    civics: "Civics",
    religion: "Religion"
  };
  function renderChooser(card, values) {
    const total = card.choiceCredits;
    const sum = ADVANCE_GROUPS.reduce((n, g) => n + (values[g] ?? 0), 0);
    const rows = ADVANCE_GROUPS.map((g) => `<div class="adv-choice-row adv-${g}">` + `<span class="adv-choice-group">${GROUP_LABEL[g]}</span>` + `<button type="button" class="adv-btn" data-choice-step="-5" data-group="${g}" aria-label="5 less ${GROUP_LABEL[g]}">−</button>` + `<output class="adv-choice-val" data-group="${g}">${values[g] ?? 0}</output>` + `<button type="button" class="adv-btn" data-choice-step="5" data-group="${g}" aria-label="5 more ${GROUP_LABEL[g]}">+</button>` + `</div>`).join("");
    return `<div class="adv-choice" data-choice-for="${card.id}" data-total="${total}">` + `<p class="adv-choice-intro"><strong>${escapeHtml(card.name)}</strong>: choose the colours of ${total} extra credits. You keep them all game.</p>` + rows + `<button type="button" class="btn-submit adv-choice-save"${sum === total ? "" : " disabled"}>Save <span class="adv-choice-sum">${sum}</span> of ${total}</button>` + `</div>`;
  }
  var groupCards = (g) => ADVANCES.filter((c) => c.groups[0] === g).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  function cardPrice(c, held, round) {
    const h = held.find((x) => x.id === c.id);
    return h && advanceLocked(h, round) ? c.cost : advanceCost(c.id, held, round);
  }
  var priceHtml = (c, price) => price < c.cost ? `<s>${c.cost}</s> <strong class="adv-price">${price}</strong>` : `${c.cost}`;
  function sections(sort, held, round) {
    if (sort === "group")
      return ADVANCE_GROUPS.map((g) => ({ group: g, cards: groupCards(g) }));
    const price = new Map(ADVANCES.map((c) => [c.id, cardPrice(c, held, round)]));
    const byName = (a, b) => a.name.localeCompare(b.name);
    const byPrice = (a, b) => price.get(a.id) - price.get(b.id);
    const cmp = sort === "name" ? byName : sort === "cost" ? (a, b) => byPrice(a, b) || byName(a, b) : (a, b) => b.vp - a.vp || byPrice(a, b) || byName(a, b);
    return [{ cards: [...ADVANCES].sort(cmp) }];
  }
  var section = (group, inner) => group ? `<section class="adv-group adv-${group}"><h4>${GROUP_LABEL[group]}</h4>${inner}</section>` : `<section class="adv-group">${inner}</section>`;
  function renderAdvancePicker(held, round, { canBuy = true, drafts = new Map, gm = false, sort = "group" } = {}) {
    const heldById = new Map(held.map((h) => [h.id, h]));
    const t = advanceTotals(heldById.keys());
    const summary = `<p class="adv-pick-summary"><strong>${heldById.size}</strong> cards · <strong>${t.adv_points}</strong> VP` + ` <span class="adv-pick-tiers">(${t.adv_1vp} × 1 · ${t.adv_3vp} × 3 · ${t.adv_6vp} × 6)</span></p>` + `<p class="adv-pick-hint">${gm ? "<strong>GM correction:</strong> tick or untick any card, also locked ones and in any phase. A card added now counts as bought this round." : canBuy ? "Tick the cards you buy this round. Prices include credits from cards bought in earlier rounds. Cards lock when the round ends." : "Cards are bought after calamities are resolved."}</p>`;
    const groups = sections(sort, held, round).map(({ group, cards }) => {
      const buttons = cards.map((c) => {
        const h = heldById.get(c.id);
        const bought = h ? advanceLocked(h, round) : false;
        const locked = bought && !gm;
        const closed = !locked && !canBuy && !gm;
        const cost = priceHtml(c, cardPrice(c, held, round));
        const open = h && c.choiceCredits && (gm || creditChoiceOpen(h, round));
        const chooser = open && (!h.choice || drafts.has(c.id)) ? renderChooser(c, drafts.get(c.id) ?? h.choice ?? {}) : "";
        const change = open && h.choice && !drafts.has(c.id) ? `<button type="button" class="adv-choice-change" data-choice-change="${c.id}">Change colours</button>` : "";
        const cls = `adv-pick adv-${c.groups[0]}${h ? " adv-held" : ""}${locked ? " adv-locked" : ""}${closed ? " adv-closed" : ""}`;
        return `<button type="button" class="${cls}" data-advance="${c.id}" aria-pressed="${!!h}"${locked || closed ? ' aria-disabled="true"' : ""}>` + `<span class="adv-pick-name">${escapeHtml(c.name)}${dot(c)}</span>` + `<span class="adv-pick-meta">${cost} · ${c.vp} VP${h && h.round === round ? " · <em>new</em>" : ""}</span>` + `</button>` + change + chooser;
      }).join("");
      return section(group, `<div class="adv-pick-grid">${buttons}</div>`);
    }).join("");
    return summary + groups + basket(held, round);
  }
  function basket(held, round) {
    const fresh = held.filter((h) => h.round === round && ADVANCE_BY_ID.has(h.id));
    if (!fresh.length)
      return "";
    const cost = fresh.reduce((sum, h) => sum + advanceCost(h.id, held, round), 0);
    const vp = fresh.reduce((sum, h) => sum + ADVANCE_BY_ID.get(h.id).vp, 0);
    return `<p class="adv-basket" role="status">Buying this round: <strong>${fresh.length}</strong> ${fresh.length === 1 ? "card" : "cards"}` + ` · <strong class="adv-basket-cost">${cost}</strong> · +${vp} VP</p>`;
  }
  var dot = (c) => c.groups[1] ? `<span class="adv-dot adv-${c.groups[1]}" title="${GROUP_LABEL[c.groups[1]]}"></span>` : "";
  var CREDITS_FROM = (() => {
    const m = new Map;
    for (const from of ADVANCES) {
      for (const [id, n] of Object.entries(from.special))
        m.set(id, [...m.get(id) ?? [], { from, n }]);
    }
    return m;
  })();

  // src/client/picker.ts
  function bindPicker(picker, b) {
    picker.addEventListener("click", async (e) => {
      const target = e.target;
      const chooser = target.closest(".adv-choice");
      if (chooser) {
        await onChooserClick(chooser, target, b);
        return;
      }
      const change = target.closest("[data-choice-change]");
      if (change) {
        const id = change.dataset.choiceChange;
        b.drafts.set(id, { ...b.held().find((h) => h.id === id)?.choice ?? {} });
        b.rerender();
        return;
      }
      const btn = target.closest(".adv-pick");
      if (!btn || btn.getAttribute("aria-disabled") === "true")
        return;
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("adv-held", on);
      const ids = Array.from(picker.querySelectorAll('.adv-pick[aria-pressed="true"]')).map((el) => el.dataset.advance);
      const res = await mettPost(`/api/players/${b.playerId()}/advances`, { ids });
      if (!res.ok) {
        btn.setAttribute("aria-pressed", String(!on));
        btn.classList.toggle("adv-held", !on);
      }
    });
  }
  async function onChooserClick(chooser, target, b) {
    const cardId = chooser.dataset.choiceFor;
    const total = Number(chooser.dataset.total);
    const read = () => Object.fromEntries(Array.from(chooser.querySelectorAll(".adv-choice-val")).map((o) => [o.dataset.group, Number(o.textContent)]).filter(([, n]) => n));
    const step = target.closest("[data-choice-step]");
    if (step) {
      const out = chooser.querySelector(`.adv-choice-val[data-group="${step.dataset.group}"]`);
      const sum = Object.values(read()).reduce((a, n) => a + (n ?? 0), 0);
      const delta = Number(step.dataset.choiceStep);
      const next = Number(out.textContent) + delta;
      if (next < 0 || sum + delta > total)
        return;
      out.textContent = String(next);
      b.drafts.set(cardId, read());
      const newSum = sum + delta;
      chooser.querySelector(".adv-choice-sum").textContent = String(newSum);
      chooser.querySelector(".adv-choice-save").disabled = newSum !== total;
      return;
    }
    const save = target.closest(".adv-choice-save");
    if (!save)
      return;
    save.disabled = true;
    const res = await mettPost(`/api/players/${b.playerId()}/advances/${cardId}/choice`, { choice: read() });
    if (res.ok)
      b.drafts.delete(cardId);
    else
      save.disabled = false;
  }

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
    const gmDialog = document.getElementById("gm-cards");
    const gmPicker = document.getElementById("gm-picker");
    let gmPlayer = 0;
    let gmState = null;
    const gmDrafts = new Map;
    const renderGmCards = () => {
      if (!gmPicker || !gmState || !gmDialog?.open)
        return;
      gmPicker.innerHTML = renderAdvancePicker(gmState.advances[gmPlayer] ?? [], gmState.game.current_round, { canBuy: true, gm: true, drafts: gmDrafts });
    };
    if (gmDialog && gmPicker) {
      bindPicker(gmPicker, {
        playerId: () => gmPlayer,
        held: () => gmState?.advances[gmPlayer] ?? [],
        rerender: renderGmCards,
        drafts: gmDrafts
      });
      qsa(".adv-pts-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          gmPlayer = Number(btn.dataset.playerId);
          gmDrafts.clear();
          document.getElementById("gm-cards-title").textContent = `Correct cards: ${btn.dataset.civName}`;
          gmState = await (await fetch("/api/state")).json();
          gmDialog.showModal();
          renderGmCards();
        });
      });
      gmDialog.querySelector(".gm-cards-close").addEventListener("click", () => gmDialog.close());
    }
    window.addEventListener("mett:state", (e) => {
      const data = e.detail;
      if (!data?.game || !data?.census || !data?.players)
        return;
      gmState = data;
      renderGmCards();
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
        const pts = row.querySelector(".adv-pts-btn");
        if (pts)
          pts.textContent = String(p.adv_points);
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
