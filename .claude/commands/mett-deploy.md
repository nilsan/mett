Full release pipeline for me[tt]. Execute each step in order; abort and report if any step fails.

## Steps

### 1. Pre-flight checks (run in parallel)
- `bun run test` — all tests must pass
- `bunx tsc --noEmit` — zero type errors
- `bun run test:browser` — Playwright layout suite (self-managed `:3100` instance; does not touch the dev server)

All three must be clean before proceeding.

### 2. Version bump
Bump the version in `package.json` according to semver:
- Patch (`0.0.x`) for bug fixes
- Minor (`0.x.0`) for new features or meaningful internal work
- Major (`x.0.0`) for breaking changes

If the version is surfaced in the running app (footer, etc.), the bump propagates automatically on deploy.

### 3. Commit and push
- Stage all modified tracked files (do NOT use `git add -A`; add specific files)
- Commit with a descriptive message summarising what changed and why
- `git push`

Never add "Co-Authored-By" or any Claude signature to the commit message.

### 4. Watch the GitHub Actions build
```bash
gh run list --workflow=build.yml --repo=nilsan/mett --limit=1
```
Get the run ID, then:
```bash
gh run watch <run-id> --repo=nilsan/mett
```
Wait for the build to succeed (pushes the new image to ghcr.io). Abort if it fails.

### 5. Deploy via Ansible
```bash
cd /home/nilsan/src/mett-deploy
ansible-playbook -i ansible/inventory.ini ansible/deploy.yml
```
This pulls the new image, recreates all 5 containers, and runs the verify playbook automatically.

### 6. Verify prod SHAs
Confirm all 5 instances (katja, arne, dag, me, roe .mett.games) serve the new commit SHA:
```bash
for sub in katja arne dag me roe; do echo -n "$sub: "; curl -s https://${sub}.mett.games/ | grep -oE '[0-9a-f]{7}' | head -1; done
```
All 5 must match the commit just pushed.

Report the deployed SHA and version when done.
