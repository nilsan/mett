# me[tt] — The Rules It Implements

Which rules of **Mega Empires: The West & The East** me[tt] keeps track of, how, and what it leaves to the table. Rulebook quotes are from *Mega Empires: The West*. If me[tt] gets a rule wrong, please [open an issue](https://github.com/nilsan/mett/issues/new/choose) with the rulebook quote.

See [README.md](README.md) for how to use me[tt] and [DEV.md](DEV.md) for the code.

---

## Setup

**Empires by player count.** The admin page offers the official scenario table for 3–18 players (West, East or both boxes combined). **Apply recommended civs** fills in that set; the game master can change any empire before starting.

**West and East.** Each empire plays in the West or the East. Empires near the middle of the combined map can be either, depending on the scenario; the setup sets it.

**Basic or Expert.** Chosen at setup. It decides the A.S.T. requirements, regression and how the game ends (below).

---

## A round in me[tt]

The rulebook's turn has more phases than me[tt] needs. me[tt] follows the ones that involve bookkeeping:

1. **Census.** Each player enters their population. Nobody sees anyone else's number until the last one is in; then all are revealed together. The game master can reveal early, or enter a number for a player without a phone.
2. **Move order.** After the reveal, the board lists the move order:
   - Empires without the **Military** advance move first, those with it move last.
   - Within each group the **largest population moves first**.
   - Remaining ties go by empire number, lowest first.

   Players can mark "units moved", so neighbours on the board can see who is done.
3. **Cities and trade cards.** Each player enters their city count (possible once the census is revealed). The board shows each empire's trade-card draw: one stack per city, plus one extra card for the holder of the **Wonder of the World**.
4. **Trading done.** The game master clicks **Trading done → recount**. The city counts are cleared for the recount.
5. **Calamities** are resolved at the table. Then each player enters their city count again; this count is the one the A.S.T. uses. If a calamity knocks an empire back on the A.S.T., the game master clicks **Regress** for it, and the board marks it in red for the rest of the round.
6. **Advance.** The game master clicks **Advance**: every A.S.T. marker moves (next section), the Late Iron Age bonus and the end of the game are checked, and the next round starts. A backup is taken first, so an advance can be undone.

Players update their advance cards, Military, Wonder and special ability on their own page whenever they change.

---

## A.S.T.

### Requirements

When the game master advances the round, each empire's marker moves **one square forward** if the empire meets the requirement of the era it moves into, using the post-calamity city count. Each player's page shows the requirements, coloured green (met) or red (still needed), and the board predicts every empire's move before the round ends.

| Era | Basic | Expert |
|---|---|---|
| Stone Age | No requirements | No requirements |
| Early Bronze Age | 2 cities | 3 cities |
| Middle Bronze Age | 3 cities and 3 advances | 3 cities and 5 VP in advances |
| Late Bronze Age | 3 cities and 3 advances costing 100 or more | 4 cities and 12 advances |
| Early Iron Age | 4 cities and 2 advances costing 200 or more | 5 cities, 10 advances costing under 100, and 38 VP in advances |
| Late Iron Age | 5 cities and 3 advances costing 200 or more | 6 cities, 17 advances costing under 100, and 56 VP in advances |

### Advance cards

Players don't enter which advances they hold, only how many in each price band, which is what the requirements need:

| Band | Price | VP per card |
|---|---|---|
| 1 VP cards | under 100 | 1 |
| 3 VP cards | 100–199 | 3 |
| 6 VP cards | 200 and more | 6 |

The VP total in advances is computed from the three counts.

### Empires with a different A.S.T. row

Some empires have a longer Stone Age or Early Bronze Age, as printed on the A.S.T. me[tt] knows each empire's row:

| Mode | Empires | Difference |
|---|---|---|
| Expert | Minoa, Saba, Kushan, Iberia | Five Stone Age squares (to 25), so a shorter Early Bronze Age |
| Basic | Minoa, Saba | Five Stone Age squares, and the Early Bronze Age runs to 40 |
| Basic | Celt, Carthage, Iberia, Parthia | The Early Bronze Age runs to 40 |

Stone Age squares are free for everyone; a longer Early Bronze Age needs only its 2 cities on the extra square.

### Wonder of the World

The Wonder counts as **one extra city** for every A.S.T. purpose: the city requirements, and (in Expert) not regressing with no cities on the board. It gives one extra trade card. It does **not** count as a city in the final score.

### Regression (Expert)

"During A.S.T.-Alteration, if players have no cities on the board, their succession marker is moved 1 space backward. This rule does not apply to the Stone Age." me[tt] does this automatically when the round advances; the player's page warns ahead of time.

Calamity regressions are applied by the game master with the **Regress** button (step 5 above).

### Corrections

The game master can set any empire's A.S.T. square by hand on the admin page.

---

## The end of the game

**Basic:** the game ends as soon as an empire enters the Late Iron Age (square 75).

**Expert:** "After one or more players have first entered the Late Iron Age, 1 additional game turn is played. After this turn the game ends." me[tt] announces the final round on the board and the admin page, and ends the game after it. If a calamity regression during the final round takes every empire back out of the Late Iron Age, the final round is called off and the game goes on.

**Late Iron Age bonus:** "At Victory Determination, if a single player has moved their A.S.T.-marker into the first of the two Late Iron Age era columns, this player receives the A.S.T. Bonus of 5 Victory Points, regardless of what happens in the final game turn." me[tt] gives the 5 VP to an empire that enters the Late Iron Age first and alone. If two or more arrive in the same round, nobody gets it, and nobody who arrives later can. The round summary on the admin page says which happened, and the game master can grant or remove the bonus by hand.

---

## Score

| Part | VP |
|---|---|
| A.S.T. | The number of the empire's A.S.T. square (e.g. 70) |
| Advances | 1, 3 or 6 per card, by price band |
| Cities | 1 per city on the board at the end (the Wonder doesn't count) |
| Late Iron Age bonus | 5 |

**During the game**, the leaderboard ranks by A.S.T. plus advances plus the bonus; cities are left out until the end, since they change all the time.

**At the end**, ties are broken by A.S.T. position, then by the number of 6 VP cards, then 3 VP cards. A tie that is still left is settled by the game master on the admin page.

---

## What stays at the table

me[tt] does not track:

- **Which** advances a player owns, or what they can afford. Matt Crawford's [Mega Empires Calculator](https://calculator.mega-empires.com/) is very good for planning purchases.
- The trade cards in each hand, and trading itself.
- Which calamities strike and what they do (beyond A.S.T. regressions).
- The map: tokens, cities' positions, conflict.
