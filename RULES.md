# me[tt] — Implemented Game Rules

This document describes which rules from **Mega Empires: The West & The East** me[tt] has implemented, how they work, and any deliberate simplifications.

For the user guide see [README.md](README.md). For architecture and development see [DEV.md](DEV.md).

---

## Civilisations

### Selection by player count

The official scenario table defines which civilisations participate for each player count (3–18). me[tt] uses the exact recommended set and pre-selects them in the admin setup wizard. The admin can override the selection manually.

### West and East

Each civilisation belongs to a region — West or East. Border civilisations near the centre of the map may be assigned to either region depending on how many players are in the game; the admin sets this during setup.

### Slow-start civilisations

Some civilisations (Minoa, Saba, Kushan, Iberia) start outside the A.S.T. Stone Age zone used by other civilisations. me[tt] tracks each civilisation's individual Stone Age endpoint and applies free advancement correctly: a slow-start civilisation advances freely through its extended Stone Age without needing to meet the stated requirements.

---

## Census and move order

Each round, every player submits their current population count. The counts are hidden from all players until everyone has submitted.

**Move order** after reveal:
1. Non-Military players move first, Military players move last.
2. Within each group, players with the **highest population move first**.
3. Ties within a group are broken by civilisation number (ascending).

The Military Advance is toggled per player by the admin (or by the player from their own page). me[tt] shows the resulting move order on the main display immediately after all census entries are in.

---

## City count

City count is collected twice each round:

1. **Pre-trade** — players enter their city count after building but before buying trade cards. This is used on the main display (A.S.T. progress board).
2. **Post-calamity** — after calamities are resolved, players re-enter their city count. This is the count used to check A.S.T. advancement and regression requirements.

The admin uses the **Prepare for A.S.T.** button to transition from the pre-trade phase to the post-calamity phase.

---

## A.S.T. advancement

### Requirements

Each A.S.T. level has a requirement. me[tt] implements all requirements from the official table for both Basic and Expert mode:

| Age | Typical requirement |
|---|---|
| Stone Age | None (free advancement) |
| Early Bronze Age | Minimum number of cities |
| Middle Bronze Age | Cities + number of Advances |
| Late Bronze Age | Cities + Advances with a VP threshold |
| Early Iron Age | Cities + Advances ≥ 100 VP each |
| Late Iron Age (Basic) | Cities + Advances ≥ 200 VP each |
| Late Iron Age (Expert) | Cities + additional Advances ≥ 200 VP each + total VP threshold |

### Advance card tiers

me[tt] tracks advances in three tiers matching the VP value printed on each card:

- **1 VP cards** — less than 100 VP
- **3 VP cards** — 100–199 VP (i.e. ≥ 100 VP each)
- **6 VP cards** — 200+ VP (i.e. ≥ 200 VP each)

Each player enters how many cards they hold in each tier. This lets me[tt] evaluate requirements like "3 Advances ≥ 200 VP each" precisely.

### Auto-advancement

After each city count or Advance VP update, me[tt] checks whether the player now meets the requirements for their next A.S.T. level and advances them automatically if so. The admin can also set the A.S.T. level manually via a dropdown.

### Slow-start free advancement

Civilisations with a later Stone Age end (Minoa, Saba, Kushan, Iberia) advance freely through all Stone Age levels without meeting any stated requirement. me[tt] knows each civilisation's Stone Age endpoint and applies this correctly.

### Regression (Expert mode only)

In Expert mode, a player who ends the round with **0 effective cities** outside the Stone Age regresses one A.S.T. level. The player's page shows a regression warning when this applies, and the admin panel shows a red indicator dot.

---

## Wonder of the World

The Wonder of the World is held by at most one player at a time. me[tt] tracks it as a per-player flag toggled by the admin or by the player from their own page.

The Wonder grants **+1 effective city** toward all A.S.T. purposes:
- It counts toward the minimum city requirement for advancement.
- It counts toward the regression-prevention threshold in Expert mode (a player with 0 cities but holding the Wonder is treated as having 1 city).

The Wonder does **not** count as a city for final VP scoring.

---

## Late Iron Age (LIA) simultaneous finish bonus

When two or more players reach the maximum A.S.T. level in the **same round**, they each receive a **+5 VP bonus** added to their final score. Players who had already reached maximum A.S.T. in an earlier round do not receive this bonus.

---

## Final round (Expert mode)

In Expert mode, the final round is triggered when the first player reaches A.S.T. level 75 (Late Iron Age entry). All remaining players get one additional round to catch up before the game ends. me[tt] flags the round as the final round and shows a banner on the admin page. Clicking **End Game** closes the game and reveals final scores.

In Basic mode, the game ends when the first player reaches A.S.T. level 75. There is no final extra round.

---

## Final scoring

When the game ends me[tt] calculates and displays a full breakdown for every player:

| Component | Rule |
|---|---|
| **Advance VP** | Total VP from all purchased Civilization Advances |
| **A.S.T. VP** | VP awarded for the player's final A.S.T. position per the official table |
| **City VP** | 1 VP per city held at the end of the final round (Wonder does not count) |
| **LIA bonus** | +5 VP if the player reached maximum A.S.T. in the same round as at least one other player |

Players are ranked by total VP. The final scoreboard shows gold, silver and bronze medals for the top three.

---

## What is not implemented

The following aspects of Mega Empires are handled by the players at the table and are not tracked in me[tt]:

- **Trade card hand management** — which specific cards a player holds (me[tt] only tracks the count by VP tier)
- **Calamity resolution** — which calamities fire, who they affect, and their effects (city loss, population loss, etc.)
- **Advance purchasing logic** — which advances a player can buy given their hand (use the [Mega Empires Calculator](https://calculator.mega-empires.com/) for this)
- **Succession kingdoms** — any special rules for successor states
- **Map state** — token placement, territory, conflicts on the board
