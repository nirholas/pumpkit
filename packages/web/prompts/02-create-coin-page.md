# Task 2: Build the Create Coin Page

## Context

You're building a website for **PumpKit** — an open-source framework for building PumpFun Telegram bots on Solana. The site uses a **Telegram-style UI** (dark chat interface) with **PumpFun-style content**.

The site already has:
- Vite + React + TypeScript + Tailwind CSS
- A Telegram-style Layout shell with sidebar + top bar (`src/components/Layout.tsx`)
- Tailwind config with `tg-*` (Telegram) and `pump-*` (PumpFun) color tokens
- The Home page renders content as Telegram message bubbles

## Your Task

**Create `src/pages/CreateCoin.tsx`** — a page that mimics PumpFun's "Create a Coin" form, but styled as a Telegram chat interaction.

**Update `src/main.tsx`** to add the `/create` route pointing to this page.

## Design Concept

The page looks like a **Telegram bot conversation** where "PumpKit Bot" walks you through creating a token. Each form field is presented as a bot message followed by a user input bubble. The whole thing is a mockup/demo (no actual functionality) — it's marketing to show what PumpKit enables.

## Page Structure

### 1. Date Separator
```
[Today]
```

### 2. Bot Welcome Message (incoming bubble)
- Sender: "PumpKit Bot" (text-tg-blue)
- Avatar: 🤖 in circle
- Text: "Let's create your token on PumpFun! Fill in the details below and I'll generate the instructions."
- Timestamp: "14:00"

### 3. Token Name Field (as chat exchange)
- **Bot message** (incoming): "What's your token name?"
- **User reply** (outgoing bubble): An editable-looking input field
  - `<input>` with `bg-tg-input border border-tg-border rounded-lg px-3 py-2 text-white w-full`
  - Placeholder: "e.g. PumpKit Token"

### 4. Token Symbol Field
- **Bot message**: "Choose a ticker symbol (1–8 chars)"
- **User reply**: Input with placeholder "e.g. PUMP"

### 5. Description Field
- **Bot message**: "Describe your token (optional)"
- **User reply**: Textarea with placeholder "The best PumpFun bot framework..."

### 6. Token Image
- **Bot message**: "Upload a token image (optional)"
- **User reply**: A dashed border upload zone
  - `border-2 border-dashed border-tg-border rounded-xl p-8 text-center`
  - Emoji 🖼️ and text "Drag & drop or click to upload"

### 7. Options Section (bot message with inline toggles)
- **Bot message**: "Configure launch options:"
- Inside the bubble, show toggle rows:
  - `Mayhem Mode` — toggle switch (off by default)
  - `Cashback Enabled` — toggle switch (on by default)  
  - `Creator Fee Sharing` — toggle switch (off by default)
- Each row: flex justify-between, label on left, toggle on right
- Toggle: a simple `w-10 h-6 rounded-full bg-tg-input` with a `w-4 h-4 rounded-full` dot that shifts. Active state uses `bg-pump-green`

### 8. Preview Card (outgoing bubble)
- Styled like a PumpFun token card:
  - `bg-gradient-to-br from-tg-input to-tg-bubble-in rounded-xl p-4`
  - Token emoji placeholder (🪙 large)
  - Token name and symbol in bold
  - "Bonding Curve: 0%" progress bar (thin, green)
  - "Market Cap: —" / "Created by: You"
  - Small "Preview" badge in top-right

### 9. Launch Button (as Telegram inline keyboard)
- Full-width `bg-pump-green text-black font-bold rounded-lg py-3 text-center`
- Text: "🚀 Create Token"
- Below it, smaller text: "This is a demo — use @pumpkit/monitor to build a real bot"

### 10. Info Footer (incoming bubble)
- Bot message: "Want to integrate token creation into your own bot? Check out the SDK docs:"
- Inline keyboard buttons: `📖 SDK Docs` → `/docs` and `📦 Packages` → `/packages`

## Message Bubble Styling (same as Home page)

```
Outgoing: bg-tg-bubble rounded-2xl rounded-br-sm max-w-[85%] ml-auto px-4 py-3
Incoming: bg-tg-bubble-in rounded-2xl rounded-bl-sm max-w-[85%] mr-auto px-4 py-3
  - Sender name: text-tg-blue text-sm font-medium
  - Avatar: emoji in w-8 h-8 rounded-full bg-tg-input, placed left of bubble
Inline keyboard: bg-tg-input text-tg-blue text-sm rounded-lg px-4 py-2
Timestamps: text-[11px] text-zinc-500 mt-1 text-right
```

### Bot Message Container
When showing a bot message with avatar, wrap like:
```tsx
<div className="flex gap-2 items-end max-w-[85%]">
  <div className="w-8 h-8 rounded-full bg-tg-input flex items-center justify-center text-sm shrink-0">
    🤖
  </div>
  <div className="bg-tg-bubble-in rounded-2xl rounded-bl-sm px-4 py-3">
    <p className="text-tg-blue text-sm font-medium mb-1">PumpKit Bot</p>
    {/* content */}
    <span className="text-[11px] text-zinc-500 block text-right mt-1">14:00</span>
  </div>
</div>
```

## State Management

Use local `useState` for form fields. Nothing submits anywhere — it's a UI demo. The preview card should reactively show the token name/symbol as the user types.

## Tailwind Colors Available

```
tg-bg tg-sidebar tg-chat tg-header tg-input tg-hover tg-border
tg-blue tg-green tg-bubble tg-bubble-in
pump-green pump-pink pump-yellow pump-purple pump-orange pump-cyan
```

## Files to Edit

1. **Create** `packages/web/src/pages/CreateCoin.tsx`
2. **Edit** `packages/web/src/main.tsx` — add route: `<Route path="create" element={<CreateCoin />} />`

## Do NOT

- Add any dependencies
- Modify Layout.tsx or tailwind.config.js
- Make any actual API calls or blockchain transactions
- Use images (emoji only)
