// Atomic create-only launch (no dev buy). Single tx, fits under 1232B.
// Signers: leaked (fee payer + creator + user), mint. No race window.

const fs = require('fs');
const bs58mod = require('bs58');
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const {
  Connection, Keypair, TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js');
const { PUMP_SDK } = require('@nirholas/pump-sdk');

const RPC_URL  = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const URI      = process.env.URI;
const NAME     = process.env.NAME   || 'pUSDC';
const SYMBOL   = process.env.SYMBOL || 'pUSDC';
const PRIORITY = parseInt(process.env.PRIORITY || '3000000', 10);
const CU_LIMIT = parseInt(process.env.CU_LIMIT || '300000', 10);

const leaked = Keypair.fromSecretKey(bs58decode(process.env.LEAKED_SECRET));
const mint   = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./mint.json', 'utf8'))));

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');

  console.log('Creator/fee-payer:', leaked.publicKey.toBase58());
  console.log('Mint:             ', mint.publicKey.toBase58());
  console.log('Name:', NAME, ' Symbol:', SYMBOL);

  const bal = await c.getBalance(leaked.publicKey, 'confirmed');
  console.log('Creator balance:', bal / 1e9, 'SOL');
  if (bal < 0.025 * 1e9) {
    console.error('Need >= 0.025 SOL for create rent. Fund first.');
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

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: leaked.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: CU_LIMIT }),
      createIx,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([leaked, mint]);

  console.log('Tx size:', tx.serialize().length, 'bytes');

  console.log('Sending...');
  const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
  console.log('Sig:', sig);
  const conf = await c.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (conf.value.err) {
    console.error('Tx errored:', JSON.stringify(conf.value.err));
    process.exit(1);
  }
  console.log('\nLAUNCHED.');
  console.log('Mint:    ', mint.publicKey.toBase58());
  console.log('Pump URL:', `https://pump.fun/coin/${mint.publicKey.toBase58()}`);
  console.log('Solscan: ', `https://solscan.io/tx/${sig}`);
})().catch(e => { console.error(e); process.exit(1); });
