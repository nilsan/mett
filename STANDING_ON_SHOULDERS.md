# Standing on Shoulders

me[tt] is a small program, but it exists because a lot of people built something first: a game, a table full of friends, a tool that showed the way, and the open-source software it runs on. This page thanks them.

---

## The game

**Mega Empires: The West & The East**, designed and developed by **Flo de Haan and Gerart de Haan**, created by **[Colossus Games](https://colossus-games.com)** and produced by **[Ares Games](https://www.aresgames.eu)**. Artwork by Franz Vohwinkel.

It is "based on Mega Civilization by Flo de Haan and John Rodriguez", which began as a tribute to *Advanced Civilization*, "which in turn was based on Francis Tresham's classic game from 1980". The rulebook "bows to Francis Tresham for creating the greatest game", and so do we. Everything me[tt] tracks, from the census and the trade cards to the A.S.T. and its eras, is their design. me[tt] only does the arithmetic.

Thanks also to Michael Bruinsma, who first published Mega Civilization in 2015, and to everyone who playtested it over the years.

---

## The people at our table

me[tt] was built by a gamer for gamers, and shaped by the people who play:

- **Dag Petersen**, for a lifetime of service to the board game hobby and all the evenings at his table.
- **Roe Nøttseter**, who wrote [METool](https://github.com/roenoe/METool), the first version of this idea and the inspiration for me[tt].
- **Katja Sverdlilje**, for playtesting me[tt] and designing a full set of [3D-printable tokens](https://www.printables.com/@RobinDeBanqu_4392738) which make our games even more enjoyable.

And thank you to **everyone else who has played with us**, for the long weekends that make a project like this worth doing.

---

## The tool that showed the way

**Matt Crawford's [Mega Empires Calculator](https://calculator.mega-empires.com/)** (and [MCA2](https://crawdad.neocities.org/MCA2/), its predecessor for Mega Civilization) is the planner our players keep open while they buy advances. It showed how much better a game gets when a phone takes care of the sums. If it has helped your table too, you can [buy Matt a coffee](https://www.buymeacoffee.com/crawford).

---

## The software

me[tt] is built on open source, and published with the help of a few generous free services:

| Project | What it does for me[tt] |
|---|---|
| [Bun](https://bun.sh) | Runs the server, the database, the WebSockets and the tests |
| [TypeScript](https://www.typescriptlang.org) | The language all of me[tt] is written in |
| [SQLite](https://sqlite.org) | Keeps each game in a single file; also the backups |
| [Hono](https://hono.dev) | The web framework |
| [htmx](https://htmx.org) | Keeps the status board live without a front-end framework |
| [Pico CSS](https://picocss.com) | The starting point for every page's look |
| [Playwright](https://playwright.dev) | Checks every screen size in a real browser |
| [Caddy](https://caddyserver.com) and [Let's Encrypt](https://letsencrypt.org) | HTTPS for every table, with no setup |
| [Docker](https://www.docker.com) | Packages me[tt] so anyone can run a table |
| [Debian](https://www.debian.org) and [Linux](https://kernel.org) | The machines it is built and hosted on |
| [Git](https://git-scm.com) and [GitHub](https://github.com) | Where the code lives, is tested and is published |

Each of these is the work of many people, most of them volunteers. Thank you.

---

## How me[tt] was written

I decided what me[tt] should do and how it should look, and tested it at real tables. The code, the tests and much of the documentation were written together with **[Claude](https://claude.com/product/claude-code)**, Anthropic's AI, in Claude Code.

---

## Why

I like programming, board games and making things, and me[tt] is where all of this meets. It is free, and it will stay free, as a thank-you to everyone above. If it gives your table a little more time for the game itself, it has done its job.

— Nils-Anders Nøttseter

*The idea for this page comes from Ole-Morten Duesund's [tilfluktsrom](https://kode.naiv.no/olemd/tilfluktsrom/src/branch/main/STANDING_ON_SHOULDERS.md).*
