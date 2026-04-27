# Ansible deployment

Pulls the latest image from **ghcr.io** and recreates the running `me[tt]` containers on **bf.nottseter.no**. The image itself is built by the `build` GitHub Actions workflow on every push to `main` — the deploy host never compiles anything, and the deploy playbook deliberately does not touch the git tree so it can never ship unintended source changes alongside the image swap.

## Prerequisites

- **Ansible** 2.10 or newer on your local machine.
- **SSH access** to `bf.nottseter.no` as user `nilsan`, using your normal SSH agent / key. Test with `ssh nilsan@bf.nottseter.no echo ok`.
- **Source already checked out** at `/home/nilsan/src/mett` on the remote with `origin` pointing at the GitHub repo. The compose file and Caddyfile are read from this working copy. This playbook does *not* clone or pull the repo — see "Updating compose / Caddyfile" below for that one-off case.
- **Docker + Compose v2** installed on the remote and the `nilsan` user in the `docker` group (no `sudo` required for `docker compose ...`).

## Usage

From this directory:

```bash
ansible-playbook -i inventory.ini deploy.yml
```

Optional flags:

```bash
# Show what would change without doing it (note: the pull/up steps are not
# perfectly check-mode-safe, so use this mostly to verify connectivity).
ansible-playbook -i inventory.ini deploy.yml --check

# Skip the post-deploy smoke test (e.g. emergency rollback).
ansible-playbook -i inventory.ini deploy.yml --skip-tags verify
```

## What it does

1. Runs `docker compose -f docker/docker-compose.yml pull` to fetch `ghcr.io/nilsan/mett:latest`.
2. Runs `docker compose -f docker/docker-compose.yml up -d` to recreate any container whose image changed (Caddy is unaffected unless its image is newer).
3. Prints `docker compose ps` so you can confirm everything came back up.
4. Runs `verify.yml` (see below) to smoke-test each subdomain over HTTPS.

The playbook is idempotent: re-running it after a successful deploy is a no-op apart from a `pull` that finds the image cached and an `up -d` that finds nothing to recreate.

## Updating compose / Caddyfile

The deploy playbook does **not** run `git pull` on the remote. The compose file and Caddyfile only need updating when their definitions change (rare — adding a service, changing a route). When that happens, do it manually before deploying:

```bash
ssh nilsan@bf.nottseter.no
cd ~/src/mett && git pull --ff-only
exit
ansible-playbook -i inventory.ini deploy.yml
```

Keeping the git pull out of the deploy path means a normal image-swap deploy can never accidentally ship unintended source-tree changes (e.g. half-finished commits left on the remote working copy).

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

`verify.yml` runs locally (no SSH) and hits each production subdomain over HTTPS to assert that `GET /` returns 200 and the version footer carries the expected commit SHA. That single fact is enough to prove the right image is live; we deliberately don't read `/api/state` or `/api/civs` in the verify step — that would pull live game contents into the play log for no real safety benefit (those payloads are already covered by the test suite).

The expected SHA defaults to the local repo's `HEAD` short SHA (what `build.yml` would have just baked into the image on push). Override:

```bash
ansible-playbook -i inventory.ini verify.yml -e expected_sha=abc1234
```

This replaces the manual `for h in katja arne dag me; do curl …` smoke-test we used to run after every deploy.

## Caveats

- Brief downtime per instance (~1–3 s while the container is recreated). Not zero-downtime — fine for a casual board-game tracker, not designed for SLA work.
- Deploys depend on the **build** GitHub Actions workflow having published an image to ghcr.io for the current commit. If the workflow is still running (or failed), `verify.yml` will catch the SHA mismatch.
- For a manual local-build deploy (no GHCR), set `BUILD_SHA=$(git rev-parse --short HEAD)` and run `docker compose build && up -d` on the host directly. The compose file keeps a `build:` block alongside `image:` precisely for this fallback.
