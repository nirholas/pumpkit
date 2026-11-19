# Build from the repository root so the @pumpkit/core workspace is available:
#   docker build -f packages/tracker/Dockerfile -t pumpkit-tracker .

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build

# Native deps for better-sqlite3 and canvas
RUN apk add --no-cache python3 make g++ cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev pixman-dev

WORKDIR /app

COPY . .
RUN npm ci
RUN npx turbo build --filter=@pumpkit/tracker
RUN npm prune --omit=dev

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:24-alpine

LABEL org.opencontainers.image.title="PumpKit Tracker Bot"
LABEL org.opencontainers.image.description="Telegram call-tracking bot with leaderboards and PNL cards"

# Runtime libraries for canvas
RUN apk add --no-cache cairo pango jpeg giflib librsvg pixman

WORKDIR /app

RUN addgroup -S bot && adduser -S bot -G bot

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules/
# node_modules/bigint-buffer links to the patched copy in vendor/
COPY --from=build /app/vendor vendor/
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/core/dist packages/core/dist/
COPY --from=build /app/packages/tracker/package.json packages/tracker/
COPY --from=build /app/packages/tracker/dist packages/tracker/dist/

WORKDIR /app/packages/tracker

# Writable data directory for SQLite database
RUN mkdir -p /app/data && chown bot:bot /app/data
ENV DATA_DIR=/app/data

USER bot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/health || exit 0

CMD ["node", "--enable-source-maps", "dist/index.js"]
