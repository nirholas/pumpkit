# Task 4: Build the Docs Page

## Context

You're building a website for **PumpKit** — an open-source PumpFun Telegram bot framework on Solana. The site uses a **Telegram-style UI** with dark chat aesthetics.

The site already has:
- Vite + React + TypeScript + Tailwind CSS
- Telegram-style Layout shell with sidebar + top bar (`src/components/Layout.tsx`)
- Tailwind config with `tg-*` and `pump-*` color tokens
- Other pages use Telegram message bubbles to present content

## Your Task

**Create `src/pages/Docs.tsx`** — a documentation page styled as a Telegram channel/chat with pinned messages and organized doc sections.

**Update `src/main.tsx`** to add the `/docs` route.

## Design Concept

The docs page looks like a **Telegram channel** called "PumpKit Docs" where each documentation section is a "pinned message" or "channel post." Users scroll through docs as if reading a Telegram channel history. There's a sticky table of contents at the top.

## Page Structure

### 1. Sticky Table of Contents
At the top of the scroll area, a sticky horizontal nav:
```
sticky top-0 z-10 bg-tg-chat/95 backdrop-blur-sm border-b border-tg-border
```
- Horizontal scrollable pill bar (like the Dashboard filters)
- Sections: Getting Started, Architecture, Packages, Bot Commands, API, Tutorials, FAQ
- Clicking scrolls to that section (use `id` anchors + `scrollIntoView`)
- Active pill highlighted in `bg-tg-blue text-white`

### 2. Welcome / Getting Started Section
Bot message (incoming bubble):
- Sender: "PumpKit Docs" with 📖 avatar
- Content:

```
📖 Getting Started

PumpKit is an open-source TypeScript framework for building PumpFun 
Telegram bots on Solana. It provides production-ready building blocks 
so you can ship a bot in hours, not weeks.

Prerequisites:
• Node.js ≥ 20
• A Telegram Bot Token (from @BotFather)
• A Solana RPC URL (Helius, Quicknode, etc.)

Installation:
```
Then a code block (inside the bubble):
```
git clone https://github.com/nirholas/pumpkit.git
cd pumpkit && npm install
```

### 3. Architecture Section
Bot message with an ASCII diagram inside a code block:
```
┌───────────────────────────────────────────────┐
│                @pumpkit/core                  │
│  bot/ • monitor/ • solana/ • formatter/       │
│  storage/ • config/ • health/ • logger/       │
└──────┬──────────────────┬─────────────────────┘
       │                  │
 ┌─────▼──────┐    ┌──────▼──────┐
 │  monitor   │    │  tracker    │
 │ DM + API   │    │ Groups +   │
 │ Channel    │    │ Leaderboard │
 └────────────┘    └─────────────┘
```
Styled as `font-mono text-xs bg-[#1a2332] rounded-lg p-3 overflow-x-auto`

### 4. Packages Section
A series of "mini-post" bubbles, one per package. Each contains:
- Package name in bold `text-tg-blue`
- One-liner description
- Key features as bullet points
- Status badge: ✅ Ready

Packages to document:
- **@pumpkit/core** — Shared framework: bot scaffolding, Solana monitoring, formatters, storage, config, health checks
- **@pumpkit/monitor** — All-in-one PumpFun monitor: fee claims, launches, graduations, whale trades, CTO alerts. Includes REST API + SSE streaming
- **@pumpkit/channel** — Read-only Telegram channel feed that broadcasts token events  
- **@pumpkit/claim** — Fee claim tracker: look up claims by token CA or creator's X/Twitter handle
- **@pumpkit/tracker** — Group call-tracking bot with leaderboards, PNL cards, and multi-chain support

### 5. Bot Commands Section
Bot message showing commands in a formatted table-like layout:
```
🤖 Monitor Bot Commands

/start     — Start the bot & show welcome
/help      — Show all commands
/watch CA  — Watch a wallet for fee claims
/unwatch CA — Stop watching a wallet
/list      — Show watched wallets
/claims    — Recent claim events
/status    — Bot health & uptime
/alerts    — Configure alert settings
```
Use `font-mono` for the commands, regular font for descriptions.

### 6. API Reference Section
Bot message with endpoint docs:
```
📡 Monitor API Endpoints

GET  /api/v1/health         → Bot status, uptime
GET  /api/v1/watches        → List watched wallets
POST /api/v1/watches        → Add a watch
DEL  /api/v1/watches/:addr  → Remove a watch
GET  /api/v1/claims         → Recent claims (paginated)
GET  /api/v1/claims/stream  → SSE real-time stream
POST /api/v1/webhooks       → Register webhook
DEL  /api/v1/webhooks/:id   → Remove webhook
```
HTTP methods colored: GET=`text-pump-green`, POST=`text-tg-blue`, DEL=`text-pump-pink`

### 7. Tutorials Quick Links
Bot message with a numbered list of links:
```
📚 Tutorials

1. Set up your first monitor bot
2. Deploy to Railway in 5 minutes
3. Add custom event handlers
4. Build a channel feed bot
5. Create a call-tracking group bot
6. Integrate with PumpFun SDK
```
Each is a `text-tg-blue hover:underline` link (can link to `#` for now).

### 8. FAQ Section
A series of Q&A pairs. Each Q is an outgoing bubble, each A is an incoming bot response:

Q: "Is PumpKit free to use?"
A: "Yes! PumpKit is MIT licensed. Use it for personal or commercial projects."

Q: "Does it work with PumpSwap?"
A: "Yes. The monitor detects token graduations and can track AMM pool activity via @pumpkit/core."

Q: "Can I run multiple bots?"
A: "Absolutely. Each package is independent. Run monitor, tracker, and channel bots simultaneously."

### 9. Footer CTA
Bot message:
```
🚀 Ready to start building?

Join the community or dive into the code:
```
Inline keyboard buttons: `⭐ GitHub` (external), `💬 Telegram` (external link to `#`), `🪙 Create Coin` → `/create`

## Message Styling (consistent with other pages)

```
Incoming bubble:
  flex gap-2 items-start
  Avatar: w-8 h-8 rounded-full bg-tg-input flex items-center justify-center
  Bubble: bg-tg-bubble-in rounded-2xl rounded-bl-sm px-4 py-3 max-w-[85%]
  Sender: text-tg-blue text-sm font-medium mb-1 ("PumpKit Docs")

Outgoing bubble:  
  bg-tg-bubble rounded-2xl rounded-br-sm max-w-[85%] ml-auto px-4 py-3

Code blocks inside bubbles:
  bg-[#1a2332] rounded-lg p-3 font-mono text-sm text-zinc-300 overflow-x-auto mt-2

Section separators:
  <div id="section-name" className="pt-4" /> (for scroll anchors)

Inline keyboard:
  grid grid-cols-2 (or 3) gap-2 mt-2
  bg-tg-input text-tg-blue text-xs rounded-lg px-3 py-1.5 text-center
```

## Scroll-to-Section Logic

```tsx
const sections = ['getting-started', 'architecture', 'packages', 'commands', 'api', 'tutorials', 'faq'];
const [activeSection, setActiveSection] = useState('getting-started');

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActiveSection(id);
}
```

Optionally use IntersectionObserver to update `activeSection` as user scrolls.

## Tailwind Colors Available

```
tg-bg tg-sidebar tg-chat tg-header tg-input tg-hover tg-border
tg-blue tg-green tg-bubble tg-bubble-in
pump-green pump-pink pump-yellow pump-purple pump-orange pump-cyan
```

## Files to Edit

1. **Create** `packages/web/src/pages/Docs.tsx`
2. **Edit** `packages/web/src/main.tsx` — add: `<Route path="docs" element={<Docs />} />`

## Do NOT

- Add any dependencies (no markdown renderer needed — all content is hardcoded JSX)
- Modify Layout.tsx or tailwind.config.js
- Use images (emoji only)
- Create separate files for each section — keep it all in Docs.tsx
