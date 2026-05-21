// USDC rewards distribution for a SOL-paired pump.fun coin.
//
// Flow:
//   1. Collect accumulated creator fees (SOL) from the pump creator vault to the creator wallet.
//   2. Quote and execute a SOL -> USDC swap on Jupiter for REWARD_PERCENT of the freshly collected SOL.
//   3. Snapshot token holders for the mint.
//   4. Filter (exclude curve/dev/treasury, skip dust under MIN_BPS of supply, skip holders without USDC ATA).
//   5. Compute sqrt-weighted shares (favors small holders over whales — the "unique" mechanic).
//   6. Airdrop USDC in batched txs.
//
// Modes:
//   node distribute.js                                  # normal run
//   DRY_RUN=1 node distribute.js                        # show plan, no txs
//   EMERGENCY=1 EMERGENCY_TO=<addr> node distribute.js  # skip holder logic, sweep all USDC to one address
//
// Env vars:
//   HELIUS_KEY            — Helius API key
//   CREATOR_SECRET        — base58 secret key of the creator (= funder of the launch)
//   MINT                  — base58 of the token mint
//   REWARD_PERCENT        — % of newly collected fees to convert + airdrop (default 80)
//   MIN_BPS               — holder eligibility floor in basis points of total supply (default 10 = 0.1%)
//   SLIPPAGE_BPS          — Jupiter swap slippage tolerance (default 100 = 1%)

const fs = require('fs');
const bs58mod = require('bs58');
const bs58decode = bs58mod.default ? bs58mod.default.decode : bs58mod.decode;
const fetch = require('node-fetch');
const {
  Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction,
  ComputeBudgetProgram,
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const { OnlinePumpSdk } = require('@nirholas/pump-sdk');

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;
const TOKEN_DECIMALS = 6; // pump.fun coins are 6 decimals

const HELIUS_KEY     = required('HELIUS_KEY');
const MINT_STR       = required('MINT');
const REWARD_PERCENT = parseFloat(process.env.REWARD_PERCENT || '80');
const MIN_BPS        = parseInt(process.env.MIN_BPS || '10', 10);
const SLIPPAGE_BPS   = parseInt(process.env.SLIPPAGE_BPS || '100', 10);
const DRY_RUN        = process.env.DRY_RUN === '1';
const EMERGENCY      = process.env.EMERGENCY === '1';
const EMERGENCY_TO   = process.env.EMERGENCY_TO;

function required(name) {
  const v = process.env[name];
  if (!v) { console.error(`Missing env: ${name}`); process.exit(1); }
  return v;
}

function loadCreator() {
  if (process.env.CREATOR_SECRET) return Keypair.fromSecretKey(bs58decode(process.env.CREATOR_SECRET));
  if (process.env.CREATOR_KEYPAIR) {
    const arr = JSON.parse(fs.readFileSync(process.env.CREATOR_KEYPAIR, 'utf8'));
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  console.error('Provide CREATOR_SECRET (base58) or CREATOR_KEYPAIR (path)');
  process.exit(1);
}

async function jupQuote(inMint, outMint, amountLamports) {
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inMint}&outputMint=${outMint}&amount=${amountLamports}&slippageBps=${SLIPPAGE_BPS}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Jupiter quote failed ${r.status}: ${await r.text()}`);
  return r.json();
}

async function jupSwapTx(quote, userPubkey) {
  const r = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: userPubkey.toBase58(),
      wrapAndUnwrapSol: true,
      computeUnitPriceMicroLamports: 100000,
    }),
  });
  if (!r.ok) throw new Error(`Jupiter swap failed ${r.status}: ${await r.text()}`);
  return r.json();
}

async function fetchHolders(connection, mint) {
  const accounts = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      { dataSize: 165 },
      { memcmp: { offset: 0, bytes: mint.toBase58() } },
    ],
  });
  return accounts.map(({ account }) => {
    const data = account.data;
    const owner = new PublicKey(data.slice(32, 64));
    const amount = data.readBigUInt64LE(64);
    return { owner: owner.toBase58(), amount };
  }).filter(h => h.amount > 0n);
}

async function accountExists(connection, pubkey) {
  const info = await connection.getAccountInfo(pubkey, 'confirmed');
  return info !== null;
}

async function sendTx(connection, payer, ixs, signers = []) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer, ...signers]);
  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}

async function main() {
  const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, 'confirmed');
  const onlineSdk  = new OnlinePumpSdk(connection);
  const creator    = loadCreator();
  const mint       = new PublicKey(MINT_STR);

  console.log('Creator:', creator.publicKey.toBase58());
  console.log('Mint:   ', mint.toBase58());
  console.log('Mode:   ', EMERGENCY ? `EMERGENCY -> ${EMERGENCY_TO}` : `normal, ${REWARD_PERCENT}% of fees to holders, sqrt-weighted, min ${MIN_BPS}bps`);
  if (DRY_RUN) console.log('** DRY_RUN — no transactions will be sent **\n');

  // ---- 1. Collect creator fees from pump --------------------------------
  const vaultBalanceBefore = await onlineSdk.getCreatorVaultBalance(creator.publicKey);
  console.log('\n[1] Creator vault balance:', Number(vaultBalanceBefore) / 1e9, 'SOL');

  if (vaultBalanceBefore.gtn(0)) {
    const collectIxs = await onlineSdk.collectCoinCreatorFeeInstructions(creator.publicKey, creator.publicKey);
    if (DRY_RUN) {
      console.log(`    [dry] would send collectCoinCreatorFee tx with ${collectIxs.length} ix(s)`);
    } else {
      const sig = await sendTx(connection, creator, [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
        ...collectIxs,
      ]);
      console.log('    collected. sig:', sig);
    }
  } else {
    console.log('    nothing to collect.');
  }

  // ---- 2. Decide how much SOL to convert --------------------------------
  const creatorBalance = await connection.getBalance(creator.publicKey, 'confirmed');
  const rentBuffer = 0.01 * 1e9; // leave 0.01 SOL behind for future tx fees
  const collectedNow = Number(vaultBalanceBefore);
  const swapLamports = EMERGENCY
    ? 0  // emergency mode skips swap; sweeps existing USDC
    : Math.max(0, Math.min(creatorBalance - rentBuffer, Math.floor(collectedNow * REWARD_PERCENT / 100)));

  console.log('\n[2] Creator wallet SOL balance:', creatorBalance / 1e9);
  console.log('    Swapping to USDC:', swapLamports / 1e9, 'SOL');

  // ---- 3. Swap SOL -> USDC via Jupiter ----------------------------------
  if (swapLamports > 0) {
    const quote = await jupQuote('So11111111111111111111111111111111111111112', USDC_MINT.toBase58(), swapLamports);
    console.log('    quote: expect', Number(quote.outAmount) / 10**USDC_DECIMALS, 'USDC');
    if (!DRY_RUN) {
      const { swapTransaction } = await jupSwapTx(quote, creator.publicKey);
      const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
      tx.sign([creator]);
      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
      console.log('    swap sig:', sig);
    } else {
      console.log('    [dry] would execute Jupiter swap');
    }
  }

  // ---- 4. Check USDC balance in creator wallet --------------------------
  const creatorUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, creator.publicKey);
  const ataInfo = await connection.getParsedAccountInfo(creatorUsdcAta, 'confirmed');
  const usdcBalance = ataInfo.value?.data?.parsed?.info?.tokenAmount?.amount;
  const usdcBalanceNum = usdcBalance ? Number(usdcBalance) : 0;
  console.log('\n[3] Creator USDC balance:', usdcBalanceNum / 10**USDC_DECIMALS, 'USDC');

  if (usdcBalanceNum === 0) { console.log('    nothing to distribute.'); return; }

  // ---- EMERGENCY: dump all USDC to EMERGENCY_TO -------------------------
  if (EMERGENCY) {
    if (!EMERGENCY_TO) { console.error('EMERGENCY=1 requires EMERGENCY_TO=<addr>'); process.exit(1); }
    const toPubkey = new PublicKey(EMERGENCY_TO);
    const toAta = getAssociatedTokenAddressSync(USDC_MINT, toPubkey);
    if (!(await accountExists(connection, toAta))) {
      console.error(`Emergency destination has no USDC ATA: ${toAta.toBase58()} — open one first.`);
      process.exit(1);
    }
    const ix = createTransferCheckedInstruction(
      creatorUsdcAta, USDC_MINT, toAta, creator.publicKey,
      BigInt(usdcBalanceNum), USDC_DECIMALS,
    );
    console.log(`\n[EMERGENCY] Sweeping ${usdcBalanceNum / 10**USDC_DECIMALS} USDC -> ${EMERGENCY_TO}`);
    if (DRY_RUN) { console.log('    [dry] would send sweep tx'); return; }
    const sig = await sendTx(connection, creator, [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
      ix,
    ]);
    console.log('    sig:', sig);
    return;
  }

  // ---- 5. Snapshot holders ----------------------------------------------
  console.log('\n[4] Snapshotting holders...');
  let holders = await fetchHolders(connection, mint);
  console.log('    raw holders:', holders.length);

  // Exclusions
  const bondingCurveAddr = (await import('@nirholas/pump-sdk')).bondingCurvePda(mint).toBase58();
  const exclude = new Set([
    bondingCurveAddr,
    creator.publicKey.toBase58(),
    '11111111111111111111111111111111',
  ]);
  holders = holders.filter(h => !exclude.has(h.owner));

  const totalSupply = holders.reduce((acc, h) => acc + h.amount, 0n);
  const minAmount = (totalSupply * BigInt(MIN_BPS)) / 10000n;
  holders = holders.filter(h => h.amount >= minAmount);
  console.log('    after exclusions + min', MIN_BPS, 'bps:', holders.length);

  // Skip holders without USDC ATA (per your choice).
  console.log('    checking USDC ATAs (this is slow — N RPC calls)...');
  const concurrency = 20;
  const eligible = [];
  for (let i = 0; i < holders.length; i += concurrency) {
    const batch = holders.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(async h => {
      const ata = getAssociatedTokenAddressSync(USDC_MINT, new PublicKey(h.owner));
      const exists = await accountExists(connection, ata);
      return exists ? { ...h, ata } : null;
    }));
    for (const r of results) if (r) eligible.push(r);
    process.stderr.write(`\r    checked ${Math.min(i + concurrency, holders.length)}/${holders.length}`);
  }
  console.error(`\n    eligible (with USDC ATA): ${eligible.length}`);

  if (eligible.length === 0) { console.log('    no eligible holders.'); return; }

  // ---- 6. Sqrt-weighted distribution ------------------------------------
  // weight_i = sqrt(balance_i); reward_i = pot * weight_i / sum(weights)
  const weights = eligible.map(h => Math.sqrt(Number(h.amount) / 10**TOKEN_DECIMALS));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const distributions = eligible.map((h, i) => ({
    ...h,
    rewardLamports: Math.floor((weights[i] / totalWeight) * usdcBalanceNum),
  })).filter(d => d.rewardLamports > 0);

  const totalToSend = distributions.reduce((acc, d) => acc + d.rewardLamports, 0);
  console.log(`\n[5] Distributing ${totalToSend / 10**USDC_DECIMALS} USDC to ${distributions.length} holders (sqrt-weighted)`);
  console.log('    sample (top 5 weighted):');
  for (const d of distributions.slice().sort((a,b) => b.rewardLamports - a.rewardLamports).slice(0,5)) {
    console.log(`      ${d.owner}  ${(d.rewardLamports / 10**USDC_DECIMALS).toFixed(6)} USDC`);
  }

  if (DRY_RUN) { console.log('    [dry] would airdrop'); return; }

  // ---- 7. Airdrop in batches (8 transfers per tx is safe size) ----------
  const PER_TX = 8;
  for (let i = 0; i < distributions.length; i += PER_TX) {
    const batch = distributions.slice(i, i + PER_TX);
    const ixs = [
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }),
      ...batch.map(d => createTransferCheckedInstruction(
        creatorUsdcAta, USDC_MINT, d.ata, creator.publicKey,
        BigInt(d.rewardLamports), USDC_DECIMALS,
      )),
    ];
    try {
      const sig = await sendTx(connection, creator, ixs);
      console.log(`    batch ${i/PER_TX + 1}/${Math.ceil(distributions.length/PER_TX)} sig: ${sig}`);
    } catch (e) {
      console.error(`    batch ${i/PER_TX + 1} FAILED: ${e.message}`);
    }
  }

  console.log('\nDONE.');
}

main().catch(e => { console.error(e); process.exit(1); });
