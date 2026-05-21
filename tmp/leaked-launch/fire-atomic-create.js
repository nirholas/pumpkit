// Atomic create-only launch: funder transfers rent SOL to leaked creator,
// leaked runs createV2 (no buy), all in one tx. No race window, no buy-ix
// BuybackFeeRecipient error (since there is no buy).
// Signers: funder (fee payer + source), leaked (creator/user), mint.

const fs = require('fs');
const bs58mod = require('bs58');
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const {
  Connection, Keypair, SystemProgram,
  TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js');
const { PUMP_SDK } = require('@nirholas/pump-sdk');

const RPC_URL  = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const URI      = process.env.URI;
const NAME     = process.env.NAME   || 'pUSDC';
const SYMBOL   = process.env.SYMBOL || 'pUSDC';
const RENT_SOL = parseFloat(process.env.RENT_SOL || '0.035');
const PRIORITY = parseInt(process.env.PRIORITY || '3000000', 10);
const CU_LIMIT = parseInt(process.env.CU_LIMIT || '300000', 10);

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const leaked = Keypair.fromSecretKey(bs58decode(process.env.LEAKED_SECRET));
const mint   = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./mint.json', 'utf8'))));

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');

  console.log('Funder (fee payer):', funder.publicKey.toBase58());
  console.log('Leaked (creator): ', leaked.publicKey.toBase58());
  console.log('Mint:             ', mint.publicKey.toBase58());

  const funderBal = await c.getBalance(funder.publicKey, 'confirmed');
  console.log('Funder balance:', funderBal / 1e9, 'SOL');
  if (funderBal < (RENT_SOL + 0.005) * 1e9) {
    console.error('Funder needs ≥', (RENT_SOL + 0.005), 'SOL');
    process.exit(1);
  }

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

  const fundIx = SystemProgram.transfer({
    fromPubkey: funder.publicKey,
    toPubkey:   leaked.publicKey,
    lamports:   Math.floor(RENT_SOL * 1e9),
  });

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }),
      fundIx,
      createIx,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([funder, leaked, mint]);

  console.log('Tx size:', tx.serialize().length, 'bytes (limit 1232)');
  if (tx.serialize().length > 1232) {
    console.error('Too large.');
    process.exit(1);
  }

  console.log('Simulating first...');
  const sim = await c.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false });
  if (sim.value.err) {
    console.error('Sim failed:', JSON.stringify(sim.value.err));
    console.error('Logs:\n' + (sim.value.logs || []).join('\n'));
    process.exit(1);
  }
  console.log('Sim OK. CU consumed:', sim.value.unitsConsumed);

  console.log('Sending atomic tx...');
  const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
  console.log('Sig:', sig);
  const conf = await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (conf.value.err) {
    console.error('Tx errored on chain:', JSON.stringify(conf.value.err));
    process.exit(1);
  }
  console.log('\nLAUNCHED.');
  console.log('Mint:    ', mint.publicKey.toBase58());
  console.log('Pump URL:', `https://pump.fun/coin/${mint.publicKey.toBase58()}`);
  console.log('Solscan: ', `https://solscan.io/tx/${sig}`);
})().catch(e => { console.error(e); process.exit(1); });
