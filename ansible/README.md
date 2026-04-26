# Ansible deployment

Pulls the latest source and rebuilds/restarts the running `me[tt]` containers on **bf.nottseter.no**.

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
2. Runs `git pull --ff-only` in `/home/nilsan/src/mett`. Aborts if the local branch has diverged.
3. Lists any incoming commits so the deploy log shows what was actually shipped.
4. Runs `docker compose -f docker/docker-compose.yml build` to rebuild the four `mett-*` service images.
5. Runs `docker compose -f docker/docker-compose.yml up -d` to recreate any container whose image changed (Caddy is unaffected unless its image is newer).
6. Prints `docker compose ps` so you can confirm everything came back up.

The playbook is idempotent: re-running it after a successful deploy is a no-op apart from a quick `git pull` (already up to date), a fully-cached `build`, and an `up -d` that finds nothing to recreate.

## Caveats

- Brief downtime per instance (~1–3 s while the container is recreated). Not zero-downtime — fine for a casual board-game tracker, not designed for SLA work.
- `--ff-only` will fail loudly if someone has committed directly on the remote working copy. Resolve that on the box before re-running.
- The first run after a Bun/Hono dependency change will be slower (uncached `bun install` step in the Dockerfile).
