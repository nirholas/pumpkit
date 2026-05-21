// Jito bundle launch: two atomic txs, where the create tx's FEE PAYER is the leaked wallet.
//
// Tx 1 (funder pays its own fee): transfer rent SOL to leaked + Jito tip
// Tx 2 (leaked pays its own fee): createV2 — Solscan "from" = leaked
//
// Bundle is submitted to Jito's public Block Engine — atomic, no bot insertion possible.

const fs = require('fs');
const bs58mod = require('bs58');
const bs58encode = bs58mod.default ? bs58mod.default.encode : bs58mod.encode;
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const fetch = require('node-fetch');
const {
  Connection, Keypair, PublicKey, SystemProgram,
  TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js');
const { PUMP_SDK } = require('@nirholas/pump-sdk');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const JITO_BUNDLE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDe9B',
  'ADuUkR4vqLUMWXxW9gh6D6L8pivKeVBBmf9pNxqx9aja',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

const URI       = process.env.URI;
const NAME      = process.env.NAME   || 'pUSDC';
const SYMBOL    = process.env.SYMBOL || 'pUSDC';
const RENT_SOL  = parseFloat(process.env.RENT_SOL  || '0.035');
const JITO_TIP  = parseFloat(process.env.JITO_TIP  || '0.001');
const PRIORITY  = parseInt(process.env.PRIORITY || '2000000', 10);

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const leaked = Keypair.fromSecretKey(bs58decode(process.env.LEAKED_SECRET));
const mint   = process.env.MINT_SECRET
  ? Keypair.fromSecretKey(bs58decode(process.env.MINT_SECRET))
  : Keypair.generate();

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');

  console.log('Funder (pays Tx1 fee + Jito tip):', funder.publicKey.toBase58());
  console.log('Leaked (pays Tx2 fee = create):  ', leaked.publicKey.toBase58());
  console.log('Mint:                             ', mint.publicKey.toBase58());
  console.log('Jito tip:', JITO_TIP, 'SOL');
  console.log('Rent funding:', RENT_SOL, 'SOL');

  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  console.log('Funder balance:', funderBal / 1e9, 'SOL');
  const needed = RENT_SOL + JITO_TIP + 0.002;
  if (funderBal < needed * 1e9) {
    console.error(`Funder needs ≥ ${needed} SOL.`);
    process.exit(1);
  }

  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  console.log('\nBlockhash:', blockhash);

  // --- TX 1: funder pays fee, transfers rent SOL to leaked, pays Jito tip ---
  const tx1Msg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 }),
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: leaked.publicKey,
        lamports: Math.floor(RENT_SOL * 1e9),
      }),
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: tipAccount,
        lamports: Math.floor(JITO_TIP * 1e9),
      }),
    ],
  }).compileToV0Message();
  const tx1 = new VersionedTransaction(tx1Msg);
  tx1.sign([funder]);
  console.log('Tx1 (transfer + tip) size:', tx1.serialize().length, 'bytes');

  // --- TX 2: leaked pays its own fee, runs createV2 ---
  const createIx = await PUMP_SDK.createV2Instruction({
    mint:    mint.publicKey,
    name:    NAME,
    symbol:  SYMBOL,
    uri:     URI,
    creator: leaked.publicKey,
    user:    leaked.publicKey,
    mayhemMode: false,
    cashback:   false,
  });
  const tx2Msg = new TransactionMessage({
    payerKey: leaked.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      createIx,
    ],
  }).compileToV0Message();
  const tx2 = new VersionedTransaction(tx2Msg);
  tx2.sign([leaked, mint]);
  console.log('Tx2 (createV2, fee payer = leaked) size:', tx2.serialize().length, 'bytes');

  // --- Submit bundle to Jito ---
  const bundle = [
    bs58encode(tx1.serialize()),
    bs58encode(tx2.serialize()),
  ];

  console.log('\nSubmitting bundle to Jito Block Engine...');
  const t0 = Date.now();
  const res = await fetch(JITO_BUNDLE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendBundle',
      params: [bundle],
    }),
  });
  const body = await res.json();
  console.log('Jito response (' + (Date.now() - t0) + 'ms):', JSON.stringify(body));

  if (body.error) {
    console.error('Bundle submit failed.');
    process.exit(1);
  }

  const bundleId = body.result;
  console.log('Bundle ID:', bundleId);

  // --- Wait + verify both txs landed ---
  console.log('\nWaiting for confirmations...');
  const sig1 = bs58encode(tx1.signatures[0]);
  const sig2 = bs58encode(tx2.signatures[0]);
  console.log('Tx1 sig:', sig1);
  console.log('Tx2 sig:', sig2);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const sigs = await c.getSignatureStatuses([sig1, sig2]);
    const s1 = sigs.value[0];
    const s2 = sigs.value[1];
    process.stderr.write(`\r  poll ${i}: tx1=${s1?.confirmationStatus || '...'} tx2=${s2?.confirmationStatus || '...'}      `);
    if (s1?.confirmationStatus === 'confirmed' && s2?.confirmationStatus === 'confirmed') {
      console.error('\n  both confirmed.');
      console.log('Tx1 err:', s1.err);
      console.log('Tx2 err:', s2.err);
      console.log('\nMint:    ', mint.publicKey.toBase58());
      console.log('Pump URL:', `https://pump.fun/coin/${mint.publicKey.toBase58()}`);
      console.log('Tx2 (the create, from leaked):', `https://solscan.io/tx/${sig2}`);
      return;
    }
  }
  console.error('\nBundle did not confirm within 60s. Check Jito explorer:');
  console.error(`https://explorer.jito.wtf/bundle/${bundleId}`);
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
