// Atomic create-only launch in a SINGLE tx (no Jito bundle needed).
// Funder transfers rent SOL to creator, creator runs pump.fun createV2, all atomic.
// No bot race window. No dev buy (avoids any buy-ix changes in the pump program).
//
// Use this when:
//   - You don't want to pay a Jito tip
//   - You don't need the create tx's "from" to equal creator (it will be funder)
//
// Env:
//   URI              — metadata URI (from metadata.js)
//   NAME, SYMBOL     — token name/symbol
//   FUNDER_SECRET    — base58 secret of fee payer + rent source
//   CREATOR_SECRET   — base58 secret of on-chain creator
//   MINT_SECRET      — optional; base58 secret of mint keypair (default: random)
//   RENT_SOL         — SOL to fund creator with for internal rent (default 0.035)
//   PRIORITY         — compute unit priority microlamports (default 3000000)
//   CU_LIMIT         — compute unit limit (default 300000)

const bs58mod = require('bs58');
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const {
  Connection, Keypair, SystemProgram,
  TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js');
const { PUMP_SDK } = require('@nirholas/pump-sdk');

const RPC_URL  = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
if (!process.env.URI) { console.error('Missing URI'); process.exit(1); }
const URI      = process.env.URI;
const NAME     = process.env.NAME   || 'MyCoin';
const SYMBOL   = process.env.SYMBOL || 'MEME';
const RENT_SOL = parseFloat(process.env.RENT_SOL || '0.035');
const PRIORITY = parseInt(process.env.PRIORITY || '3000000', 10);
const CU_LIMIT = parseInt(process.env.CU_LIMIT || '300000', 10);

const funder  = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const creator = Keypair.fromSecretKey(bs58decode(process.env.CREATOR_SECRET));
const mint    = process.env.MINT_SECRET
  ? Keypair.fromSecretKey(bs58decode(process.env.MINT_SECRET))
  : Keypair.generate();

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');

  console.log('Funder (fee payer):', funder.publicKey.toBase58());
  console.log('Creator:           ', creator.publicKey.toBase58());
  console.log('Mint:              ', mint.publicKey.toBase58());

  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  console.log('Funder balance:', funderBal / 1e9, 'SOL');
  if (funderBal < (RENT_SOL + 0.005) * 1e9) {
    console.error('Funder needs >=', RENT_SOL + 0.005, 'SOL');
    process.exit(1);
  }

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

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }),
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey:   creator.publicKey,
        lamports:   Math.floor(RENT_SOL * 1e9),
      }),
      createIx,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([funder, creator, mint]);

  console.log('Tx size:', tx.serialize().length, 'bytes (limit 1232)');
  if (tx.serialize().length > 1232) { console.error('Too large.'); process.exit(1); }

  const sim = await c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false });
  if (sim.value.err) {
    console.error('Sim failed:', JSON.stringify(sim.value.err));
    console.error('Logs:\n' + (sim.value.logs || []).join('\n'));
    process.exit(1);
  }
  console.log('Sim OK. CU consumed:', sim.value.unitsConsumed);

  console.log('Sending...');
  const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
  const conf = await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (conf.value.err) { console.error('Tx errored:', JSON.stringify(conf.value.err)); process.exit(1); }
  console.log('LAUNCHED.');
  console.log('Mint:    ', mint.publicKey.toBase58());
  console.log('Pump URL:', `https://pump.fun/coin/${mint.publicKey.toBase58()}`);
  console.log('Solscan: ', `https://solscan.io/tx/${sig}`);
})().catch(e => { console.error(e); process.exit(1); });
