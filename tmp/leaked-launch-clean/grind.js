const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const nacl = require('tweetnacl');
const bs58mod = require('bs58');
const bs58encode = bs58mod.default ? bs58mod.default.encode : bs58mod.encode;
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PREFIX = 'usdc';
const OUT_DIR = __dirname;

if (isMainThread) {
  const N = Math.max(1, os.cpus().length);
  console.log(`Grinding prefix="${PREFIX}" on ${N} workers`);
  console.log(`Expected attempts: ~${Math.pow(58, PREFIX.length).toLocaleString()}`);

  let total = 0;
  const start = Date.now();
  const workers = [];

  for (let i = 0; i < N; i++) {
    const w = new Worker(__filename, { workerData: { prefix: PREFIX } });
    w.on('message', (msg) => {
      if (msg.type === 'stats') {
        total += msg.count;
        const sec = (Date.now() - start) / 1000;
        const rate = (total / sec).toFixed(0);
        process.stdout.write(`\r${rate}/s | ${total.toLocaleString()} tried | ${sec.toFixed(0)}s elapsed     `);
      } else if (msg.type === 'found') {
        const sec = ((Date.now() - start) / 1000).toFixed(1);
        const p = path.join(OUT_DIR, 'funder.json');
        fs.writeFileSync(p, JSON.stringify(Array.from(msg.secret)));
        fs.writeFileSync(path.join(OUT_DIR, 'funder.pub'), msg.pubkey + '\n');
        console.log(`\n\nFOUND in ${sec}s: ${msg.pubkey}`);
        console.log(`Saved keypair to: ${p}`);
        workers.forEach(w => w.terminate());
        process.exit(0);
      }
    });
    w.on('error', (e) => console.error('worker error:', e));
    workers.push(w);
  }
} else {
  const { prefix } = workerData;
  let count = 0;
  const tick = 10000;

  while (true) {
    const seed = crypto.randomBytes(32);
    const kp = nacl.sign.keyPair.fromSeed(seed);
    const addr = bs58encode(kp.publicKey);

    if (addr.startsWith(prefix)) {
      parentPort.postMessage({ type: 'found', secret: kp.secretKey, pubkey: addr });
    }

    count++;
    if (count % tick === 0) {
      parentPort.postMessage({ type: 'stats', count: tick });
    }
  }
}
