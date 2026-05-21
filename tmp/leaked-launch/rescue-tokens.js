// Atomic rescue: move FeMbDoX tokens from 88cH's ATA to a safe wallet via Jito bundle.
// Funder pays fee + tip + ATA rent. 88cH signs the token transfer.

const bs58mod = require('bs58');
const bs58encode = bs58mod.default ? bs58mod.default.encode : bs58mod.encode;
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const fetch = require('node-fetch');
const {
  Connection, Keypair, PublicKey, SystemProgram,
  TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');

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

const MINT       = new PublicKey(process.env.MINT       || 'FeMbDoX7R1Psc4GEcvJdsbNbZA3bfztcyDCatJVJpump');
const DEST_OWNER = new PublicKey(process.env.DEST_OWNER || 'nichQ7m3W37WJ9beNLZfTj27gLrjC7ddq4YguHufYas');
const DECIMALS   = parseInt(process.env.DECIMALS   || '6', 10);
const JITO_TIP   = parseFloat(process.env.JITO_TIP || '0.01');
const PRIORITY   = parseInt(process.env.PRIORITY || '2000000', 10);
const TOKEN_PID  = TOKEN_2022_PROGRAM_ID;

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const leaked = Keypair.fromSecretKey(bs58decode(process.env.LEAKED_SECRET));

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');

  const fromAta = getAssociatedTokenAddressSync(MINT, leaked.publicKey, true, TOKEN_PID);
  const toAta   = getAssociatedTokenAddressSync(MINT, DEST_OWNER,       true, TOKEN_PID);

  console.log('Mint:        ', MINT.toBase58());
  console.log('From (88cH): ', leaked.publicKey.toBase58());
  console.log('From ATA:    ', fromAta.toBase58());
  console.log('To owner:    ', DEST_OWNER.toBase58());
  console.log('To ATA:      ', toAta.toBase58());

  // Read current balance
  const fromInfo = await c.getParsedAccountInfo(fromAta, 'confirmed');
  if (!fromInfo.value) { console.error('From ATA does not exist.'); process.exit(1); }
  const rawAmount = BigInt(fromInfo.value.data.parsed.info.tokenAmount.amount);
  console.log('From balance:', rawAmount.toString(), '=', Number(rawAmount) / 10**DECIMALS, 'tokens');
  if (rawAmount === 0n) { console.error('Nothing to transfer.'); process.exit(1); }

  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  console.log('Funder SOL:  ', funderBal / 1e9);

  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');

  const ixs = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
    SystemProgram.transfer({
      fromPubkey: funder.publicKey, toPubkey: tipAccount, lamports: Math.floor(JITO_TIP * 1e9),
    }),
    createAssociatedTokenAccountIdempotentInstruction(
      funder.publicKey, // payer for rent
      toAta,
      DEST_OWNER,
      MINT,
      TOKEN_PID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createTransferCheckedInstruction(
      fromAta,            // source
      MINT,
      toAta,              // destination
      leaked.publicKey,   // authority (signer)
      rawAmount,
      DECIMALS,
      [],
      TOKEN_PID,
    ),
  ];

  const msg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([funder, leaked]);
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
  const res = await fetch(JITO_BUNDLE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [bundle] }),
  });
  const body = await res.json();
  console.log('Jito response:', JSON.stringify(body));
  if (body.error) { console.error('Bundle submit failed.'); process.exit(1); }

  const sig = bs58encode(tx.signatures[0]);
  console.log('Sig:', sig);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const stat = (await c.getSignatureStatuses([sig])).value[0];
    process.stderr.write(`\r  poll ${i}: ${stat?.confirmationStatus || '...'}    `);
    if (stat?.confirmationStatus === 'confirmed' || stat?.confirmationStatus === 'finalized') {
      console.error('');
      if (stat.err) { console.error('On-chain err:', JSON.stringify(stat.err)); process.exit(1); }
      console.log('CONFIRMED.');
      const newInfo = await c.getParsedAccountInfo(toAta, 'confirmed');
      console.log(`${DEST_OWNER.toBase58()} now holds: ${newInfo.value?.data?.parsed?.info?.tokenAmount?.uiAmountString || '0'} tokens`);
      console.log('Solscan:', `https://solscan.io/tx/${sig}`);
      return;
    }
  }
  console.error('\nTimeout. Bundle ID:', body.result);
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
