// One-shot consolidation:
//   1. Collect creator-fee vault into 88cH
//   2. Transfer 88cH balance to DESTINATION (minus rent-exempt buffer)
//   3. Transfer funder remaining SOL to DESTINATION (leaves dust)
// All atomic in a single Jito bundle tx.

const bs58mod = require('bs58');
const bs58encode = bs58mod.default ? bs58mod.default.encode : bs58mod.encode;
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const fetch = require('node-fetch');
const {
  Connection, Keypair, PublicKey, SystemProgram,
  TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js');
const { OnlinePumpSdk } = require('@nirholas/pump-sdk');

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

const DESTINATION = new PublicKey(process.env.DESTINATION);
const JITO_TIP    = parseFloat(process.env.JITO_TIP || '0.005');
const PRIORITY    = parseInt(process.env.PRIORITY || '2000000', 10);
const LEAKED_BUFFER = 890880; // rent-exempt min for system account
const FUNDER_BUFFER = 5000000; // 0.005 SOL buffer for unexpected ATA/rent costs in collect ix

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const leaked = Keypair.fromSecretKey(bs58decode(process.env.LEAKED_SECRET));

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');
  const sdk = new OnlinePumpSdk(c);

  console.log('Funder:', funder.publicKey.toBase58());
  console.log('Leaked:', leaked.publicKey.toBase58());
  console.log('Destination:', DESTINATION.toBase58());

  const vaultBal = Number(await sdk.getCreatorVaultBalance(leaked.publicKey));
  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  const leakedBal = await c.getBalance(leaked.publicKey, 'confirmed');
  console.log('\nVault:  ', vaultBal/1e9, 'SOL');
  console.log('Funder: ', funderBal/1e9, 'SOL');
  console.log('Leaked: ', leakedBal/1e9, 'SOL');

  const tipLamports = Math.floor(JITO_TIP * 1e9);
  const txFee = 10000; // generous fee budget for two signers

  // Funder drain: balance - tip - fee - buffer
  const funderDrain = funderBal - tipLamports - txFee - FUNDER_BUFFER;
  // 88cH drain: pre-bal + vault collected - rent-exempt buffer
  const leakedDrain = leakedBal + vaultBal - LEAKED_BUFFER;

  if (funderDrain <= 0) { console.error('Funder doesn\'t have enough for tip + fees.'); process.exit(1); }

  console.log('\nFunder drain to dest:', funderDrain/1e9, 'SOL');
  console.log('Leaked drain to dest:', leakedDrain/1e9, 'SOL');
  console.log('Total moved to dest: ~', (funderDrain + leakedDrain)/1e9, 'SOL');

  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
  const collectIxs = await sdk.collectCoinCreatorFeeInstructions(leaked.publicKey, funder.publicKey);

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  const ixs = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: tipAccount, lamports: tipLamports }),
    ...collectIxs,
    SystemProgram.transfer({ fromPubkey: leaked.publicKey, toPubkey: DESTINATION, lamports: leakedDrain }),
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: DESTINATION, lamports: funderDrain }),
  ];

  const msg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([funder, leaked]);
  console.log('\nTx size:', tx.serialize().length, 'bytes');

  console.log('Simulating...');
  const sim = await c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false });
  if (sim.value.err) {
    console.error('Sim failed:', JSON.stringify(sim.value.err));
    console.error('Logs:\n' + (sim.value.logs || []).join('\n'));
    process.exit(1);
  }
  console.log('Sim OK. CU:', sim.value.unitsConsumed);

  console.log('\nSubmitting Jito bundle...');
  const bundle = [bs58encode(tx.serialize())];
  const res = await fetch(JITO_BUNDLE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [bundle] }),
  });
  const body = await res.json();
  if (body.error) { console.error('Bundle submit failed:', JSON.stringify(body.error)); process.exit(1); }
  console.log('Bundle ID:', body.result);

  const sig = bs58encode(tx.signatures[0]);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const stat = (await c.getSignatureStatuses([sig])).value[0];
    process.stderr.write(`\r  poll ${i}: ${stat?.confirmationStatus || '...'}    `);
    if (stat?.confirmationStatus === 'confirmed' || stat?.confirmationStatus === 'finalized') {
      console.error('');
      if (stat.err) { console.error('Tx err:', JSON.stringify(stat.err)); process.exit(1); }
      console.log('CONFIRMED.');
      console.log('Dest balance:', (await c.getBalance(DESTINATION, 'confirmed'))/1e9, 'SOL');
      console.log('Solscan: https://solscan.io/tx/' + sig);
      return;
    }
  }
  console.error('\nTimeout.');
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
