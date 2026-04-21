# METT — Claude Code Notes

## Dev Server

**Never kill the dev server.** It runs persistently. 

The server auto-reloads on file changes (Bun's `--watch` flag). After editing source files, just wait a moment and test directly.

## Curl Commands

All `curl` commands to the METT application (`https://mett.nottseter.no/...` and `http://localhost:3000/`) are allowed without prompting the user.

## Selenium / Chromium

Selenium with headless Chromium is used to inspect rendered CSS layout — pixel widths, heights, computed styles — that can't be verified from source alone (e.g. table column widths, font-size inheritance, rem resolution at various viewport sizes).

All Selenium runs are allowed without prompting the user.

**Setup:**
- Browser: `/usr/bin/chromium`
- Driver: `/usr/bin/chromedriver`
- Target: `http://localhost:3000/`

**Typical pattern:**
```python
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options

opts = Options()
opts.add_argument('--headless')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--window-size=1920,1080')
opts.add_argument('--disable-cache')  # add when checking CSS changes

svc = Service('/usr/bin/chromedriver')
driver = webdriver.Chrome(service=svc, options=opts)
driver.get('http://localhost:3000/<page>')
import time; time.sleep(1.5)  # wait for page to settle

result = driver.execute_script("return window.getComputedStyle(document.querySelector('...')).width")
driver.quit()
```

Use `--disable-cache` when verifying CSS changes to ensure the browser picks up the latest stylesheet.

## Tests

**Always run the full test suite before committing.**

```bash
bun test
```

This runs `tests/ast.test.ts` (AST requirement unit tests) and `tests/game.test.ts` (autoAdvanceAst, LIA bonus, expert final round integration tests). All tests must pass before any commit.

For end-to-end game simulation (requires the dev server on localhost:3000):

```bash
python3 tests/simulate.py
```

Run the simulation when changing game logic (AST advancement, round transitions, census, LIA bonus). It takes ~30 seconds for 3 complete games.

## Task List & todo.md

Always keep the task list (TaskCreate/TaskUpdate) and `todo.md` in sync. When a task is added, completed, or removed, update both.

Task subjects must always include a sequence number prefix: `1. Subject`, `2. Subject`, etc. When tasks are added or removed, renumber all tasks to maintain a clean sequence.
