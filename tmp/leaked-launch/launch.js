// Atomic pump.fun launch from a separate creator wallet.
//
// Default mode: FUNDER is creator/user.
// Leaked-creator mode (LEAKED_SECRET set): FUNDER pays fee + transfers SOL into the
// leaked/creator wallet atomically, the LEAKED wallet is the creator/user.
// One transaction. Sweeper bots can't insert between the funding and the create+buy.
//
// Required env:
//   URI               — metadata URI (from metadata.js)
//   FUNDER_SECRET     — base58 secret of the SOL-bearing wallet
//                       (or FUNDER_KEYPAIR=path/to/json)
//
// Optional:
//   LEAKED_SECRET     — base58 secret of the wallet that should appear as creator
//                       (or LEAKED_KEYPAIR=path/to/json). If unset, funder = creator.
//   MINT_KEYPAIR      — path to mint.json (default ./mint.json)
//   RPC_URL           — RPC override (default Helius if HELIUS_KEY set, else public)
//   HELIUS_KEY        — Helius API key (used only if RPC_URL not set)
//   NAME / SYMBOL     — token name/symbol (default pUSDC / pUSDC)
//   DEV_BUY_SOL       — initial dev buy in SOL (default 0)
//   SLIPPAGE_BPS      — default 500 (5%)
//   PRIORITY_FEE_MICRO— compute unit price, microlamports (default 100000)
//   COMPUTE_UNITS     — compute unit limit (default 400000)
//   DRY_RUN=1         — simulate only, don't send

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

const URI         = required('URI');
const NAME        = process.env.NAME   || 'pUSDC';
const SYMBOL      = process.env.SYMBOL || 'pUSDC';
const DEV_BUY_SOL = parseFloat(process.env.DEV_BUY_SOL || '0');
const SLIPPAGE_BPS       = parseInt(process.env.SLIPPAGE_BPS       || '500', 10);
const PRIORITY_FEE_MICRO = parseInt(process.env.PRIORITY_FEE_MICRO || '100000', 10);
const COMPUTE_UNITS      = parseInt(process.env.COMPUTE_UNITS      || '400000', 10);
const RPC_URL = process.env.RPC_URL
  || (process.env.HELIUS_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}` : 'https://api.mainnet-beta.solana.com');

function required(name) { const v = process.env[name]; if (!v) { console.error(`Missing env: ${name}`); process.exit(1); } return v; }

function loadKey(secretEnv, fileEnv, requiredIt) {
  if (process.env[secretEnv]) return Keypair.fromSecretKey(bs58decode(process.env[secretEnv]));
  if (process.env[fileEnv])   return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env[fileEnv], 'utf8'))));
  if (requiredIt) { console.error(`Provide ${secretEnv} (base58) or ${fileEnv} (path)`); process.exit(1); }
  return null;
}

function loadMint() {
  const path = process.env.MINT_KEYPAIR || './mint.json';
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, 'utf8'))));
}

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const onlineSdk  = new OnlinePumpSdk(connection);

  const leaked = loadKey('LEAKED_SECRET', 'LEAKED_KEYPAIR', false);
  const funder = leaked ? loadKey('FUNDER_SECRET', 'FUNDER_KEYPAIR', false) : loadKey('FUNDER_SECRET', 'FUNDER_KEYPAIR', true);
  const creator = leaked || funder;
  const mint = loadMint();

  console.log('RPC:    ', RPC_URL.replace(/api-key=[^&]+/, 'api-key=***'));
  console.log('Creator:', creator.publicKey.toBase58(), '(fee payer + creator)');
  if (funder) console.log('Funder: ', funder.publicKey.toBase58(), '(pre-fund source, not in this tx)');
  console.log('Mint:   ', mint.publicKey.toBase58());
  console.log('Name:   ', NAME);
  console.log('Symbol: ', SYMBOL);
  console.log('URI:    ', URI);
  console.log('Dev buy:', DEV_BUY_SOL, 'SOL');

  const global = await onlineSdk.fetchGlobal();

  // Compute dev-buy amounts
  const solLamports = new BN(Math.floor(DEV_BUY_SOL * 1e9));
  let amount = new BN(0);
  if (DEV_BUY_SOL > 0) {
    const feeConfig = await onlineSdk.fetchFeeConfig();
    const bondingCurve = newBondingCurve(global);
    amount = getBuyTokenAmountFromSolAmount({
      global, feeConfig, mintSupply: new BN(0), bondingCurve, amount: solLamports,
    });
    console.log('Estimated dev tokens:', amount.toString());
  }

  // When leaked-creator mode is used, the tx is too large to also include
  // the funder->creator transfer. The creator wallet must already hold SOL.
  // The funder is dropped from the tx entirely; creator pays its own fee.
  const preIxs = [];
  if (leaked) {
    const creatorBal = await connection.getBalance(creator.publicKey);
    console.log('Creator SOL balance:', creatorBal / 1e9);
    const needed = Math.floor((DEV_BUY_SOL + 0.03) * 1e9);
    if (creatorBal < needed) {
      console.error(`Creator needs ≥ ${needed/1e9} SOL. Current: ${creatorBal/1e9}. Fund it first:`);
      console.error(`  solana transfer ${creator.publicKey.toBase58()} ${needed/1e9} --from <funder>`);
      process.exit(1);
    }
  }

  const createIxs = await PUMP_SDK.createV2AndBuyInstructions({
    global,
    mint:    mint.publicKey,
    name:    NAME,
    symbol:  SYMBOL,
    uri:     URI,
    creator: creator.publicKey,
    user:    creator.publicKey,
    amount,
    solAmount: solLamports,
    mayhemMode: false,
    cashback:   false,
  });

  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: COMPUTE_UNITS }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICRO }),
    ...preIxs,
    ...createIxs,
  ];

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  // In leaked-creator mode, the creator (leaked) pays its own fee — funder isn't in this tx.
  // In normal mode, funder is creator and fee payer.
  const feePayer = leaked ? leaked : funder;
  const message = new TransactionMessage({
    payerKey: feePayer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const tx = new VersionedTransaction(message);
  const signers = leaked ? [leaked, mint] : [funder, mint];
  tx.sign(signers);

  console.log('\nSerialized tx size:', tx.serialize().length, 'bytes');

  if (process.env.DRY_RUN === '1') {
    console.log('Simulating (DRY_RUN=1, not sending)...');
    const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: false });
    if (sim.value.err) {
      console.error('Sim failed:', JSON.stringify(sim.value.err));
      console.error('Logs:\n' + (sim.value.logs || []).join('\n'));
      process.exit(1);
    }
    console.log('Sim OK. CU consumed:', sim.value.unitsConsumed);
    return;
  }

  console.log('Sending...');
  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  console.log('Signature:', sig);
  console.log('Confirming...');
  const conf = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (conf.value.err) {
    console.error('Tx errored on chain:', JSON.stringify(conf.value.err));
    process.exit(1);
  }
  console.log('\nLAUNCHED.');
  console.log('Mint:    ', mint.publicKey.toBase58());
  console.log('Pump URL:', `https://pump.fun/coin/${mint.publicKey.toBase58()}`);
  console.log('Solscan: ', `https://solscan.io/tx/${sig}`);
}

main().catch(e => { console.error(e); process.exit(1); });
