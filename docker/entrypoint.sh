#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at https://mozilla.org/MPL/2.0/.

# Start me[tt] as the unprivileged `bun` user. Volumes created by older
# images (which ran as root) hold root-owned files, so when started as root
# hand the data directory over first, then drop privileges.
set -eu

if [ "$(id -u)" = "0" ]; then
  data_dir="$(dirname "${DATABASE_PATH:-/app/data/mett.db}")"
  mkdir -p "$data_dir"
  chown -R bun:bun "$data_dir"
  exec su-exec bun:bun "$@"
fi

exec "$@"
