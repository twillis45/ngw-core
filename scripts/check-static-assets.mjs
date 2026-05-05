/**
 * check-static-assets.mjs
 *
 * Guards against mismatched frontend bundles reaching production.
 *
 * Validates:
 *   1. static/ui/index.html exists.
 *   2. Every asset referenced by index.html exists on disk.
 *   3. Every cross-chunk reference inside generated JS files resolves to a
 *      file that also exists on disk.
 *
 * Exit 0 = consistent. Exit 1 = missing files (lists them).
 *
 * Incident context: 2026-05-05 prod blank screen was caused by index-5d49a9f9.js
 * referencing jspdf.es.min-549e115f.js which was never committed to git.
 * That 404 broke the JS module graph at startup — #root stayed empty.
 *
 * Run: node scripts/check-static-assets.mjs
 *   or: npm run check:static-assets  (from repo root)
 *   or: npm run check:static-assets  (from ui/)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const UI_DIR    = join(ROOT, 'static', 'ui');
const ASSETS    = join(UI_DIR, 'assets');
const HTML_PATH = join(UI_DIR, 'index.html');

const missing = [];

// ── 1. index.html must exist ──────────────────────────────────────────────────
if (!existsSync(HTML_PATH)) {
  console.error('✗ static/ui/index.html not found — run: cd ui && npm run build');
  process.exit(1);
}

const html = readFileSync(HTML_PATH, 'utf8');

// ── 2. Assets referenced by index.html ───────────────────────────────────────
// Matches both script src and link href pointing into /static/ui/assets/
const HTML_ASSET_RE = /\/static\/ui\/assets\/([\w.\-]+)/g;
const htmlRefs = [...html.matchAll(HTML_ASSET_RE)].map(m => m[1]);

if (htmlRefs.length === 0) {
  console.error('✗ index.html contains no /static/ui/assets/ references — file may be corrupt');
  process.exit(1);
}

console.log(`\nChecking static/ui/index.html → ${htmlRefs.length} asset reference(s):`);
const resolvedChunks = [];

for (const ref of htmlRefs) {
  const fullPath = join(ASSETS, ref);
  if (!existsSync(fullPath)) {
    missing.push(`index.html → ${ref}`);
    console.error(`  ✗ MISSING  ${ref}`);
  } else {
    resolvedChunks.push(ref);
    console.log(`  ✓ ok       ${ref}`);
  }
}

// ── 3. Cross-chunk references inside generated JS ────────────────────────────
// Generated chunk filenames follow the pattern: name-<8hexchars>.js
// Vite writes dynamic imports as: "./name-<hash>.js"
const CHUNK_REF_RE = /"\.\/([^"]+\.(?:js|css))"/g;

const jsChunks = resolvedChunks.filter(f => f.endsWith('.js'));

if (jsChunks.length > 0) {
  console.log(`\nChecking cross-chunk references in ${jsChunks.length} JS file(s):`);
}

for (const chunk of jsChunks) {
  const chunkPath = join(ASSETS, chunk);
  const src = readFileSync(chunkPath, 'utf8');
  const refs = [...new Set([...src.matchAll(CHUNK_REF_RE)].map(m => m[1]))];

  for (const ref of refs) {
    const fullPath = join(ASSETS, ref);
    if (!existsSync(fullPath)) {
      missing.push(`${chunk} → ${ref}`);
      console.error(`  ✗ MISSING  ${chunk} references ${ref}`);
    } else {
      console.log(`  ✓ ok       ${chunk} → ${ref}`);
    }
  }
}

// ── Result ───────────────────────────────────────────────────────────────────
if (missing.length > 0) {
  console.error(`\n✗ Static UI assets are NOT consistent — ${missing.length} missing file(s):`);
  missing.forEach(m => console.error(`    • ${m}`));
  console.error('\nFix: cd ui && npm run build — then git add ALL changed files in static/ui/ together.');
  process.exit(1);
}

console.log('\n✓ Static UI assets are consistent — all references resolve.\n');
