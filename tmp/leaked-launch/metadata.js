// Uploads token metadata to pump.fun's IPFS endpoint.
// Usage:
//   node metadata.js                    # uses defaults below, generates a 1x1 PNG placeholder
//   IMAGE_PATH=./logo.png node metadata.js
//
// Prints the metadataUri to stdout, which you feed into launch.js as --uri.

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');

const NAME        = process.env.NAME        || 'pUSD';
const SYMBOL      = process.env.SYMBOL      || 'pUSD';
const DESCRIPTION = process.env.DESCRIPTION || 'test';
const TWITTER     = process.env.TWITTER     || '';
const TELEGRAM    = process.env.TELEGRAM    || '';
const WEBSITE     = process.env.WEBSITE     || 'https://github.com/chris-baton';
const SHOW_NAME   = (process.env.SHOW_NAME || 'true') === 'true';

const IMAGE_PATH  = process.env.IMAGE_PATH;

// 1x1 transparent PNG — fallback so the upload form is valid without you
// committing to an image yet. Replace later by setting IMAGE_PATH=./yourfile.png
const ONE_PX_TRANSPARENT_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f0305000601018a0c1d99000000004945' +
  '4e44ae426082',
  'hex'
);

async function main() {
  const form = new FormData();
  if (IMAGE_PATH) {
    form.append('file', fs.createReadStream(IMAGE_PATH), { filename: path.basename(IMAGE_PATH) });
  } else {
    form.append('file', ONE_PX_TRANSPARENT_PNG, { filename: 'placeholder.png', contentType: 'image/png' });
  }
  form.append('name', NAME);
  form.append('symbol', SYMBOL);
  form.append('description', DESCRIPTION);
  form.append('twitter', TWITTER);
  form.append('telegram', TELEGRAM);
  form.append('website', WEBSITE);
  form.append('showName', String(SHOW_NAME));

  const res = await fetch('https://pump.fun/api/ipfs', {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`IPFS upload failed ${res.status}: ${txt}`);
  }
  const json = await res.json();
  console.error('Full response:', JSON.stringify(json, null, 2));
  console.log(json.metadataUri || json.metadata_uri || JSON.stringify(json));
}

main().catch(e => { console.error(e); process.exit(1); });
