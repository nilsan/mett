# Changelog

All notable changes to me[tt]. Versions follow [semantic versioning](DEV.md#versioning): **major** = upgrading needs manual work or breaks bookmarks/config; **minor** = new features, visible changes, database migrations; **patch** = fixes. Docker images are tagged with each version (`1.5.0`, `1.5`, `1`).

## 2.0.0-beta.6 — 2026-10-28

### Changed
- Two-colour cards no longer have a dot for their second colour; the stripe and the fade show both colours.

## 2.0.0-beta.5 — 2026-10-28

### Added
- **Confirm** next to Clear on the purchase bar: a player who is done buying locks this round's cards (and a new Monument / Written Record's colours, which must be chosen first) without waiting for the GM to end the round. The bar then says **✓ Confirmed**. The GM's card dialog shows "Confirmed by the player" with **Reopen**. Database migration 4 adds `players.cards_confirmed`.

### Changed
- The Cards tab has one list instead of tiles above and All cards below. Each card is a row that opens to its full text, with a **Buy** button while buying; a card picked this round shows **✓ Buying** (tap to undo) until the purchase is confirmed or the round ends, then **✓ Bought**, and earlier cards **✓ Owned**. Held cards are filled in their colour. The GM's card correction keeps the tiles.
- Two-colour cards are drawn as the game draws them: listed under their first colour (as on the Strategy Explorer), with a stripe in both colours and, when held, a fade from the first colour to the second.
- Calamities show their printed text first, the same for every player, then what the cards change, and last **Your result**: the primary and secondary victims, other players and the beneficiary as it works out for the player's cards.

### Fixed
- With large fonts, the purchase bar puts Clear under the text instead of squeezing it.

## 2.0.0-beta.4 — 2026-10-28

### Added
- Cards tab: the colour credit totals under the sort buttons (with what this round's cards add from next round), and an **A.S.T. Req.** line with the cards the next age asks for, counted against the player's cards, on one line at any phone font size.
- Cards tab: a **VP/cost** sort, most VP for the money first (prices after credits). It goes one way only, like Colour.
- The purchase bar names the cards being bought and has **Clear** to untick them all.
- Prices, the purchase total and the VP/cost order count **Library** (40 off one other card bought the same round) and **Anatomy** (one science card printed under 100 free).
- Calamities: each calamity spells out the primary victim, the secondary victims and the beneficiary, worked out for the player's cards (e.g. Famine with Pottery and Agriculture: 10 damage as primary victim, none as a secondary one).

### Changed
- The Calamities tab is one list; a ✓ after a calamity's name shows that the player's cards help (green) or hurt (red), and the ✓ on a card's line takes the same colour.
- The sort buttons have no "Sort" label and fit one line on a phone.
- The source code and Ko-fi line shows only on the Cards and Calamities tabs.

## 2.0.0-beta.3 — 2026-10-27

### Changed
- A–Z, Cost and VP on the Cards tab turn round on a second click (Z–A, dearest first, most VP first); the button shows the direction. VP now starts with the fewest VP, like Cost starts cheapest.

### Fixed
- A card the GM adds outside the buying phase counts as bought in the previous round, locked, instead of as a purchase in progress the player could not change.

## 2.0.0-beta.2 — 2026-10-27

### Added
- The Cards tab can sort the cards by colour (default), A–Z, cost after credits (cheapest first) or VP (most first). The choice applies to the picker and All cards, and the browser remembers it.

### Changed
- All cards shows each card's price after credits, as the picker does.

## 2.0.0-beta.1 — 2026-10-27

A beta for review on beta.mett.games; the image is tagged `:beta` only, never `:latest`. Start a new game on it: cards entered mid-game replace the hand-entered advance counts.

### Added
- **Advance cards per player.** Players tick the cards they own on a new Cards tab; tier counts, advance VP, Military, Wonder and special abilities all follow from the cards. Card data (cost, VP, colours, credits, calamity effects and text) is read from the printed cards.
- Cards are bought after calamities (phase 12) and lock when the round rolls over; a round undo unlocks them again. Each tile shows the price after credits from cards bought in earlier rounds, and a bar at the bottom of the screen sums what the player is buying this round.
- Monument and Written Record: the extra credits are split between colours once and kept for the rest of the game.
- **All cards** on the Cards tab: every card's text, calamity effects, credits (colour credits, the player's own colour split, the credit to a named card, the cards that make it cheaper) and the round the player bought it, in the card colours.
- **Calamities** tab: what the player's cards change, and every calamity in the game with its Quick Chart text and a ✓ on the effects of cards the player holds. Minor calamities are listed only for player counts that use them (9–11 and 15–18).
- The GM corrects a player's cards on the admin page: a player's Adv VP opens their cards in a dialog, where any card can be ticked or unticked, locked or not, in any phase, and a colour choice changed.

### Changed
- The player page is split into Round · Cards · A.S.T. · Calamities tabs under a summary line with A.S.T. position and VP.
- The admin page no longer has the Military / Wonder / special ability toggles, and the player page no longer shows them as icons: the cards decide them.

## 1.7.0 — 2026-10-26

### Added
- Player pages end with the same quiet source code and Ko-fi line as the admin page.

### Changed
- The A.S.T. timeline on the status board matches the softer look: each age is a rounded block per empire, with a small gap between ages.
- The "A.S.T. Progress Order" heading stays on one line from 1440p up, with its rows as wide as the heading (it still wraps at 1080p, where the board needs the width).
- Table rows are slightly less rounded.

## 1.6.1 — 2026-10-26

### Fixed
- The Expert Iron Age requirement on the player page and board read "10 Adv ≤100"; the rulebook says *less than* 100, which is what me[tt] always counted. It now reads "10 Adv <100".
- `db/schema.sql` was missing the `special` column (databases got it from a migration, so nothing broke).

### Changed
- README, RULES.md and DEV.md rewritten and brought up to date.

## 1.6.0 — 2026-10-26

### Added
- The admin page ends with a quiet line linking the source code and a Ko-fi tip jar; the repository has a Sponsor button.

### Changed
- me[tt] is now public on GitHub, and the README says why it exists.

## 1.5.0 — 2026-10-26

### Added
- **Demo mode** (`DEMO=1`): a public instance that starts every night from the same 12-empire, round-7 Expert game with half the census in. The admin password is `demo`, shown on the login page, and cannot be changed. Runs at [demo.mett.games](https://demo.mett.games).
- End-to-end game simulations in the test suite: complete Expert and Basic games over the API, with every rule checked after every round.
- `CONTRIBUTING.md`, issue templates, this changelog, and a test that every source file carries the MPL notice.

### Changed
- README rewritten for newcomers, with new screenshots. `bun run screenshots` now starts its own demo instance instead of resetting the dev server's game.

### Fixed
- RULES.md described the Late Iron Age bonus wrongly (as a reward for arriving *together*). The rulebook, and me[tt] since it first had the bonus, give it to the one empire that arrives first, alone.
- Unit tests no longer leave files in `/tmp`.

## 1.4.3 — 2026-10-26
### Fixed
- The status board fits 1080p with wide system fonts (e.g. DejaVu Sans on Linux TVs); browser tests now also run with that font.

## 1.4.2 — 2026-10-26
### Changed
- Bun 1.4.4.

## 1.4.1 — 2026-10-25
### Fixed
- Leaderboard keeps a fixed width, so tie ranks like "=10" no longer squeeze the timeline.
### Changed
- About 70 unused CSS rules removed; CI fails if unused CSS comes back.

## 1.4.0 — 2026-10-25
### Added
- Debug data endpoints take a `seed` for reproducible games; pixel-exact screenshot tests.

## 1.3.0 — 2026-10-25
### Changed
- Games with fewer empires fill the status board: rows and text grow (rows up to 3×).

## 1.2.0 — 2026-10-25
### Added
- The status page keeps the screen awake and has a full-screen button.

## 1.1.0 — 2026-10-25
### Added
- A backup before every round advance, game start, reset and restore; a Restore list on the admin page.
### Fixed
- "Undo round advance" restores the game exactly (it used to change only the round number).

## 1.0.0 — 2026-10-25
### Changed
- Calm redesign of the status board, admin page and player pages, with one shared stylesheet. Trade cards in one table with West/East labels, aligned with the other tables.
- Supported screens: phones, and 1920×1080 at 100 % and up (smaller desktop layouts removed).

## 0.18.0 — 2026-10-25
### Changed
- Security hardening: the admin cookie is a session token instead of the password, login throttling, the password hash never leaves the server, player names escaped everywhere, input validation on the API.
- Game data in one place (A.S.T. rules, civ data); database migrations tracked by version.
- Docker image runs as an unprivileged user; health check; CI builds the image only after all tests pass.

## 0.17.x — 2026-07-04
- A.S.T. requirements on the player page coloured green (reached) / red (needed); city counts lock until the census is revealed.

## 0.16.0 — 2026-07-04
- Calamity regression button on the admin page, with a red marker on the status board.

## 0.15.x — 2026-07-04
- "Units moved" readiness signal; census locks after calamities.

## 0.14.x — 2026-06-30 to 07-02
- Three-phase rounds (census, trade, calamities) on the status and admin pages; 4K TV pass.

## 0.13.x — 2026-06-01 to 06-28
- Shared scoring and A.S.T. code between server and player page; status tables aligned row by row; player-page readability pass; leaderboard ranks by total VP during play.

## 0.1 – 0.12 — 2026-04 to 2026-06
- First versions: census, move order, cities, advance VP, A.S.T., Wonder, final scoring, live updates, admin setup from the official scenario table, Docker image and multi-instance deploys. Inspired by [METool](https://github.com/roenoe/METool).
