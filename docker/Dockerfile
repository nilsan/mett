# Bun version: keep in sync with /.bun-version (CI passes it as BUN_VERSION;
# tests/client-build.test.ts fails if this default drifts from that file).
ARG BUN_VERSION=1.4.4
FROM oven/bun:${BUN_VERSION}-alpine

WORKDIR /app

# su-exec: the entrypoint starts as root only to hand the data volume to the
# unprivileged `bun` user, then drops privileges before starting the server.
# hadolint ignore=DL3018
RUN apk add --no-cache su-exec

# Install runtime dependencies first (layer cache). htmx + Pico are served
# from node_modules, so they are regular dependencies.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
 && rm -rf /root/.bun/install/cache

# Copy source. Normalise permissions so the non-root user can read everything
# regardless of the build host's umask.
COPY src/ ./src/
COPY db/ ./db/
COPY public/ ./public/
COPY docker/entrypoint.sh /usr/local/bin/mett-entrypoint
RUN chmod -R a+rX /app \
 && chmod 755 /usr/local/bin/mett-entrypoint \
 && mkdir -p /app/data \
 && chown bun:bun /app/data

# Build-time identifier baked into the image. Set by docker-compose / CI from
# the host's `git rev-parse --short HEAD`; defaults to empty for ad-hoc builds.
ARG BUILD_SHA=
ENV BUILD_SHA=${BUILD_SHA}

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/mett.db
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/healthz').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["mett-entrypoint"]
CMD ["bun", "run", "src/index.ts"]
