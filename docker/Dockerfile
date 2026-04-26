FROM oven/bun:1-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY src/ ./src/
COPY db/ ./db/
COPY public/ ./public/

# Data directory (will be overridden by volume mount in production)
RUN mkdir -p /app/data

# Build-time identifier baked into the image. Set by docker-compose / CI from
# the host's `git rev-parse --short HEAD`; defaults to empty for ad-hoc builds.
ARG BUILD_SHA=
ENV BUILD_SHA=${BUILD_SHA}

ENV DATABASE_PATH=/app/data/mett.db
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
