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
| CSS | **Pico CSS + custom** | Dark-mode baseline out of the box; small footprint (~10 KB) |
| Frontend JS | **Vanilla JS + HTMX** | No framework needed at this scale; HTMX for partial updates |
| Container | **Docker + Docker Compose** | Volume-mounted SQLite for persistence |
| TLS (optional) | **Caddy** | Automatic Let's Encrypt certificates |

---

## Project layout

```
mett/
├── src/
│   ├── index.ts            Entry point: Hono app + Bun server
│   ├── db.ts               Re-export barrel + CRUD for players/census/civs
│   ├── civs.ts             Static civ data + official scenario tables
│   ├── types.ts            Shared TypeScript types
│   ├── ws.ts               WebSocket connection manager + broadcast
│   ├── models/
│   │   ├── ast.ts          AST requirement parsing and advancement logic
│   │   └── game.ts         Game-state queries + scoring/tie-break
│   ├── services/
│   │   └── db.ts           Raw SQLite connection, schema + migrations
│   ├── routes/
│   │   ├── api.ts          REST API routes
│   │   └── pages.ts        Server-rendered HTML page routes
│   └── views/
│       ├── layout.ts       Base HTML shell (Pico CSS, nav, WS script)
│       ├── main.ts         Main page (5-section status grid)
│       ├── admin.ts        Admin page (setup wizard + game controls)
│       └── civ.ts          Individual empire page
├── public/
│   ├── css/style.css       Civ colour variables, Pico overrides, layout
│   └── js/
│       ├── ws-client.js    Shared WebSocket client (auto-reconnect)
│       ├── toast.js        Error toast helper
│       ├── main.js         Main page JS
│       ├── admin.js        Admin page JS
│       └── civ.js          Empire page JS
├── db/
│   └── schema.sql          Schema + seed data (civs and A.S.T. levels)
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml  Multi-instance setup with bundled Caddy (HTTPS)
│   └── Caddyfile
└── tests/
    ├── ast.test.ts         Unit tests for A.S.T. requirement logic
    ├── game.test.ts        Integration tests (AST advancement, LIA bonus, etc.)
    └── simulate.py         End-to-end game simulations against a live server
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
- The server tracks all connected clients in memory.
- After any state change the server broadcasts to all clients:
  ```json
  { "type": "state_update", "data": { ...fullGameState } }
  ```
- `public/js/ws-client.js` handles reconnection with exponential backoff and dispatches a `CustomEvent` on `window` so each page's JS can listen independently.

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

## Running with Docker

The production compose file runs four named service instances (katja, arne, dag, me) behind a bundled Caddy reverse proxy that obtains Let's Encrypt certificates automatically. Each instance has an isolated SQLite database mounted at `~/docker/mett/{instance}/`.

```bash
# Build and start all instances + Caddy
docker compose -f docker/docker-compose.yml up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Stop
docker compose -f docker/docker-compose.yml down
```

To point the instances at your own domains, edit `docker/Caddyfile` and the service names/volume paths in `docker/docker-compose.yml`.

---

## Tests

### Unit and integration tests (Bun)

```bash
bun test
```

- `tests/ast.test.ts` — A.S.T. requirement unit tests (all level transitions, Expert vs Basic, Wonder bonus)
- `tests/game.test.ts` — Integration tests for auto-advancement, LIA bonus calculation, final-round Expert rules

All tests must pass before committing.

### End-to-end simulation (Python)

Requires the dev server running at `http://localhost:3000`.

```bash
python3 tests/simulate.py
```

The script runs several complete games against the live server over the HTTP API, verifying census flow, move order, A.S.T. progression, Wonder logic, LIA bonuses and final scoring. It takes roughly 30 seconds. Run it when changing game logic.

The admin password used by the simulation defaults to `PASSWORD` and can be overridden:

```bash
METT_ADMIN_PASSWORD=secret python3 tests/simulate.py
```

---

## Responsive layout

The status page uses a CSS Grid layout that adapts across five breakpoints defined in `public/css/style.css`:

| Breakpoint | Viewport | Layout |
|---|---|---|
| Default | ≥ 700px | 5-column grid (leaderboard, census, trade, AST board, AST order) |
| WQHD | ≥ 2560px (`160rem`) | Larger row heights, bigger fonts |
| 4K @ 1.25× | ≥ 3072px (`192rem`) | 9rem empire cells, even larger fonts |
| Tablet | ≤ 700px | Single column |

`rem` values in media queries use the browser default font size (16 px), not Pico's fluid root font size (~21 px at 1920 px). Keep this in mind when editing breakpoints.

---

## License

MIT — Copyright © 2026 [Nils-Anders Nøttseter](https://github.com/nilsan)
