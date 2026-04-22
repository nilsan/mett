# me[tt] — Mega Empires Turn Tracker

**me[tt]** is a real-time web app for playing **Mega Empires: The West & The East** — the civilisation-building board game for 3–18 players that typically runs over two full days. It replaces the manual bookkeeping of population census, move order, Advance VP and A.S.T. progress with a shared live display that everyone can see and interact with from their own device.

> **Before you start — use this alongside me[tt]:**
> Matt Crawford's **[Mega Empires Calculator](https://calculator.mega-empires.com/)** is the best tool available for planning Civilization Advance purchases. Keep it open on a tablet or laptop throughout your session — it makes buying decisions dramatically easier.

---

## What me[tt] tracks

- **Census** — each player submits their own population count each round from their phone; the shared display stays hidden until everyone has reported, then reveals automatically
- **Move order** — players are sorted by population (lowest moves first), with Military advance holders always moving last
- **Leaderboard** — live ranking by Advance VP
- **A.S.T. progress** — each player's position on the Archaeological Succession Table, with their requirements for the next level shown on their personal page
- **Live updates** — every screen updates automatically; no manual refreshing

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

The admin panel is also where you will manage the game round-by-round.

### The main display

Put **http://localhost:3000** on a shared screen or TV. It shows:

| Column | What it shows |
|---|---|
| **Census** | Who has submitted (✓) and who hasn't (⏳). Population counts stay hidden until everyone has reported. After reveal, players are listed in move order. |
| **Leaderboard** | Ranked by Advance VP. |
| **A.S.T. ranking** | Ranked by A.S.T. level, with VP as the tiebreak. |

All three columns update live as players submit.

### Player pages

Every player bookmarks their own civilisation's page, for example:

```
http://localhost:3000/egypt
http://localhost:3000/rome
http://localhost:3000/hellas
```

From their page a player can:
- Submit their census count each round
- Update their Advance VP total
- See their current A.S.T. position and exactly what they need to reach the next level

### Running a round

1. Players submit census from their own pages
2. The main display shows a tick as each one comes in
3. Once all are submitted, move order is revealed automatically
4. Play the round — players update their Advance VP after purchasing
5. Admin clicks **Advance to Round N+1** when the round ends

The admin can also:
- Toggle the **Military** advance per player (⚔)
- Adjust **A.S.T. positions** with +/− buttons
- **Force reveal** census early if a player is unavailable

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

[Developer documentation →](DEV.md)
