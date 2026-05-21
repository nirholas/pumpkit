// Atomic SPL/Token-2022 token transfer via Jito bundle.
// Funder pays fee + Jito tip + (if needed) destination ATA rent.
// Source wallet signs the token transfer.
//
// Env:
//   MINT           — token mint address (required)
//   FROM_SECRET    — base58 secret of the source wallet (owns the tokens)
//   DEST_OWNER     — pubkey of the destination wallet (required)
//   DECIMALS       — token decimals (default 6)
//   TOKEN_PROGRAM  — 'spl' or 't22' (default 't22')
//   AMOUNT_RAW     — optional; if unset, transfers full balance
//   FUNDER_SECRET  — pays fee + tip + ATA rent
//   JITO_TIP       — default 0.005

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
  TOKEN_PROGRAM_ID,
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

if (!process.env.MINT)       { console.error('Missing MINT'); process.exit(1); }
if (!process.env.DEST_OWNER) { console.error('Missing DEST_OWNER'); process.exit(1); }
const MINT       = new PublicKey(process.env.MINT);
const DEST_OWNER = new PublicKey(process.env.DEST_OWNER);
const DECIMALS   = parseInt(process.env.DECIMALS || '6', 10);
const TOKEN_PID  = (process.env.TOKEN_PROGRAM || 't22') === 'spl' ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
const JITO_TIP   = parseFloat(process.env.JITO_TIP || '0.005');
const PRIORITY   = parseInt(process.env.PRIORITY || '2000000', 10);
const AMOUNT_RAW = process.env.AMOUNT_RAW ? BigInt(process.env.AMOUNT_RAW) : null;

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const from   = Keypair.fromSecretKey(bs58decode(process.env.FROM_SECRET));

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');

  const fromAta = getAssociatedTokenAddressSync(MINT, from.publicKey, true, TOKEN_PID);
  const toAta   = getAssociatedTokenAddressSync(MINT, DEST_OWNER,     true, TOKEN_PID);

  console.log('Mint:    ', MINT.toBase58());
  console.log('From:    ', from.publicKey.toBase58());
  console.log('From ATA:', fromAta.toBase58());
  console.log('To:      ', DEST_OWNER.toBase58());
  console.log('To ATA:  ', toAta.toBase58());

  const fromInfo = await c.getParsedAccountInfo(fromAta, 'confirmed');
  if (!fromInfo.value) { console.error('From ATA does not exist.'); process.exit(1); }
  const balRaw = BigInt(fromInfo.value.data.parsed.info.tokenAmount.amount);
  console.log('From balance:', balRaw.toString(), '(=', Number(balRaw) / 10**DECIMALS, 'tokens)');
  if (balRaw === 0n) { console.error('Nothing to transfer.'); process.exit(1); }
  const amount = AMOUNT_RAW !== null ? AMOUNT_RAW : balRaw;
  if (amount > balRaw) { console.error('Requested amount > balance'); process.exit(1); }

  const tipAccount = new PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');

  const ixs = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 }),
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: tipAccount, lamports: Math.floor(JITO_TIP * 1e9) }),
    createAssociatedTokenAccountIdempotentInstruction(funder.publicKey, toAta, DEST_OWNER, MINT, TOKEN_PID, ASSOCIATED_TOKEN_PROGRAM_ID),
    createTransferCheckedInstruction(fromAta, MINT, toAta, from.publicKey, amount, DECIMALS, [], TOKEN_PID),
  ];

  const msg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([funder, from]);
  console.log('Tx size:', tx.serialize().length, 'bytes');

  const sim = await c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false });
  if (sim.value.err) {
    console.error('Sim failed:', JSON.stringify(sim.value.err));
    console.error('Logs:\n' + (sim.value.logs || []).join('\n'));
    process.exit(1);
  }
  console.log('Sim OK. CU:', sim.value.unitsConsumed);

  console.log('Submitting Jito bundle...');
  const bundle = [bs58encode(tx.serialize())];
  const res = await fetch(JITO_BUNDLE_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
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
      if (stat.err) { console.error('Tx errored on chain:', JSON.stringify(stat.err)); process.exit(1); }
      console.log('CONFIRMED. https://solscan.io/tx/' + sig);
      return;
    }
  }
  console.error('\nTimeout.');
  process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
