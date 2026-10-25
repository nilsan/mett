# me[tt] — Developer Documentation

This document covers the architecture, technology choices, and how to build, run and test the application.

For the user-facing guide see [README.md](README.md). For which game rules are implemented see [RULES.md](RULES.md).

---

## Technology stack

| Concern | Choice | Reason |
|---|---|---|
| Runtime | **Bun** | Built-in SQLite, built-in WebSocket, TypeScript without a build step |
| Web framework | **Hono** | Lightweight, TypeScript-first, first-class Bun support |
| Database | **bun:sqlite** | Zero extra dependencies; Bun includes it natively |
| Password hashing | **node:crypto scrypt** | OWASP-recommended; sync; no extra dep |
| CSS | **Pico CSS + custom** | Dark-mode baseline out of the box; served from `node_modules` (no CDN), version pinned in `package.json` |
| Frontend JS | **TypeScript bundles + vanilla JS + HTMX** | No framework needed at this scale; HTMX (served from `node_modules`) for the status page |
| Browser tests | **Playwright** | Auto-wait, browser bundled, TypeScript-native |
| Container | **Docker + Docker Compose** | Volume-mounted SQLite for persistence |
| TLS | **Caddy** | Automatic Let's Encrypt certificates, bundled in compose |
| CI | **GitHub Actions** | bun test + tsc + Playwright + linters on every PR; the image is only published when they pass |
| Deployment | **Docker Compose** | `docker compose pull` from GHCR + recreate; pin via `METT_VERSION` (no git pull on remote — image-only swap). Multi-instance Ansible automation lives in the private `mett-deploy` repo. |

---

## Project layout

```
mett/
├── src/
│   ├── index.ts            Entry point: Hono app + Bun server, error/404 handlers
│   ├── db.ts               Re-export barrel + CRUD for players/census/civs;
│   │                       getFullState() (precomputes per-player astStatus)
│   ├── civs.ts             Static civ data + official scenario tables
│   ├── types.ts            Shared TypeScript types (FullState, AstStatus, …)
│   ├── version.ts          Reads package.json + BUILD_SHA env → footer string
│   ├── ws.ts               WebSocket clients set + broadcast/sendInitialState
│   ├── client/
│   │   ├── civ.ts          Empire-page client source ┐ compiled to public/js/
│   │   └── admin.ts        Admin-page client source  ┘ via `bun run build:client`
│   ├── shared/
│   │   ├── ast-pure.ts     AGE_TABLE — the single source of A.S.T. rules — plus
│   │   │                   pure AST helpers shared by server + client bundles
│   │   ├── html.ts         escapeHtml (server views + client bundles)
│   │   └── scoring.ts      Pure scoring/sort helpers shared by server + client
│   ├── models/
│   │   ├── ast.ts          autoAdvanceAst (re-exports shared/ast-pure.ts)
│   │   └── game.ts         advanceRound, scoring, computeTieGroupMeta
│   ├── services/
│   │   ├── db.ts           initDb (schema, versioned migrations, civ seed,
│   │   │                   password seed), PLAYER_SELECT, _onReset, DB_PATH
│   │   └── password.ts     scrypt hashPassword / verifyPassword
│   ├── routes/
│   │   ├── api.ts          REST API routes (admin auth, input validation,
│   │   │                   public submissions)
│   │   └── pages.ts        Server-rendered pages (login + session cookie,
│   │                       login throttle, /admin, /:slug)
│   └── views/
│       ├── layout.ts       Base HTML shell (/vendor Pico + htmx, toast.js, api.js,
│       │                   ws-client.js, version footer)
│       ├── main.ts         Main display (5-section status grid)
│       ├── admin.ts        Admin (setup wizard / active game / game over)
│       └── civ.ts          Individual empire page (initial render only —
│                           updates flow from WS via civ.js)
├── public/
│   ├── css/style.css       Civ colour vars, Pico overrides, breakpoint sizing
│   └── js/
│       ├── ws-client.js    Shared WebSocket client (auto-reconnect)
│       ├── toast.js        Error toast helper (window.showToast)
│       ├── api.js          Shared mettPost helper (JSON + toast on error)
│       ├── main.js         Main page JS (asks ws-client for ping-only frames)
│       ├── admin.js        GENERATED from src/client/admin.ts ┐ committed build
│       └── civ.js          GENERATED from src/client/civ.ts   ┘ artifacts
│                           (`bun run build:client`). Never edit directly;
│                           tests/client-build.test.ts fails on drift
├── db/
│   └── schema.sql          Current schema (CREATE IF NOT EXISTS); no seed data —
│                           civs come from src/civs.ts, A.S.T. rules from
│                           src/shared/ast-pure.ts
├── docker/
│   ├── Dockerfile          Bun image (version from .bun-version); runs as the
│   │                       unprivileged `bun` user; HEALTHCHECK on /healthz
│   ├── entrypoint.sh       Hands the data volume to `bun`, drops privileges
│   ├── docker-compose.yml  Single mett service + Caddy; pin via $METT_VERSION
│   └── Caddyfile           One reverse-proxy block (demo.mett.games by default)
├── .github/
│   └── workflows/
│       ├── test.yml        CI: bun test, tsc, Playwright, yamllint/hadolint/shellcheck
│       └── build.yml       On push to main: runs test.yml, then builds + pushes
│                           ghcr.io/nilsan/mett (:latest, semver, short SHA)
├── .bun-version            The one pinned Bun version (CI + Docker)
├── playwright.config.ts    Browser-test config (testDir tests/browser/)
├── .yamllint               Project-wide yamllint config (line-length 140)
└── tests/
    ├── _helpers.ts         In-memory DB factories (via initDb) + DB helpers
    ├── ast.test.ts         A.S.T. requirement unit tests + golden age table
    ├── db.test.ts          initDb: fresh DB, legacy upgrade, idempotence
    ├── game.test.ts        Game flow integration (AST, LIA, ties,
    │                       advanceRound orchestration + census prune,
    │                       cities_phase reset, computeTieGroupMeta)
    ├── auth.test.ts        Login, change-password, isAdminAuthed, scrypt
    ├── password.test.ts    hashPassword / verifyPassword round-trip
    ├── api.test.ts         Auth middleware classification, /rank tie resolution,
    │                       input validation, secret + XSS regressions
    ├── ws.test.ts          broadcastState payload contract, per-player routing,
    │                       ping-only clients
    ├── client-build.test.ts Rebuilds src/client/{civ,admin}.ts and byte-compares
    │                       the committed bundles; Bun version pin in sync
    └── browser/            Playwright specs (self-managed :3100 instance)
        ├── fixtures.ts             Auto-seed fixture (fresh 18-player game)
        ├── layout.spec.ts          1080p / 4K layout regression
        ├── civ-viewport.spec.ts    Civ page fits phones/laptops + font scaling
        ├── admin.spec.ts           Admin page behaviour
        ├── civ-ast-strip.spec.ts   Civ-page A.S.T. strip layout
        ├── civ-live-update.spec.ts Civ-page live update preserves focus
        └── status-live.spec.ts     Status page gets ping-only WS frames
```

---

## Database schema

```sql
-- Static reference, upserted at startup from CIVS in src/civs.ts
CREATE TABLE civs (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,   -- official number 1–18
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,        -- URL path segment
  color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  def_region TEXT NOT NULL          -- "west" or "east"
);

-- One row; reset on new game
CREATE TABLE game (
  id INTEGER PRIMARY KEY DEFAULT 1,
  expert INTEGER NOT NULL DEFAULT 1,
  current_round INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 0,
  census_revealed INTEGER NOT NULL DEFAULT 0,
  is_final_round INTEGER NOT NULL DEFAULT 0,
  cities_phase INTEGER NOT NULL DEFAULT 0,
  admin_password TEXT,              -- scrypt hash; never selected into GameRow
  started_at TEXT
);

-- Active players for the current game
CREATE TABLE players (
  id INTEGER PRIMARY KEY,
  civ_id INTEGER NOT NULL REFERENCES civs(id),
  name TEXT NOT NULL,
  military INTEGER NOT NULL DEFAULT 0,
  wonder INTEGER NOT NULL DEFAULT 0,
  ast_level INTEGER NOT NULL DEFAULT 0,
  adv_points INTEGER NOT NULL DEFAULT 0,
  adv_1vp INTEGER NOT NULL DEFAULT 0,
  adv_3vp INTEGER NOT NULL DEFAULT 0,
  adv_6vp INTEGER NOT NULL DEFAULT 0,
  region TEXT NOT NULL,
  rank_order INTEGER NOT NULL DEFAULT 0,
  late_iron_age_bonus INTEGER NOT NULL DEFAULT 0
);

-- One row per player per round
CREATE TABLE census (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  population INTEGER,               -- NULL until submitted
  city_count INTEGER,               -- NULL until submitted; re-entered post-calamity
  submitted_at TEXT,
  UNIQUE(player_id, round)
);
```

---

## REST API

All mutating endpoints require the `mett_admin` session cookie (an opaque random token issued by `POST /login`; only its SHA-256 is stored, in `admin_sessions`, and all sessions are cleared on a password change). Player census and city-count submissions are public (players act on their own pages without admin access).

Requests are validated at the boundary: malformed JSON → `400`, unknown player → `404`, census/city-count/move with no game running → `409`, city count before the census is revealed → `409`. Errors are always `{ "error": "…" }`.

```
GET  /api/state                    Full game state
GET  /api/civs                     All 18 empires (for admin setup)
GET  /api/setup-recommendations    West/East/Combined scenarios by player count
POST /api/game/start               Start game {expert, players:[{civ_id,name,region}]}
POST /api/game/round/next          Advance to next round (backup taken first)
POST /api/game/round/undo          Undo the last round advance (restores the backup from before it)
GET  /api/backups                  [ADMIN] List backups + the undo candidate
POST /api/backups/restore          [ADMIN] Restore a backup {file}
POST /api/game/reset               Reset game {confirm} (backup taken first)
POST /api/game/cities/clear        Clear city counts, enter post-calamity phase
POST /api/census/reveal            Force census reveal
POST /api/players/:id/census       Submit census {population}   (public)
POST /api/players/:id/city-count   Update city count {city_count}  (public)
POST /api/players/:id/military     Toggle Military advance       (public)
POST /api/players/:id/wonder       Toggle Wonder of the World    (public)
POST /api/players/:id/adv          Set Advance cards {adv_1vp, adv_3vp, adv_6vp}  (public)
POST /api/players/:id/ast          Set A.S.T. level {level}
POST /api/players/:id/name         Rename player {name}
POST /api/players/:id/rank         Set tie-break rank {rank_order, …}
POST /api/players/:id/late-iron-age-bonus  Grant/revoke 5 VP LIA bonus
POST /api/debug/simulate           [DEV] Simulate N rounds
POST /api/debug/census             [DEV] Randomise current-round census
POST /api/debug/cities             [DEV] Randomise current-round cities
POST /api/debug/advances           [DEV] Simulate advance purchases
POST /api/debug/set-round          [DEV] Jump to round N
```

Endpoints marked (public) are callable without the admin cookie so players can submit from their own page. All others require the `mett_admin` session cookie.

Every mutating endpoint broadcasts a `state_update` WebSocket event after writing to the database.

---

## WebSocket

- Endpoint: `/ws`
- The server tracks all connected clients in `src/ws.ts`.
- On client `open`, the server immediately sends one `state_update` so reconnecting tabs are fresh without waiting for the next mutation.
- Clients identify with `{ "type": "identify", "playerId": n|null, "ping": bool }`. Ping-only clients (the status page, which re-fetches HTML and never reads the JSON) receive `{ "type": "state_changed" }` instead of the full state.
- After any state-changing API call the server broadcasts:
  ```json
  { "type": "state_update", "data": { ...fullGameState, "targetPlayerId": null|number } }
  ```
  `fullGameState` includes `astStatus` (per-player advance/stay/regress prediction, computed once in `getFullState()`) so the WS payload and page renders agree on the same map.
- `public/js/ws-client.js` handles reconnection with exponential backoff and dispatches `mett:state` (every event) and `mett:my-state` (only when the event affects this client's player, or is global).

### Status page on the TV

`public/js/main.js` holds a Screen Wake Lock while the status page is visible (re-taken after the tab returns and on any click), so the display computer doesn't dim or sleep mid-game; it needs a secure origin (HTTPS or localhost). A ⛶ button at the right end of the status header toggles full screen where the browser supports it. Both are covered by `tests/browser/status-tv.spec.ts` with stubbed browser APIs.

### How pages consume the WS feed

| Page | First paint | Updates |
|---|---|---|
| `/` (status display) | Server-rendered | HTMX swap of `#main-content` on every `mett:state` (ping-only WS frames) |
| `/admin` | Server-rendered | In-place DOM patch on `mett:state` in `admin.js` (TypeScript source `src/client/admin.ts`) (sub-prog bar, AST status dots, census/city icons, LIA stars, mil/won classes). Five reloads remain by design — round transitions and setup ↔ active page-shape changes |
| `/<slug>` (player) | Server-rendered (`renderCivFragment`) | **Full client-side render from WS state** in `civ.js`'s `renderFromState()`. No HTMX swap → focused inputs and scroll position are preserved. The client is TypeScript (`src/client/civ.ts`, compiled to `public/js/civ.js` by `bun run build:client`) and imports the same pure helpers (`compareScores`, `playerTotalVp`, `getCivAstProfile`, etc.) from `src/shared/` as the server, so the leaderboard sort and requirement-row formatting are identical by construction |

---

## Move order logic

```
sort players by:
  1. military ASC    (non-military moves first)
  2. population DESC (highest population moves first within each group)
```

Census is hidden from all clients until every player in the game has submitted, at which point the server reveals it and the sort order updates live.

---

## A.S.T. advancement

A.S.T. rules live in one place: `AGE_TABLE` in `src/shared/ast-pure.ts`. Each age lists its board squares and the structured requirement (cities, advance counts by tier, VP totals) to move onto them, per mode; the requirement to advance from level L is that of the age holding L+5. Legends, tooltips, the player-page checklist and the rule checks are all derived from it, and per-civ era shifts come from `getCivAstProfile` in `src/civs.ts`. Auto-advancement runs server-side after each VP or city-count update: if a player meets the next level's requirements they are automatically bumped up. In Expert mode, a player with 0 effective cities outside the Stone Age automatically regresses one level.

Each round has a two-phase city count: players submit a pre-trade count, then re-submit a post-calamity count after calamities resolve. The post-calamity count is what drives A.S.T. checks. The admin uses "Prepare for A.S.T." to transition between phases.

The Wonder of the World grants +1 effective city toward all A.S.T. requirements (advancement and regression checks), but does not count as a city for final VP scoring.

---

## Running locally (without Docker)

**Prerequisites:** [Bun](https://bun.sh) — the version in `.bun-version` (CI and the Docker image use exactly that one)

```bash
bun install
bun run dev          # starts with --watch auto-reload on file changes
```

The server listens on **http://localhost:3000** by default.

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `./data/mett.db` | Path to the SQLite database file |
| `PORT` | `3000` | Port the HTTP server listens on |
| `ADMIN_PASSWORD` | `PASSWORD` | Seeded on first boot; persisted in DB and changeable from the admin UI |
| `NODE_ENV` | — | `production` (set in the image) skips writing the dev `.pid` file |

---

## Tests

Test workflow has two layers: fast unit/integration in Bun (always), and browser checks in Playwright (on demand; self-managed test instance on `:3100`).

### Unit and integration tests (Bun)

```bash
bun run test          # tests/*.test.ts only — does not pick up Playwright specs
bunx tsc --noEmit     # TypeScript strict check
```

Everything in `tests/*.test.ts` runs against an in-memory SQLite DB (`_setTestDb()` from `services/db.ts` for isolation):

- `tests/ast.test.ts` — A.S.T. requirement unit tests (all level transitions, Expert vs Basic, Wonder bonus, slow-start civs) and a golden check that `AGE_TABLE` reproduces the historical per-level requirements.
- `tests/db.test.ts` — `initDb` on a fresh DB, an upgrade from a pre-versioning legacy DB (columns added, `ast_levels` dropped, plaintext password hashed), and idempotence.
- `tests/game.test.ts` — `autoAdvanceAst`, `checkAndSetLateIronAgeBonus`, `checkAndSetFinalRound`, `playerTotalVp`, `sortCensusOrder`, `computeTieGroupMeta`, `advanceRound` orchestration (basic LIA end, expert `is_final_round` flag, `cities_phase`/`census_revealed` reset) + census prune, static-row cache reset.
- `tests/auth.test.ts` — Login flow (correct / wrong / **empty** — regression for the bypass fix), `verifyAdminPassword`, `setAdminPassword` (hashing + reject empty), `isAdminAuthed` session validation (expiry, password-as-cookie rejected), `Secure` flag behind HTTPS, the per-client login throttle, `isUsingDefaultPassword`, `/admin/change-password` (logs out other sessions). Drives Hono in-process via `app.request()`.
- `tests/password.test.ts` — `hashPassword` / `verifyPassword` / `isLegacyPlaintext` round-trips.
- `tests/api.test.ts` — API auth middleware classification (GET-bypass, public-action whitelist, admin-only POSTs return 401), `POST /api/players/:id/rank` sibling-clear + auto-resolve, `WEST_SCENARIOS`/`EAST_SCENARIOS`/`SETUP_RECOMMENDATIONS` shape, input validation (400/404/409), no password hash in `/api/state`, and HTML-escaped player names on every page.
- `tests/ws.test.ts` — `broadcastState` payload contract (`game`/`players`/`census`/`astStatus`/`targetPlayerId`, never the password hash), per-player routing (targeted broadcast skips civ-page sockets owned by other players; non-civ sockets and the targeted player's own tabs always receive) and ping-only clients.
- `tests/client-build.test.ts` — rebuilds `src/client/civ.ts` and `src/client/admin.ts` and byte-compares the committed bundles, so a forgotten `bun run build:client` fails the suite instead of shipping a stale page; also checks the Dockerfile's Bun version matches `.bun-version`.

Every `tests/*.test.ts` file runs (new files are picked up automatically) and all must pass before committing. The full suite (~270 tests) runs in ~5 s; the cost is dominated by scrypt operations (every test DB seeds a hashed admin password) — that's intentional.

### Browser tests (Playwright)

Self-contained — no dev server needed. Playwright's `webServer` config boots a dedicated me[tt] instance on `:3100` with a throwaway DB (`data/mett-test.db`, gitignored), and an auto-applied fixture seeds a fresh 18-player Expert game before every test via `/api/debug/simulate`. Your `:3000` dev session is never touched. Locally an existing `:3100` instance is reused; CI always starts fresh.

```bash
bun run test:browser  # bunx playwright test
```

Specs live under `tests/browser/`:

- `layout.spec.ts` — at 1080 p and 4 K, asserts the main display fits without overflow and shows 18 leaderboard rows.
- `civ-viewport.spec.ts` — civ page fits without overflow across the modern phone fleet (375×667 legacy through 440×956) and 1366×768, plus OS font-scaling cases via CDP: Pixel 8 at 1.3× must fit entirely; at 2.0× vertical scroll is allowed but horizontal never is.
- `admin.spec.ts` — admin page behaviour.
- `civ-ast-strip.spec.ts` — civ-page A.S.T. strip layout.
- `civ-live-update.spec.ts` — proves the civ page's live update preserves focus on a typed input, and that `#civ-content` is not swapped on state events.
- `status-live.spec.ts` — the status page receives payload-free `state_changed` frames and re-fetches its HTML on each.

The seed fixture logs its request context in through `POST /login` (`adminLogin()` in `fixtures.ts`).

For one-off measurements (CSS layout debugging, click-and-verify smoke) use `bun -e` with the Playwright API directly — see `CLAUDE.md` for the pattern.

### Screenshot tests

`tests/browser/visual.spec.ts` renders a seeded 18-player game (`seed: 42` on the debug endpoints) and compares the status board (1920×1080, 3840×2160), the admin page and a player page on a phone pixel-exactly with the PNGs in `tests/browser/visual.spec.ts-snapshots/`. The version stamp and the backup list are masked. Accept an intended change with `bunx playwright test tests/browser/visual.spec.ts --update-snapshots`. Skipped on CI: the runners render the system font differently from the machine the baselines come from.

### Continuous integration

`.github/workflows/test.yml` runs four jobs in parallel on every PR, and — via `workflow_call` from `build.yml` — on every push to `main`:

| Job | Command | Purpose |
|---|---|---|
| `bun test` | `bun run test` | Unit + integration suite (`tests/*.test.ts` glob; `tests/browser/` excluded) |
| `tsc --noEmit` | `bunx tsc --noEmit` | TypeScript strict typecheck |
| `playwright` | `bun run test:browser` | Browser suite against a fresh `:3100` instance |
| `lint` | yamllint, `hadolint-action@v3.5.0`, shellcheck | Workflows/compose, Dockerfile, `docker/entrypoint.sh` |

`build.yml` only builds and pushes the image after every job above passes. All jobs use the Bun version in `.bun-version`. Concurrency groups cancel in-flight runs when a new push lands on the same ref.

`.yamllint` at the repo root relaxes line-length to 140 and keeps the rest of yamllint's defaults, including the `truthy` check that makes us quote `"on":` in workflow files.

---

## Versioning

me[tt] follows [semantic versioning](https://semver.org). The version lives in `package.json`, shows in the page footer (with the build SHA), and becomes the Docker image tags. Every push to `main` publishes an image, so **every commit that changes behaviour is a release**: bump the version in that same commit and put it in the subject, e.g. `fix(ui): … (1.0.1)`.

The "public API" is what operators and players rely on: the compose file, environment variables, volume and port; player and admin URLs (bookmarks); and that an upgrade is just *pull and restart*.

| Bump | When | Examples |
|---|---|---|
| **Major** `x.0.0` | Upgrading needs manual work, or breaks something people rely on | Compose/env/volume/port change; player URLs change; a DB change that can't migrate automatically; dropping an advertised feature |
| **Minor** `1.x.0` | New features or visible changes; upgrade is still pull-and-restart | New feature or redesign; any new entry in `MIGRATIONS` (rolling back past it is unsafe); dropping support for a screen size |
| **Patch** `1.0.x` | Fixes with no new behaviour and no schema change | Bug fixes, styling tweaks, dependency patch updates |

Commits that change no shipped behaviour (tests, CI, docs only) need no bump. Tag what you deploy (`git tag v1.0.0`) so `git log v1.0.0..main` shows exactly what is not yet live.

## Deployment

The shipped compose file runs a single me[tt] instance behind Caddy. The public demo at `demo.mett.games` runs from this exact configuration. Game data persists in the `mett_data` named Docker volume on the host.

**Backups.** Before every round advance, game start, reset (including the debug simulation) and restore, the server writes a full copy of the database with SQLite's `VACUUM INTO` to `<db name>-backups/` next to the database (`/app/data/mett-backups/` in the container; override with `BACKUP_DIR`). The newest 30 are kept. The admin page lists them under **Backups** with a Restore button each, and shows **↶ Undo round advance** whenever a backup from right before the current round exists. A restore copies back the game state only (game row, players, census) — the admin password and sessions stay — and takes a backup first, so it can itself be undone. A failed backup is logged but never blocks the game.

### Bring it up

```bash
docker compose -f docker/docker-compose.yml pull   # from ghcr.io/nilsan/mett:${METT_VERSION:-latest}
docker compose -f docker/docker-compose.yml up -d
```

### Pin a version

The `image:` line in compose is `ghcr.io/nilsan/mett:${METT_VERSION:-latest}`. In production, pin:

```bash
METT_VERSION=1.2.3 docker compose -f docker/docker-compose.yml pull
METT_VERSION=1.2.3 docker compose -f docker/docker-compose.yml up -d
```

`build.yml` publishes `:<version>`, `:<major>.<minor>` and `:<major>` tags from `package.json` alongside `:latest` and `:<short-sha>`. Default of `:latest` is fine for the demo / dev; production should pin — `METT_VERSION=1` follows every compatible release (see [Versioning](#versioning)).

The container starts as root only long enough for `docker/entrypoint.sh` to `chown` the data volume to the `bun` user (volumes from older, root-run images hold root-owned files), then runs the server unprivileged. `HEALTHCHECK` polls `/healthz`, and Caddy waits for it before starting.

### Multi-instance / multi-game on one host

Duplicate the `mett` service in `docker-compose.yml` under different names with separate volume mounts, and add a Caddyfile block per hostname. Each instance is fully independent — separate database, separate game.

The `nilsan/mett-deploy` private repo is one example of this pattern (four named instances behind a wildcard Caddy config). It's not part of the public repo; this is the setup you'd build on top.

### Local-build fallback

When GHCR is unreachable, the compose file's `build:` block still works:

```bash
BUILD_SHA=$(git rev-parse --short HEAD) docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
```

The image carries the commit SHA via the `BUILD_SHA` build arg → `ENV`, which `src/version.ts` reads into the footer. CI's `build.yml` sets the same arg from the commit's short SHA on every build, and passes `BUN_VERSION` from `.bun-version`.

### Tailing logs

```bash
docker compose -f docker/docker-compose.yml logs -f mett
docker compose -f docker/docker-compose.yml logs -f caddy
```

### Local Docker testing

You don't need Docker for local development — `bun run dev` is faster. If you do want to test the production-shaped setup locally:

```bash
docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml down
```

Caddy in the compose file expects a real DNS name (`demo.mett.games` by default), so it won't issue certificates locally — either strip the `caddy` service and add `ports: - "3000:3000"` to `mett`, or change the Caddyfile to use a local hostname with `tls internal` for a self-signed cert.

---

## Responsive layout

The status page uses a CSS Grid layout in `public/css/style.css`. Supported sizes are **phones** and **1920×1080 at 100 % scaling and up**; everything in between (tablets, laptops, 1080p at 125 %) is out of scope.

| Breakpoint | Viewport | Layout |
|---|---|---|
| Phone | ≤ 700 px | Single column; the page scrolls table by table |
| Default | ≥ 700 px (supported from 1920×1080) | 5-column grid (census, trade, A.S.T. order, timeline, leaderboard), viewport-locked, never scrolls |
| 1080p admin | 1200 px ≤ width < 2560 px | `(min-width: 75em) and (max-width: 159.99em)` block tightens admin row density so 18 players fit at 1920×1080 without compromising WQHD |
| WQHD | ≥ 2560 px (`160rem`) | Larger row heights, bigger fonts (TV target) |
| 4K widths | ≥ 3072 px (`192rem`) | 13 rem empire cells |
| 4K rows | ≥ 3072 px wide **and** ≥ 1840 px tall (`115rem`) | Re-values the board type tokens (taller rows, bigger type). Height-gated: 4K at 125 % OS scaling is 3072×~1600 and must keep the base rows to fit |

**Board type scale.** Row height, name/player/number/header sizes are `--board-*` tokens on `.status-grid` (vh-based clamps, end of `style.css`); breakpoints only re-value the `*-base` tokens. **Smaller games fill the board:** `main.ts` sets `--players` on `.status-grid`; rows grow by 18 ÷ players (up to 3×), civ names up to 1.3× and numbers up to 1.15× (lower caps at 4K, where the type already fills the columns); player names keep their size. `layout.spec.ts` checks 6 and 12 players at 1080p and 4K. Trade-card chips are sized from `--board-row`, so a trade row can never be taller than the other tables' rows. **Calm components** (panels, striped tables, the `.civ-num` empire badge, colour tokens such as `--mett-text`, `--mett-stripe`, `--radius-panel`) are shared by every page — change the token, not per-page copies. The app font is the platform UI font (`--mett-font`); a condensed web font was tried and dropped as blurry on desktop monitors.

`rem` values in media queries use the browser default font size (16 px), not Pico's fluid root font size (~21 px at 1920 px). Keep this in mind when editing breakpoints. The status grid hides overflow, so clipping never shows up as a scrollbar — `tests/browser/layout.spec.ts` checks that every panel ends inside the viewport and rows are equally tall across tables at 1920×1080, 2560×1440, 3072×1600, 3440×1440, 3840×2160 and 5120×2160 — each both with an empty trade table and with 9 trade cards per empire (the tallest case).

### Per-page viewport targets

Layout work must respect this hierarchy — captured here so future tightening doesn't accidentally compromise the primary read target.

| Page | Primary | Must work | Out of scope |
|---|---|---|---|
| Status display (`/`) | WQHD / 4K (TV) | Phones (scrolls table by table); 1920×1080 at 100 % and up (never scrolls) | Tablets, laptops, anything between phone and 1080p |
| Admin (`/admin`) | WQHD / 4K (TV) | Phones; 1920×1080 at 100 % and up | Anything between phone and 1080p |
| Player page (`/<slug>`) | Modern phones incl. large OS fonts | Phones; never scrolls horizontally | Wide desktop is fine but not optimised for |

When tightening density to fit a smaller viewport, scope the change inside a media query so WQHD/4K density stays untouched. The 1080p admin block above is a worked example of the pattern.

---

## License

MIT — Copyright © 2026 [Nils-Anders Nøttseter](https://github.com/nilsan)
