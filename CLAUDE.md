# me[tt] — Claude Code Notes

## Dev Server

**Never kill the dev server.** It runs persistently. 

The server auto-reloads on file changes (Bun's `--watch` flag). After editing source files, just wait a moment and test directly.

## Always-allowed commands

The following are always allowed without prompting the user:

- **`bun`** — any `bun` command (`bun test`, `bun run`, `bun install`, etc.)
- **`bunx playwright`** — any Playwright invocation against `http://localhost:3000/`, including ad-hoc inline scripts via `bun -e '...'`
- **`curl`** — any `curl` command to the me[tt] application (`https://*.example.com/`, `https://mett.nottseter.no/...`, `http://localhost:3000/`)
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
   The dev server must already be running on :3000.

**Notes:**
- Playwright auto-waits for selectors; explicit `time.sleep` is not needed (use `page.waitForLoadState("networkidle")` after navigation if you need a settle moment).
- Set viewport via `newContext({ viewport: { width, height } })` — Playwright respects the values exactly, including DPR. There's no `--force-device-scale-factor` footgun.
- For mobile-DPR emulation, use `devices['Pixel 8']` from `playwright/devices`.

## Tests

**Always add tests when implementing new features.** New game logic goes in `tests/game.test.ts`; new AST requirement checks go in `tests/ast.test.ts`; new browser/layout checks go in `tests/browser/*.spec.ts`; legacy end-to-end flows live in `tests/simulate.py` (Python, requires live server).

**Always run the full test suite before committing.**

```bash
bun run test            # unit + integration via bun test
bun run test:browser    # Playwright; requires a running dev server on :3000
```

`bun run test` runs `tests/ast.test.ts`, `tests/game.test.ts`, and `tests/password.test.ts`. All must pass before any commit. The browser suite is separate and run on demand.

For end-to-end game simulation (also requires the dev server):

```bash
python3 tests/simulate.py
```

Run the simulation when changing game logic. It takes ~30 seconds for 3 complete games.

## Task List & todo.md

Always keep the task list (TaskCreate/TaskUpdate) and `todo.md` in sync. When a task is added, completed, or removed, update both.

Task subjects must always include a sequence number prefix: `1. Subject`, `2. Subject`, etc. When tasks are added or removed, renumber all tasks to maintain a clean sequence.
