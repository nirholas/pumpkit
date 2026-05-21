// Jito bundle: funder → 88cH transfer (atomic) + Jupiter swap signed by 88cH.
// Bypasses the broken pump-sdk buy ix entirely (Jupiter handles pump.fun curves).
//
// Env:
//   TARGET_MINT    — coin to buy (default FeMbDoX...pump)
//   BUY_SOL        — SOL to spend on buy (default 0.1)
//   SLIPPAGE_BPS   — default 500 (5%)
//   JITO_TIP       — default 0.005
//   FUNDER_SECRET, LEAKED_SECRET — required

const bs58mod = require('bs58');
const bs58encode = bs58mod.default ? bs58mod.default.encode : bs58mod.encode;
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const fetch = require('node-fetch');
const {
  Connection, Keypair, PublicKey, SystemProgram,
  TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const JITO_BUNDLE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const JITO_TIP_ACCOUNTS = [
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
];

const TARGET_MINT = process.env.TARGET_MINT || 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump';
const BUY_SOL     = parseFloat(process.env.BUY_SOL     || '0.1');
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || '500', 10);
const JITO_TIP    = parseFloat(process.env.JITO_TIP   || '0.005');
const PRIORITY    = parseInt(process.env.PRIORITY     || '2000000', 10);

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const leaked = Keypair.fromSecretKey(bs58decode(process.env.LEAKED_SECRET));

const SOL_MINT = 'So11111111111111111111111111111111111111112';

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');
  console.log('Funder:', funder.publicKey.toBase58());
  console.log('Buyer (88cH leaked):', leaked.publicKey.toBase58());
  console.log('Target:', TARGET_MINT);
  console.log('Spend:', BUY_SOL, 'SOL');
  console.log('Slippage:', SLIPPAGE_BPS, 'bps');

  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  console.log('Funder balance:', funderBal / 1e9, 'SOL');
  const needed = BUY_SOL + 0.005 + JITO_TIP + 0.002; // buy + 88cH rent buffer + tip + fees
  if (funderBal < needed * 1e9) {
    console.error(`Funder needs ≥ ${needed} SOL. Has ${funderBal/1e9}.`);
    process.exit(1);
  }

  // --- Get Jupiter quote ---
  const buyLamports = Math.floor(BUY_SOL * 1e9);
  const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${TARGET_MINT}&amount=${buyLamports}&slippageBps=${SLIPPAGE_BPS}`;
  console.log('\nFetching Jupiter quote...');
  const qres = await fetch(quoteUrl);
  if (!qres.ok) {
    console.error('Jupiter quote failed:', qres.status, await qres.text());
    process.exit(1);
  }
  const quote = await qres.json();
  console.log('Quote: spend', Number(quote.inAmount)/1e9, 'SOL, receive', Number(quote.outAmount), 'tokens (raw)');
  console.log('Price impact:', quote.priceImpactPct + '%');
  console.log('Route:', quote.routePlan.map(r => r.swapInfo.label).join(' -> '));

  // --- Get Jupiter swap tx (signed by 88cH) ---
  console.log('Building Jupiter swap tx...');
  const sres = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: leaked.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      computeUnitPriceMicroLamports: PRIORITY,
    }),
  });
  if (!sres.ok) {
    console.error('Jupiter swap build failed:', sres.status, await sres.text());
    process.exit(1);
  }
  const { swapTransaction } = await sres.json();
  const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  swapTx.sign([leaked]);
  console.log('Swap tx size:', swapTx.serialize().length, 'bytes');

  // --- Build funder tx (transfer rent + tip) ---
  // 88cH needs ~0.005 SOL on top of BUY_SOL to cover its own tx fee + wsol ATA rent + small buffer
  const transferToLeaked = Math.floor((BUY_SOL + 0.005) * 1e9);
  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);

  // Use the SAME blockhash as the swap tx (matters for Jito bundle ordering)
  const blockhash = swapTx.message.recentBlockhash;
  console.log('Using blockhash:', blockhash);

  const fundMsg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 }),
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: leaked.publicKey,
        lamports: transferToLeaked,
      }),
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: tipAccount,
        lamports: Math.floor(JITO_TIP * 1e9),
      }),
    ],
  }).compileToV0Message();
  const fundTx = new VersionedTransaction(fundMsg);
  fundTx.sign([funder]);
  console.log('Fund tx size:', fundTx.serialize().length, 'bytes');

  // --- Submit bundle: [fund tx, swap tx] (fund must come first) ---
  const bundle = [
    bs58encode(fundTx.serialize()),
    bs58encode(swapTx.serialize()),
  ];

  console.log('\nSubmitting Jito bundle...');
  const t0 = Date.now();
  const res = await fetch(JITO_BUNDLE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [bundle] }),
  });
  const body = await res.json();
  console.log('Jito response (' + (Date.now() - t0) + 'ms):', JSON.stringify(body));
  if (body.error) { console.error('Bundle submit failed.'); process.exit(1); }
  console.log('Bundle ID:', body.result);

  const fundSig = bs58encode(fundTx.signatures[0]);
  const swapSig = bs58encode(swapTx.signatures[0]);
  console.log('Fund sig:', fundSig);
  console.log('Swap sig:', swapSig);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const sigs = await c.getSignatureStatuses([fundSig, swapSig]);
    const s1 = sigs.value[0], s2 = sigs.value[1];
    process.stderr.write(`\r  poll ${i}: fund=${s1?.confirmationStatus || '...'} swap=${s2?.confirmationStatus || '...'}      `);
    if (s1?.confirmationStatus === 'confirmed' && s2?.confirmationStatus === 'confirmed') {
      console.error('');
      console.log('Fund err:', s1.err);
      console.log('Swap err:', s2.err);
      console.log('\nDone.');
      console.log('Swap tx: https://solscan.io/tx/' + swapSig);
      console.log('88cH balance:', (await c.getBalance(leaked.publicKey, 'confirmed'))/1e9, 'SOL');
      return;
    }
  }
  console.error('\nBundle not confirmed in 60s. Check https://explorer.jito.wtf/bundle/' + body.result);
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
