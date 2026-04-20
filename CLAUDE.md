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
