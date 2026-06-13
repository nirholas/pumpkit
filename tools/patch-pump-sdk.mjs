// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2025-2026 nirholas (nichxbt)
//
// Postinstall patch for @nirholas/pump-sdk.
//
// The published 1.30.0 package ships a broken `exports.import` condition: it
// points at ./dist/esm/index.js, but the actual ESM bundle is index.mjs. CJS
// `require` works, but ESM `import` (which our packages use) fails at runtime
// with ERR_MODULE_NOT_FOUND. We rewrite the condition to the real filename.
//
// Defensive by design: only rewrites when the declared target is missing AND the
// .mjs target exists, so a future, correctly-packaged SDK release is left alone.
// Idempotent and safe to run on every install (npm postinstall).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = join(root, 'node_modules', '@nirholas', 'pump-sdk');
const pkgJson = join(pkgDir, 'package.json');

if (!existsSync(pkgJson)) {
    // Not installed (e.g. partial install) — nothing to do.
    process.exit(0);
}

try {
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'));
    const dot = pkg.exports?.['.'];
    if (!dot || typeof dot.import !== 'string') process.exit(0);

    const declared = dot.import.replace(/^\.\//, '');
    const declaredPath = join(pkgDir, declared);
    const mjsPath = join(pkgDir, 'dist', 'esm', 'index.mjs');

    // Only act on the known bug: declared ESM target missing, .mjs present.
    if (!existsSync(declaredPath) && existsSync(mjsPath)) {
        dot.import = './dist/esm/index.mjs';
        writeFileSync(pkgJson, JSON.stringify(pkg, null, 2) + '\n');
        console.log('[patch-pump-sdk] fixed exports.import -> ./dist/esm/index.mjs');
    }
} catch (err) {
    // Never fail the install over this — just report.
    console.log('[patch-pump-sdk] skipped:', err.message);
}
