#!/usr/bin/env node
/**
 * scripts/test-secret-extraction.js
 *
 * Attempts to extract the HMAC secret from the production bundle to verify
 * that obfuscation is effective. This simulates what a determined attacker
 * would do when trying to forge score signatures.
 *
 * Usage:
 *   node scripts/test-secret-extraction.js [dist-dir]
 *
 * Exit codes:
 *   0 — Secret was NOT extractable (good — obfuscation effective)
 *   1 — Secret WAS extractable (bad — review obfuscation configuration)
 *   2 — Could not run test (build missing, .env missing, etc.)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const distDir = process.argv[2] ?? join(REPO_ROOT, 'dist');

function header(msg) { console.log(`\n=== ${msg} ===`); }

console.log('\nAsteroids Demoscene — HMAC Secret Extraction Test');
console.log('Purpose: verify that the HMAC secret cannot be trivially extracted from the bundle.\n');

// Load expected secret
let hmacSecret;
try {
  const envContent = readFileSync(join(REPO_ROOT, '.env'), 'utf8');
  const match = envContent.match(/^VITE_SCORE_HMAC_SECRET\s*=\s*(\S+)/m);
  if (!match) {
    console.warn('⚠️  VITE_SCORE_HMAC_SECRET not set in .env — cannot perform definitive check.');
    process.exit(2);
  }
  hmacSecret = match[1];
  console.log(`Loaded HMAC secret (length: ${hmacSecret.length} chars)`);
} catch {
  console.error('❌ Could not read .env — run this script with a local .env file.');
  process.exit(2);
}

// Collect JS bundle files
function collectJsFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        results.push(...collectJsFiles(fullPath));
      } else if (extname(entry) === '.js') {
        results.push(fullPath);
      }
    }
  } catch {
    // ignore missing dirs
  }
  return results;
}

const jsFiles = collectJsFiles(distDir);
if (jsFiles.length === 0) {
  console.error(`❌ No JS files found in ${distDir} — run "npm run build" first.`);
  process.exit(2);
}

console.log(`Scanning ${jsFiles.length} bundle file(s) in ${distDir}…`);

// ──────────────────────────────────────────────
// Attack 1: Direct string search
// ──────────────────────────────────────────────
header('Attack 1: Direct String Match');
let directMatch = false;
for (const file of jsFiles) {
  const content = readFileSync(file, 'utf8');
  if (content.includes(hmacSecret)) {
    console.log(`  ❌ VULNERABLE: Full secret found verbatim in ${file}`);
    directMatch = true;
  }
}
if (!directMatch) {
  console.log('  ✅ Secret not present verbatim in any bundle file');
}

// ──────────────────────────────────────────────
// Attack 2: Substring search (partial secret)
// ──────────────────────────────────────────────
header('Attack 2: Partial Secret / Substring Search');
const CHUNK_SIZE = 16;
let partialMatch = false;
for (let i = 0; i <= hmacSecret.length - CHUNK_SIZE; i += CHUNK_SIZE) {
  const chunk = hmacSecret.substring(i, i + CHUNK_SIZE);
  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf8');
    if (content.includes(chunk)) {
      console.log(`  ⚠️  Partial match (offset ${i}): "${chunk}" found in ${file}`);
      partialMatch = true;
    }
  }
}
if (!partialMatch) {
  console.log('  ✅ No 16-char partial secret chunks found in bundle');
}

// ──────────────────────────────────────────────
// Attack 3: Look for env var name adjacent to a value
// ──────────────────────────────────────────────
header('Attack 3: Env-Var Name + Value Pattern');
const envVarPattern = /VITE_SCORE_HMAC_SECRET[^a-zA-Z_].*?["'][0-9a-f]{32,}["']/;
let envPattern = false;
for (const file of jsFiles) {
  const content = readFileSync(file, 'utf8');
  if (envVarPattern.test(content)) {
    console.log(`  ❌ VULNERABLE: Env var name adjacent to hex value in ${file}`);
    envPattern = true;
  }
}
if (!envPattern) {
  console.log('  ✅ Env var name not found adjacent to a hex value');
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────
console.log('\n' + '='.repeat(50));
const extractable = directMatch || envPattern;
if (extractable) {
  console.log('❌ RESULT: Secret IS extractable from bundle — improve obfuscation!');
  process.exit(1);
} else if (partialMatch) {
  console.log('⚠️  RESULT: Partial chunks found but full secret not reconstructible from bundle alone.');
  console.log('   Consider additional string splitting / encoding in vite.config.ts.');
  process.exit(0);
} else {
  console.log('✅ RESULT: HMAC secret is NOT directly extractable from the production bundle.');
  process.exit(0);
}
