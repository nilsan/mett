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
  var SPECIAL_ABILITY_IDS = [
    "diaspora",
    "fundamentalism",
    "monotheism",
    "politics",
    "provincial-empire",
    "trade-routes",
    "universal-doctrine"
  ];
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

  // src/shared/advance-text.ts
  var ADVANCE_TEXT = {
    monument: [
      "Acquire 20 additional points of credit tokens in any combination of colors."
    ],
    "wonder-of-the-world": [
      "During the Trade cards acquisition phase, you may acquire 1 additional trade card for free from a stack number that is higher than your number of cities in play.",
      "Wonder of the World counts as a city during the A.S.T.-alteration phase."
    ],
    architecture: [
      "Once per turn, when constructing a city you may choose to pay up to half of the required number of tokens from treasury."
    ],
    mining: [
      "During the Trade cards acquisition phase, you may acquire additional trade cards from stack 6 and/or stack 8 for 13 treasury tokens per card.",
      "Treasury tokens are worth 2 points when purchasing Civilization Advances."
    ],
    "cloth-making": [
      "Your ships are allowed to move 5 steps."
    ],
    "naval-warfare": [
      "Your ships are allowed to carry 6 tokens.",
      "In conflicts, you may choose to remove ships from the conflict area instead of tokens. After each round of token removal a new check for token majority must be made."
    ],
    diaspora: [
      "You may choose to take up to 5 of your tokens from the board and place them anywhere on the board, providing that no population limits are exceeded."
    ],
    urbanism: [
      "Once per turn, when constructing a wilderness city you may choose to use up to 4 tokens from areas adjacent by land."
    ],
    diplomacy: [
      "Players are not allowed to move tokens into areas containing your cities, except for areas where a conflict situation already occurs. This does not count for players holding Diplomacy or Military."
    ],
    "provincial-empire": [
      "You may choose to select up to 5 players that have units adjacent by land or water to your units. These players must choose and give you a commodity card with a face value of at least 2. Players holding Provincial Empire or Public Works may not be selected."
    ],
    monarchy: [
      "You may choose to increase your tax rate by 1."
    ],
    "cultural-ascendancy": [
      "Players are not allowed to cause conflict in areas containing your units, except for areas where a conflict situation already occurs. This does not count for players holding Cultural Ascendancy or Advanced Military.",
      "Your units are protected against the effect of Politics.",
      "Your default city support rate is increased by 1."
    ],
    "written-record": [
      "Acquire 10 additional points of credit tokens in any combination of colors."
    ],
    cartography: [
      "During the Trade cards acquisition phase, you may acquire additional trade cards from stack 2 for 5 treasury tokens and/or from stack 7 for 13 treasury tokens per card."
    ],
    library: [
      "You may discount the cost of 1 other Civilization Advance that you purchase in the same turn as Library by 40 points."
    ],
    agriculture: [
      "The population limit of ‘0’, ‘1’, and ‘2’ areas on the board is increased by 1 for you as long as these areas do not contain any other player’s units or barbarian tokens."
    ],
    democracy: [
      "During the Tax collection phase you collect tax as usual but your cities do not revolt as a result of a shortage in tax collection."
    ],
    engineering: [
      "Other players or barbarians require 8 tokens to successfully attack your cities. Your cities are then replaced with 7 tokens. This does not apply when the attacking player also holds Engineering.",
      "You require 6 tokens to successfully attack other player’s cities or pirate cities. Their cities are then replaced with 5 tokens. This does not apply when the defending player also holds Engineering."
    ],
    roadbuilding: [
      "When moving over land, your tokens may move 2 areas. Tokens that are in a conflict situation after one step are not allowed to move any further.",
      "Your hand limit of trade cards is increased by 1."
    ],
    anatomy: [
      "Upon purchase, you may choose to acquire 1 science card with an undiscounted cost price of less than 100 for free."
    ],
    fundamentalism: [
      "You may choose to destroy all units in an area adjacent by land to your units. Barbarian tokens, pirate cities and units belonging to players holding Fundamentalism or Philosophy are unaffected."
    ],
    monotheism: [
      "You may choose to annex all units in an area adjacent by land to your units. Barbarian tokens, pirate cities, and units belonging to players holding Monotheism or Theology are unaffected."
    ],
    "universal-doctrine": [
      "You may choose to annex 1 pirate city or up to 5 barbarian tokens anywhere on the board."
    ],
    theology: [
      "Your units are protected against the effect of Monotheism."
    ],
    rhetoric: [
      "During the Trade cards acquisition phase, you may acquire additional trade cards from stack 3 for 9 treasury tokens per card."
    ],
    politics: [
      "You may choose one of two options:",
      "1) Gain up to 5 treasury tokens from stock.",
      "2) Annex all units in an area adjacent by land to your units. Pay treasury tokens equal to the number of unit points annexed, or the effect is canceled. Barbarian tokens, pirate cities, and units belonging to players holding Politics or Cultural Ascendancy are unaffected."
    ],
    philosophy: [
      "Your units are protected against the effect of Fundamentalism."
    ],
    astronavigation: [
      "Your ships are allowed to move through open sea areas."
    ],
    "public-works": [
      "Areas containing your cities may also contain 1 of your tokens.",
      "You are protected against the effect of Provincial Empire."
    ],
    coinage: [
      "You may choose to increase or decrease your tax rate by 1."
    ],
    "trade-routes": [
      "You may choose to discard any number of commodity cards to gain treasury tokens at twice the face value of the commodity cards discarded this way."
    ],
    "trade-empire": [
      "Once per turn, you may choose to use 1 substitute commodity card of at least the same face value when turning in an incomplete set of commodity cards."
    ],
    metalworking: [
      "In conflicts, for each round of token removal all other players not holding Metalworking must remove their token first."
    ],
    military: [
      "Your movement phase is after all other players not holding Military have moved.",
      "You are allowed to move tokens into areas containing cities belonging to players holding Diplomacy."
    ],
    "advanced-military": [
      "In conflicts, you may choose to remove tokens from areas adjacent by land. After each round of token removal a new check for token majority must be made. You may decide to wait for other token conflicts to be resolved first.",
      "You are allowed to cause conflict in areas containing units belonging to players holding Cultural Ascendancy."
    ]
  };

  // src/shared/calamities.ts
  var CALAMITIES = [
    { name: "Tempest", stack: 2, kind: "minor", text: ["Take 2 damage in total from coastal areas of your choice and lose 5 treasury tokens."] },
    { name: "Squandered Wealth", stack: 3, kind: "minor", text: ["Lose 10 treasury tokens."] },
    { name: "City Riots", stack: 4, kind: "minor", text: ["Reduce 1 of your cities and lose 5 treasury tokens."] },
    { name: "City in Flames", stack: 5, kind: "minor", text: ["Destroy 1 of your cities. You may choose to pay 10 treasury tokens to prevent this."] },
    { name: "Tribal Conflict", stack: 6, kind: "minor", text: ["Take 5 damage."] },
    { name: "Minor Uprising", stack: 7, kind: "minor", text: ["Destroy 1 of your cities."] },
    { name: "Banditry", stack: 8, kind: "minor", text: ["Discard 2 commodity cards of your choice. For each card you must discard, you may choose to pay 4 treasury tokens to prevent it."] },
    { name: "Coastal Migration", stack: 9, kind: "minor", text: ["Destroy 1 of your coastal cities and lose 5 treasury tokens."] },
    { name: "Volcanic Eruption", stack: 2, kind: "non-tradeable", alias: "Earthquake", text: [
      "Only if you have a city on a volcano this calamity is a Volcanic Eruption, otherwise this is an Earthquake.",
      "Volcanic Eruption: Destroy all units (irrespective of ownership) in the area(s) touched by the volcano. If you have cities in more than one area with a volcano, select the one volcano that would affect the most of your unit points.",
      "Earthquake: Select and destroy 1 of your cities and select and reduce 1 city adjacent by land or water (irrespective of ownership)."
    ] },
    { name: "Treachery", stack: 2, kind: "tradeable", text: ["The beneficiary selects and annexes 1 of your cities."] },
    { name: "Famine", stack: 3, kind: "non-tradeable", text: ["Take 10 damage and select 3 other players who must take 5 damage as well."] },
    { name: "Slave Revolt", stack: 3, kind: "tradeable", text: ["Immediately perform an additional check for city support, during which your city support rate is increased by 2. Reduce cities until you have sufficient support."] },
    { name: "Flood", stack: 4, kind: "non-tradeable", text: ["Only if you have any units on a flood plain, take 15 damage from the flood plain. If you have units on more than one flood plain, select the one flood plain where the most of your units would be affected. All other players with units on the same flood plain take 5 damage from that flood plain as well. Cities built on black city sites are not considered to be on the flood plain. If you have no units on a flood plain, take 5 damage in total from coastal areas of your choice instead."] },
    { name: "Superstition", stack: 4, kind: "tradeable", text: ["Reduce 3 of your cities."] },
    { name: "Civil War", stack: 5, kind: "non-tradeable", text: ["The beneficiary annexes all your units in excess of 35 unit points. You select the units. Count all units points that you have on the board and select units in excess of 35. All units selected this way must be in areas adjacent to each other if possible, and in each of these areas all of your units must be selected. If you have 35 unit points or less there is no Civil War."] },
    { name: "Barbarian Hordes", stack: 5, kind: "tradeable", text: ["One of your cities is attacked by 15 barbarian tokens, which will continue attacking your units until there are no areas with barbarian tokens in which the population limit is exceeded. Place 15 barbarian tokens in one of your cities selected by the beneficiary (if possible a wilderness city) and resolve a city attack. After this conflict, the beneficiary moves all remaining barbarian tokens in excess of the population limit to an area adjacent by land or water that contains any of your units and conflict is resolved again. The beneficiary may only move barbarian tokens into an area that contains a city if the attack would be successful. This process is repeated until no population limit is exceeded by the barbarian tokens or no new area can be chosen legally. Any barbarian tokens in excess of a population limit are then destroyed."] },
    { name: "Cyclone", stack: 6, kind: "non-tradeable", text: ["Select and reduce 3 of your cities adjacent to the one open sea area that has the largest number of your cities directly adjacent to it. All other players with cities directly adjacent to the same open sea area must select and reduce 2 of such cities as well."] },
    { name: "Epidemic", stack: 6, kind: "tradeable", text: ["Take 15 damage and select 2 other players who must take 10 damage as well. The beneficiary may not be selected as a secondary victim."] },
    { name: "Tyranny", stack: 7, kind: "non-tradeable", text: ["The beneficiary selects and annexes 15 of your unit points. All units selected this way must be in areas adjacent to each other if possible, and in each of these areas all of your units must be selected."] },
    { name: "Civil Disorder", stack: 7, kind: "tradeable", text: ["Reduce all but 3 of your cities."] },
    { name: "Corruption", stack: 8, kind: "non-tradeable", text: ["Discard commodity cards with a total face value (not set value) of at least 10 points."] },
    { name: "Iconoclasm and Heresy", stack: 8, kind: "tradeable", text: ["Reduce 4 of your cities and select 2 other players who must reduce 1 of their cities as well. The beneficiary may not be selected as a secondary victim."] },
    { name: "Regression", stack: 9, kind: "non-tradeable", text: ["Your succession marker on the A.S.T. is moved 1 step backward."] },
    { name: "Piracy", stack: 9, kind: "tradeable", text: ["The beneficiary selects 2 of your coastal cities, which are replaced by pirate cities. Then you select from 2 other players 1 coastal city each, which are also replaced by pirate cities. The beneficiary may not be selected as a secondary victim."] }
  ];
  function calamityNamed(name) {
    return CALAMITIES.find((c) => c.name === name || c.alias === name);
  }
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
  function roleResult(cal, role, heldIds) {
    const roles = CALAMITY_ROLES[cal.name];
    const outcome = roles?.[role];
    if (!outcome)
      return null;
    const changes = [];
    const notes = [];
    let immune;
    for (const id of new Set(heldIds)) {
      for (const e of CARD_CALAMITIES[id] ?? []) {
        if (calamityNamed(e.calamity) !== cal)
          continue;
        if (role === "secondary" && e.noSecondary)
          immune = id;
        if (e.role && e.role !== role)
          continue;
        if (e.delta !== undefined && outcome.n !== undefined)
          changes.push({ card: id, delta: e.delta, effect: e.effect });
        else if (e.delta === undefined)
          notes.push({ card: id, e });
      }
    }
    changes.sort((a, b) => a.effect === b.effect ? a.card.localeCompare(b.card) : a.effect === "help" ? -1 : 1);
    const n = outcome.n === undefined ? 0 : Math.max(0, outcome.n + changes.reduce((sum, c) => sum + c.delta, 0));
    return { text: outcome.say(n), base: outcome.n, changes, notes, ...immune ? { immune } : {} };
  }
  function minorCalamitiesInPlay(playerCount) {
    return playerCount === 9 || playerCount === 10 || playerCount === 11 || playerCount >= 15;
  }
  var CARD_CALAMITIES = {
    "advanced-military": [
      { calamity: "Civil Disorder", effect: "hurt", text: "Reduce 1 additional city.", delta: -1 }
    ],
    agriculture: [
      { calamity: "Famine", effect: "hurt", text: "If you are the primary victim, take 5 additional damage.", role: "primary", delta: 5 }
    ],
    anatomy: [
      { calamity: "Epidemic", effect: "help", text: "If you are a secondary victim, prevent 5 damage.", role: "secondary", delta: -5 }
    ],
    calendar: [
      { calamity: "Famine", effect: "help", text: "Prevent 5 damage.", delta: -5 },
      { calamity: "Cyclone", effect: "help", text: "Reduce 2 less selected cities.", delta: -2 }
    ],
    cartography: [
      { calamity: "Piracy", effect: "hurt", text: "If you are the primary victim, the beneficiary selects and replaces 1 additional coastal city.", role: "primary", delta: 1 }
    ],
    coinage: [
      { calamity: "Corruption", effect: "hurt", text: "Discard 5 additional points of face value.", delta: 5 }
    ],
    deism: [
      { calamity: "Superstition", effect: "help", text: "Reduce 1 less city.", delta: -1 }
    ],
    democracy: [
      { calamity: "Civil War", effect: "help", text: "Select 10 less unit points.", delta: 10 },
      { calamity: "Civil Disorder", effect: "help", text: "Reduce 1 less city.", delta: 1 }
    ],
    diplomacy: [
      { calamity: "Treachery", effect: "hurt", text: "The beneficiary selects and annexes 1 additional city.", delta: 1 }
    ],
    "drama-and-poetry": [
      { calamity: "Civil War", effect: "help", text: "Select 5 less unit points.", delta: 5 },
      { calamity: "Civil Disorder", effect: "help", text: "Reduce 1 less city.", delta: 1 }
    ],
    engineering: [
      { calamity: "Earthquake", effect: "help", text: "Your city is reduced instead of destroyed.", role: "primary" },
      { calamity: "Flood", effect: "help", text: "Prevent 5 damage.", delta: -5 }
    ],
    enlightenment: [
      { calamity: "Superstition", effect: "help", text: "Reduce 1 less city.", delta: -1 },
      { calamity: "Slave Revolt", effect: "help", text: "Your city support rate is decreased by 1 during the resolution of Slave Revolt.", delta: -1 },
      { calamity: "Epidemic", effect: "help", text: "If you are the primary victim, prevent 5 damage.", role: "primary", delta: -5 },
      { calamity: "Regression", effect: "help", text: "For each step backward, you may choose to prevent the effect by destroying 2 of your cities (if possible non-coastal)." }
    ],
    fundamentalism: [
      { calamity: "Regression", effect: "hurt", text: "Your marker is moved backward 1 additional step.", delta: 1 }
    ],
    law: [
      { calamity: "Tyranny", effect: "help", text: "The beneficiary selects and annexes 5 less unit points.", delta: -5 },
      { calamity: "Civil Disorder", effect: "help", text: "Reduce 1 less city.", delta: 1 },
      { calamity: "Corruption", effect: "help", text: "Discard 5 less points of face value.", delta: -5 }
    ],
    library: [
      { calamity: "Regression", effect: "help", text: "Your marker is moved backward 1 less step.", delta: -1 }
    ],
    masonry: [
      { calamity: "Cyclone", effect: "help", text: "Reduce 1 less of your selected cities.", delta: -1 }
    ],
    medicine: [
      { calamity: "Epidemic", effect: "help", text: "Prevent 5 damage.", delta: -5 }
    ],
    military: [
      { calamity: "Civil War", effect: "hurt", text: "Select 5 additional unit points.", delta: -5 }
    ],
    mining: [
      { calamity: "Slave Revolt", effect: "hurt", text: "Your city support rate is increased by 1 during the resolution of Slave Revolt.", delta: 1 }
    ],
    monarchy: [
      { calamity: "Barbarian Hordes", effect: "help", text: "5 less barbarian tokens are used.", delta: -5 },
      { calamity: "Tyranny", effect: "hurt", text: "The beneficiary selects and annexes 5 additional unit points.", delta: 5 }
    ],
    monotheism: [
      { calamity: "Iconoclasm and Heresy", effect: "hurt", text: "Reduce 1 additional city.", delta: 1 }
    ],
    music: [
      { calamity: "Civil War", effect: "help", text: "Select 5 less unit points.", delta: 5 },
      { calamity: "Civil Disorder", effect: "help", text: "Reduce 1 less city.", delta: 1 }
    ],
    mysticism: [
      { calamity: "Superstition", effect: "help", text: "Reduce 1 less city.", delta: -1 }
    ],
    mythology: [
      { calamity: "Slave Revolt", effect: "help", text: "Your city support rate is decreased by 1 during the resolution of Slave Revolt.", delta: -1 }
    ],
    "naval-warfare": [
      { calamity: "Piracy", effect: "help", text: "If you are the primary victim, the beneficiary selects and replaces 1 less coastal city. You may not be selected as a secondary victim.", role: "primary", delta: -1, noSecondary: true },
      { calamity: "Civil Disorder", effect: "hurt", text: "Reduce 1 additional city.", delta: -1 }
    ],
    philosophy: [
      { calamity: "Iconoclasm and Heresy", effect: "help", text: "Reduce 2 less cities.", delta: -2 },
      { calamity: "Civil War", effect: "hurt", text: "Select 5 additional unit points.", delta: -5 }
    ],
    politics: [
      { calamity: "Barbarian Hordes", effect: "hurt", text: "5 additional barbarian tokens are used.", delta: 5 }
    ],
    pottery: [
      { calamity: "Famine", effect: "help", text: "Prevent 5 damage.", delta: -5 }
    ],
    "provincial-empire": [
      { calamity: "Barbarian Hordes", effect: "hurt", text: "5 additional barbarian tokens are used.", delta: 5 },
      { calamity: "Tyranny", effect: "hurt", text: "The beneficiary selects and annexes 5 additional unit points.", delta: 5 }
    ],
    roadbuilding: [
      { calamity: "Epidemic", effect: "hurt", text: "If you are the primary victim, take 5 additional damage.", role: "primary", delta: 5 }
    ],
    sculpture: [
      { calamity: "Tyranny", effect: "help", text: "The beneficiary selects and annexes 5 less unit points.", delta: -5 }
    ],
    theocracy: [
      { calamity: "Iconoclasm and Heresy", effect: "help", text: "You may choose to discard 2 commodity cards to prevent the city reduction effect for you." }
    ],
    theology: [
      { calamity: "Iconoclasm and Heresy", effect: "help", text: "Reduce 3 less cities.", delta: -3 }
    ],
    "trade-empire": [
      { calamity: "Cyclone", effect: "hurt", text: "Select and reduce 1 additional city adjacent to the open sea area.", delta: 1 },
      { calamity: "Epidemic", effect: "hurt", text: "If you are the primary victim, take 5 additional damage.", role: "primary", delta: 5 }
    ],
    "universal-doctrine": [
      { calamity: "Superstition", effect: "hurt", text: "Reduce 1 additional city.", delta: 1 }
    ],
    "wonder-of-the-world": [
      { calamity: "Corruption", effect: "hurt", text: "Discard 5 additional points of face value.", delta: 5 }
    ]
  };

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
  var CARD_SORTS = ["group", "name", "cost", "vp", "value"];
  var DEFAULT_DIR = { group: "asc", name: "asc", cost: "asc", vp: "asc", value: "desc" };
  var isCardSort = (s) => CARD_SORTS.includes(s);
  var isSortDir = (s) => s === "asc" || s === "desc";
  var isReversible = (s) => s !== "group" && s !== "value";
  var SORT_LABEL = {
    group: { asc: ["Colour", "By colour, cheapest first"], desc: ["Colour", "By colour, cheapest first"] },
    name: { asc: ["A–Z", "A to Z"], desc: ["Z–A", "Z to A"] },
    cost: { asc: ["Cost ↑", "Cheapest first, after credits"], desc: ["Cost ↓", "Dearest first, after credits"] },
    vp: { asc: ["VP ↑", "Fewest VP first"], desc: ["VP ↓", "Most VP first"] },
    value: { asc: ["VP/cost", "Most VP for the money first, after credits"], desc: ["VP/cost", "Most VP for the money first, after credits"] }
  };
  var sortLabel = (sort, dir) => SORT_LABEL[sort][dir];
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
  function renderAdvancePicker(held, round, { canBuy = true, drafts = new Map, gm = false, sort = "group", dir = DEFAULT_DIR[sort] } = {}) {
    const heldById = new Map(held.map((h) => [h.id, h]));
    const t = advanceTotals(heldById.keys());
    const summary = `<p class="adv-pick-summary"><strong>${heldById.size}</strong> cards · <strong>${t.adv_points}</strong> VP` + ` <span class="adv-pick-tiers">(${t.adv_1vp} × 1 · ${t.adv_3vp} × 3 · ${t.adv_6vp} × 6)</span></p>` + `<p class="adv-pick-hint">${gm ? "<strong>GM correction:</strong> tick or untick any card, also locked ones and in any phase. A card added now counts as bought this round in the buying phase, otherwise in the round before." : canBuy ? "Tick the cards you buy this round. Prices include credits from cards bought in earlier rounds. Cards lock when the round ends." : "Cards are bought after calamities are resolved."}</p>`;
    const prices = priceList(held, round);
    const groups = sections(sort, dir, prices).map(({ group, cards }) => {
      const buttons = cards.map((c) => {
        const h = heldById.get(c.id);
        const bought = h ? advanceLocked(h, round) : false;
        const locked = bought && !gm;
        const closed = !locked && !canBuy && !gm;
        const cost = priceHtml(c, prices.get(c.id));
        const open = h && c.choiceCredits && (gm || creditChoiceOpen(h, round));
        const chooser = open && (!h.choice || drafts.has(c.id)) ? renderChooser(c, drafts.get(c.id) ?? h.choice ?? {}) : "";
        const change = open && h.choice && !drafts.has(c.id) ? `<button type="button" class="adv-choice-change" data-choice-change="${c.id}">Change colours</button>` : "";
        const cls = `adv-pick adv-${c.groups[0]}${h ? " adv-held" : ""}${locked ? " adv-locked" : ""}${closed ? " adv-closed" : ""}`;
        return `<button type="button" class="${cls}" data-advance="${c.id}" aria-pressed="${!!h}"${locked || closed ? ' aria-disabled="true"' : ""}>` + `<span class="adv-pick-name">${escapeHtml(c.name)}${dot(c)}</span>` + `<span class="adv-pick-meta">${cost} · ${c.vp} VP${h && h.round === round ? " · <em>new</em>" : ""}</span>` + `</button>` + change + chooser;
      }).join("");
      return section(group, `<div class="adv-pick-grid">${buttons}</div>`);
    }).join("");
    return summary + groups + basket(held, round, canBuy || gm);
  }
  function basket(held, round, canClear) {
    const fresh = held.filter((h) => h.round === round && ADVANCE_BY_ID.has(h.id));
    if (!fresh.length)
      return "";
    const cost = purchaseCost(held, round).total;
    const vp = fresh.reduce((sum, h) => sum + ADVANCE_BY_ID.get(h.id).vp, 0);
    const names = fresh.map((h) => ADVANCE_BY_ID.get(h.id)).map((c) => `<span class="adv-basket-card adv-${c.groups[0]}">${escapeHtml(c.name)}</span>`).join(" · ");
    return `<div class="adv-basket" role="status"><div class="adv-basket-text">` + `<p>Buying this round: <strong>${fresh.length}</strong> ${fresh.length === 1 ? "card" : "cards"}` + ` · <strong class="adv-basket-cost">${cost}</strong> · +${vp} VP</p>` + `<p class="adv-basket-names">${names}</p></div>` + (canClear ? `<button type="button" class="adv-basket-clear">Clear</button>` : "") + `</div>`;
  }
  function nextAgeCardRequirement({ level, civNumber, expert }) {
    const here = ageOfLevel(level);
    for (const from of AST_LEVELS.filter((l) => l >= level)) {
      const age = ageOfLevel(from + 5);
      if (age === here || from + 5 > AST_LEVELS.at(-1))
        continue;
      const parts = requirementParts(getAdvanceRequirement({ ast_level: from, civ_number: civNumber }, expert)).filter((p) => p.type !== "cities");
      if (parts.length)
        return { age: age.name, parts };
    }
    return null;
  }
  function renderCardOverview(held, round, ast) {
    const now = colourCredits(held, round);
    const next = colourCredits(held);
    const chips = ADVANCE_GROUPS.map((g) => `<span class="adv-credit-total adv-${g}"><span class="adv-credit-name">${GROUP_LABEL[g]}</span> <strong>${now[g]}</strong>` + (next[g] > now[g] ? ` → ${next[g]}` : "") + `</span>`).join("");
    const credits = `<p class="adv-credit-totals" aria-label="Colour credits">${chips}</p>`;
    const req = ast && nextAgeCardRequirement(ast);
    if (!req)
      return credits;
    const t = advanceTotals(held.map((h) => h.id));
    const parts = req.parts.map((p) => {
      const have = p.type === "adv" ? advancesOfTier(t, p.tier) : t.adv_points;
      return `<span class="adv-req ${have >= p.n ? "adv-req-met" : "adv-req-unmet"}">${escapeHtml(p.label)} <span class="adv-req-have">(${have})</span></span>`;
    }).join(" + ");
    return credits + `<p class="adv-overview-line adv-next-age"><span class="adv-overview-label">A.S.T. Req. ${escapeHtml(req.age)}:</span>${parts}</p>`;
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
  var credit = (g, text) => `<span class="adv-ref-credit adv-${g}">${escapeHtml(text)}</span>`;
  var line = (label, items) => items.length ? `<p class="adv-ref-credits">${label}: ${items.join(" · ")}</p>` : "";
  function cardBody(c, held) {
    const text = ADVANCE_TEXT[c.id] ?? [];
    const attrs = text.map((t, i) => `<p>${i === 0 && SPECIAL_ABILITY_IDS.includes(c.id) ? "<strong>Special ability:</strong> " : ""}${escapeHtml(t)}</p>`).join("");
    const cals = (CARD_CALAMITIES[c.id] ?? []).map((e) => `<p class="adv-ref-cal cal-${e.effect}">` + `<span class="cal-mark" aria-label="${e.effect === "help" ? "helps" : "hurts"}">${e.effect === "help" ? "＋" : "−"}</span>` + `<span><strong>${escapeHtml(e.calamity)}:</strong> ${escapeHtml(e.text)}</span></p>`).join("");
    const choice = held?.choice;
    const chosen = choice ? ADVANCE_GROUPS.filter((g) => choice[g]).map((g) => credit(g, `${choice[g]} ${GROUP_LABEL[g]}`)) : [];
    return attrs + cals + line("Credits", ADVANCE_GROUPS.filter((g) => c.credits[g]).map((g) => credit(g, `${c.credits[g]} ${GROUP_LABEL[g]}`))) + (c.choiceCredits ? line("Credits of your choice", chosen.length ? chosen : [`${c.choiceCredits}, chosen once`]) : "") + line("Card credit", Object.entries(c.special).flatMap(([id, n]) => {
      const to = ADVANCE_BY_ID.get(id);
      return to ? [credit(to.groups[0], `${n} to ${to.name}`)] : [];
    })) + line("Cheaper with", (CREDITS_FROM.get(c.id) ?? []).map(({ from, n }) => credit(from.groups[0], `${from.name} −${n}`))) + (held ? `<p class="adv-ref-bought">Bought in round ${held.round}</p>` : "");
  }
  function renderAdvanceReference(held, open = new Set, round = 0, sort = "group", dir = DEFAULT_DIR[sort]) {
    const heldById = new Map(held.map((h) => [h.id, h]));
    const prices = priceList(held, round);
    return sections(sort, dir, prices).map(({ group, cards }) => {
      const rows = cards.map((c) => `<details class="adv-ref-item adv-${c.groups[0]}" data-advance-ref="${c.id}"${open.has(c.id) ? " open" : ""}>` + `<summary><span class="adv-ref-name">${escapeHtml(c.name)}${dot(c)}</span>` + `<span class="adv-ref-meta">${priceHtml(c, prices.get(c.id))} · ${c.vp} VP</span>` + (heldById.has(c.id) ? '<span class="adv-ref-held" aria-label="you hold this card">✓</span>' : "") + `</summary>${cardBody(c, heldById.get(c.id))}</details>`).join("");
      return section(group, `<div class="adv-ref-list">${rows}</div>`);
    }).join("");
  }

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
      if (target.closest(".adv-basket-clear")) {
        await mettPost(`/api/players/${b.playerId()}/advances`, { ids: b.held().filter((h) => h.round !== b.round()).map((h) => h.id) });
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

  // src/shared/civ-summary.ts
  function renderCivSummary(player, totalVp) {
    return `<div class="civ-summary" id="civ-summary">` + `<span class="civ-sum-item">A.S.T. <strong>${player.ast_level === 0 ? "S" : player.ast_level}</strong></span>` + `<span class="civ-sum-item"><strong>${totalVp}</strong> VP</span>` + `</div>`;
  }

  // src/shared/calamity-panel.ts
  var KIND_LABEL = {
    minor: "Tradeable",
    "non-tradeable": "Non tradeable",
    tradeable: "Tradeable"
  };
  var mark = (effect) => `<span class="cal-mark" aria-label="${effect === "help" ? "helps" : "hurts"}">${effect === "help" ? "＋" : "−"}</span>`;
  var cardName = (id) => escapeHtml(ADVANCE_BY_ID.get(id)?.name ?? id);
  function roleLines(cal, role, held) {
    const r = roleResult(cal, role, held);
    if (!r)
      return "";
    const roles = CALAMITY_ROLES[cal.name];
    const label = role === "primary" ? "Primary victim" : `Secondary victims <span class="cal-who">(${escapeHtml(roles.secondary.who)})</span>`;
    if (r.immune) {
      return `<p class="cal-role"><span class="cal-role-name">${label}:</span> <span class="cal-help">You can’t be picked (${cardName(r.immune)}).</span></p>`;
    }
    const calc = r.changes.length ? ` <span class="cal-calc">${r.base}${r.changes.map((c) => ` <span class="cal-${c.effect}">${c.delta > 0 ? "+" : "−"}${Math.abs(c.delta)} ${cardName(c.card)}</span>`).join("")}</span>` : "";
    return `<p class="cal-role"><span class="cal-role-name">${label}:</span> ${escapeHtml(r.text)}${calc}</p>` + r.notes.map(({ card, e }) => `<p class="cal-role-note cal-${e.effect}">${mark(e.effect)}<span><strong>${cardName(card)}:</strong> ${escapeHtml(e.text)}</span></p>`).join("");
  }
  function renderRoles(cal, held) {
    const roles = CALAMITY_ROLES[cal.name];
    return `<div class="cal-roles">` + roleLines(cal, "primary", held) + roleLines(cal, "secondary", held) + (roles?.others ? `<p class="cal-role"><span class="cal-role-name">Other players:</span> ${escapeHtml(roles.others)}</p>` : "") + (roles?.beneficiary ? `<p class="cal-role"><span class="cal-role-name">Beneficiary:</span> ${escapeHtml(roles.beneficiary[0].toUpperCase() + roles.beneficiary.slice(1))}</p>` : "") + `</div>`;
  }
  function heldMarks(cal, held) {
    const mine = cardsFor(cal).filter((c) => held.has(c.id)).map((c) => c.e.effect);
    return ["help", "hurt"].filter((f) => mine.includes(f)).map((f) => `<span class="cal-check cal-check-${f}" aria-label="your cards ${f === "help" ? "help" : "hurt"}">✓</span>`).join("");
  }
  function cardsFor(cal) {
    const out = [];
    for (const card of ADVANCES) {
      for (const e of CARD_CALAMITIES[card.id] ?? []) {
        if (calamityNamed(e.calamity) === cal)
          out.push({ id: card.id, e });
      }
    }
    return [...out.filter((c) => c.e.effect === "help"), ...out.filter((c) => c.e.effect === "hurt")];
  }
  function renderCalamityReference(heldIds, playerCount, open = new Set) {
    const held = new Set(heldIds);
    const item = (cal) => {
      const mods = cardsFor(cal).map(({ id, e }) => `<li class="cal-${e.effect}${held.has(id) ? " cal-held" : ""}">` + mark(e.effect) + `<span><span class="cal-mod-card">${cardName(id)}:</span> ${escapeHtml(e.text)}</span>` + (held.has(id) ? '<span class="cal-check" aria-label="you hold this card">✓</span>' : "") + `</li>`).join("");
      return `<details class="cal-ref-item" data-calamity="${escapeHtml(cal.name)}"${open.has(cal.name) ? " open" : ""}>` + `<summary><span class="cal-stack">${cal.stack}</span><span class="cal-ref-name">${escapeHtml(cal.name)}</span>${heldMarks(cal, held)}` + `<span class="cal-kind cal-kind-${cal.kind}">${KIND_LABEL[cal.kind]}</span></summary>` + renderRoles(cal, held) + cal.text.map((t) => `<p class="cal-chart">${escapeHtml(t)}</p>`).join("") + (mods ? `<ul class="cal-mods">${mods}</ul>` : "") + `</details>`;
    };
    const major = `<h4>Major calamities</h4><div class="cal-ref-list">${CALAMITIES.filter((c) => c.kind !== "minor").map(item).join("")}</div>`;
    return minorCalamitiesInPlay(playerCount) ? `<h4>Minor calamities</h4><div class="cal-ref-list">${CALAMITIES.filter((c) => c.kind === "minor").map(item).join("")}</div>` + major : major + `<p class="cal-none">Minor calamities are not used with ${playerCount} players, only with 9–11 or 15–18.</p>`;
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
    }, bindTabs = function() {
      const tabs = Array.from(document.querySelectorAll(".civ-tab"));
      const show = (tab, focus = false) => {
        for (const t of tabs) {
          const on = t === tab;
          t.setAttribute("aria-selected", String(on));
          t.tabIndex = on ? 0 : -1;
          const panel = document.getElementById(t.getAttribute("aria-controls"));
          if (panel)
            panel.hidden = !on;
        }
        if (focus)
          tab.focus();
        history.replaceState(null, "", `#${tab.id.replace("tab-btn-", "")}`);
      };
      for (const t of tabs) {
        t.addEventListener("click", () => show(t));
        t.addEventListener("keydown", (e) => {
          const i = tabs.indexOf(t);
          const next = e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(i + tabs.length - 1) % tabs.length] : null;
          if (next) {
            e.preventDefault();
            show(next, true);
          }
        });
      }
      const fromHash = document.getElementById(`tab-btn-${location.hash.slice(1)}`);
      if (fromHash && tabs.includes(fromHash))
        show(fromHash);
    }, bindCards = function() {
      const picker = document.getElementById("adv-picker");
      if (!picker)
        return;
      bindPicker(picker, {
        playerId: () => playerId,
        held: () => lastState?.advances[playerId] ?? [],
        round: () => lastState?.game.current_round ?? 0,
        rerender: () => {
          if (lastState)
            syncPicker(lastState.advances[playerId] ?? [], lastState.game);
        },
        drafts: choiceDrafts
      });
      const bar = document.querySelector(".adv-sort");
      bar?.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-card-sort]");
        const sort = btn?.dataset.cardSort;
        if (!isCardSort(sort))
          return;
        if (sort === cardSort && isReversible(sort))
          cardDir = cardDir === "asc" ? "desc" : "asc";
        else {
          cardSort = sort;
          cardDir = DEFAULT_DIR[sort];
        }
        try {
          localStorage.setItem(CARD_SORT_KEY, `${cardSort}:${cardDir}`);
        } catch {}
        showCardSort();
        if (lastState)
          syncPicker(lastState.advances[playerId] ?? [], lastState.game);
      });
      showCardSort();
    }, showCardSort = function() {
      document.querySelectorAll("[data-card-sort]").forEach((b) => {
        const sort = b.dataset.cardSort;
        const [label, title] = sortLabel(sort, sort === cardSort ? cardDir : DEFAULT_DIR[sort]);
        b.setAttribute("aria-pressed", String(sort === cardSort));
        b.textContent = label;
        b.title = title;
      });
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
      lastState = state;
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
      const roundEl = document.getElementById("census-round");
      if (roundEl)
        roundEl.textContent = String(game.current_round);
      syncSummary(player, census, game);
      syncCensus(player, census, submitted, revealed, citiesPhase, state);
      syncCity(census, cityCountSubmitted, citiesPhase, revealed);
      syncPicker(state.advances[playerId] ?? [], game);
      const overview = document.getElementById("adv-overview");
      if (overview)
        overview.innerHTML = renderCardOverview(state.advances[playerId] ?? [], game.current_round, { level: player.ast_level, civNumber: player.civ_number, expert });
      syncCalamities((state.advances[playerId] ?? []).map((h) => h.id), state.players.length);
      syncAst(player, census, game, state, expert);
    }, syncCalamities = function(heldIds, playerCount) {
      rerenderKeepingOpen("cal-ref", "calamity", (open) => renderCalamityReference(heldIds, playerCount, open));
    }, syncSummary = function(player, census, game) {
      const el = document.getElementById("civ-summary");
      if (el)
        el.outerHTML = renderCivSummary(player, playerTotalVp(player, game.active ? null : census?.city_count));
    }, syncPicker = function(held, game) {
      const picker = document.getElementById("adv-picker");
      if (picker) {
        const focused = document.activeElement?.dataset?.advance;
        picker.innerHTML = renderAdvancePicker(held, game.current_round, { canBuy: game.cities_phase === 1, drafts: choiceDrafts, sort: cardSort, dir: cardDir });
        if (focused)
          picker.querySelector(`[data-advance="${focused}"]`)?.focus();
      }
      rerenderKeepingOpen("adv-ref", "advanceRef", (open) => renderAdvanceReference(held, open, game.current_round, cardSort, cardDir));
    }, rerenderKeepingOpen = function(id, key, render) {
      const el = document.getElementById(id);
      if (!el)
        return;
      const open = new Set(Array.from(el.querySelectorAll("details[open]"), (d) => d.dataset[key] ?? ""));
      el.innerHTML = render(open);
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
    const choiceDrafts = new Map;
    const CARD_SORT_KEY = "mett.cardSort";
    let cardSort = "group";
    let cardDir = "asc";
    try {
      const [sort, dir] = (localStorage.getItem(CARD_SORT_KEY) ?? "").split(":");
      if (isCardSort(sort)) {
        cardSort = sort;
        cardDir = isSortDir(dir) && isReversible(sort) ? dir : DEFAULT_DIR[sort];
      }
    } catch {}
    bindTabs();
    bindCensus();
    bindCity();
    bindCards();
    bindMov();
    window.addEventListener("mett:my-state", (e) => {
      try {
        renderFromState(e.detail);
      } catch (err) {
        console.error("[civ.ts] renderFromState failed", err);
      }
    });
    let lastState = null;
  }
})();
