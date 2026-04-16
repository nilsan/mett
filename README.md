# METT — Mega Empires Turn Tracker

A real-time web app for tracking census, leaderboard and A.S.T. progress during a game of **Mega Empires: The West & The East** (3–18 players).

> **Before you start — you really should use this:**
> Matt Crawford's **[Mega Empires Calculator](https://calculator.mega-empires.com/)** is an excellent tool for calculating Civilization Advance purchases. We strongly recommend having it open alongside METT throughout your game. It makes advance buying so much easier.

---

## What does METT do?

- **Census tracking** — each player submits their own population count on their personal page; the main display stays hidden until everyone has reported
- **Move order** — automatically sorts players by population (lowest first), with Military advance holders moving last
- **Leaderboard** — ranked by Advance VP
- **A.S.T. tracking** — tracks each player's position on the Archaeological Succession Table, shows what they need to advance
- **Live updates** — all screens update automatically via WebSocket; no manual refreshing needed
- **Admin controls** — start games, advance rounds, toggle Military, adjust A.S.T. positions

---

## What you need

You need **Docker Desktop** installed on your computer. It is free for personal use.

→ [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)

That's it. No other software needed.

---

## Quick Start

Open a terminal (on Mac: Terminal app; on Windows: PowerShell or Command Prompt) and run these three commands:

```bash
git clone https://github.com/nilsan/mett.git
cd mett
docker compose -f docker/docker-compose.yml up -d
```

Then open your browser and go to:

```
http://localhost:3000
```

To stop METT:

```bash
docker compose -f docker/docker-compose.yml down
```

Your game data is saved in the `data/` folder and will still be there next time you start.

---

## How to use

### Setting up a game (Admin)

1. Open `http://localhost:3000/admin` on the admin device (typically a laptop)
2. Choose **Expert** or **Basic** mode (Expert is the default and recommended for experienced players)
3. Enter the number of players and click **Apply recommended civs** — METT pre-selects the right civilizations based on the official scenarios
4. You can change the selection manually if needed
5. Enter each player's name next to their civilization
6. Click **Start Game**

### Player pages

Each player bookmarks their own civilization's page, for example:
- `http://localhost:3000/egypt`
- `http://localhost:3000/rome`
- `http://localhost:3000/hellas`

On their page they can:
- Submit their census (population count) each round
- Update their Advance VP total
- See their current A.S.T. position and exactly what they need to advance

### Main display

The main page at `http://localhost:3000` is typically shown on a shared screen or TV. It shows three tables:
- **Census** — who has submitted (✓) and who hasn't (⏳); population counts hidden until all submitted
- **Leaderboard** — ranked by Advance VP
- **A.S.T. Ranking** — ranked by A.S.T. position

### Round flow (Admin)

1. Players submit their census on their own pages
2. Once all have submitted, the census reveals and move order is shown
3. When the round is done, the admin clicks **Advance to Round N+1**
4. The admin can also:
   - Toggle the **Military** advance on/off per player (⚔ icon)
   - Adjust **A.S.T. positions** with the +/− buttons
   - **Force reveal** census early if needed

---

## Running on your local network

If players want to use their phones or tablets, make sure all devices are on the same Wi-Fi network and use your computer's local IP address instead of `localhost`. For example:

```
http://192.168.1.42:3000/egypt
```

You can find your computer's local IP in your network settings.

---

## HTTPS setup (advanced)

For running METT over the internet with a real domain name and automatic HTTPS:

1. Make sure your domain DNS points to your server
2. Edit `docker/Caddyfile` and replace `mett.yourdomain.com` with your actual domain
3. Run:

```bash
docker compose -f docker/docker-compose.caddy.yml up -d
```

Caddy handles TLS certificates automatically via Let's Encrypt.

---

## License

MIT — Copyright © 2025 [Nils-Anders Nøttseter](https://github.com/nilsan) & [Roe Nøttseter](https://github.com/roenoe)

This project is inspired by the original [METool](https://github.com/roenoe/METool) by Roe Nøttseter.

Mega Empires is a game by Flo de Haan and Gerart de Haan.
