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
  function creditChoiceOpen(held, round, confirmed = 0) {
    return !held.choice || held.round === round && confirmed < round;
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
  function colourCredits(held, round = Infinity, catalogue = ADVANCE_BY_ID) {
    const total = { science: 0, arts: 0, crafts: 0, civics: 0, religion: 0 };
    for (const h of held) {
      const card = catalogue.get(h.id);
      if (!card || h.round >= round)
        continue;
      for (const g of ADVANCE_GROUPS)
        total[g] += (card.credits[g] ?? 0) + (h.choice?.[g] ?? 0);
    }
    return total;
  }
  function advanceCost(cardId, held, round, catalogue = ADVANCE_BY_ID) {
    const card = catalogue.get(cardId);
    if (!card)
      throw new Error(`Unknown advance: ${cardId}`);
    const others = held.filter((h) => h.id !== cardId);
    const groupCredit = colourCredits(others, round, catalogue);
    let special = 0;
    for (const h of others) {
      if (h.round < round)
        special += catalogue.get(h.id)?.special[cardId] ?? 0;
    }
    const bestGroup = Math.max(0, ...card.groups.map((g) => groupCredit[g]));
    return Math.max(0, card.cost - bestGroup - special);
  }
  var LIBRARY_ID = "library";
  var ANATOMY_ID = "anatomy";
  var LIBRARY_DISCOUNT = 40;
  var ANATOMY_FREE_BELOW = 100;
  function purchaseCost(held, round, catalogue = ADVANCE_BY_ID) {
    const fresh = held.filter((h) => h.round === round && catalogue.has(h.id)).map((h) => h.id);
    const prices = new Map(fresh.map((id) => [id, advanceCost(id, held, round, catalogue)]));
    const anatomyPicks = fresh.includes(ANATOMY_ID) ? fresh.filter((id) => id !== ANATOMY_ID && catalogue.get(id).groups.includes("science") && catalogue.get(id).cost < ANATOMY_FREE_BELOW) : [];
    let best = { saving: 0, free: undefined, library: undefined };
    for (const free of [undefined, ...anatomyPicks]) {
      let saving = free ? prices.get(free) : 0;
      let library;
      if (fresh.includes(LIBRARY_ID)) {
        for (const id of fresh) {
          if (id === LIBRARY_ID || id === free)
            continue;
          if (!library || prices.get(id) > prices.get(library))
            library = id;
        }
        if (library)
          saving += Math.min(LIBRARY_DISCOUNT, prices.get(library));
      }
      if (saving > best.saving)
        best = { saving, free, library };
    }
    if (best.free)
      prices.set(best.free, 0);
    if (best.library)
      prices.set(best.library, Math.max(0, prices.get(best.library) - LIBRARY_DISCOUNT));
    return { total: [...prices.values()].reduce((a, b) => a + b, 0), prices };
  }
  function priceList(held, round) {
    const now = purchaseCost(held, round);
    const out = new Map;
    for (const c of ADVANCES) {
      const h = held.find((x) => x.id === c.id);
      if (h)
        out.set(c.id, h.round < round ? c.cost : now.prices.get(c.id) ?? c.cost);
      else
        out.set(c.id, purchaseCost([...held, { id: c.id, round }], round).total - now.total);
    }
    return out;
  }

  // src/shared/calamities.ts
  var plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  var TRADED_BENEFICIARY = "the player who traded the calamity to you. If you drew it yourself, or no one can tell who traded it: the player with the most cities in stock (tie: most tokens in stock, then A.S.T. ranking).";
  var STOCK_BENEFICIARY = "the player with the most cities in stock (tie: most tokens in stock, then A.S.T. ranking). Never the primary victim.";
  var CALAMITY_ROLES = {
    Tempest: { primary: { say: () => "Take 2 damage in total from coastal areas of your choice and lose 5 treasury tokens." } },
    "Squandered Wealth": { primary: { say: () => "Lose 10 treasury tokens." } },
    "City Riots": { primary: { say: () => "Reduce 1 of your cities and lose 5 treasury tokens." } },
    "City in Flames": { primary: { say: () => "Destroy 1 of your cities, or pay 10 treasury tokens to prevent it." } },
    "Tribal Conflict": { primary: { say: () => "Take 5 damage." } },
    "Minor Uprising": { primary: { say: () => "Destroy 1 of your cities." } },
    Banditry: { primary: { say: () => "Discard 2 commodity cards of your choice; pay 4 treasury tokens per card to keep it." } },
    "Coastal Migration": { primary: { say: () => "Destroy 1 of your coastal cities and lose 5 treasury tokens." } },
    "Volcanic Eruption": {
      primary: { say: () => "With a city on a volcano: all units in the area(s) the volcano touches are destroyed. Otherwise an Earthquake: destroy 1 of your cities and reduce 1 city next to it by land or water." },
      others: "Their units in the volcano’s area(s) are destroyed too. An Earthquake may reduce one of their cities next to the destroyed one."
    },
    Treachery: {
      primary: { n: 1, say: (n) => `The beneficiary annexes ${n} of your cities.` },
      beneficiary: `${TRADED_BENEFICIARY} They pick the cities and annex them.`
    },
    Famine: {
      primary: { n: 10, say: (n) => n > 0 ? `Take ${n} damage.` : "No damage. Famine still hits the secondary victims." },
      secondary: { n: 5, who: "3 players the primary victim picks", say: (n) => n > 0 ? `Take ${n} damage.` : "No damage." }
    },
    "Slave Revolt": {
      primary: { n: 2, say: (n) => n > 0 ? `An extra city support check with your support rate raised by ${n}. Reduce cities until they are supported.` : "An extra city support check at your normal support rate. Reduce cities until they are supported." }
    },
    Flood: {
      primary: { n: 15, say: (n) => {
        const coastal = Math.max(0, n - 10);
        return `With units on a flood plain: ${n > 0 ? `take ${n} damage there` : "no damage"}. With none: ${coastal > 0 ? `take ${coastal} damage in total from coastal areas` : "no damage"}.`;
      } },
      secondary: { n: 5, who: "every other player with units on the same flood plain", say: (n) => n > 0 ? `Take ${n} damage from that flood plain.` : "No damage." }
    },
    Superstition: {
      primary: { n: 3, say: (n) => n > 0 ? `Reduce ${n} of your cities.` : "No city is reduced." }
    },
    "Civil War": {
      primary: { n: 35, say: (n) => `The beneficiary annexes all your units beyond ${n} unit points; you pick them, in neighbouring areas. With ${n} unit points or less: no Civil War.` },
      beneficiary: `${STOCK_BENEFICIARY} They annex the units.`,
      higherIsBetter: true
    },
    "Barbarian Hordes": {
      primary: { n: 15, say: (n) => `${n} barbarian tokens attack one of your cities and keep attacking your units while they exceed a population limit.` },
      beneficiary: `${TRADED_BENEFICIARY} They pick the city (a wilderness city if possible) and move the barbarians.`
    },
    Cyclone: {
      primary: { n: 3, say: (n) => n > 0 ? `Reduce ${n} of your cities next to the open sea area with the most of your cities beside it.` : "No city is reduced." },
      secondary: { n: 2, who: "every other player with cities next to that sea area", say: (n) => n > 0 ? `Reduce ${n} of your cities next to it.` : "No city is reduced." }
    },
    Epidemic: {
      primary: { n: 15, say: (n) => n > 0 ? `Take ${n} damage.` : "No damage." },
      secondary: { n: 10, who: "2 other players the primary victim picks, not the beneficiary", say: (n) => n > 0 ? `Take ${n} damage.` : "No damage." },
      beneficiary: `${TRADED_BENEFICIARY} They can’t be picked as a secondary victim.`
    },
    Tyranny: {
      primary: { n: 15, say: (n) => `The beneficiary annexes ${n} of your unit points, in neighbouring areas.` },
      beneficiary: `${STOCK_BENEFICIARY} They pick the units and annex them.`
    },
    "Civil Disorder": {
      primary: { n: 3, say: (n) => `Reduce all but ${n} of your cities.` },
      higherIsBetter: true
    },
    Corruption: {
      primary: { n: 10, say: (n) => n > 0 ? `Discard commodity cards with a face value of at least ${n}.` : "Nothing to discard." }
    },
    "Iconoclasm and Heresy": {
      primary: { n: 4, say: (n) => n > 0 ? `Reduce ${n} of your cities.` : "No city is reduced. It still hits the secondary victims." },
      secondary: { n: 1, who: "2 other players the primary victim picks, not the beneficiary", say: (n) => n > 0 ? `Reduce ${n} of your cities.` : "No city is reduced." },
      beneficiary: `${TRADED_BENEFICIARY} They can’t be picked as a secondary victim.`
    },
    Regression: {
      primary: { n: 1, say: (n) => n > 0 ? `Your A.S.T. marker moves ${plural(n, "step")} back.` : "Your A.S.T. marker stays." }
    },
    Piracy: {
      primary: { n: 2, say: (n) => n > 0 ? `The beneficiary turns ${n} of your coastal cities into pirate cities.` : "None of your cities becomes a pirate city." },
      secondary: { who: "2 other players the primary victim picks, not the beneficiary", say: () => "1 of your coastal cities becomes a pirate city." },
      beneficiary: `${TRADED_BENEFICIARY} They pick your cities and can’t be picked as a secondary victim.`
    }
  };

  // src/civs.ts
  var LATE_BRONZE_BASIC = new Set([1, 2]);
  var LATE_BRONZE_EXPERT = new Set([1, 2, 10, 13]);
  var LATE_START = new Set([5, 7, 13, 18]);

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
  var DEFAULT_DIR = { group: "asc", name: "asc", cost: "asc", vp: "asc", value: "desc" };
  var isReversible = (s) => s !== "group" && s !== "value";
  var groupCards = (g) => ADVANCES.filter((c) => c.groups[0] === g).sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
  var priceHtml = (c, price) => price < c.cost ? `<s>${c.cost}</s> <strong class="adv-price">${price}</strong>` : `${c.cost}`;
  function sections(sort, dir, price) {
    if (sort === "group")
      return ADVANCE_GROUPS.map((g) => ({ group: g, cards: groupCards(g) }));
    const byName = (a, b) => a.name.localeCompare(b.name);
    const byPrice = (a, b) => price.get(a.id) - price.get(b.id);
    const byValue = (a, b) => a.vp * price.get(b.id) - b.vp * price.get(a.id);
    const primary = sort === "name" ? byName : sort === "cost" ? byPrice : sort === "vp" ? (a, b) => a.vp - b.vp : byValue;
    const sign = (isReversible(sort) ? dir : DEFAULT_DIR[sort]) === "desc" ? -1 : 1;
    return [{ cards: [...ADVANCES].sort((a, b) => sign * primary(a, b) || byPrice(a, b) || byName(a, b)) }];
  }
  var section = (group, inner) => group ? `<section class="adv-group adv-${group}"><h4>${GROUP_LABEL[group]}</h4>${inner}</section>` : `<section class="adv-group">${inner}</section>`;
  function pickSummary(held, hint) {
    const t = advanceTotals(held.map((h) => h.id));
    return `<p class="adv-pick-summary"><strong>${held.length}</strong> cards · <strong>${t.adv_points}</strong> VP` + ` <span class="adv-pick-tiers">(${t.adv_1vp} × 1 · ${t.adv_3vp} × 3 · ${t.adv_6vp} × 6)</span></p>` + `<p class="adv-pick-hint">${hint}</p>`;
  }
  function chooserFor(c, h, round, drafts, gm, confirmed = 0) {
    if (!h || !c.choiceCredits || !(gm || creditChoiceOpen(h, round, confirmed)))
      return "";
    if (!h.choice || drafts.has(c.id))
      return renderChooser(c, drafts.get(c.id) ?? h.choice ?? {});
    return `<button type="button" class="adv-choice-change" data-choice-change="${c.id}">Change colours</button>`;
  }
  function renderAdvancePicker(held, round, { drafts = new Map, confirmed = 0 } = {}) {
    const heldById = new Map(held.map((h) => [h.id, h]));
    const prices = priceList(held, round);
    const groups = sections("group", "asc", prices).map(({ group, cards }) => {
      const buttons = cards.map((c) => {
        const h = heldById.get(c.id);
        const cls = `adv-pick adv-${c.groups[0]}${dual(c)}${h ? " adv-held" : ""}`;
        return `<button type="button" class="${cls}" data-advance="${c.id}" aria-pressed="${!!h}">` + `<span class="adv-pick-name">${escapeHtml(c.name)}</span>` + `<span class="adv-pick-meta">${priceHtml(c, prices.get(c.id))} · ${c.vp} VP${h && h.round === round ? " · <em>new</em>" : ""}</span>` + `</button>` + chooserFor(c, h, round, drafts, true);
      }).join("");
      return section(group, `<div class="adv-pick-grid">${buttons}</div>`);
    }).join("");
    return pickSummary(held, "<strong>GM correction:</strong> tick or untick any card, also locked ones and in any phase. A card added now counts as bought this round in the buying phase, otherwise in the round before.") + groups + basket(held, round, confirmed >= round ? { done: "Confirmed by the player", buttons: `<button type="button" class="adv-basket-reopen">Reopen</button>` } : { buttons: CLEAR });
  }
  var CLEAR = `<button type="button" class="adv-basket-clear">Clear</button>`;
  function basket(held, round, { buttons = "", done }) {
    const fresh = held.filter((h) => h.round === round && ADVANCE_BY_ID.has(h.id));
    if (!fresh.length)
      return "";
    const cost = purchaseCost(held, round).total;
    const vp = fresh.reduce((sum, h) => sum + ADVANCE_BY_ID.get(h.id).vp, 0);
    const names = fresh.map((h) => ADVANCE_BY_ID.get(h.id)).map((c) => `<span class="adv-basket-card adv-${c.groups[0]}">${escapeHtml(c.name)}</span>`).join(" · ");
    return `<div class="adv-basket" role="status"><div class="adv-basket-text">` + `<p>${done ? "Bought" : "Buying"} this round: <strong>${fresh.length}</strong> ${fresh.length === 1 ? "card" : "cards"}` + ` · <strong class="adv-basket-cost">${cost}</strong> · <span class="adv-basket-vp">+${vp} VP</span></p>` + `<p class="adv-basket-names">${names}</p></div>` + (done ? `<p class="adv-basket-done">${done}</p>` : "") + (buttons ? `<div class="adv-basket-buttons">${buttons}</div>` : "") + `</div>`;
  }
  var dual = (c) => c.groups[1] ? ` adv-dual adv-2-${c.groups[1]}` : "";
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
      if (target.closest(".adv-basket-confirm")) {
        if (!confirm("Confirm this round’s cards? After this only the GM can change them."))
          return;
        await mettPost(`/api/players/${b.playerId()}/advances/confirm`, { confirm: true });
        return;
      }
      if (target.closest(".adv-basket-reopen")) {
        await mettPost(`/api/players/${b.playerId()}/advances/confirm`, { confirm: false });
        return;
      }
      if (target.closest(".adv-basket-clear")) {
        await mettPost(`/api/players/${b.playerId()}/advances`, { ids: b.held().filter((h) => h.round !== b.round()).map((h) => h.id) });
        return;
      }
      const btn = target.closest(".adv-pick, .adv-buy");
      if (!btn)
        return;
      e.preventDefault();
      const on = btn.getAttribute("aria-pressed") !== "true";
      flip(btn, on);
      const toggles = Array.from(picker.querySelectorAll("[data-advance][aria-pressed]"));
      const shown = new Set(toggles.map((el) => el.dataset.advance));
      const ids = [
        ...toggles.filter((el) => el.getAttribute("aria-pressed") === "true").map((el) => el.dataset.advance),
        ...b.held().map((h) => h.id).filter((id) => !shown.has(id))
      ];
      const res = await mettPost(`/api/players/${b.playerId()}/advances`, { ids });
      if (!res.ok)
        flip(btn, !on);
    });
  }
  function flip(btn, on) {
    btn.setAttribute("aria-pressed", String(on));
    btn.closest(".adv-pick, .adv-ref-item")?.classList.toggle("adv-held", on);
    if (btn.classList.contains("adv-buy"))
      btn.textContent = on ? "✓ Buying" : "Buy";
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
      gmPicker.innerHTML = renderAdvancePicker(gmState.advances[gmPlayer] ?? [], gmState.game.current_round, { drafts: gmDrafts, confirmed: gmState.players.find((p) => p.id === gmPlayer)?.cards_confirmed ?? 0 });
    };
    if (gmDialog && gmPicker) {
      bindPicker(gmPicker, {
        playerId: () => gmPlayer,
        held: () => gmState?.advances[gmPlayer] ?? [],
        round: () => gmState?.game.current_round ?? 0,
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
