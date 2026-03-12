# Tutorial 36: x402 Facilitator — Payment Verification & Settlement

> Build a standalone payment facilitator that verifies and settles HTTP 402 micropayments on Solana with USDC.

## Prerequisites

- Node.js 18+
- `@pump-fun/x402` installed

```bash
npm install @pump-fun/x402 @solana/web3.js express
```

## Architecture

The x402 protocol has three roles:

```
┌─────────┐    402 + PaymentAccept    ┌─────────┐
│  Client  │ ◄────────────────────── │  Server  │
│ X402Client│ ────────────────────►  │ Paywall  │
│          │    Payment header        │Middleware│
└─────────┘                          └────┬─────┘
                                          │ verify + settle
                                     ┌────▼──────┐
                                     │ Facilitator│
                                     │  verify()  │
                                     │  settle()  │
                                     │  status()  │
                                     └────────────┘
```

1. **Client** — Signs USDC transfer, retries on 402
2. **Server** — Express middleware that gates endpoints
3. **Facilitator** — Verifies payment transactions and submits them on-chain

## Step 1: The Facilitator Service

Build a standalone Express service that verifies and settles payments:

```typescript
import express from "express";
import { X402Facilitator, type PaymentPayload } from "@pump-fun/x402";

const app = express();
app.use(express.json());

const facilitator = new X402Facilitator({
  network: "solana-devnet",
  rpcUrl: "https://api.devnet.solana.com",
  waitForConfirmation: true,
  maxBlockhashAge: 150, // ~1 minute
});

// POST /verify — Check payment validity without submitting
app.post("/verify", async (req, res) => {
  const payment: PaymentPayload = req.body;

  const result = await facilitator.verify(payment);

  res.json({
    valid: result.valid,
    error: result.error,
    amount: result.amount,
    payer: result.payer,
    payTo: result.payTo,
  });
});

// POST /settle — Verify AND submit to chain
app.post("/settle", async (req, res) => {
  const payment: PaymentPayload = req.body;

  // Verify first
  const verification = await facilitator.verify(payment);
  if (!verification.valid) {
    return res.status(400).json({ success: false, error: verification.error });
  }

  // Submit on-chain
  const settlement = await facilitator.settle(payment);

  res.json({
    success: settlement.success,
    txSignature: settlement.txSignature,
    network: settlement.network,
    payer: settlement.payer,
    amount: settlement.amount,
    error: settlement.error,
  });
});

// GET /status/:tx — Check settlement confirmation
app.get("/status/:txSignature", async (req, res) => {
  const status = await facilitator.getSettlementStatus(req.params.txSignature);

  res.json({
    confirmed: status.confirmed,
    slot: status.slot,
  });
});

app.listen(4402, () => console.log("Facilitator on :4402"));
```

## Step 2: The Paywalled Server

Create an Express server that uses the facilitator for payment verification:

```typescript
import express from "express";
import { x402Paywall, createPaywalls } from "@pump-fun/x402";

const app = express();

// Single paywalled endpoint — $0.01 USDC
app.use(
  "/premium",
  x402Paywall({
    payTo: "YourWalletAddress...",
    amount: "0.01",
    network: "solana-devnet",
    description: "Premium Pump SDK analytics",
    facilitatorUrl: "http://localhost:4402",
  })
);

app.get("/premium", (req, res) => {
  res.json({
    data: "Premium bonding curve analytics...",
    timestamp: Date.now(),
  });
});

// Batch — multiple paywalled routes at once
const paywalls = createPaywalls({
  payTo: "YourWalletAddress...",
  network: "solana-devnet",
  routes: [
    { path: "/api/quotes", amount: "0.001", description: "Price quotes" },
    { path: "/api/signals", amount: "0.05", description: "Trading signals" },
    { path: "/api/export", amount: "0.10", description: "Data export" },
  ],
});

for (const { path, middleware } of paywalls) {
  app.use(path, middleware);
}

app.listen(3000, () => console.log("Server on :3000"));
```

## Step 3: The Auto-Paying Client

Build a client that automatically detects 402 responses and pays:

```typescript
import { X402Client, type PaymentEvent } from "@pump-fun/x402";
import { Keypair } from "@solana/web3.js";

// Load your keypair (the payer)
const payer = Keypair.generate(); // Use a funded keypair in production

const client = new X402Client({
  signer: payer,
  network: "solana-devnet",
  rpcUrl: "https://api.devnet.solana.com",
  maxPaymentAmount: "1.00", // Safety cap: never pay more than $1
  autoRetry: true,
});

// Listen to payment lifecycle events
const unsubscribe = client.on((event: PaymentEvent) => {
  switch (event.type) {
    case "payment_created":
      console.log(`Creating payment: ${event.amount} USDC to ${event.payTo}`);
      break;
    case "payment_settled":
      console.log(`Settled: tx ${event.txSignature}`);
      break;
    case "payment_failed":
      console.error(`Payment failed: ${event.error}`);
      break;
  }
});

// This automatically handles 402 responses
const response = await client.fetch("http://localhost:3000/premium");
const data = await response.json();
console.log("Premium data:", data);

// Convenience methods
const quotes = await client.get("http://localhost:3000/api/quotes");

// Cleanup
unsubscribe();
```

## Step 4: Manual Payment Creation

For custom flows, create payments manually:

```typescript
import {
  createPaymentTransaction,
  encodePayment,
  decodePayment,
  usdcToBaseUnits,
  baseUnitsToUsdc,
  generateNonce,
} from "@pump-fun/x402";
import { Connection, Keypair } from "@solana/web3.js";

const connection = new Connection("https://api.devnet.solana.com");
const payer = Keypair.generate();

// Convert USDC amounts
console.log(usdcToBaseUnits("0.01")); // "10000" (6 decimals)
console.log(baseUnitsToUsdc("10000")); // "0.01"

// Create a payment payload
const payment = await createPaymentTransaction({
  accept: {
    scheme: "exact",
    network: "solana-devnet",
    maxAmountRequired: usdcToBaseUnits("0.01"),
    resource: "https://api.example.com/premium",
    payTo: "MerchantWalletAddress...",
    token: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", // Devnet USDC
  },
  signer: payer,
  connection,
  nonce: generateNonce(),
});

// Encode for HTTP header
const encoded = encodePayment(payment);
// Decode back
const decoded = decodePayment(encoded);
```

## Step 5: Local Verification (No Chain)

Verify payments offline — useful for testing:

```typescript
import { verifyPaymentLocal, type PaymentPayload } from "@pump-fun/x402";

const payment: PaymentPayload = {
  x402Version: 1,
  scheme: "exact",
  network: "solana-devnet",
  transaction: "base64-signed-tx...",
  amount: "10000",
  token: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  payer: "PayerPublicKey...",
  payTo: "MerchantPublicKey...",
  resource: "/premium",
};

const result = await verifyPaymentLocal(payment, "solana-devnet");
console.log(result.valid); // true/false
console.log(result.error); // error message if invalid
```

## Payment Lifecycle

```
Client                    Server                  Facilitator
  │                        │                         │
  │── GET /premium ───────►│                         │
  │◄── 402 + PaymentAccept │                         │
  │                        │                         │
  │  (signs USDC transfer) │                         │
  │                        │                         │
  │── GET + Payment header─►│                        │
  │                        │── POST /verify ────────►│
  │                        │◄── {valid: true} ───────│
  │                        │── POST /settle ────────►│
  │                        │◄── {txSignature} ───────│
  │◄── 200 + premium data  │                         │
```

## Constants Reference

| Constant | Value |
|----------|-------|
| USDC Mainnet | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDC Devnet | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| USDC Decimals | 6 |
| Default Expiry | 300 seconds |
| x402 Version | 1 |

## Next Steps

- See [Tutorial 14](./14-x402-paywalled-apis.md) for basic x402 usage
- See [Tutorial 28](./28-analytics-price-quotes.md) for analytics to paywall
- See [Tutorial 45](./45-plugin-gateway-api-handlers.md) for plugin API endpoints
