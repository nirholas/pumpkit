# Task 5: Build the Packages Page + Final Polish

## Context

You're building a website for **PumpKit** — an open-source PumpFun Telegram bot framework on Solana. The site uses a **Telegram-style UI** with dark chat aesthetics.

The site already has:
- Vite + React + TypeScript + Tailwind CSS
- Telegram-style Layout shell with sidebar + top bar
- Tailwind config with `tg-*` and `pump-*` color tokens
- Pages: Home (`/`), Create Coin (`/create`), Dashboard (`/dashboard`), Docs (`/docs`)
- All pages use Telegram message bubble patterns

## Your Task

1. **Create `src/pages/Packages.tsx`** — a package showcase page
2. **Update `src/main.tsx`** — add the `/packages` route
3. **Add a Telegram-style input bar** to the bottom of Layout.tsx (cosmetic only)
4. **Add the slideIn animation** to `src/index.css` for the Dashboard
5. **Create `public/favicon.svg`** — simple PumpKit logo

## Part 1: Packages Page

The packages page displays each PumpKit package as a detailed **Telegram channel post**, showcasing what each bot does with code examples and feature lists.

### Page Container
```tsx
<div className="flex flex-col gap-4 p-4 max-w-3xl mx-auto pb-24">
  {/* Date separator */}
  <div className="text-center py-2">
    <span className="bg-tg-input/80 text-zinc-400 text-xs px-3 py-1 rounded-full">
      Packages
    </span>
  </div>
  {/* Package posts */}
</div>
```

### Overview Message (incoming bubble)
- Sender: "PumpKit" with 📦 avatar
- Text: "PumpKit ships 5 packages. Each is independent — use what you need."
- Below text, a small stat bar:
  ```
  5 packages • TypeScript • MIT License • Node.js ≥ 20
  ```
  in `text-xs text-zinc-500`

### Package Cards (one incoming bubble per package)

Each package gets a "rich" channel post bubble:

**@pumpkit/core**
```
🧱 @pumpkit/core

The shared foundation. Every PumpKit bot uses core.

Features:
├─ 🤖 Grammy bot scaffolding + command router
├─ 📡 WebSocket + HTTP event monitors
├─ ⛓️ Solana RPC client + program decoders
├─ 📝 HTML message formatter (Telegram)
├─ 💾 File-based + SQLite storage adapters
├─ ⚙️ Typed env config with validation
├─ 🏥 HTTP health check server
└─ 📊 Leveled console logger

npm install @pumpkit/core (coming soon)
```
Code example inside the bubble:
```typescript
import { createBot, createHealthServer } from '@pumpkit/core';

const bot = createBot({
  token: process.env.BOT_TOKEN!,
  commands: { start: (ctx) => ctx.reply('Hello!') },
});
```

**@pumpkit/monitor**
```
📡 @pumpkit/monitor

All-in-one PumpFun activity monitor. DM bot + REST API + SSE streaming.

Monitors:
├─ 💰 Fee claims (by wallet or token)
├─ 🚀 Token launches (with cashback detection)
├─ 🎓 Graduations (bonding curve → AMM)
├─ 🐋 Whale trades (configurable threshold)
├─ 👑 CTO events (creator transfers)
└─ 💎 Fee distributions

API: REST endpoints + SSE real-time stream
Deploy: Railway, Fly.io, or any Node.js host
```

**@pumpkit/channel**
```
📢 @pumpkit/channel

Read-only Telegram channel feed. Broadcasts token events to a public channel.

• Zero interaction needed — just add the bot as channel admin
• Customizable message templates
• Filter by event type
• Rate limiting built in
```

**@pumpkit/claim**
```
💰 @pumpkit/claim

Fee claim tracker. Look up claims by token CA or creator X handle.

• /claim <CA> — show fee claims for a token
• /creator <handle> — find tokens by X/Twitter handle
• CSV export for accounting
• Historical claim data
```

**@pumpkit/tracker**
```
🏆 @pumpkit/tracker

Group call-tracking bot. Add to your Telegram group, members call tokens, bot tracks results.

Features:
├─ 📊 Leaderboards (daily/weekly/monthly/all-time)
├─ 💰 PNL cards with entry/exit prices
├─ 🏅 Rank tiers (Amateur → Oracle)
├─ ⛓️ Multi-chain (Solana, ETH, Base, BSC)
├─ 📈 Win rate & multiplier tracking
└─ 🎯 Call resolution (auto or manual)
```

### Style for Package Bubbles

Each package bubble should have a subtle colored left border to distinguish it:
```
border-l-4 border-l-{color}
```
Colors by package:
- core: `border-l-tg-blue`
- monitor: `border-l-pump-green`
- channel: `border-l-pump-cyan`
- claim: `border-l-pump-yellow`
- tracker: `border-l-pump-purple`

Code snippets inside bubbles:
```
bg-[#1a2332] rounded-lg p-3 font-mono text-xs text-zinc-300 overflow-x-auto mt-3
```

### CTA at Bottom (outgoing bubble)
```
Ready to build? Pick a package and start coding.

[📖 Read the Docs]  [🪙 Create Coin]  [⭐ GitHub]
```

## Part 2: Telegram Input Bar (Layout.tsx)

Add a cosmetic Telegram-style message input bar to the bottom of the main content area. It's non-functional but completes the Telegram look.

At the bottom of the `<main>` in Layout.tsx, after `<Outlet />`, add:

```tsx
{/* Cosmetic Telegram input bar */}
<div className="shrink-0 bg-tg-header border-t border-tg-border px-4 py-2 flex items-center gap-3">
  <button className="text-zinc-500 hover:text-zinc-300 transition text-xl">😊</button>
  <div className="flex-1 bg-tg-input rounded-full px-4 py-2 text-sm text-zinc-500">
    Message...
  </div>
  <button className="text-zinc-500 hover:text-tg-blue transition text-xl">📎</button>
  <button className="w-9 h-9 rounded-full bg-tg-blue flex items-center justify-center text-white text-sm hover:bg-tg-blue/80 transition">
    ▶
  </button>
</div>
```

This should be inside the right panel's flex column, after `<main>` but inside the flex container so it sticks to the bottom.

## Part 3: SlideIn Animation (index.css)

Add to the end of `src/index.css`:

```css
/* Event card entrance animation */
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-slide-in {
  animation: slideIn 0.3s ease-out;
}
```

## Part 4: Favicon (public/favicon.svg)

Create a simple SVG favicon — a rocket emoji style icon in PumpKit colors:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="48" fill="#17212b" stroke="#5eb5f7" stroke-width="3"/>
  <text x="50" y="68" text-anchor="middle" font-size="52">🚀</text>
</svg>
```

## Tailwind Colors Available

```
tg-bg: #17212b       tg-sidebar: #0e1621    tg-chat: #0e1621
tg-header: #17212b   tg-input: #242f3d      tg-hover: #202b36
tg-border: #1c2733   tg-blue: #5eb5f7       tg-green: #4fae4e
tg-bubble: #2b5278   tg-bubble-in: #182533
pump-green: #00e676  pump-pink: #ff6b9d     pump-yellow: #ffd54f
pump-purple: #b388ff pump-orange: #ff9100   pump-cyan: #00e5ff
```

## Files to Edit

1. **Create** `packages/web/src/pages/Packages.tsx`
2. **Edit** `packages/web/src/main.tsx` — add: `<Route path="packages" element={<Packages />} />`
3. **Edit** `packages/web/src/components/Layout.tsx` — add the input bar to the bottom
4. **Edit** `packages/web/src/index.css` — add the slideIn animation
5. **Create/replace** `packages/web/public/favicon.svg`

## Do NOT

- Add any dependencies
- Change the tailwind.config.js
- Make any API calls
- Use images (emoji only, except the SVG favicon)
- Remove any existing route — only add the new `/packages` route
