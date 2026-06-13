Run Playwright viewport overflow checks across all target sizes for the me[tt] app.

If called with no argument (or `dev`), checks only the local dev server at http://localhost:3000/ — the server must already be running.

If called with `all`, checks dev plus all 5 prod hosts: katja, arne, dag, me, roe (.mett.games).

Check both the status page (`/`) and the player page at the viewports below. The player slug differs per host, so the script fetches the first player's `civ_slug` from `/api/state` on each host — never hardcode a slug (and never use `/civ/1`; that route does not exist and 404s). For each viewport, measure vertical scroll (`scrollHeight - innerHeight`) and horizontal scroll (`scrollWidth - innerWidth`). Report ✓ if both are 0, ✗ with the values otherwise.

Viewports follow the target hierarchy in `todo.md`:

- **Status `/`** — 1920×1080 minimum through 5K2K; phone sizes are out of scope:
  1366×768, 1920×1080, 2560×1440, 3840×2160, 5120×2160
- **Player `/<slug>`** — modern phones (Pixel 6–9, iPhone 13–16) primary, legacy/tablet/desktop secondary:
  390×844 (iPhone 13/14 — minimum supported), 393×852 (iPhone 15/16), 412×915 (Pixel 6/7/8), 440×956 (16 Pro Max), 768×1024, 1366×768, 1920×1080
- **Player with OS font scaling** (emulated via CDP `Page.setFontSizes`; default standard is 16):
  - 412×915 @ 1.3× (`standard: 21`) — Pixel "Large" text; must fit with **no overflow at all**
  - 390×844 @ 2.0× (`standard: 32`) — maximum accessibility scaling; vertical scroll is allowed by design, but **horizontal must be 0**

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
  { w: 375,  h: 667  },   // legacy small phone
  { w: 390,  h: 844  },   // iPhone 13/14
  { w: 393,  h: 852  },   // iPhone 15/16
  { w: 412,  h: 915  },   // Pixel 6/7/8
  { w: 440,  h: 956  },   // iPhone 16 Pro Max
  { w: 768,  h: 1024 },   // tablet
  { w: 1366, h: 768  },   // short laptop
  { w: 1920, h: 1080 },
];
// Font-scaled checks: fontPx sets the CDP default font size (16 = 1.0×).
// vOk=true means vertical scroll is acceptable (only horizontal must be 0).
const civFontScaled = [
  { w: 412, h: 915, fontPx: 21, label: "Pixel 8 @1.3×", vOk: false },
  { w: 390, h: 844, fontPx: 32, label: "iPhone @2.0×",  vOk: true  },
];

for (const { host, label } of hosts) {
  console.log(`\n── ${label} ──`);
  const state = await (await fetch(host + "/api/state")).json();
  const slug = state.players[0]?.civ_slug;
  if (!slug) { console.log("  ✗ no players in game — cannot check player page"); }
  const checks = [
    ...statusViewports.map(v => ({ ...v, page: "/", tag: `status ${v.w}×${v.h}` })),
    ...(slug ? civViewports.map(v => ({ ...v, page: `/${slug}`, tag: `civ ${v.w}×${v.h}` })) : []),
    ...(slug ? civFontScaled.map(v => ({ ...v, page: `/${slug}`, tag: `civ ${v.label}` })) : []),
  ];
  for (const vp of checks) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const p = await ctx.newPage();
    if (vp.fontPx) {
      const cdp = await ctx.newCDPSession(p);
      await cdp.send("Page.enable");
      await cdp.send("Page.setFontSizes", { fontSizes: { standard: vp.fontPx, fixed: Math.round(vp.fontPx * 0.8) } });
    }
    await p.goto(host + vp.page, { timeout: 10000 });
    await p.waitForLoadState("networkidle");
    const v = await p.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    const h = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const fail = h > 0 || (v > 0 && !vp.vOk);
    console.log(`  ${fail ? "✗" : "✓"} ${vp.tag}: v=${v} h=${h}`);
    await ctx.close();
  }
}
await browser.close();
```

After running, report the results. If any viewport fails (✗), investigate the cause and fix the CSS before reporting done. The status page must never scroll on any viewport from 1366×768 up to 5K2K. The player page must not scroll on any modern phone at default fonts or 1.15×, and must not scroll on Pixel-class phones at 1.3×; horizontal scroll is never acceptable anywhere, at any font scale.
