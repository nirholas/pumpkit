# Task 3: Build the Live Feed Dashboard

## Context

You're building a website for **PumpKit** — an open-source PumpFun Telegram bot framework on Solana. The site uses a **Telegram-style UI** with **PumpFun-style content**.

The site already has:
- Vite + React + TypeScript + Tailwind CSS
- Telegram-style Layout shell (`src/components/Layout.tsx`)
- Tailwind config with `tg-*` and `pump-*` color tokens
- An existing `src/pages/Dashboard.tsx` that needs to be **completely rewritten**
- An existing `src/components/EventCard.tsx` that needs to be **completely rewritten**
- Types in `src/types.ts` (MonitorEvent, EventType, etc.)

## Your Task

**Rewrite `src/pages/Dashboard.tsx`** and **rewrite `src/components/EventCard.tsx`** to show a simulated real-time token event feed styled as a Telegram chat channel.

## Design Concept

The dashboard looks like a **Telegram channel** called "PumpKit Live" that's receiving a stream of PumpFun events (token launches, whale trades, graduations, etc.). Events are displayed as Telegram message bubbles scrolling in, with mock data that auto-generates.

## Dashboard.tsx

### Layout

```
┌────────────────────────────────────────────────┐
│  Filter bar (sticky at top)                     │
│  [All] [🚀 Launches] [🐋 Whales] [🎓 Grads]   │
│  [💰 Claims] [👑 CTO] [📊 Stats]               │
├────────────────────────────────────────────────┤
│                                                 │
│  [Today separator]                              │
│                                                 │
│  [Event message bubbles...]                     │
│  [Event message bubbles...]                     │
│  [Event message bubbles...]                     │
│                                                 │
│  ─── Bottom info bar ───                        │
│  "Simulated feed • Connect your bot for live"   │
└────────────────────────────────────────────────┘
```

### Filter Bar
- Sticky at top: `sticky top-0 z-10 bg-tg-chat/95 backdrop-blur-sm border-b border-tg-border px-4 py-2`
- Horizontal scroll row of filter pills
- Each pill: `px-3 py-1.5 rounded-full text-sm transition`
  - Active: `bg-tg-blue text-white`
  - Inactive: `bg-tg-input text-zinc-400 hover:text-white`
- Filters: All, 🚀 Launches, 🐋 Whales, 🎓 Graduations, 💰 Claims, 👑 CTO

### Mock Data Generator
Create a `useMockFeed()` hook inside Dashboard.tsx (no separate file needed):

```typescript
const MOCK_TOKENS = [
  { name: 'PumpKitty', symbol: 'KITTY', creator: '7xKp...3nRm' },
  { name: 'SolDoge', symbol: 'SDOGE', creator: '3mFq...8vLp' },
  { name: 'MoonPump', symbol: 'MPUMP', creator: '9aHj...2wXk' },
  { name: 'BonkFren', symbol: 'BFREN', creator: '5cNr...7tQs' },
  { name: 'PepeSol', symbol: 'PEPE', creator: '2dLw...4mYn' },
  { name: 'DegenApe', symbol: 'DAPE', creator: '8bGx...1pRv' },
  { name: 'ChadCoin', symbol: 'CHAD', creator: '4fKt...6sWm' },
  { name: 'WenLambo', symbol: 'WEN', creator: '6eJy...9cDp' },
];

const EVENT_TYPES = ['launch', 'whale', 'graduation', 'claim', 'cto'] as const;
```

- On mount, generate 8-12 initial events with timestamps spread over the last few minutes
- Every 3-5 seconds (random interval), add a new random event at the top
- Cap at 50 events max in state
- Each event gets a random token, random type, random SOL amounts

### Event Messages Container
```tsx
<div className="flex flex-col gap-2 p-4 max-w-3xl mx-auto">
  {/* Date separator */}
  <div className="text-center py-2">
    <span className="bg-tg-input/80 text-zinc-400 text-xs px-3 py-1 rounded-full">Today</span>
  </div>
  {/* Events */}
  {events.map(event => <EventCard key={event.id} event={event} />)}
</div>
```

## EventCard.tsx

Each event is a Telegram-style **channel post** (incoming bubble with channel avatar).

### Structure
```tsx
<div className="flex gap-2 items-start">
  {/* Channel avatar */}
  <div className="w-10 h-10 rounded-full bg-{color} flex items-center justify-center text-lg shrink-0">
    {emoji}
  </div>
  {/* Message bubble */}
  <div className="bg-tg-bubble-in rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
    <p className="text-tg-blue text-sm font-medium mb-1">PumpKit Live</p>
    {/* Event-specific content */}
    <span className="text-[11px] text-zinc-500 block text-right mt-1">{time}</span>
  </div>
</div>
```

### Event Type Designs

**🚀 Launch**
- Avatar bg: `bg-tg-blue`
- Content:
  ```
  🚀 New Token Launch
  
  PumpKitty ($KITTY)
  Creator: 7xKp...3nRm
  
  [View on PumpFun]  [Explorer]     ← inline keyboard buttons
  ```

**🐋 Whale Trade**
- Avatar bg: `bg-pump-orange`
- Content:
  ```
  🐋 Whale Buy — 42.5 SOL
  
  SolDoge ($SDOGE)
  Wallet: 3mFq...8vLp
  
  [View TX]
  ```
- SOL amount in `text-pump-green` for buys, `text-pump-pink` for sells

**🎓 Graduation**
- Avatar bg: `bg-pump-purple`
- Content:
  ```
  🎓 Token Graduated!
  
  MoonPump ($MPUMP) migrated to PumpSwap AMM
  Liquidity: 85.0 SOL
  
  [View Pool]  [Trade]
  ```

**💰 Fee Claim**
- Avatar bg: `bg-pump-green`
- Content:
  ```
  💰 Fee Claimed — 2.3 SOL
  
  Creator 9aHj...2wXk claimed fees from BonkFren ($BFREN)
  
  [View TX]
  ```

**👑 CTO (Creator Transfer)**
- Avatar bg: `bg-pump-pink`
- Content:
  ```
  👑 Creator Transfer
  
  PepeSol ($PEPE)
  From: 2dLw...4mYn → To: 8bGx...1pRv
  
  [View TX]
  ```

### Inline Keyboard Buttons (inside bubbles)
```
grid grid-cols-2 gap-2 mt-2
each button: bg-tg-input text-tg-blue text-xs rounded-lg px-3 py-1.5 text-center
```
Buttons are non-functional links (`<span>` or `<button disabled>`).

### New Event Animation
New events should fade in from top. Use a simple CSS animation:
```css
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
```
Apply `animate-[slideIn_0.3s_ease-out]` on newly added events.

## Tailwind Colors Available

```
tg-bg tg-sidebar tg-chat tg-header tg-input tg-hover tg-border
tg-blue tg-green tg-bubble tg-bubble-in
pump-green pump-pink pump-yellow pump-purple pump-orange pump-cyan
```

## Files to Edit

1. **Rewrite** `packages/web/src/pages/Dashboard.tsx` — full replacement
2. **Rewrite** `packages/web/src/components/EventCard.tsx` — full replacement

## Do NOT

- Add any dependencies
- Modify Layout.tsx, main.tsx, or tailwind.config.js
- Make real API calls — all data is mock
- Delete existing hooks directory or lib directory (even if Dashboard no longer imports from them)
- Use images
