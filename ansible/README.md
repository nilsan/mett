# Ansible deployment

Pulls the latest image from **ghcr.io** and recreates the running `me[tt]` containers on **bf.nottseter.no**. The image itself is built by the `build` GitHub Actions workflow on every push to `main` — the deploy host never compiles anything, and never sees the source tree. Compose file and Caddyfile are shipped from the local repo via the playbook itself, so the host only needs Docker — no git, no source checkout.

## Prerequisites

- **Ansible** 2.10 or newer on your local machine.
- **SSH access** to `bf.nottseter.no` as user `nilsan`, using your normal SSH agent / key. Test with `ssh nilsan@bf.nottseter.no echo ok`.
- **Docker + Compose v2** installed on the remote and the `nilsan` user in the `docker` group (no `sudo` required for `docker compose ...`).
- **Persistent data dirs** at `~/docker/mett/{katja,arne,dag,me}/` on the remote (created on first run if missing — Docker auto-creates them when binding the volume, but they'll be `root`-owned; either pre-create them as `nilsan` or let Docker handle them).

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

1. Ships `docker/docker-compose.yml` and `docker/Caddyfile` from the local repo to `/home/nilsan/mett/docker/` on the remote.
2. Runs `docker compose -f docker/docker-compose.yml pull` from `/home/nilsan/mett/` to fetch `ghcr.io/nilsan/mett:latest`.
3. Runs `docker compose -f docker/docker-compose.yml up -d` to recreate any container whose image changed (Caddy is unaffected unless its image is newer).
4. If the Caddyfile changed, sends Caddy a `caddy reload` (Caddy doesn't watch its config; without this, an edited Caddyfile would sit on disk unread until the container is recreated).
5. Prints `docker compose ps` so you can confirm everything came back up.
6. Runs `verify.yml` (see below) to smoke-test each subdomain over HTTPS.

The playbook is idempotent: re-running it after a successful deploy is a no-op apart from a `pull` that finds the image cached and an `up -d` that finds nothing to recreate. The two file-ship tasks only register `changed` when the file content actually differs.

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
- For a manual local-build deploy (no GHCR), `scp -r` the repo to the host, then `BUILD_SHA=$(git rev-parse --short HEAD) docker compose build && docker compose up -d` from inside it. The compose file keeps a `build:` block alongside `image:` precisely for this fallback.
