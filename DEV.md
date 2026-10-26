# me[tt] — Developer Guide

How me[tt] is built, run, tested and released. For using it see [README.md](README.md); for the game rules it implements see [RULES.md](RULES.md); for how to send a change see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | **Bun** (version pinned in `.bun-version`) | SQLite, WebSockets and TypeScript built in; no build step for the server |
| Web framework | **Hono** | Small, TypeScript-first, runs on Bun |
| Database | **bun:sqlite**, one file per game | No database server; a game is one file you can copy |
| Pages | Server-rendered HTML, **htmx** on the status board, small TypeScript bundles on the player and admin pages | No front-end framework needed at this size |
| CSS | **Pico CSS** plus one shared `public/css/style.css` | Dark baseline; Pico and htmx are served from `node_modules`, no CDN |
| Passwords | `node:crypto` scrypt | No extra dependency |
| Tests | `bun test`, **Playwright** | Unit, integration, whole-game simulations; real-browser layout and screenshot checks |
| Container | Docker, Compose, **Caddy** for HTTPS | Automatic certificates; one container per game |
| CI | GitHub Actions | Every push is tested; the image is published only when everything passes |

---

## Project layout

```
mett/
├── src/
│   ├── index.ts            Server entry: Hono app, static files, /healthz, WebSocket upgrade
│   ├── db.ts               Data access for players, census, civs; getFullState()
│   ├── civs.ts             CIVS (the 18 empires), scenario tables, per-empire A.S.T. rows
│   ├── types.ts            Shared types (PlayerRow, FullState, …)
│   ├── version.ts          Version string for the header (package.json + BUILD_SHA)
│   ├── ws.ts               WebSocket clients and broadcasts
│   ├── shared/             Pure code used by both the server and the browser bundles
│   │   ├── ast-pure.ts     AGE_TABLE, the single source of A.S.T. rules, and helpers
│   │   ├── scoring.ts      Totals, tie-breaks, move order
│   │   └── html.ts         escapeHtml
│   ├── models/
│   │   ├── ast.ts          autoAdvanceAst: moves every marker at the end of a round
│   │   └── game.ts         Start, reset, advance a round, final round, LIA bonus, round summaries
│   ├── services/
│   │   ├── db.ts           initDb: schema, MIGRATIONS, civ data, admin password
│   │   ├── backup.ts       Backups (VACUUM INTO), restore, undo
│   │   ├── password.ts     scrypt hashing
│   │   ├── simulate.ts     Seeded fake games (debug endpoints, demo, tests)
│   │   └── demo.ts         Demo mode (DEMO=1)
│   ├── routes/
│   │   ├── api.ts          REST API
│   │   └── pages.ts        Pages, login and sessions
│   ├── views/              HTML for the layout, status board (main.ts), admin and player pages
│   └── client/             Browser TypeScript for the player (civ.ts) and admin pages
├── public/
│   ├── css/style.css       The one stylesheet for every page
│   └── js/                 Small hand-written scripts, plus civ.js and admin.js, which are
│                           built from src/client/ and committed (see Client bundles)
├── db/schema.sql           The current database shape (CREATE IF NOT EXISTS)
├── docker/                 Dockerfile, entrypoint.sh, docker-compose.yml, Caddyfile
├── scripts/
│   ├── css-usage.ts        Fails if style.css has a selector no page uses
│   └── screenshots.ts      Regenerates the README screenshots in docs/img/
├── tests/                  bun tests (*.test.ts) and Playwright specs (browser/)
└── .github/                CI workflows, issue templates, FUNDING.yml
```

---

## How it works

### One game per instance

Each me[tt] instance runs one game, stored in one SQLite file (`DATABASE_PATH`). Several tables means several instances, for example one container and subdomain each. The tables are:

| Table | Holds |
|---|---|
| `civs` | The 18 empires, refreshed from `CIVS` at every boot |
| `game` | One row: mode, round, phase flags, the admin password hash |
| `players` | The empires in this game: player name, A.S.T. square, advance cards, Military, Wonder, special ability, tie-break rank, LIA bonus |
| `census` | Population and city count per player per round. Older rounds are pruned when a round advances |
| `admin_sessions` | Login sessions; only a hash of each token is stored |

`db/schema.sql` is the current shape. Existing databases are brought up to date by `MIGRATIONS` in `src/services/db.ts`, tracked with `PRAGMA user_version`. A test checks that the schema file alone has every column the migrations add.

### Rules in code

- **A.S.T. requirements** live only in `AGE_TABLE` (`src/shared/ast-pure.ts`). Legends, tooltips, the player-page checklist, the board's predictions and the actual move are all derived from it. Per-empire rows (longer Stone Age or Early Bronze Age) come from `getCivAstProfile` in `src/civs.ts`.
- **Markers move once, at the end of the round**: `advanceRound()` → `autoAdvanceAst()`, using the post-calamity city counts (plus 1 for the Wonder). In between, `getFullState()` predicts each empire's move (`astStatus`) so the board and the player pages can show it.
- **Scoring, tie-breaks and move order** are in `src/shared/scoring.ts`, shared with the player page so both always agree.

### Live updates

- Every page connects to the WebSocket at `/ws` (`public/js/ws-client.js`, which reconnects with backoff).
- After every change the server broadcasts. Player and admin pages receive the full state, `{ "type": "state_update", "data": … }`. The status board only receives `{ "type": "state_changed" }` and then re-fetches its HTML with htmx.
- Changes from one player's page skip the other players' pages; the board and admin always get them.

| Page | First load | Updates |
|---|---|---|
| `/` status board | Server-rendered | htmx swap of `#main-content` on each `state_changed` |
| `/admin` | Server-rendered | `admin.js` patches the page in place; a few changes (new round, setup ↔ game) reload it |
| `/<empire>` player page | Server-rendered | `civ.js` re-renders from the WebSocket state, keeping focus and scroll position |

On the TV, the status board holds a screen wake lock while visible and has a full-screen button.

### Client bundles

`public/js/civ.js` and `public/js/admin.js` are built from `src/client/` (which imports `src/shared/`) and committed, so the server needs no build step. After changing either folder run `bun run build:client` and commit the bundles; `tests/client-build.test.ts` fails if they are out of date.

---

## REST API

Reading is public. Of the changes, those a player makes on their own page are public: census, city count, units moved, Military, Wonder, special ability and advance cards. Everything else needs the admin session cookie `mett_admin`, which `POST /login` sets.

Input is checked at the boundary: bad JSON is `400`, an unknown player `404`, and a submission with no game running (or a city count before the census reveal) `409`. Errors look like `{ "error": "…" }`. Every change is followed by a WebSocket broadcast.

```
GET  /api/state                         Full game state
GET  /api/civs                          The 18 empires
GET  /api/setup-recommendations         Official scenarios by player count
GET  /healthz                           "ok" when the server and database respond

POST /api/game/start                    {expert, players:[{civ_id, name, region}]}
POST /api/game/reset                    New game (backup first)
POST /api/game/round/next               Advance the round (backup first)
POST /api/game/round/undo               Undo the last advance
POST /api/game/cities/clear             Trading done: clear city counts for the recount
POST /api/census/reveal                 Reveal the census early
GET  /api/backups                       List backups and the undo candidate
POST /api/backups/restore               {file}

POST /api/players/:id/census            {population}                      public
POST /api/players/:id/city-count        {city_count}                      public
POST /api/players/:id/move              Toggle "units moved"              public
POST /api/players/:id/military          Toggle Military                   public
POST /api/players/:id/wonder            Toggle Wonder of the World        public
POST /api/players/:id/special           Toggle special ability            public
POST /api/players/:id/adv               {adv_1vp, adv_3vp, adv_6vp}       public
POST /api/players/:id/ast               {level}: set the A.S.T. square
POST /api/players/:id/regress           Calamity regression, one square back
POST /api/players/:id/name              {name}
POST /api/players/:id/rank              Settle a final tie
POST /api/players/:id/late-iron-age-bonus   Grant or remove the 5 VP bonus

POST /api/debug/simulate                {expert, player_count, rounds, seed?}: play a fake game
POST /api/debug/census                  {seed?}: random census for this round
POST /api/debug/cities                  {seed?}: random city counts
POST /api/debug/advances                {seed?}: random advance purchases
POST /api/debug/set-round               {round}
```

The debug endpoints also need the admin cookie. With a `seed` they produce the same data every time.

---

## Running it

You need [Bun](https://bun.sh), the version in `.bun-version`.

```bash
bun install
bun run dev          # http://localhost:3000, restarts on every save
```

| Variable | Default | |
|---|---|---|
| `DATABASE_PATH` | `./data/mett.db` | The game's SQLite file |
| `PORT` | `3000` | |
| `ADMIN_PASSWORD` | `PASSWORD` | Only used on first boot; change it from the admin page |
| `BACKUP_DIR` | `<db name>-backups/` next to the database | Where backups go |
| `DEMO` | unset | `1` makes a public demo (below) |
| `NODE_ENV` | unset | `production` (set in the image) skips writing the dev `.pid` file |

**Backups.** Before every round advance, game start, reset, simulation and restore, the server copies the database with `VACUUM INTO` and keeps the newest 30. The admin page lists them with a Restore button, and offers **Undo round advance** when a backup from just before the current round exists. A restore brings back the game, but keeps the admin password and sessions. It takes a backup first, so it can be undone too. A failed backup is logged and never stops the game.

**Demo mode** (`DEMO=1`, used by demo.mett.games):
- At boot the server replaces the game with the same seeded table every time: a 12-empire Expert game played to round 7, with half the census in. It does this again every night at 03:00 UTC, using a timer in the server process (`src/services/demo.ts`).
- The admin password is `demo`, shown on the login page, and can't be changed.

**Screenshots.** `bun run screenshots` starts its own demo instance on a throwaway database and rewrites `docs/img/`. It doesn't touch your dev server.

---

## Tests

```bash
bun run test            # unit, integration and simulations: ~300 tests, ~10 s
bunx tsc --noEmit       # type check
bun run test:browser    # Playwright
bun run css:usage       # unused-CSS check
```

All of them run in CI, and all must pass before a commit.

### bun test (`tests/*.test.ts`)

Each test gets an in-memory database built by the real `initDb()` (`tests/_helpers.ts`). `tests/_preload.ts` sends backups to a temporary folder.

| File | Covers |
|---|---|
| `ast.test.ts` | Every A.S.T. requirement in both modes, per-empire rows, Wonder, regression |
| `game.test.ts` | Round advance, LIA bonus, final round, scoring, tie-breaks, move order, census pruning |
| `simulate.test.ts` | Whole games over the HTTP API (Expert and Basic; West, East and combined; 5–18 empires), with every rule checked after every round, an undo and replay, and scripted Late Iron Age endings |
| `api.test.ts` | Which endpoints need admin, input validation, tie resolution, no secrets in the state, escaped names on every page |
| `auth.test.ts` | Login, sessions, throttling, password change |
| `password.test.ts` | Hashing |
| `ws.test.ts` | What each kind of client receives |
| `backup.test.ts` | Backups, pruning, restore, undo |
| `db.test.ts` | Fresh databases, upgrades from old ones, schema file complete |
| `demo.test.ts` | Demo table, password, nightly schedule |
| `client-build.test.ts` | Committed bundles up to date; Bun version pin consistent |
| `license.test.ts` | Every source file carries the MPL notice |

### Browser tests (`tests/browser/`)

Each Playwright worker starts its own me[tt] on port 3100+ with a throwaway database, and a fresh 18-empire game is seeded before every test, so tests run in parallel and never touch your dev server (`fixtures.ts`).

| Spec | Checks |
|---|---|
| `layout.spec.ts` | The status board fits without scrolling or clipping from 1920×1080 to 5120×2160 (including 4K at 125 %), with empty and full trade tables, and with 6, 12 and 18 empires. Also runs with the wide DejaVu Sans font (`wide-font.conf`), as on many Linux TVs |
| `civ-viewport.spec.ts` | Player page on phones (390–440 px wide), with OS font scaling, never scrolls sideways |
| `civ-ast-strip.spec.ts` | The player page's A.S.T. strip |
| `civ-live-update.spec.ts` | Live updates keep focus in a field being typed in |
| `status-live.spec.ts` | The board updates from `state_changed` |
| `status-tv.spec.ts` | Wake lock and full screen |
| `admin.spec.ts` | Admin page behaviour |
| `admin-round.spec.ts` | A whole round driven from the admin page, then undone |
| `visual.spec.ts` | Pixel-exact screenshots of a seeded game: board at 1080p and 4K, admin, a player page on a phone |

The screenshot test only runs locally, because CI renders fonts differently. After an intended visual change: `bunx playwright test tests/browser/visual.spec.ts --update-snapshots`, look at the new images, and commit them.

For quick measurements, run Playwright from `bun -e`; [CLAUDE.md](CLAUDE.md) has an example.

### Unused CSS

`bun run css:usage` walks a throwaway instance through every game state on every page at phone, 1080p and 4K sizes. It fails if a selector in `style.css` never matches. Delete such a rule, or, for elements that only exist at runtime, add it to `KNOWN_DYNAMIC` in `scripts/css-usage.ts` with the reason.

---

## Screens

Supported: **phones** (every page) and **1920×1080 at 100 % and up** (every page). Nothing in between.

- **Status board:** never scrolls or clips from 1080p up, including 4K at 125 % OS scaling (3072×1600). On phones it shows the tables one under the other.
- **Player page:** may scroll down on phones, never sideways, even with large OS fonts.

**The board's type scale** is a set of `--board-*` tokens on `.status-grid`, at the end of `style.css`. The breakpoints only change the `*-base` values:

| Width | Change |
|---|---|
| ≤ 700 px | Phone: one column |
| ≥ 1200 px and < 2560 px | Tighter admin rows, so 18 players fit at 1080p |
| ≥ 2560 px | Larger rows and fonts |
| ≥ 3072 px | Wider empire cells; taller rows only from 1840 px tall, so 4K at 125 % still fits |

Smaller games fill the board: `--players` scales rows (up to 3×) and type.

Colours, panels and stripes are shared tokens (`--mett-text`, `--mett-stripe`, `--radius-panel`, …) used by every page. Change the token, not a page-specific copy.

Media-query `rem` is the browser's 16 px, not Pico's larger root size.

---

## Versioning

[Semantic versioning](https://semver.org). The version is in `package.json`, appears in the page header with the commit, and becomes the Docker image tags. Every push to `main` publishes an image, so **every commit that changes behaviour is a release**: bump the version in that commit, put it in the subject (e.g. `fix(admin): … (1.6.1)`), add a line to [CHANGELOG.md](CHANGELOG.md), and tag it (`git tag v1.6.1`).

What operators and players rely on is the compose file, environment variables, volume and port, the player and admin URLs, and that an upgrade is just *pull and restart*.

| Bump | When | Examples |
|---|---|---|
| **Major** | Upgrading needs manual work or breaks something people rely on | Compose, env or URL changes; a database change that can't migrate itself; a game in progress that can't continue |
| **Minor** | New features or visible changes; still pull and restart | New features, redesigns, any new `MIGRATIONS` entry (rolling back past it is unsafe), dropping a screen size |
| **Patch** | Fixes, no schema change | Bug fixes, style tweaks, dependency patches |

Commits that only touch tests, CI or docs need no bump.

---

## Deployment

```bash
docker compose -f docker/docker-compose.yml pull
docker compose -f docker/docker-compose.yml up -d
```

- **Hostname:** put yours in `docker/Caddyfile`; Caddy fetches the certificate.
- **Image:** `ghcr.io/nilsan/mett:${METT_VERSION:-latest}`. CI publishes `:latest`, `:<version>`, `:<major>.<minor>`, `:<major>` and `:<commit>`. `METT_VERSION=1` gets every compatible update.
- **Data** is in the `mett_data` volume, backups included.
- **Container:** it starts as root only to hand the data volume to the `bun` user, then drops privileges (`docker/entrypoint.sh`).
- **Health:** a `HEALTHCHECK` calls `/healthz` every 30 s (the server answers and the database responds), and Caddy starts once it passes. Docker marks a failing container unhealthy but doesn't restart it, so use an outside monitor on `/healthz` if you want alerts.
- **Resources:** one instance is small. In a load test of an 18-empire game, with everyone submitting at once, it used about 80 MB of memory (22 MB for the app itself) under a 256 MB / half-CPU limit, and answered in a few milliseconds.

**Several tables:** copy the `mett` service under a new name with its own volume, and add a Caddyfile block per hostname. Each instance is completely separate.

**Building the image yourself:** `BUILD_SHA=$(git rev-parse --short HEAD) docker compose -f docker/docker-compose.yml build`. The commit appears in the header.

**Logs:** `docker compose -f docker/docker-compose.yml logs -f mett`. One line per request.

---

## License

[Mozilla Public License 2.0](LICENSE). Copyright © 2026 Nils-Anders Nøttseter. Every source file starts with the MPL notice.
