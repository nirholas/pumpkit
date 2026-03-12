# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine

LABEL org.opencontainers.image.title="PumpFun Claim Bot"
LABEL org.opencontainers.image.description="Interactive Telegram bot for tracking PumpFun fee claims"

WORKDIR /app

RUN addgroup -S bot && adduser -S bot -G bot

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/dist dist/

RUN mkdir -p /app/data && chown bot:bot /app/data
ENV DATA_DIR=/app/data

USER bot

CMD ["node", "dist/index.js"]
