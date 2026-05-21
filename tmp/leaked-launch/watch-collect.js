// Continuous watcher: polls creator vault every POLL_MS, fires collect-jito
// when balance exceeds MIN_COLLECT_SOL. Retries on Jito errors.
//
// Env (all required from parent except optional ones below):
//   DESTINATION, FUNDER_SECRET, LEAKED_SECRET (from collect-jito.js)
//   POLL_MS              — default 30000
//   MIN_COLLECT_SOL      — fire when vault >= this many SOL (default 0.05)

const { spawn } = require('child_process');
const { Connection, PublicKey } = require('@solana/web3.js');
const { OnlinePumpSdk } = require('@nirholas/pump-sdk');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const POLL_MS = parseInt(process.env.POLL_MS || '30000', 10);
const MIN_COLLECT_SOL = parseFloat(process.env.MIN_COLLECT_SOL || '0.05');
const LEAKED_PUBKEY = new PublicKey('88cHMF86xTH4c9NnkE1S9qFQ7hnY7LyuyGYuH4vmHuY5');

const c = new Connection(RPC_URL, 'confirmed');
const sdk = new OnlinePumpSdk(c);

function runCollectOnce() {
  return new Promise((resolve) => {
    const env = { ...process.env, BUFFER_LAMPORTS: '890880' };
    const child = spawn('node', ['collect-jito.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => resolve({ code, out, err }));
  });
}

let totalRuns = 0;
let totalSuccessful = 0;

(async () => {
  console.log('Watcher started.');
  console.log('  poll every:', POLL_MS / 1000, 's');
  console.log('  threshold: ', MIN_COLLECT_SOL, 'SOL');
  console.log('  destination:', process.env.DESTINATION);
  console.log('');

  while (true) {
    try {
      const vault = await sdk.getCreatorVaultBalance(LEAKED_PUBKEY);
      const sol = Number(vault) / 1e9;
      const ts = new Date().toISOString().slice(11, 19);

      if (sol >= MIN_COLLECT_SOL) {
        console.log(`[${ts}] vault=${sol.toFixed(4)} SOL >= ${MIN_COLLECT_SOL} — firing collect...`);
        totalRuns++;
        const { code, out, err } = await runCollectOnce();
        const lastLines = (out + err).split('\n').filter(l => l.includes('Destination balance:') || l.includes('CONFIRMED') || l.includes('Bundle submit failed') || l.includes('error')).slice(-3);
        if (code === 0) {
          totalSuccessful++;
          console.log(`[${ts}] success #${totalSuccessful}/${totalRuns}: ${lastLines.find(l => l.includes('Destination balance:')) || 'confirmed'}`);
        } else {
          console.log(`[${ts}] FAILED (code ${code}). Will retry next tick. tail:`);
          for (const l of lastLines) console.log('   ', l);
        }
      } else {
        process.stderr.write(`\r[${ts}] vault=${sol.toFixed(4)} SOL (< ${MIN_COLLECT_SOL})  collects=${totalSuccessful}/${totalRuns}     `);
      }
    } catch (e) {
      console.error(`\n[${new Date().toISOString()}] poll error: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
})();
