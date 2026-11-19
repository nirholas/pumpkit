# Build from the repository root so the @pumpkit/core workspace is available:
#   docker build -f packages/channel/Dockerfile -t pumpkit-channel .

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

COPY . .
# No native modules here; skip install scripts so other workspaces' native
# deps (better-sqlite3, canvas) are not compiled, and run the one repo
# postinstall step explicitly.
RUN npm ci --ignore-scripts && node tools/patch-pump-sdk.mjs
RUN npx turbo build --filter=@pumpkit/channel
RUN npm prune --omit=dev --ignore-scripts

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:24-alpine

LABEL org.opencontainers.image.title="PumpFun Channel Feed Bot"
LABEL org.opencontainers.image.description="Read-only Telegram channel feed for PumpFun activity"

WORKDIR /app

RUN addgroup -S bot && adduser -S bot -G bot

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules/
# node_modules/bigint-buffer links to the patched copy in vendor/
COPY --from=build /app/vendor vendor/
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/core/dist packages/core/dist/
COPY --from=build /app/packages/channel/package.json packages/channel/
COPY --from=build /app/packages/channel/dist packages/channel/dist/

WORKDIR /app/packages/channel

# Writable data directory for persisted claim tracker
RUN mkdir -p /app/data && chown bot:bot /app/data
ENV DATA_DIR=/app/data

USER bot

EXPOSE 3000

CMD ["node", "--enable-source-maps", "dist/index.js"]
