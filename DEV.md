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
| CSS | **Pico CSS + custom** | Dark-mode baseline out of the box; small footprint (~10 KB) |
| Frontend JS | **Vanilla JS + HTMX** | No framework needed at this scale; HTMX for first-paint fragments |
| Browser tests | **Playwright** | Auto-wait, browser bundled, TypeScript-native (replaced Selenium) |
| Container | **Docker + Docker Compose** | Volume-mounted SQLite for persistence |
| TLS | **Caddy** | Automatic Let's Encrypt certificates, bundled in compose |
| CI | **GitHub Actions** | bun test + tsc + ansible-lint + yamllint + hadolint on every push |
| Deployment | **Ansible** | Idempotent `docker compose pull` from GHCR + recreate, automatic post-deploy smoke test (no git pull on remote — image-only swap) |

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
│   ├── models/
│   │   ├── ast.ts          AST requirement parsing, advancement, tier helpers
│   │   └── game.ts         advanceRound, scoring, computeTieGroupMeta
│   ├── services/
│   │   ├── db.ts           Raw SQLite connection, schema + migrations,
│   │   │                   PLAYER_SELECT, _onReset cache hooks, DB_PATH
│   │   └── password.ts     scrypt hashPassword / verifyPassword
│   ├── routes/
│   │   ├── api.ts          REST API routes (admin auth + public submissions)
│   │   └── pages.ts        Server-rendered pages (login, /admin, /:slug)
│   └── views/
│       ├── layout.ts       Base HTML shell (Pico, htmx, toast.js, api.js,
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
│       ├── main.js         Main page JS (HTMX swap entry-point)
│       ├── admin.js        Admin page JS (in-place updates from mett:state)
│       └── civ.js          Empire page JS (full client-side render from
│                           WS state — no HTMX swap, preserves focus)
├── db/
│   └── schema.sql          Schema + seed data (civs and A.S.T. levels)
├── docker/
│   ├── Dockerfile          Bun image; ARG BUILD_SHA → ENV
│   ├── docker-compose.yml  Single mett service + Caddy; pin via $METT_VERSION
│   └── Caddyfile           One reverse-proxy block (demo.mett.games by default)
├── .github/
│   └── workflows/
│       ├── test.yml        CI: bun test + tsc + ansible-lint + yamllint + hadolint
│       └── build.yml       Builds + pushes ghcr.io/nilsan/mett:latest on push to main
├── playwright.config.ts    Browser-test config (testDir tests/browser/)
├── .yamllint               Project-wide yamllint config (line-length 140)
└── tests/
    ├── _helpers.ts         Shared schema/migration/AST-seed factory + DB helpers
    ├── ast.test.ts         A.S.T. requirement unit tests
    ├── game.test.ts        Game flow integration (AST, LIA, ties,
    │                       advanceRound orchestration + census prune,
    │                       cities_phase reset, computeTieGroupMeta)
    ├── auth.test.ts        Login, change-password, isAdminAuthed, scrypt
    ├── password.test.ts    hashPassword / verifyPassword round-trip
    ├── api.test.ts         Auth middleware classification, /rank tie resolution,
    │                       static civ scenario shape
    ├── ws.test.ts          broadcastState payload contract + per-player routing
    ├── simulate.py         Python end-to-end against a live server (legacy)
    └── browser/            Playwright specs (require running dev server)
        ├── layout.spec.ts          1080p / 4K layout regression
        └── civ-live-update.spec.ts Civ-page live update preserves focus
```

---

## Database schema

```sql
-- Static reference, seeded at startup
CREATE TABLE civs (
  id INTEGER PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,   -- official number 1–18
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,        -- URL path segment
  color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  def_region TEXT NOT NULL          -- "west" or "east"
);

CREATE TABLE ast_levels (
  level INTEGER PRIMARY KEY,        -- 0, 5, 10 … 80
  era TEXT NOT NULL,
  basic_req TEXT,
  expert_req TEXT,
  basic_req_json TEXT,              -- structured AstRequirement
  expert_req_json TEXT
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
  admin_password TEXT,
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

All mutating endpoints require the `mett_admin` session cookie. Player census and city-count submissions are public (players act on their own pages without admin access).

```
GET  /api/state                    Full game state
GET  /api/civs                     All 18 empires (for admin setup)
GET  /api/setup-recommendations    West/East/Combined scenarios by player count
POST /api/game/start               Start game {expert, players:[{civ_id,name,region}]}
POST /api/game/round/next          Advance to next round
POST /api/game/reset               Reset game {confirm}
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
- After any state-changing API call the server broadcasts:
  ```json
  { "type": "state_update", "data": { ...fullGameState, "targetPlayerId": null|number } }
  ```
  `fullGameState` includes `astStatus` (per-player advance/stay/regress prediction, computed once in `getFullState()`) so the WS payload and page renders agree on the same map.
- `public/js/ws-client.js` handles reconnection with exponential backoff and dispatches `mett:state` (every event) and `mett:my-state` (only when the event affects this client's player, or is global).

### How pages consume the WS feed

| Page | First paint | Updates |
|---|---|---|
| `/` (status display) | Server-rendered | HTMX swap of `#main-content` on every `mett:state` |
| `/admin` | Server-rendered | In-place DOM patch on `mett:state` (sub-prog bar, AST status dots, census/city icons, LIA stars, mil/won classes). Five reloads remain by design — round transitions and setup ↔ active page-shape changes |
| `/<slug>` (player) | Server-rendered (`renderCivFragment`) | **Full client-side render from WS state** in `civ.js`'s `renderFromState()`. No HTMX swap → focused inputs and scroll position are preserved. Pure helpers (`compareScores`, `playerTotalVp`, `getCivAstProfile`, etc.) are mirrored in JS to keep the leaderboard sort and requirement-row formatting identical to the server |

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

A.S.T. level requirements are stored as structured data in `src/models/ast.ts` (not freeform text). Each level specifies minimum cities, minimum Advance VP, and minimum count of ≥100 VP and ≥200 VP advances. Auto-advancement runs server-side after each VP or city-count update: if a player meets the next level's requirements they are automatically bumped up. In Expert mode, a player with 0 effective cities outside the Stone Age automatically regresses one level.

Each round has a two-phase city count: players submit a pre-trade count, then re-submit a post-calamity count after calamities resolve. The post-calamity count is what drives A.S.T. checks. The admin uses "Prepare for A.S.T." to transition between phases.

The Wonder of the World grants +1 effective city toward all A.S.T. requirements (advancement and regression checks), but does not count as a city for final VP scoring.

---

## Running locally (without Docker)

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.0

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

---

## Tests

Test workflow has three layers: fast unit/integration in Bun (always), browser checks in Playwright (on demand against the dev server), and a legacy Python simulator (when changing game logic).

### Unit and integration tests (Bun)

```bash
bun run test          # tests/*.test.ts only — does not pick up Playwright specs
bunx tsc --noEmit     # TypeScript strict check
```

Everything in `tests/*.test.ts` runs against an in-memory SQLite DB (`_setTestDb()` from `services/db.ts` for isolation):

- `tests/ast.test.ts` — A.S.T. requirement unit tests (all level transitions, Expert vs Basic, Wonder bonus, slow-start civs).
- `tests/game.test.ts` — `autoAdvanceAst`, `checkAndSetLateIronAgeBonus`, `checkAndSetFinalRound`, `playerTotalVp`, `sortCensusOrder`, `computeTieGroupMeta`, `advanceRound` orchestration (basic LIA end, expert `is_final_round` flag, `cities_phase`/`census_revealed` reset) + census prune, static-row cache reset.
- `tests/auth.test.ts` — Login flow (correct / wrong / **empty** — regression for the bypass fix), `verifyAdminPassword`, `setAdminPassword` (hashing + reject empty), `isAdminAuthed` cookie validation, `isUsingDefaultPassword`, `/admin/change-password`. Drives Hono in-process via `app.request()`.
- `tests/password.test.ts` — `hashPassword` / `verifyPassword` / `isLegacyPlaintext` round-trips.
- `tests/api.test.ts` — API auth middleware classification (GET-bypass, public-action whitelist, admin-only POSTs return 401), `POST /api/players/:id/rank` sibling-clear + auto-resolve, `WEST_SCENARIOS`/`EAST_SCENARIOS`/`SETUP_RECOMMENDATIONS` shape.
- `tests/ws.test.ts` — `broadcastState` payload contract (`game`/`players`/`census`/`astLevels`/`astStatus`/`targetPlayerId`) and per-player routing (targeted broadcast skips civ-page sockets owned by other players; non-civ sockets and the targeted player's own tabs always receive).

All six files must pass before committing. The full suite (~163 tests) runs in ~2.5 s; the cost is dominated by scrypt operations in `auth.test.ts` — that's intentional.

### Browser tests (Playwright)

Require the dev server running on `:3000`.

```bash
bun run test:browser  # bunx playwright test
```

Specs live under `tests/browser/`:

- `layout.spec.ts` — at 1080 p and 4 K, asserts the main display fits without overflow and shows 18 leaderboard rows.
- `civ-live-update.spec.ts` — proves the civ page's live update preserves focus on a typed input, and that `#civ-content` is not swapped on state events.

For one-off measurements (CSS layout debugging, click-and-verify smoke) use `bun -e` with the Playwright API directly — see `CLAUDE.md` for the pattern.

### End-to-end simulation (Python, legacy)

Requires the dev server. Predates the Bun/Playwright suites; kept around for full-game smoke testing.

```bash
python3 tests/simulate.py
```

Runs 3 complete games over the HTTP API in ~30 s, exercising census flow, move order, A.S.T. progression, Wonder logic, LIA bonuses, final scoring. Useful when touching game-logic primitives. Admin password override:

```bash
METT_ADMIN_PASSWORD=secret python3 tests/simulate.py
```

### Continuous integration

`.github/workflows/test.yml` runs four jobs in parallel on every push to `main` and every PR:

| Job | Command | Purpose |
|---|---|---|
| `bun test` | `bun run test` | Unit + integration suite (`tests/*.test.ts` glob; `tests/browser/` excluded) |
| `tsc --noEmit` | `bunx tsc --noEmit` | TypeScript strict typecheck |
| `yamllint` | over `.github/workflows/`, `docker/docker-compose.yml` | YAML formatting / structure |
| `hadolint` | `hadolint-action@v3.1.0` on `docker/Dockerfile` | Dockerfile best practices |

Concurrency group cancels in-flight runs when a new push lands on the same ref. Five-minute timeout per job. Browser tests stay local-only — they need a live server.

`.yamllint` at the repo root relaxes line-length to 140 and keeps the rest of yamllint's defaults, including the `truthy` check that makes us quote `"on":` in workflow files.

---

## Deployment

The shipped compose file runs a single me[tt] instance behind Caddy. The public demo at `demo.mett.games` runs from this exact configuration. Game data persists in the `mett_data` named Docker volume on the host.

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

(Once 1.0.0 ships, `:1.2.3` / `:1.2` / `:1` semver tags become available alongside `:latest`. Default of `:latest` is fine for the demo / dev; production should pin.)

### Multi-instance / multi-game on one host

Duplicate the `mett` service in `docker-compose.yml` under different names with separate volume mounts, and add a Caddyfile block per hostname. Each instance is fully independent — separate database, separate game.

The `nilsan/mett-deploy` private repo is one example of this pattern (four named instances behind a wildcard Caddy config). It's not part of the public repo; this is the setup you'd build on top.

### Local-build fallback

When GHCR is unreachable, the compose file's `build:` block still works:

```bash
BUILD_SHA=$(git rev-parse --short HEAD) docker compose -f docker/docker-compose.yml build
docker compose -f docker/docker-compose.yml up -d
```

The image carries the commit SHA via the `BUILD_SHA` build arg → `ENV`, which `src/version.ts` reads into the footer. CI's `build.yml` sets the same arg from `${{ github.sha }}`'s short form on every build.

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

The status page uses a CSS Grid layout that adapts across five breakpoints defined in `public/css/style.css`:

| Breakpoint | Viewport | Layout |
|---|---|---|
| Default | ≥ 700 px | 5-column grid (leaderboard, census, trade, AST board, AST order) |
| 1080p admin | 1200 px ≤ width < 2560 px | `(min-width: 75em) and (max-width: 159.99em)` block tightens admin row density so 18 players fit at 1920×1080 without compromising WQHD |
| WQHD | ≥ 2560 px (`160rem`) | Larger row heights, bigger fonts (TV target) |
| 4K @ 1.25× | ≥ 3072 px (`192rem`) | 9 rem empire cells, even larger fonts |
| Tablet | ≤ 700 px | Single column |

`rem` values in media queries use the browser default font size (16 px), not Pico's fluid root font size (~21 px at 1920 px). Keep this in mind when editing breakpoints.

### Per-page viewport targets

Layout work must respect this hierarchy — captured here so future tightening doesn't accidentally compromise the primary read target.

| Page | Primary | Minimum | Out of scope |
|---|---|---|---|
| Status display (`/`) | WQHD / 4K (TV) | 1920×1080 | < 1080p |
| Admin (`/admin`) | WQHD / 4K (TV) | 1920×1080 | 1280×720 laptop |
| Player page (`/<slug>`) | Phone (≈ 411×731 portrait) | Tablet | Wide desktop is fine but not optimised for |

When tightening density to fit a smaller viewport, scope the change inside a media query so WQHD/4K density stays untouched. The 1080p admin block above is a worked example of the pattern.

---

## License

MIT — Copyright © 2026 [Nils-Anders Nøttseter](https://github.com/nilsan)
