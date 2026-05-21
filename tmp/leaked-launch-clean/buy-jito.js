// Jito bundle buy via Jupiter aggregator. Two-tx bundle:
//   Tx 1: funder transfers SOL to buyer + Jito tip (atomic with Tx 2)
//   Tx 2: buyer signs Jupiter swap (SOL -> TARGET_MINT)
//
// Use this when the buy ix in @nirholas/pump-sdk is incompatible with the
// live program (e.g., new required accounts). Jupiter handles routing.
//
// WARNING: if BUYER_SECRET corresponds to a public/leaked key, sweeper bots
// can steal the output tokens within seconds. Use a private wallet, OR add
// a third bundle tx that transfers the tokens to a safe destination atomically.
//
// Env:
//   TARGET_MINT     — mint to buy (required)
//   BUY_SOL         — SOL to spend (default 0.01)
//   SLIPPAGE_BPS    — default 500
//   JITO_TIP        — default 0.005
//   FUNDER_SECRET   — pays fee + tip + sends SOL to buyer
//   BUYER_SECRET    — signs Jupiter swap; receives output tokens

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

if (!process.env.TARGET_MINT) { console.error('Missing TARGET_MINT'); process.exit(1); }
const TARGET_MINT  = process.env.TARGET_MINT;
const BUY_SOL      = parseFloat(process.env.BUY_SOL || '0.01');
const SLIPPAGE_BPS = parseInt(process.env.SLIPPAGE_BPS || '500', 10);
const JITO_TIP     = parseFloat(process.env.JITO_TIP || '0.005');
const PRIORITY     = parseInt(process.env.PRIORITY || '2000000', 10);

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const buyer  = Keypair.fromSecretKey(bs58decode(process.env.BUYER_SECRET));

const SOL_MINT = 'So11111111111111111111111111111111111111112';

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');
  console.log('Funder:', funder.publicKey.toBase58());
  console.log('Buyer: ', buyer.publicKey.toBase58());
  console.log('Target:', TARGET_MINT);
  console.log('Spend: ', BUY_SOL, 'SOL');

  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  console.log('Funder balance:', funderBal / 1e9, 'SOL');
  const needed = BUY_SOL + 0.005 + JITO_TIP + 0.002;
  if (funderBal < needed * 1e9) {
    console.error(`Funder needs >= ${needed} SOL.`);
    process.exit(1);
  }

  const buyLamports = Math.floor(BUY_SOL * 1e9);
  const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${TARGET_MINT}&amount=${buyLamports}&slippageBps=${SLIPPAGE_BPS}`;
  console.log('\nFetching Jupiter quote...');
  const qres = await fetch(quoteUrl);
  if (!qres.ok) { console.error('Jupiter quote failed:', qres.status, await qres.text()); process.exit(1); }
  const quote = await qres.json();
  console.log('Quote: receive', Number(quote.outAmount), 'tokens (raw); priceImpact:', quote.priceImpactPct + '%');
  console.log('Route:', quote.routePlan.map(r => r.swapInfo.label).join(' -> '));

  console.log('Building Jupiter swap tx...');
  const sres = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: buyer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      computeUnitPriceMicroLamports: PRIORITY,
    }),
  });
  if (!sres.ok) { console.error('Jupiter swap failed:', sres.status, await sres.text()); process.exit(1); }
  const { swapTransaction } = await sres.json();
  const swapTx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  swapTx.sign([buyer]);

  const transferToBuyer = Math.floor((BUY_SOL + 0.005) * 1e9);
  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
  const blockhash = swapTx.message.recentBlockhash;

  const fundMsg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 }),
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: buyer.publicKey, lamports: transferToBuyer }),
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: tipAccount, lamports: Math.floor(JITO_TIP * 1e9) }),
    ],
  }).compileToV0Message();
  const fundTx = new VersionedTransaction(fundMsg);
  fundTx.sign([funder]);

  const bundle = [bs58encode(fundTx.serialize()), bs58encode(swapTx.serialize())];
  console.log('\nSubmitting Jito bundle...');
  const res = await fetch(JITO_BUNDLE_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [bundle] }),
  });
  const body = await res.json();
  if (body.error) { console.error('Bundle submit failed:', JSON.stringify(body.error)); process.exit(1); }
  console.log('Bundle ID:', body.result);

  const fundSig = bs58encode(fundTx.signatures[0]);
  const swapSig = bs58encode(swapTx.signatures[0]);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const sigs = await c.getSignatureStatuses([fundSig, swapSig]);
    const s1 = sigs.value[0], s2 = sigs.value[1];
    process.stderr.write(`\r  poll ${i}: fund=${s1?.confirmationStatus || '...'} swap=${s2?.confirmationStatus || '...'}    `);
    if (s1?.confirmationStatus === 'confirmed' && s2?.confirmationStatus === 'confirmed') {
      console.error('');
      console.log('Fund err:', s1.err, '  Swap err:', s2.err);
      console.log('Swap tx: https://solscan.io/tx/' + swapSig);
      return;
    }
  }
  console.error('\nBundle not confirmed in 60s. Bundle ID:', body.result);
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
