Manage the local me[tt] dev server (bun run --watch). Accepts an optional argument: `start` (default), `stop`, `restart`, `status`, or `logs`.

PID files:
- `.pid` (repo root, gitignored) — written by the **server itself** on boot (`src/index.ts`). This is the actual `bun run --watch src/index.ts` process and the authoritative kill target.
- `/tmp/mett-dev.pid` — the `bun run dev` wrapper PID captured at launch. Killing only this can orphan the watcher child, so always kill the server PID from `.pid` first.

Log file: `/tmp/mett-dev.log`

## status (always check this first)

```bash
curl -sf http://localhost:3000/ -o /dev/null -w "%{http_code}" 2>&1
```

If it returns `200` the server is up. If it returns an error or non-200, it is down.

## start

Only start if not already running (check status first). The server auto-reloads on source file changes via `--watch` — no action needed after editing files.

```bash
nohup bun run dev > /tmp/mett-dev.log 2>&1 &
echo $! > /tmp/mett-dev.pid
```

The server writes its own PID to `.pid` once it boots. Wait up to 5 seconds and re-check with curl to confirm it came up. Report the PID and confirm the server is responding.

## stop

Kill the server PID from `.pid`, then the wrapper from `/tmp/mett-dev.pid` if it still exists:

```bash
kill $(cat .pid) 2>/dev/null; rm -f .pid
kill $(cat /tmp/mett-dev.pid) 2>/dev/null; rm -f /tmp/mett-dev.pid
```

Never use lsof to find the PID — only use the PID files or a previously captured job reference.

## restart

Stop (if running), then start. **Only use this if the server is unresponsive or crashed.** The server runs with `--watch` and auto-reloads on every source file change — do not restart just because files were edited.

## logs

```bash
tail -50 /tmp/mett-dev.log
```

---

If no argument is given, check status and start if not running. Always report what was done and whether the server is up at the end.
