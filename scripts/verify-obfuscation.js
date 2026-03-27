#!/usr/bin/env node
/**
 * scripts/verify-obfuscation.js
 *
 * Verifies that the production build has been adequately obfuscated:
 *  1. No raw HMAC secret appears in bundle assets
 *  2. Console statements have been stripped
 *  3. Source maps are not included in production build
 *  4. Bundle is minified (high token density)
 *
 * Usage:
 *   node scripts/verify-obfuscation.js [dist-dir]
 *
 * Exit codes:
 *   0 — All checks passed
 *   1 — One or more checks failed
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const distDir = process.argv[2] ?? join(REPO_ROOT, 'dist');

let failed = 0;

function ok(msg)   { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.log(`  ❌  ${msg}`); failed++; }
function info(msg) { console.log(`  ℹ️   ${msg}`); }
function header(msg) { console.log(`\n=== ${msg} ===`); }

/** Collect all JS files recursively under dir */
function collectJsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...collectJsFiles(fullPath));
    } else if (extname(entry) === '.js') {
      results.push(fullPath);
    }
  }
  return results;
}

console.log('\nAsteroids Demoscene — Obfuscation Verification');
console.log(`Dist dir: ${distDir}`);

let jsFiles;
try {
  jsFiles = collectJsFiles(distDir);
} catch {
  console.error(`\n❌ Could not read dist directory: ${distDir}`);
  console.error('Run "npm run build" first.');
  process.exit(1);
}

info(`Found ${jsFiles.length} JS bundle file(s)`);

// ──────────────────────────────────────────────
// 1. No HMAC secret in bundle
// ──────────────────────────────────────────────
header('1. HMAC Secret Not in Bundle');

// Load the real secret from .env if available (for a definitive check)
let hmacSecret = null;
try {
  const envContent = readFileSync(join(REPO_ROOT, '.env'), 'utf8');
  const match = envContent.match(/^VITE_SCORE_HMAC_SECRET\s*=\s*(\S+)/m);
  if (match) {
    hmacSecret = match[1];
    info(`Loaded HMAC secret from .env (${hmacSecret.length} chars)`);
  }
} catch {
  info('No .env found — skipping definitive HMAC check');
}

let hmacFound = false;
for (const file of jsFiles) {
  const content = readFileSync(file, 'utf8');
  if (hmacSecret && content.includes(hmacSecret)) {
    fail(`Raw HMAC secret found in: ${file}`);
    hmacFound = true;
    break;
  }
  // Also scan for suspicious 64-char hex strings (likely raw HMAC secrets)
  const hexMatches = content.match(/["'][0-9a-f]{56,72}["']/g) ?? [];
  if (hexMatches.length > 0) {
    fail(`Suspicious 64-char hex string(s) found in ${file}: ${hexMatches[0].substring(0, 20)}…`);
    hmacFound = true;
    break;
  }
}
if (!hmacFound) {
  ok('No raw HMAC secret detected in bundle');
}

// ──────────────────────────────────────────────
// 2. Console statements stripped
// ──────────────────────────────────────────────
header('2. Console Statements Stripped');
let consoleFound = false;
for (const file of jsFiles) {
  const content = readFileSync(file, 'utf8');
  // Allow console.error and console.warn for critical logging, but not .log/.debug
  const matches = content.match(/console\.(log|debug|info)\s*\(/g) ?? [];
  if (matches.length > 0) {
    fail(`console.log/debug/info found in ${file} (${matches.length} occurrence(s))`);
    consoleFound = true;
  }
}
if (!consoleFound) {
  ok('No console.log/debug/info statements in bundle');
}

// ──────────────────────────────────────────────
// 3. No source maps in dist
// ──────────────────────────────────────────────
header('3. No Source Maps in Production Build');
let mapFound = false;
function checkMaps(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      checkMaps(fullPath);
    } else if (entry.endsWith('.map')) {
      fail(`Source map found in dist: ${fullPath}`);
      mapFound = true;
    }
  }
}
checkMaps(distDir);
if (!mapFound) {
  ok('No source maps found in production build');
}

// ──────────────────────────────────────────────
// 4. Minification check (low whitespace ratio)
// ──────────────────────────────────────────────
header('4. Bundle Minification Check');
for (const file of jsFiles) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const avgLineLen = content.length / Math.max(lines.length, 1);
  if (avgLineLen < 200 && content.length > 10_000) {
    fail(`${file} does not appear minified (avg line length: ${avgLineLen.toFixed(0)} chars)`);
  } else {
    ok(`${file} appears minified (avg line: ${avgLineLen.toFixed(0)} chars, size: ${(content.length / 1024).toFixed(1)} KB)`);
  }
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
if (failed === 0) {
  console.log('✅ All obfuscation checks passed.');
  process.exit(0);
} else {
  console.log(`❌ ${failed} check(s) failed. Review the output above.`);
  process.exit(1);
}
