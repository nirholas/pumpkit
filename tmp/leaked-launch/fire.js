// Single-process simultaneous send: funding tx + create+buy tx with same blockhash.
// Funding priority > create+buy priority (so funding orders first in the same block).
// Both fees are well above what the sweeper bot uses (~225 microlamports/CU).

const fs = require('fs');
const BN = require('bn.js');
const bs58mod = require('bs58');
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const {
  Connection, Keypair, PublicKey, SystemProgram,
  TransactionMessage, VersionedTransaction, ComputeBudgetProgram,
} = require('@solana/web3.js');
const {
  PUMP_SDK, OnlinePumpSdk,
  getBuyTokenAmountFromSolAmount, newBondingCurve,
} = require('@nirholas/pump-sdk');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const URI     = process.env.URI;
const NAME    = process.env.NAME   || 'pUSDC';
const SYMBOL  = process.env.SYMBOL || 'pUSDC';
const DEV_BUY_SOL    = parseFloat(process.env.DEV_BUY_SOL || '0.25');
const FUND_BUFFER    = parseFloat(process.env.FUND_BUFFER || '0.03');
const FUND_PRIORITY  = parseInt(process.env.FUND_PRIORITY  || '5000000', 10);  // microlamports/CU
const LAUNCH_PRIORITY= parseInt(process.env.LAUNCH_PRIORITY|| '3000000', 10);  // microlamports/CU

const funder = Keypair.fromSecretKey(bs58decode(process.env.FUNDER_SECRET));
const leaked = Keypair.fromSecretKey(bs58decode(process.env.LEAKED_SECRET));
const mint   = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./mint.json', 'utf8'))));

(async () => {
  const c = new Connection(RPC_URL, 'confirmed');
  const sdk = new OnlinePumpSdk(c);

  console.log('Funder:', funder.publicKey.toBase58());
  console.log('Leaked:', leaked.publicKey.toBase58());
  console.log('Mint:  ', mint.publicKey.toBase58());

  const fundLamports = Math.floor((DEV_BUY_SOL + FUND_BUFFER) * 1e9);
  const solLamports  = new BN(Math.floor(DEV_BUY_SOL * 1e9));

  console.log('Funding amount:', fundLamports / 1e9, 'SOL');
  console.log('Fund priority: ', FUND_PRIORITY, 'µL/CU');
  console.log('Launch priority:', LAUNCH_PRIORITY, 'µL/CU');

  console.log('\nFetching pump global + computing dev-buy estimate...');
  const global = await sdk.fetchGlobal();
  const feeConfig = await sdk.fetchFeeConfig();
  const bondingCurve = newBondingCurve(global);
  const amount = getBuyTokenAmountFromSolAmount({
    global, feeConfig, mintSupply: new BN(0), bondingCurve, amount: solLamports,
  });
  console.log('Estimated dev tokens:', amount.toString());

  console.log('Building create+buy instructions...');
  const createIxs = await PUMP_SDK.createV2AndBuyInstructions({
    global,
    mint:    mint.publicKey,
    name:    NAME,
    symbol:  SYMBOL,
    uri:     URI,
    creator: leaked.publicKey,
    user:    leaked.publicKey,
    amount,
    solAmount: solLamports,
    mayhemMode: false,
    cashback:   false,
  });

  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash('confirmed');
  console.log('Blockhash:', blockhash);

  // FUNDING TX (signer: funder; high priority so it lands first)
  const fundMsg = new TransactionMessage({
    payerKey: funder.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: FUND_PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600 }),
      SystemProgram.transfer({
        fromPubkey: funder.publicKey,
        toPubkey:   leaked.publicKey,
        lamports:   fundLamports,
      }),
    ],
  }).compileToV0Message();
  const fundTx = new VersionedTransaction(fundMsg);
  fundTx.sign([funder]);
  console.log('Fund tx size:', fundTx.serialize().length, 'bytes');

  // LAUNCH TX (signers: leaked, mint; slightly lower priority so funding orders first)
  const launchMsg = new TransactionMessage({
    payerKey: leaked.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: LAUNCH_PRIORITY }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }),
      ...createIxs,
    ],
  }).compileToV0Message();
  const launchTx = new VersionedTransaction(launchMsg);
  launchTx.sign([leaked, mint]);
  console.log('Launch tx size:', launchTx.serialize().length, 'bytes');

  console.log('\nFiring BOTH txs simultaneously...');
  const t0 = Date.now();
  const [fundSig, launchSig] = await Promise.all([
    c.sendRawTransaction(fundTx.serialize(), { skipPreflight: true, maxRetries: 5 }),
    c.sendRawTransaction(launchTx.serialize(), { skipPreflight: true, maxRetries: 5 }),
  ]);
  console.log(`Submitted in ${Date.now() - t0}ms`);
  console.log('Fund sig:  ', fundSig);
  console.log('Launch sig:', launchSig);

  console.log('\nWaiting for confirmations...');
  const [fundConf, launchConf] = await Promise.allSettled([
    c.confirmTransaction({ signature: fundSig,   blockhash, lastValidBlockHeight }, 'confirmed'),
    c.confirmTransaction({ signature: launchSig, blockhash, lastValidBlockHeight }, 'confirmed'),
  ]);

  console.log('\nFund:  ', JSON.stringify(fundConf));
  console.log('Launch:', JSON.stringify(launchConf));

  console.log('\nFinal state:');
  console.log('Funder balance:', (await c.getBalance(funder.publicKey, 'confirmed')) / 1e9);
  console.log('Leaked balance:', (await c.getBalance(leaked.publicKey, 'confirmed')) / 1e9);
  console.log('Mint:', mint.publicKey.toBase58());
  console.log('Check: https://pump.fun/coin/' + mint.publicKey.toBase58());
})().catch(e => { console.error(e); process.exit(1); });
