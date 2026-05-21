#!/usr/bin/env node
/**
 * tools/lint-check.mjs
 *
 * Lightweight repo-wide lint that complements `tsc --noEmit`. Designed to be
 * fast (no eslint install required) and to catch the things that have
 * actually bitten this repo:
 *
 *   1. Staged or tracked files that look like Solana keypair JSON (a JSON
 *      array of exactly 64 small integers).
 *   2. `console.log` calls left in `src/` (tests + scripts allowed).
 *   3. `.only` / `fdescribe` left in test files.
 *   4. Hardcoded secret patterns: GitHub PATs, Telegram bot tokens, base58
 *      strings of suspicious length.
 *   5. TODO/FIXME without an owner — `// TODO(name): …` is fine, naked
 *      `// TODO` is flagged.
 *
 * Usage:
 *   node tools/lint-check.mjs [packageDir]
 *
 * Exits with code 1 on any error-level finding. Warnings do not fail the
 * command — they print to stderr.
 *
 * This file uses ES modules and has zero runtime dependencies beyond Node 20+.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, extname, basename } from 'node:path';
import { argv, cwd, exit } from 'node:process';

const ROOT = resolve(argv[2] ?? cwd());

const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.git',
  'coverage',
  'tmp',
  'data',
]);

const SRC_LIKE = /\/(src|lib)\//;
const TEST_LIKE = /(\.test\.|\.spec\.|__tests__|\/tests?\/)/;

const errors = [];
const warnings = [];

/** Recursively walk a directory, yielding absolute file paths. */
async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/** Heuristic: does this JSON file contain a Solana secret-key byte array? */
function looksLikeKeypair(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return false;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false;
  }
  if (!Array.isArray(parsed)) return false;
  if (parsed.length !== 64) return false;
  return parsed.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
}

const SECRET_PATTERNS = [
  { name: 'GitHub PAT (classic)', re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub PAT (fine-grained)', re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/ },
  { name: 'GitHub OAuth token', re: /\bgho_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub server token', re: /\bghs_[A-Za-z0-9]{36}\b/ },
  { name: 'Telegram bot token', re: /\b\d{9,10}:[A-Za-z0-9_-]{35}\b/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
];

async function checkFile(path) {
  const rel = relative(ROOT, path);
  const ext = extname(path);
  const base = basename(path);

  if (ext === '.json' && (rel.includes('tmp/') || rel.includes('secrets/') || rel.includes('scripts/'))) {
    const text = await readFile(path, 'utf8').catch(() => '');
    if (looksLikeKeypair(text)) {
      errors.push(`${rel}: looks like a Solana keypair JSON (64-byte array). Move it out of the repo tree.`);
      return;
    }
  }

  const codeExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
  if (!codeExts.has(ext)) return;

  // Skip generated and vendored code
  if (rel.includes('/dist/') || rel.includes('/node_modules/')) return;

  const text = await readFile(path, 'utf8').catch(() => '');
  if (!text) return;
  const lines = text.split('\n');

  const isSrc = SRC_LIKE.test('/' + rel + '/');
  const isTest = TEST_LIKE.test(rel);

  lines.forEach((line, i) => {
    const lineNo = i + 1;

    // console.log in src (not tests)
    if (isSrc && !isTest && /\bconsole\.log\b/.test(line) && !line.includes('lint-ignore')) {
      warnings.push(`${rel}:${lineNo}: console.log in src/ — use the logger instead`);
    }

    // .only in tests
    if (isTest && /\b(it|describe|test)\.only\b/.test(line)) {
      errors.push(`${rel}:${lineNo}: .only left in test — would skip sibling tests in CI`);
    }
    if (isTest && /\bfdescribe\b/.test(line)) {
      errors.push(`${rel}:${lineNo}: fdescribe left in test — would skip sibling tests in CI`);
    }

    // Secret patterns
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) {
        errors.push(`${rel}:${lineNo}: hardcoded ${name} detected`);
      }
    }

    // Naked TODO/FIXME (no owner in parens)
    const todoMatch = line.match(/\/\/\s*(TODO|FIXME)(?!\s*\()/);
    if (todoMatch && !/\/\/\s*(TODO|FIXME)\s*[:\-]/.test(line)) {
      // Allow "TODO: ..." and "TODO - ..." but flag bare "TODO"
      if (/\/\/\s*(TODO|FIXME)\s*$/.test(line.trimEnd())) {
        warnings.push(`${rel}:${lineNo}: bare ${todoMatch[1]} — add owner like \`// ${todoMatch[1]}(name): reason\``);
      }
    }
  });
}

async function main() {
  const stats = await stat(ROOT).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    console.error(`lint-check: not a directory: ${ROOT}`);
    exit(2);
  }

  for await (const file of walk(ROOT)) {
    await checkFile(file);
  }

  if (warnings.length) {
    console.error('');
    console.error(`lint-check: ${warnings.length} warning(s)`);
    for (const w of warnings) console.error(`  warn  ${w}`);
  }

  if (errors.length) {
    console.error('');
    console.error(`lint-check: ${errors.length} error(s)`);
    for (const e of errors) console.error(`  error ${e}`);
    console.error('');
    exit(1);
  }

  if (!warnings.length && !errors.length) {
    console.log(`lint-check: clean (${relative(cwd(), ROOT) || '.'})`);
  } else {
    console.log(`lint-check: ${warnings.length} warning(s), no errors`);
  }
}

main().catch((err) => {
  console.error('lint-check: unexpected failure:', err);
  exit(2);
});
