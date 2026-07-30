# pumpkit examples

Open-source framework for building PumpFun Telegram bots on Solana

## Example 1

```text
┌───────────────────────────────────────────────────┐
│                  @pumpkit/core                    │
│                                                   │
│  bot/       grammy scaffolding, command router    │
│  monitor/   WebSocket + HTTP event monitors       │
│  solana/    RPC client, program IDs, decoders     │
│  formatter/ HTML message builder (Telegram)       │
│  storage/   File-based + SQLite adapters          │
│  config/    Typed env loader with validation      │
│  health/    HTTP health check server              │
│  logger/    Leveled console logger                │
│  api/       REST + SSE + webhook server           │
│  social/    Twitter/X + GitHub integrations       │
│  types/     Shared event & program types          │
└──────────┬────────────────────────┬───────────────┘
           │                        │
    ┌──────▼───────┐          ┌──────▼───────┐
    │  @pumpkit/   │          │  @pumpkit/   │
    │   monitor    │          │   tracker    │
    │              │          │              │
    │ DM commands  │          │ Group calls  │
    │ Channel feed │          │ Leaderboards │
    │ REST API     │          │ PNL cards    │
    │ Webhooks     │          │ Rankings     │
    │ SSE stream   │          │ Multi-chain  │
    └──────────────┘          └──────────────┘
```

## Example 2

```text
pumpkit/
├── packages/
│   ├── core/              @pumpkit/core — shared framework
│   ├── monitor/           @pumpkit/monitor — monitoring bot
│   ├── channel/           @pumpkit/channel — read-only channel feed
│   ├── claim/             @pumpkit/claim — fee claim tracker
│   ├── tracker/           @pumpkit/tracker — group tracker bot
│   └── web/               @pumpkit/web — dashboard (skeleton)
├── docs/                  documentation (everything in this README is also here)
├── tutorials/             numbered, hands-on guides (45+)
├── examples/              starter dashboards & templates
├── agent-prompts/         multi-step refactor prompts
├── prompts/               one-shot workflow prompts
├── security/              audits, checklists
├── tools/                 shell + ts utilities
├── tmp/                   ephemeral scratch
└── turbo.json             monorepo build pipeline
```

## Example 3

```text
@pumpkit/monitor ──→ @pumpkit/core
@pumpkit/tracker ──→ @pumpkit/core
@pumpkit/channel ──→ @pumpkit/core
@pumpkit/claim   ──→ @pumpkit/core
```

## Example 4

```bash
# Clone the repo
git clone https://github.com/nirholas/pumpkit.git
cd pumpkit

# Install dependencies
npm install

# Configure
cp packages/monitor/.env.example packages/monitor/.env
# Edit .env with your TELEGRAM_BOT_TOKEN and SOLANA_RPC_URL

# Run the monitor bot
npm run dev --workspace=@pumpkit/monitor
```

## Example 5

```bash
git clone https://github.com/nirholas/pumpkit.git
cd pumpkit
npm install
cp packages/monitor/.env.example packages/monitor/.env
```

## Example 6

```bash
TELEGRAM_BOT_TOKEN=your-bot-token-here
SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-key
```

## Example 7

```bash
npm run dev --workspace=@pumpkit/monitor
```

## Example 8

```bash
cp packages/tracker/.env.example packages/tracker/.env
```


Every snippet above is taken from the [repository documentation](https://github.com/nirholas/pumpkit#readme).
