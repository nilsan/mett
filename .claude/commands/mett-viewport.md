Run Playwright viewport overflow checks across all target sizes for the me[tt] app.

If called with no argument (or `dev`), checks only the local dev server at http://localhost:3000/ — the server must already be running.

If called with `all`, checks dev plus all 5 prod hosts: katja, arne, dag, me, roe (.mett.games).

Check both the status page (`/`) and the player page at the viewports below. The player slug differs per host, so the script fetches the first player's `civ_slug` from `/api/state` on each host — never hardcode a slug (and never use `/civ/1`; that route does not exist and 404s). For each viewport, measure vertical scroll (`scrollHeight - innerHeight`) and horizontal scroll (`scrollWidth - innerWidth`). Report ✓ if both are 0, ✗ with the values otherwise.

Viewports follow the target hierarchy in `todo.md`:

- **Status `/`** — 1920×1080 minimum through 5K2K; phone sizes are out of scope:
  1366×768, 1920×1080, 2560×1440, 3840×2160, 5120×2160
- **Player `/<slug>`** — phone primary, tablet minimum, desktop checked but secondary:
  375×667, 390×844, 414×896, 768×1024, 1366×768, 1920×1080

Use this inline Playwright script (run with `bun -e`), adjusting the `hosts` array based on the argument:

```js
import { chromium } from "playwright";
const browser = await chromium.launch();

// For "all" mode, extend hosts with prod entries:
// { host: "https://katja.mett.games", label: "katja" }, etc.
const hosts = [
  { host: "http://localhost:3000", label: "dev" },
  // { host: "https://katja.mett.games", label: "katja" },
  // { host: "https://arne.mett.games",  label: "arne"  },
  // { host: "https://dag.mett.games",   label: "dag"   },
  // { host: "https://me.mett.games",    label: "me"    },
  // { host: "https://roe.mett.games",   label: "roe"   },
];

const statusViewports = [
  { w: 1366, h: 768  },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
  { w: 3840, h: 2160 },
  { w: 5120, h: 2160 },
];
const civViewports = [
  { w: 375,  h: 667  },
  { w: 390,  h: 844  },
  { w: 414,  h: 896  },
  { w: 768,  h: 1024 },
  { w: 1366, h: 768  },
  { w: 1920, h: 1080 },
];

for (const { host, label } of hosts) {
  console.log(`\n── ${label} ──`);
  const state = await (await fetch(host + "/api/state")).json();
  const slug = state.players[0]?.civ_slug;
  if (!slug) { console.log("  ✗ no players in game — cannot check player page"); }
  const checks = [
    ...statusViewports.map(v => ({ ...v, page: "/", tag: `status ${v.w}×${v.h}` })),
    ...(slug ? civViewports.map(v => ({ ...v, page: `/${slug}`, tag: `civ ${v.w}×${v.h}` })) : []),
  ];
  for (const vp of checks) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p = await ctx.newPage();
    await p.goto(host + vp.page, { timeout: 10000 });
    await p.waitForLoadState("networkidle");
    const v = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const h = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const mark = (v > 0 || h > 0) ? "✗" : "✓";
    console.log(`  ${mark} ${vp.tag}: v=${v} h=${h}`);
    await ctx.close();
  }
}
await browser.close();
```

After running, report the results. If any viewport fails (✗), investigate the cause and fix the CSS before reporting done. The status page must never scroll on any viewport from 1366×768 up to 5K2K. The player page should not scroll either — phone sizes are the primary target there.
