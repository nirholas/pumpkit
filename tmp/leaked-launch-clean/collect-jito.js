// Atomic collect-and-route via Jito bundle.
// Single tx in the bundle:
//   - Funder pays fee + Jito tip
//   - Creator signs collectCoinCreatorFee  -> drains vault to creator
//   - Creator signs system transfer        -> creator balance to DESTINATION
// No insertion possible between ixs (single tx, atomic). Useful when the
// creator key is shared/public (e.g. multi-party) and you want to atomically
// move the SOL to a safe wallet on every collect.
//
// Env:
//   DESTINATION       — pubkey to send collected SOL to
//   FUNDER_SECRET     — pays fee + tip + (collect's internal ATA rents)
//   CREATOR_SECRET    — coin creator; signs the collect + drain
//   JITO_TIP          — default 0.005 SOL (bump if not landing)
//   PRIORITY          — compute unit priority microlamports (default 3000000)
//   BUFFER_LAMPORTS   — lamports to leave in creator wallet (default 890880,
//                       the rent-exempt minimum for a system account)

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
const PRIORITY    = parseInt(process.env.PRIORITY || '3000000', 10);
const TRANSFER_BUFFER_LAMPORTS = parseInt(process.env.BUFFER_LAMPORTS || '890880', 10); // rent-exempt min for system account

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const creator = Keypair.fromSecretKey(bs58decode(process.env.CREATOR_SECRET));

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');
  const sdk = new OnlinePumpSdk(c);

  console.log('Funder (fee payer + tip):', funder.publicKey.toBase58());
  console.log('Leaked (collector):      ', creator.publicKey.toBase58());
  console.log('Destination:             ', DESTINATION.toBase58());

  const vaultBalance = await sdk.getCreatorVaultBalance(creator.publicKey);
  const vaultLamports = Number(vaultBalance);
  console.log('Vault balance:', vaultLamports / 1e9, 'SOL');

  if (vaultLamports < 0.001 * 1e9) {
    console.error('Vault too small to bother. Aborting.');
    process.exit(1);
  }

  const creatorPreBal = await c.getBalance(creator.publicKey, 'confirmed');
  const transferAmount = creatorPreBal + vaultLamports - TRANSFER_BUFFER_LAMPORTS;
  console.log('Will transfer out:', transferAmount / 1e9, 'SOL (leaving', TRANSFER_BUFFER_LAMPORTS / 1e9, 'SOL buffer)');

  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  const needed = JITO_TIP + 0.002;
  if (funderBal < needed * 1e9) {
    console.error(`Funder needs ≥ ${needed} SOL. Has ${funderBal/1e9}.`);
    process.exit(1);
  }

  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);

  const collectIxs = await sdk.collectCoinCreatorFeeInstructions(creator.publicKey, funder.publicKey);
  console.log('Collect ixs:', collectIxs.length);

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  console.log('Blockhash:', blockhash);

  const msg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey: tipAccount,
        lamports: Math.floor(JITO_TIP * 1e9),
      }),
      ...collectIxs,
      SystemProgram.transfer({
        fromPubkey: creator.publicKey,
        toPubkey: DESTINATION,
        lamports: transferAmount,
      }),
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([funder, creator]);
  console.log('Tx size:', tx.serialize().length, 'bytes (limit 1232)');

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

  const sig = bs58encode(tx.signatures[0]);
  console.log('Tx sig:', sig);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const stat = (await c.getSignatureStatuses([sig])).value[0];
    process.stderr.write(`\r  poll ${i}: ${stat?.confirmationStatus || '...'}    `);
    if (stat?.confirmationStatus === 'confirmed' || stat?.confirmationStatus === 'finalized') {
      console.error('');
      if (stat.err) {
        console.error('Tx errored on chain:', JSON.stringify(stat.err));
        process.exit(1);
      }
      console.log('CONFIRMED.');
      const destBal = await c.getBalance(DESTINATION, 'confirmed');
      console.log(`Destination balance: ${destBal / 1e9} SOL`);
      console.log(`Solscan: https://solscan.io/tx/${sig}`);
      return;
    }
  }
  console.error('\nTimeout. Check https://explorer.jito.wtf/bundle/' + body.result);
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
