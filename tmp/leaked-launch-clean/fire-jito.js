// Jito bundle launch: two atomic txs where the create tx's FEE PAYER is the
// designated creator wallet (independent of the funder).
//
// Tx 1 (funder pays its own fee): transfer rent SOL to creator + Jito tip
// Tx 2 (creator pays its own fee): pump.fun createV2 — Solscan "from" = creator
//
// Bundle submitted to Jito's public Block Engine — atomic, no MEV insertion possible
// between the two txs.
//
// Env:
//   URI            — metadata URI (from metadata.js)
//   NAME, SYMBOL   — token name/symbol
//   FUNDER_SECRET  — base58 secret of wallet paying for Tx1 fee + tip + rent transfer
//   CREATOR_SECRET — base58 secret of wallet that becomes on-chain creator (pays Tx2 fee)
//   MINT_SECRET    — optional base58 secret of the mint keypair (default: random)
//   RENT_SOL       — SOL to transfer to creator for tx2 rent + fees (default 0.035)
//   JITO_TIP       — Jito tip in SOL (default 0.005, bump if not landing)
//   PRIORITY       — compute unit priority in microlamports (default 2000000)

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
// Current Jito tip accounts. Fetch fresh via getTipAccounts RPC if you hit
// "Bundles must write lock at least one tip account" errors.
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

if (!process.env.URI) { console.error('Missing URI'); process.exit(1); }
const URI       = process.env.URI;
const NAME      = process.env.NAME   || 'MyCoin';
const SYMBOL    = process.env.SYMBOL || 'MEME';
const RENT_SOL  = parseFloat(process.env.RENT_SOL || '0.035');
const JITO_TIP  = parseFloat(process.env.JITO_TIP || '0.005');
const PRIORITY  = parseInt(process.env.PRIORITY || '2000000', 10);

const funder  = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const creator = Keypair.fromSecretKey(bs58decode(process.env.CREATOR_SECRET));
const mint    = process.env.MINT_SECRET
  ? Keypair.fromSecretKey(bs58decode(process.env.MINT_SECRET))
  : Keypair.generate();

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');

  console.log('Funder (pays Tx1 + tip):', funder.publicKey.toBase58());
  console.log('Creator (pays Tx2):     ', creator.publicKey.toBase58());
  console.log('Mint:                    ', mint.publicKey.toBase58());
  console.log('Jito tip:', JITO_TIP, 'SOL  |  Rent funding:', RENT_SOL, 'SOL');

  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  console.log('Funder balance:', funderBal / 1e9, 'SOL');
  const needed = RENT_SOL + JITO_TIP + 0.002;
  if (funderBal < needed * 1e9) {
    console.error(`Funder needs >= ${needed} SOL.`);
    process.exit(1);
  }

  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
  const { blockhash } = await c.getLatestBlockhash('confirmed');

  // --- TX 1: funder transfers rent SOL + Jito tip ---
  const tx1Msg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1000 }),
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: creator.publicKey, lamports: Math.floor(RENT_SOL * 1e9) }),
      SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: tipAccount, lamports: Math.floor(JITO_TIP * 1e9) }),
    ],
  }).compileToV0Message();
  const tx1 = new VersionedTransaction(tx1Msg);
  tx1.sign([funder]);

  // --- TX 2: creator runs createV2, pays its own fee ---
  const createIx = await PUMP_SDK.createV2Instruction({
    mint:    mint.publicKey,
    name:    NAME,
    symbol:  SYMBOL,
    uri:     URI,
    creator: creator.publicKey,
    user:    creator.publicKey,
    mayhemMode: false,
    cashback:   false,
  });
  const tx2Msg = new TransactionMessage({
    payerKey: creator.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
      createIx,
    ],
  }).compileToV0Message();
  const tx2 = new VersionedTransaction(tx2Msg);
  tx2.sign([creator, mint]);

  console.log('Tx1 size:', tx1.serialize().length, '| Tx2 size:', tx2.serialize().length);

  const bundle = [bs58encode(tx1.serialize()), bs58encode(tx2.serialize())];
  console.log('\nSubmitting bundle to Jito Block Engine...');
  const res = await fetch(JITO_BUNDLE_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [bundle] }),
  });
  const body = await res.json();
  if (body.error) { console.error('Bundle submit failed:', JSON.stringify(body.error)); process.exit(1); }
  console.log('Bundle ID:', body.result);

  const sig1 = bs58encode(tx1.signatures[0]);
  const sig2 = bs58encode(tx2.signatures[0]);
  console.log('Tx1 sig:', sig1, '\nTx2 sig:', sig2);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const sigs = await c.getSignatureStatuses([sig1, sig2]);
    const s1 = sigs.value[0], s2 = sigs.value[1];
    process.stderr.write(`\r  poll ${i}: tx1=${s1?.confirmationStatus || '...'} tx2=${s2?.confirmationStatus || '...'}    `);
    if (s1?.confirmationStatus === 'confirmed' && s2?.confirmationStatus === 'confirmed') {
      console.error('');
      if (s1.err || s2.err) { console.error('Tx errors:', s1.err, s2.err); process.exit(1); }
      console.log('LAUNCHED.');
      console.log('Mint:    ', mint.publicKey.toBase58());
      console.log('Pump URL:', `https://pump.fun/coin/${mint.publicKey.toBase58()}`);
      console.log('Create tx:', `https://solscan.io/tx/${sig2}`);
      return;
    }
  }
  console.error('\nBundle not confirmed in 60s. Check: https://explorer.jito.wtf/bundle/' + body.result);
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
