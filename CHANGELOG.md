# Changelog

All notable changes to me[tt]. Versions follow [semantic versioning](DEV.md#versioning): **major** = upgrading needs manual work or breaks bookmarks/config; **minor** = new features, visible changes, database migrations; **patch** = fixes. Docker images are tagged with each version (`1.5.0`, `1.5`, `1`).

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
