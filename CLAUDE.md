# me[tt] — Claude Code Notes

## Dev Server

**Never kill the dev server.** It runs persistently. 

The server auto-reloads on file changes (Bun's `--watch` flag). After editing source files, just wait a moment and test directly.

## Always-allowed commands

The following are always allowed without prompting the user:

- **`bun`** — any `bun` command (`bun test`, `bun run`, `bun install`, etc.)
- **`bunx playwright`** — any Playwright invocation against `http://localhost:3000/`, including ad-hoc inline scripts via `bun -e '...'`
- **`curl`** — any `curl` command to the me[tt] application (`https://*.mett.games/`, `http://localhost:3000/`). Operators with their own deployments can extend this list in their personal `~/.claude/settings.local.json`.
- **`python3`** — any `python3` script that uses `json` (e.g. parsing API responses)

## Browser inspection (Playwright)

Playwright with headless Chromium is used to inspect rendered CSS layout — pixel widths, heights, computed styles, screenshots — that can't be verified from source alone.

**Two ways to use it:**

1. **Inline ad-hoc script** for quick measurements:
   ```bash
   bun -e '
     import { chromium } from "playwright";
     const browser = await chromium.launch();
     const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
     const page = await ctx.newPage();
     await page.goto("http://localhost:3000/");
     await page.waitForLoadState("networkidle");
     const overflow = await page.evaluate(() =>
       document.documentElement.scrollHeight - window.innerHeight);
     console.log("overflow:", overflow);
     await browser.close();
   '
   ```

2. **Checked-in spec** under `tests/browser/`:
   ```bash
   bun run test:browser    # runs `playwright test` via the package script
   ```
   Self-contained: every Playwright worker starts its own me[tt] instance (port 3100 + worker index, throwaway DB in a temp folder; `workerServer` fixture in `tests/browser/fixtures.ts`) and auto-seeds an 18-player game before each test. Admin calls log in through `POST /login` (`adminLogin()` in `tests/browser/fixtures.ts`) — the admin cookie is a session token, not the password. It does **not** use — or disturb — the `:3000` dev server.

**Notes:**
- Playwright auto-waits for selectors; explicit `time.sleep` is not needed (use `page.waitForLoadState("networkidle")` after navigation if you need a settle moment).
- Set viewport via `newContext({ viewport: { width, height } })` — Playwright respects the values exactly, including DPR. There's no `--force-device-scale-factor` footgun.
- For mobile-DPR emulation, use `devices['Pixel 7']` from `playwright/devices` (Pixel 8 isn't in Playwright's bundled list yet — `devices['Pixel 8']` resolves to `undefined`, which silently yields the default 1280×720 viewport).

## Tests

**Always add tests when implementing new features.** New game logic goes in `tests/game.test.ts`; new AST requirement checks go in `tests/ast.test.ts`; auth/login changes go in `tests/auth.test.ts`; REST endpoint behaviour goes in `tests/api.test.ts`; WebSocket payload/routing changes go in `tests/ws.test.ts`; schema/migration changes go in `tests/db.test.ts`; backups and restore go in `tests/backup.test.ts`; whole games played over the API (every rule checked after every round) go in `tests/simulate.test.ts`; new browser/layout checks go in `tests/browser/*.spec.ts` (`admin-round.spec.ts` drives a whole round from the admin page). In-memory DB factories (built by the production `initDb()`) live in `tests/_helpers.ts`.

**Always run the full test suite before committing.**

```bash
bun run test            # unit + integration via bun test (tests/*.test.ts glob)
bun run test:browser    # Playwright; one self-managed instance per worker on :3100+ (does not touch :3000)
```

`bun run test` runs every `tests/*.test.ts` file (new files are picked up automatically). All must pass before any commit. The browser suite is separate locally and also runs in CI. Browser specs run in parallel, one me[tt] instance per worker, so a test may freely mutate its game (the next test re-seeds it). `layout.spec.ts` also runs in a second project, `chromium-wide-font`, with the UI font forced to DejaVu Sans (`tests/browser/wide-font.conf`): the board must fit wide system fonts too, not just the font on this machine.

**Unused CSS:** `bun run css:usage` walks every page through every game state at phone/1080p/4K on a throwaway instance and fails if any selector in `style.css` never matches (also runs in CI). When it flags a selector, either delete the rule or — only for DOM that exists solely at runtime — add it to `KNOWN_DYNAMIC` in `scripts/css-usage.ts` with the reason.

**Screenshot tests:** `tests/browser/visual.spec.ts` compares a seeded game (status 1080p + 4K, admin, player phone) pixel-exactly against committed baselines. After an *intended* visual change, run `bunx playwright test tests/browser/visual.spec.ts --update-snapshots`, look at the new PNGs, and commit them with the change. Local only (CI fonts differ). The debug endpoints (`/api/debug/simulate|census|cities|advances`) take an optional numeric `seed` for reproducible data.

**Client bundles:** `public/js/civ.js` and `public/js/admin.js` are committed build artifacts generated from `src/client/civ.ts` and `src/client/admin.ts`. After editing anything under `src/client/` or `src/shared/`, run `bun run build:client` and commit the regenerated bundles — `tests/client-build.test.ts` fails the suite if they drift.

**Single sources of truth:** A.S.T. rules live only in `AGE_TABLE` (`src/shared/ast-pure.ts`); civ reference data only in `CIVS` (`src/civs.ts`, upserted into the `civs` table at boot). Don't reintroduce copies in SQL, views or tests.

**Schema changes:** edit `db/schema.sql` (current shape, `CREATE IF NOT EXISTS`) *and* append a migration to `MIGRATIONS` in `src/services/db.ts` for existing databases (tracked by `PRAGMA user_version`; never edit a shipped entry).

**Bun version:** pinned once in `.bun-version` (CI + Docker); the Dockerfile's `ARG BUN_VERSION` default must match (tested).

## Versioning

Semantic versioning, rules in DEV.md › Versioning: every commit that changes behaviour bumps `package.json` in that same commit and puts the version in the subject. Major = upgrade needs manual work or breaks bookmarks/config; minor = features, visible changes, any new `MIGRATIONS` entry; patch = fixes without schema change.

## Supported screens

Phones (every page) and 1920×1080 at 100 % scaling and up. Nothing in between. The status page must never scroll *or clip* at ≥ 1080p, including OS-scaled 4K (3072×1600); on phones it scrolls table by table.

## Task List & todo.md

Always keep the task list (TaskCreate/TaskUpdate) and `todo.md` in sync. When a task is added, completed, or removed, update both.

Task subjects must always include a sequence number prefix: `1. Subject`, `2. Subject`, etc. When tasks are added or removed, renumber all tasks to maintain a clean sequence.
