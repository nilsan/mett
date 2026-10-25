# me[tt] — Mega Empires Turn Tracker

**me[tt]** is a real-time web app for playing **Mega Empires: The West & The East** — the empire-building board game for 3–18 players that typically runs over two full days. It replaces the manual bookkeeping of population census, move order, city count, Advance VP and A.S.T. progress with a shared live display that everyone can see and interact with from their own device.

> **Before you start — use this alongside me[tt]:**
> Matt Crawford's **[Mega Empires Calculator](https://calculator.mega-empires.com/)** is the best tool available for planning Civilization Advance purchases. Keep it open on a tablet or laptop throughout your session — it makes buying decisions dramatically easier.

---

## What me[tt] tracks

- **Census** — each player submits their population count from their own phone; the shared display stays hidden until everyone has reported, then reveals automatically
- **Move order** — after reveal, players are sorted by population (highest moves first), with Military advance holders always moving last
- **City count** — each player submits their city count before trading and again after calamities; me[tt] uses the post-calamity count to check A.S.T. requirements automatically
- **Advance VP** — tracked by card tier (1 VP, 3 VP, 6 VP) so A.S.T. requirements like "3 advances ≥ 200 VP each" can be checked precisely
- **A.S.T. progress** — each player's position on the Archaeological Succession Table, with next-level requirements shown on their personal page; advancement and regression are calculated automatically
- **Wonder of the World** — grants +1 effective city toward all A.S.T. requirements
- **Leaderboard** — live ranking by Advance VP
- **Final scoring** — when the game ends, me[tt] shows a full breakdown: Advance VP + A.S.T. VP + city VP (1 per city) + LIA bonus (5 VP for reaching maximum A.S.T. simultaneously)
- **Live updates** — every screen updates automatically via WebSocket; no manual refreshing

For a detailed description of each implemented rule see [RULES.md](RULES.md).

---

## What it looks like

**Status display** — the shared TV view, mid-game with 12 players (Round 7, Expert):

![Status display](docs/img/screenshot-status.jpg)

**Admin** — the game master's control panel:

![Admin page](docs/img/screenshot-admin.jpg)

**Player page** (phone) — each empire's personal page, optimised for portrait phones:

<img src="docs/img/screenshot-civ.png" alt="Player page on a phone" width="320">

(Regenerate from a fresh simulated game any time with `bun run screenshots`.)

---

## Deployment

### Production (Docker)

The shipped compose file runs one me[tt] instance behind a Caddy reverse proxy that handles HTTPS automatically. The public demo at **`demo.mett.games`** runs from this exact configuration.

**Requirements:** a Linux server with Docker and Docker Compose installed, and a DNS A record for the chosen subdomain pointing to the server's IP.

```bash
git clone https://github.com/nilsan/mett.git
cd mett
# Edit docker/Caddyfile to use your own hostname instead of demo.mett.games
docker compose -f docker/docker-compose.yml up -d
```

The instance is reachable at the configured hostname; Caddy obtains the TLS certificate on first request.

```bash
docker compose -f docker/docker-compose.yml down   # stop
```

Pin a specific upstream image version (recommended in production):

```bash
METT_VERSION=1.2.3 docker compose -f docker/docker-compose.yml pull
METT_VERSION=1.2.3 docker compose -f docker/docker-compose.yml up -d
```

`:latest` (the default) tracks `main` and is only published after the full test suite passes. Every build is also tagged with its version (`1.0.0`, `1.0`, `1`) and short commit SHA. Pin `METT_VERSION=1` to receive every compatible update and nothing that needs manual work (see [DEV.md › Versioning](DEV.md#versioning)). Game data lives at the `mett_data` named volume on the host, together with automatic backups taken before every round advance (restorable from the admin page).

**Multi-instance / multi-game on one host:** duplicate the `mett` service in `docker-compose.yml` under different names with separate volume mounts, and add a Caddyfile block per hostname. Each instance is fully independent — separate database, separate game.

### Development (Bun)

For local development, Docker is not needed. Install [Bun](https://bun.sh), then:

```bash
git clone https://github.com/nilsan/mett.git
cd mett
bun install
bun --watch run src/index.ts
```

The app is available at **http://localhost:3000**. The server reloads automatically on file changes.

---

## User guide

### Admin setup

Open **/admin** on the device that will act as the game master (typically a laptop). In production this is e.g. `https://demo.mett.games/admin`; in development it is `http://localhost:3000/admin`.

The default admin password is **`PASSWORD`**. You can change it from the admin page once logged in.

1. Choose **Expert** or **Basic** mode
2. Enter the number of players and click **Apply recommended civs** — me[tt] pre-selects the correct empires from the official scenario table
3. Adjust the selection manually if you want
4. Assign a player name to each empire
5. Click **Start Game**

### The main display

Put the root URL (e.g. `https://demo.mett.games` in production, or `http://localhost:3000` in development) on a shared screen or TV. It shows five panels:

| Panel | What it shows |
|---|---|
| **Leaderboard** | Ranked by Advance VP. |
| **Census** | Who has submitted (✓) and who hasn't (?). Population counts stay hidden until everyone has reported; after reveal players are listed in move order. |
| **Trade cards** | Each player's trade card hand at a glance. |
| **A.S.T. progress** | The full A.S.T. board with each player's current position highlighted. |
| **A.S.T. order** | Players ranked by A.S.T. level, used to determine taxation order. |

All panels update live as players submit.

### Player pages

Every player bookmarks their own empire's page, for example:

```
https://demo.mett.games/egypt
https://demo.mett.games/rome
https://demo.mett.games/hellas
```

From their page a player can:

- **Submit census** — population count each round
- **Submit city count** — entered before trading, and again after calamities (the second entry is used for A.S.T. checks)
- **Update Advance VP** — by card tier: how many 1 VP, 3 VP and 6 VP cards they hold; me[tt] shows whether each A.S.T. requirement is met
- **Toggle Wonder of the World** — when held, counts as +1 city for all A.S.T. requirements
- **See A.S.T. status** — current level, next level's requirements with green/red indicators, and a visual progress strip across all ages

In Expert mode, a player with 0 cities (and no Wonder) outside the Stone Age will see a **regression warning** — they will drop one A.S.T. level unless they acquire a city before the round ends.

### Running a round

1. **Census phase** — players submit their population count; the main display shows a tick as each comes in
2. **Move order reveals** automatically once all are submitted — highest population moves first within each group, Military holders move last
3. **Pre-trade city count** — players enter their current city count before buying trade cards
4. **Trade and calamities** take place as normal
5. **Post-calamity city count** — players re-enter their city count after calamities are resolved; when all are in, the admin clicks **Trading done →**
6. **A.S.T. advancement** — me[tt] automatically advances (or regresses in Expert) each player based on their post-calamity cities and advances; the admin can override with the A.S.T. dropdown
7. **Advance VP** — players update their card totals after purchasing
8. **Admin advances the round** — click **Advance to Round N+1** (or **End Game** in the final round)

The admin can also:
- Toggle **Military** (⚔) and **Wonder** (★) per player
- Edit **player names** inline
- **Force reveal** census early if a player is unavailable

### Final scores

When the admin clicks **End Game**, me[tt] displays a final scoreboard with each component:

- **Advance VP** — total VP from all purchased advances
- **A.S.T. VP** — VP earned from the player's final A.S.T. position
- **City VP** — 1 VP per city held at game end (Wonder does not count)
- **LIA bonus** — 5 VP awarded to every player who reached maximum A.S.T. in the same round (Late Iron Age simultaneous finish)

### Using phones and tablets

In production, players simply open their subdomain URL on any device — no local network required.

In development (Bun), all devices must be on the same Wi-Fi network. Use the computer's local IP instead of `localhost`:

```
http://192.168.1.42:3000/egypt
```

Find your IP in network settings. On Mac: System Settings → Wi-Fi → Details. On Windows: `ipconfig` in PowerShell.

---

## Contributing and development

me[tt] is built with [Bun](https://bun.sh), [Hono](https://hono.dev), TypeScript and [htmx](https://htmx.org). If you want to run it locally without Docker, explore the architecture, or contribute, see [DEV.md](DEV.md) for setup instructions, the project layout, API reference and test guide.

---

## License

**Mozilla Public License 2.0** — Copyright © 2026 [Nils-Anders Nøttseter](https://github.com/nilsan).

Full license text in [LICENSE](LICENSE). The MPL is a file-level copyleft licence: anyone can use me[tt] in their own work, but modifications to me[tt]'s own source files must remain MPL-licensed.

Inspired by the original [METool](https://github.com/roenoe/METool) by Roe Nøttseter.
Mega Empires is a game by Flo de Haan and Gerart de Haan.
