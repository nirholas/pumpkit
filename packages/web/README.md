# @pumpkit/web

> Frontend dashboard and documentation site for PumpKit — styled as a Telegram chat interface.

## Features

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Project overview, feature grid, package cards, quick start |
| `/create` | Create Coin | Interactive token creation form (demo/marketing) |
| `/dashboard` | Live Feed | Real-time event feed with filters and stats |
| `/docs` | Documentation | Getting started, architecture, packages, API, tutorials, FAQ |
| `/packages` | Packages | Detailed showcase of all 5 PumpKit packages |

### Telegram-Style UI

- Dark chat interface with message bubbles (incoming/outgoing)
- Sidebar with channel-style navigation
- Cosmetic message input bar
- Inline keyboard buttons for CTAs
- Date separators and timestamps

## Tech Stack

| Tool | Purpose |
|------|---------|
| **Vite** | Build tool and dev server |
| **React 19** | UI framework |
| **React Router 7** | Client-side routing |
| **Tailwind CSS 3** | Styling with `tg-*` and `pump-*` color tokens |

## Development

```bash
cd packages/web
npm run dev      # Start Vite dev server
npm run build    # Production build (tsc + vite)
npm run preview  # Preview production build
```

## API Integration

The dashboard can connect to a running `@pumpkit/monitor` bot API.
Set the `VITE_API_URL` environment variable to enable live data:

```bash
VITE_API_URL=http://localhost:3000 npm run dev
```

### Monitor API Endpoints

```
GET  /api/v1/health           → Bot status, uptime, connected wallets
GET  /api/v1/watches          → List watched wallets
POST /api/v1/watches          → Add a watch (body: { address: string })
DELETE /api/v1/watches/:addr  → Remove a watch
GET  /api/v1/claims           → Recent claim events (paginated)
GET  /api/v1/claims/stream    → SSE stream of real-time claims
POST /api/v1/webhooks         → Register webhook URL
DELETE /api/v1/webhooks/:id   → Remove webhook
```

Without `VITE_API_URL`, the dashboard displays a simulated event feed for demonstration.

## Project Structure

```
src/
├── main.tsx                  # Entry point + React Router config
├── index.css                 # Tailwind directives + animations
├── types.ts                  # Shared type definitions
├── components/
│   ├── Layout.tsx            # Telegram-style shell (sidebar + top bar + input bar)
│   ├── EventCard.tsx         # Event feed cards (6 event types)
│   └── StatsBar.tsx          # Feed statistics bar
├── pages/
│   ├── Home.tsx              # Landing page
│   ├── CreateCoin.tsx        # Token creation form
│   ├── Dashboard.tsx         # Live event feed
│   ├── Docs.tsx              # Documentation
│   └── Packages.tsx          # Package showcase
├── hooks/
│   └── useEventStream.ts    # SSE connection with auto-reconnect
└── lib/
    ├── api.ts                # REST API client
    └── types.ts              # API response types
```

## License

MIT
