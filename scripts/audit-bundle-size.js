#!/usr/bin/env node
/**
 * scripts/audit-bundle-size.js
 *
 * Audits the production bundle to ensure obfuscation hasn't caused
 * unacceptable bundle size bloat. Compares against a configurable baseline.
 *
 * Usage:
 *   node scripts/audit-bundle-size.js [--baseline <bytes>] [--max-increase <pct>] [dist-dir]
 *
 * Exit codes:
 *   0 — Bundle size is within acceptable limits
 *   1 — Bundle size exceeds threshold
 *   2 — Could not read dist directory
 */

import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
let baseline = null;     // bytes — if null, only report size (no comparison)
let maxIncreasePct = 5;  // default: fail if bundle grew > 5%
let distDir = join(REPO_ROOT, 'dist');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--baseline') { baseline = Number(args[++i]); }
  else if (args[i] === '--max-increase') { maxIncreasePct = Number(args[++i]); }
  else { distDir = args[i]; }
}

function collectFiles(dir, results = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        collectFiles(fullPath, results);
      } else {
        results.push({ path: fullPath, size: stat.size, ext: extname(entry) });
      }
    }
  } catch (err) {
    console.error(`❌ Cannot read ${dir}: ${err.message}`);
    process.exit(2);
  }
  return results;
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

console.log('\nAsteroids Demoscene — Bundle Size Audit');
console.log(`Dist dir: ${distDir}\n`);

const files = collectFiles(distDir);
if (files.length === 0) {
  console.error('❌ No files found — run "npm run build" first.');
  process.exit(2);
}

// Group by extension
const byExt = {};
let totalSize = 0;
for (const f of files) {
  if (!byExt[f.ext]) byExt[f.ext] = { count: 0, size: 0 };
  byExt[f.ext].count++;
  byExt[f.ext].size += f.size;
  totalSize += f.size;
}

// JS-only total (most relevant for obfuscation bloat)
const jsTotal = byExt['.js']?.size ?? 0;
const cssTotal = byExt['.css']?.size ?? 0;

console.log('File breakdown by type:');
for (const [ext, stats] of Object.entries(byExt).sort((a, b) => b[1].size - a[1].size)) {
  console.log(`  ${ext || '(no ext)'.padEnd(6)}  ${String(stats.count).padStart(4)} file(s)  ${fmt(stats.size)}`);
}
console.log(`\n  Total dist size : ${fmt(totalSize)}`);
console.log(`  JS bundle size  : ${fmt(jsTotal)}`);
console.log(`  CSS bundle size : ${fmt(cssTotal)}`);

// Largest individual JS files
const jsFiles = files.filter(f => f.ext === '.js').sort((a, b) => b.size - a.size);
if (jsFiles.length > 0) {
  console.log('\nLargest JS files:');
  for (const f of jsFiles.slice(0, 5)) {
    const rel = f.path.replace(distDir, '');
    console.log(`  ${fmt(f.size).padStart(10)}  ${rel}`);
  }
}

// Comparison against baseline
let failed = false;
if (baseline !== null) {
  const increase = ((jsTotal - baseline) / baseline) * 100;
  console.log(`\nBaseline JS size : ${fmt(baseline)}`);
  console.log(`Current JS size  : ${fmt(jsTotal)}`);
  console.log(`Difference       : ${increase >= 0 ? '+' : ''}${increase.toFixed(1)}%`);
  if (increase > maxIncreasePct) {
    console.log(`\n❌ Bundle increased by ${increase.toFixed(1)}% > allowed ${maxIncreasePct}%`);
    failed = true;
  } else {
    console.log(`\n✅ Bundle size within acceptable limit (≤ ${maxIncreasePct}% increase)`);
  }
} else {
  console.log('\nℹ️  No --baseline provided. Reporting only — no size threshold enforced.');
  console.log('   Re-run with --baseline <bytes> after establishing a reference build.');
}

process.exit(failed ? 1 : 0);
