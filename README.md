# me[tt] — Mega Empires Turn Tracker

**me[tt]** is a real-time web app for playing **Mega Empires: The West & The East** — the civilisation-building board game for 3–18 players that typically runs over two full days. It replaces the manual bookkeeping of population census, move order, city count, Advance VP and A.S.T. progress with a shared live display that everyone can see and interact with from their own device.

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

---

## What you need

**Docker Desktop** — free for personal use.

→ [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)

That's it. No other software required.

---

## Quick start

Open a terminal and run:

```bash
git clone https://github.com/nilsan/mett.git
cd mett
docker compose -f docker/docker-compose.yml up -d
```

Then open **http://localhost:3000** in your browser.

To stop:

```bash
docker compose -f docker/docker-compose.yml down
```

Game data is saved in the `data/` folder and survives restarts.

---

## User guide

### Admin setup

Open **http://localhost:3000/admin** on the device that will act as the game master (typically a laptop).

1. Choose **Expert** or **Basic** mode
2. Enter the number of players and click **Apply recommended civs** — me[tt] pre-selects the correct civilisations from the official scenario table
3. Adjust the selection manually if you want
4. Assign a player name to each civilisation
5. Click **Start Game**

### The main display

Put **http://localhost:3000** on a shared screen or TV. It shows five panels:

| Panel | What it shows |
|---|---|
| **Leaderboard** | Ranked by Advance VP. |
| **Census** | Who has submitted (✓) and who hasn't (?). Population counts stay hidden until everyone has reported; after reveal players are listed in move order. |
| **Trade cards** | Each player's trade card hand at a glance. |
| **A.S.T. progress** | The full A.S.T. board with each player's current position highlighted. |
| **A.S.T. order** | Players ranked by A.S.T. level, used to determine taxation order. |

All panels update live as players submit.

### Player pages

Every player bookmarks their own civilisation's page, for example:

```
http://localhost:3000/egypt
http://localhost:3000/rome
http://localhost:3000/hellas
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
5. **Post-calamity city count** — players re-enter their city count after calamities are resolved; when all are in, the admin clicks **Prepare for A.S.T.**
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

All devices must be on the same Wi-Fi network. Use your computer's local IP address instead of `localhost`, for example:

```
http://192.168.1.42:3000/egypt
```

Find your IP in your system's network settings. On Mac: System Settings → Wi-Fi → Details. On Windows: `ipconfig` in PowerShell.

### HTTPS setup

If you want to run me[tt] on a public server with a real domain name:

1. Point your domain's DNS to the server
2. Edit `docker/Caddyfile` and replace `mett.yourdomain.com` with your domain
3. Run:

```bash
docker compose -f docker/docker-compose.caddy.yml up -d
```

Caddy handles TLS certificates automatically via Let's Encrypt.

---

## License

MIT — Copyright © 2025 [Nils-Anders Nøttseter](https://github.com/nilsan) & [Roe Nøttseter](https://github.com/roenoe)

Inspired by the original [METool](https://github.com/roenoe/METool) by Roe Nøttseter.
Mega Empires is a game by Flo de Haan and Gerart de Haan.

---

[Implemented game rules →](RULES.md) · [Developer documentation →](DEV.md)
