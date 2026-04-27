# Ansible deployment

Pulls the latest image from **ghcr.io** and recreates the running `me[tt]` containers on **bf.nottseter.no**. The image itself is built by the `build` GitHub Actions workflow on every push to `main` — the deploy host never compiles anything.

## Prerequisites

- **Ansible** 2.10 or newer on your local machine.
- **SSH access** to `bf.nottseter.no` as user `nilsan`, using your normal SSH agent / key. Test with `ssh nilsan@bf.nottseter.no echo ok`.
- **Source already checked out** at `/home/nilsan/src/mett` on the remote with `origin` pointing at the GitHub repo. This playbook does *not* clone the repo for you.
- **Docker + Compose v2** installed on the remote and the `nilsan` user in the `docker` group (no `sudo` required for `docker compose ...`).

## Usage

From this directory:

```bash
ansible-playbook -i inventory.ini deploy.yml
```

Optional flags:

```bash
# Show what would change without doing it (note: the build/up steps are not
# perfectly check-mode-safe, so use this mostly to verify connectivity).
ansible-playbook -i inventory.ini deploy.yml --check

# Stop on the first task that reports a change — useful for "is anything new?"
ansible-playbook -i inventory.ini deploy.yml --start-at-task="Fast-forward git pull"
```

## What it does

1. Records the current `HEAD` commit on the remote.
2. Runs `git pull --ff-only` in `/home/nilsan/src/mett`. Aborts if the local branch has diverged. (The compose file and Caddyfile come from git; only the runtime image comes from ghcr.io.)
3. Lists any incoming commits so the deploy log shows what was actually shipped.
4. Runs `docker compose -f docker/docker-compose.yml pull` to fetch `ghcr.io/nilsan/mett:latest`.
5. Runs `docker compose -f docker/docker-compose.yml up -d` to recreate any container whose image changed (Caddy is unaffected unless its image is newer).
6. Prints `docker compose ps` so you can confirm everything came back up.
7. Runs `verify.yml` (see below) to smoke-test each subdomain over HTTPS.

The playbook is idempotent: re-running it after a successful deploy is a no-op apart from a quick `git pull` (already up to date), a `pull` that finds the image cached, and an `up -d` that finds nothing to recreate.

### Timing the deploy

After `git push`, wait for the GitHub Actions **build** workflow to finish before running `deploy.yml` — it takes ~1–2 minutes to publish `ghcr.io/nilsan/mett:latest`. If you deploy too soon, the host pulls the previous image and `verify.yml` reports an SHA mismatch. Watch the run:

```bash
gh run watch --workflow=build.yml
```

Skip the smoke test with `--skip-tags verify` if you've already verified manually:

```bash
ansible-playbook -i inventory.ini deploy.yml --skip-tags verify
```

## Standalone verification

`verify.yml` runs locally (no SSH) and hits each production subdomain over HTTPS to assert:

- `GET /` returns 200 and the version footer carries the expected commit SHA.
- `GET /api/state` returns 200 with the expected JSON shape (`game` / `players` / `census` / `astLevels` / `astStatus`, with 17 AST levels).
- `GET /api/civs` returns 200 with all 18 civilisations.

The expected SHA defaults to the local repo's `HEAD` short SHA (what `deploy.yml` would have just baked into the image). Override:

```bash
ansible-playbook -i inventory.ini verify.yml -e expected_sha=abc1234
```

This replaces the manual `for h in katja arne dag me; do curl …` smoke-test we used to run after every deploy.

## Caveats

- Brief downtime per instance (~1–3 s while the container is recreated). Not zero-downtime — fine for a casual board-game tracker, not designed for SLA work.
- `--ff-only` will fail loudly if someone has committed directly on the remote working copy. Resolve that on the box before re-running.
- Deploys depend on the **build** GitHub Actions workflow having published an image to ghcr.io for the current commit. If the workflow is still running (or failed), `verify.yml` will catch the SHA mismatch.
- For a manual local-build deploy (no GHCR), set `BUILD_SHA=$(git rev-parse --short HEAD)` and run `docker compose build && up -d` on the host directly. The compose file keeps a `build:` block alongside `image:` precisely for this fallback.
