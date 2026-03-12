# Task 1: Build the PumpKit Home Page

## Context

You're building a website for **PumpKit** — an open-source framework for building PumpFun Telegram bots on Solana. The site uses a **Telegram-style design** (dark chat UI with sidebar) combined with **PumpFun-style content** (token cards, neon green accents, crypto vibes).

The site already has:
- Vite + React + TypeScript + Tailwind CSS
- A Telegram-style Layout shell with sidebar channels and top bar (see `src/components/Layout.tsx`)
- Tailwind config with Telegram colors (`tg-*`) and PumpFun colors (`pump-*`)
- Routes in `src/main.tsx`

## Your Task

**Replace the contents of `src/pages/Home.tsx`** with a PumpFun-style landing page that renders inside the Telegram chat area.

## Design Requirements

The page should look like a **Telegram channel** displaying a series of "messages" that form a landing page. Each section is styled as a **Telegram message bubble** (using `bg-tg-bubble` for outgoing-style, `bg-tg-bubble-in` for incoming-style).

### Sections (each as a message bubble)

1. **Hero Message** (outgoing bubble, right-aligned)
   - PumpKit logo/emoji 🚀
   - "Build your own PumpFun Telegram bot in hours, not weeks"
   - Two buttons styled like Telegram inline keyboard buttons: `⭐ Star on GitHub` and `📖 Read the Docs`
   - Buttons should be `bg-tg-input` with `text-tg-blue`, in a grid row below the text

2. **"What is PumpKit?" Message** (incoming bubble, left-aligned)
   - Brief explanation: open-source TS framework, production bots, Solana/PumpFun monitoring
   - Format like a Telegram message with sender name "PumpKit Bot" in `text-tg-blue` and a small avatar

3. **Feature Grid** (outgoing bubble)
   - 4-6 features as a compact grid inside one bubble:
     - 🔔 Fee Claim Monitoring
     - 🚀 Token Launch Alerts
     - 🎓 Graduation Detection
     - 🐋 Whale Trade Alerts
     - 👑 CTO Tracking
     - 📊 Leaderboards & PNL
   - Each feature is a small card with emoji + title + one-line description

4. **Quick Start Code Snippet** (incoming bubble)
   - Sender: "PumpKit Bot"
   - A code block showing:
     ```
     git clone https://github.com/nirholas/pumpkit.git
     cd pumpkit && npm install
     cp packages/monitor/.env.example packages/monitor/.env
     npm run dev --workspace=@pumpkit/monitor
     ```
   - Styled with `bg-[#1a2332]` and `font-mono text-sm`

5. **Package Cards** (outgoing bubble)
   - Show the 5 packages: `@pumpkit/core`, `@pumpkit/monitor`, `@pumpkit/channel`, `@pumpkit/claim`, `@pumpkit/tracker`
   - Each as a small inline card with name, status badge (✅ Ready or 🚧 Soon), one-line description
   - Style like Telegram "link preview" boxes

6. **CTA Footer Message** (incoming bubble)  
   - "Ready to build? Start with the docs or check out the create coin tutorial →"
   - Two inline keyboard buttons: `Create Coin →` (links to `/create`) and `View Docs →` (links to `/docs`)

### Message Bubble Styling

```
Outgoing (right side):
- bg-tg-bubble rounded-2xl rounded-br-sm
- max-w-[85%] ml-auto
- px-4 py-3
- text-white

Incoming (left side):  
- bg-tg-bubble-in rounded-2xl rounded-bl-sm
- max-w-[85%] mr-auto
- px-4 py-3
- text-white
- Show sender name in text-tg-blue text-sm font-medium above message text
- Show small circular avatar (emoji in bg-tg-input rounded-full w-8 h-8)

Inline keyboard buttons:
- bg-tg-input text-tg-blue text-sm rounded-lg px-4 py-2
- Grid layout: grid grid-cols-2 gap-2 mt-2

Timestamps:
- text-[11px] text-zinc-500 mt-1 text-right
- Use static times like "12:00", "12:01", etc.
```

### Overall Page Container

```tsx
<div className="flex flex-col gap-3 p-4 max-w-3xl mx-auto pb-20">
  {/* Date separator */}
  <div className="text-center">
    <span className="bg-tg-input/80 text-zinc-400 text-xs px-3 py-1 rounded-full">
      Today
    </span>
  </div>
  {/* Messages here */}
</div>
```

## Tailwind Colors Available

```
tg-bg: #17212b        tg-sidebar: #0e1621    tg-chat: #0e1621
tg-header: #17212b    tg-input: #242f3d      tg-hover: #202b36
tg-border: #1c2733    tg-blue: #5eb5f7       tg-green: #4fae4e
tg-bubble: #2b5278    tg-bubble-in: #182533
pump-green: #00e676   pump-pink: #ff6b9d     pump-yellow: #ffd54f
pump-purple: #b388ff  pump-orange: #ff9100   pump-cyan: #00e5ff
```

## File to Edit

`packages/web/src/pages/Home.tsx` — replace the entire file contents.

## Do NOT

- Add any new dependencies
- Modify Layout.tsx, main.tsx, or tailwind.config.js
- Add any backend/API calls — this is a static landing page
- Use any images (emoji only)
