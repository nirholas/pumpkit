# Build from the repository root so the @pumpkit/core workspace is available:
#   docker build -f packages/monitor/Dockerfile -t pumpkit-monitor .

# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS build

WORKDIR /app

COPY . .
# The monitor has no native modules; skip install scripts so other
# workspaces' native deps (better-sqlite3, canvas) are not compiled, and run
# the one repo postinstall step explicitly.
RUN npm ci --ignore-scripts && node tools/patch-pump-sdk.mjs
RUN npx turbo build --filter=@pumpkit/monitor
RUN npm prune --omit=dev --ignore-scripts

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:24-alpine

LABEL org.opencontainers.image.title="PumpFun Fee Monitor"
LABEL org.opencontainers.image.description="Telegram bot + REST API for PumpFun fee claim monitoring"

WORKDIR /app

RUN addgroup -S bot && adduser -S bot -G bot

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules/
# node_modules/bigint-buffer links to the patched copy in vendor/
COPY --from=build /app/vendor vendor/
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/core/dist packages/core/dist/
COPY --from=build /app/packages/monitor/package.json packages/monitor/
COPY --from=build /app/packages/monitor/dist packages/monitor/dist/

# The monitor keeps its state in ./data, so run from /app to keep it at /app/data.
# NOTE: Railway bans the VOLUME keyword — use Railway Volumes instead
# https://docs.railway.com/reference/volumes
RUN mkdir -p /app/data && chown bot:bot /app/data

# API server port — Railway injects PORT; EXPOSE is just metadata
EXPOSE 3000

USER bot

# Health check against the API (noop when API disabled)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/v1/health || exit 0

CMD ["node", "--enable-source-maps", "packages/monitor/dist/index.js"]
