// NGW Home — 7-workflow browser smoke test
//
// Drives the actual Home UI in Chromium and exercises each entry point:
//   W1  Analyze a Photo (file picker)             → ref_eval
//   W2  Drag-and-drop image                       → ref_eval
//   W3  Paste image from clipboard                → ref_eval
//   W4  Browse Proven Setups                      → recipes
//   W5  Continue last setup / Resume last         → saved_setups
//   W6  Build a Setup (home secondary button)     → wizard
//   W7  Build (BottomNav tab)                     → wizard
//
// Usage:
//   node ui/test-home-workflows.mjs                          # default http://localhost:5173/static/ui/
//   BASE_URL=http://localhost:5173/static/ui/ node ui/test-home-workflows.mjs
//
// Exit code: 0 = all passed, 1 = one or more failed

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
// Studio Matte shell is the default and gates Home behind sign-in (see ui/src/main.jsx).
// Use ?studio=off to render the legacy shell (HomeScreenV2) for the 5-workflow smoke.
const BASE_URL  = process.env.BASE_URL || 'http://localhost:5173/static/ui/?studio=off';
const FIXTURE   = resolve(REPO_ROOT, 'static/loop_standard.jpg');

const fixtureBytes = readFileSync(FIXTURE);
const fixtureB64   = fixtureBytes.toString('base64');

const results = [];
function record(id, pass, note) {
  results.push({ id, pass, note });
  const tag = pass ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m';
  console.log(`  ${tag} ${id}: ${note}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

ctx.on('weberror', e => console.error('[weberror]', e.error()));

const errors = [];
async function loadHome(page, opts = {}) {
  // First navigation establishes the origin; clear any persisted studio flags.
  await page.goto(BASE_URL, { waitUntil: 'commit' });
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('ngw_studio_active');
      sessionStorage.removeItem('ngw_goto_day1_demo');
      sessionStorage.removeItem('ngw_studio_cockpit');
      localStorage.removeItem('ngw_studio_persist');
    } catch {}
  });
  if (opts.seedSetups) {
    await page.evaluate(seed => {
      try { localStorage.setItem('ngw_saved_setups', JSON.stringify(seed)); } catch {}
    }, opts.seedSetups);
  }
  await page.goto(BASE_URL, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="home-root"]', { state: 'attached', timeout: 15_000 });
}

async function expectScreen(page, selector, label) {
  try {
    await page.waitForSelector(selector, { timeout: 8_000 });
    return true;
  } catch (e) {
    const html = await page.evaluate(() => document.body.innerHTML.slice(0, 600));
    console.error(`    expected ${label} (${selector}) — current body head:\n    ${html}`);
    return false;
  }
}

console.log('============================================================');
console.log('  NGW Home — 7-Workflow Browser Smoke Test');
console.log(`  ${BASE_URL}`);
console.log('============================================================');

// ── W1: Analyze a Photo (file picker) ────────────────────────────────
{
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`W1 ${e.message}`));
  await loadHome(page);
  const input = page.getByTestId('home-file-input');
  await input.setInputFiles(FIXTURE);
  const ok = await expectScreen(page, '.ref-eval-screen', 'ref-eval-screen');
  record('W1', ok, ok ? 'file picker → ref_eval' : 'did not navigate to ref_eval');
  await page.close();
}

// ── W2: Drag-and-drop ────────────────────────────────────────────────
{
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`W2 ${e.message}`));
  await loadHome(page);

  // Build a real File in the page from base64, then dispatch drag events on .home-v2.
  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'loop_standard.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer();
    dt.items.add(file);

    const target = document.querySelector('[data-testid="home-root"]');
    const fire = (type) => target.dispatchEvent(new DragEvent(type, {
      bubbles: true, cancelable: true, dataTransfer: dt,
    }));
    fire('dragenter');
    fire('dragover');
    fire('drop');
  }, fixtureB64);

  const ok = await expectScreen(page, '.ref-eval-screen', 'ref-eval-screen');
  record('W2', ok, ok ? 'drag-drop → ref_eval' : 'did not navigate to ref_eval');
  await page.close();
}

// ── W3: Paste from clipboard ─────────────────────────────────────────
{
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`W3 ${e.message}`));
  await loadHome(page);

  await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const file = new File([arr], 'loop_standard.jpg', { type: 'image/jpeg' });
    const dt = new DataTransfer();
    dt.items.add(file);
    window.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: dt,
    }));
  }, fixtureB64);

  const ok = await expectScreen(page, '.ref-eval-screen', 'ref-eval-screen');
  record('W3', ok, ok ? 'paste → ref_eval' : 'did not navigate to ref_eval');
  await page.close();
}

// ── W4: Browse Proven Setups ─────────────────────────────────────────
{
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`W4 ${e.message}`));
  await loadHome(page);
  await page.getByTestId('home-browse-recipes').first().click();
  const ok = await expectScreen(page, '.recipe-screen', 'recipe-screen');
  record('W4', ok, ok ? 'Browse Proven Setups → recipes' : 'did not navigate to recipes');
  await page.close();
}

// ── W5: Continue last setup ──────────────────────────────────────────
{
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`W5 ${e.message}`));

  const fakeSetup = [{
    id: 'smoke-1',
    name: 'Smoke Test Setup',
    subject: 'Female · Studio',
    createdAt: Date.now() - 60_000,
    result: { bestMatch: { name: 'Loop', lightingPattern: 'Loop', confidence: 0.85 } },
  }];
  await loadHome(page, { seedSetups: fakeSetup });

  // Both Free ("Continue your last setup") and Paid ("Resume last analysis") variants
  // share data-testid="home-continue".
  const continueBtn = page.getByTestId('home-continue').first();
  const visible = await continueBtn.isVisible().catch(() => false);
  if (!visible) {
    record('W5', false, '"Continue last setup" affordance did not render after seeding ngw_saved_setups');
  } else {
    await continueBtn.click();
    const ok = await expectScreen(page, '.ss-screen, .results-screen, [class*="results"]', 'saved_setups or results');
    record('W5', ok, ok ? 'Continue → saved_setups/results' : 'did not navigate');
  }
  await page.close();
}

// ── W6: Build a Setup (home secondary button) ────────────────────────
{
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`W6 ${e.message}`));
  await loadHome(page);
  const btn = page.getByTestId('home-build-setup').first();
  const visible = await btn.isVisible().catch(() => false);
  if (!visible) {
    record('W6', false, '"Build a Setup" secondary button did not render on home');
  } else {
    await btn.click();
    const ok = await expectScreen(page, '.screen-heading', 'wizard screen-heading');
    if (ok) {
      const heading = await page.$eval('.screen-heading', el => el.textContent.trim()).catch(() => '');
      const isWizard = heading.toLowerCase().includes('build') || heading.toLowerCase().includes('scratch');
      record('W6', isWizard, isWizard ? `Build a Setup → wizard ("${heading}")` : `screen-heading found but unexpected: "${heading}"`);
    } else {
      record('W6', false, 'did not navigate to wizard');
    }
  }
  await page.close();
}

// ── W7: Build tab in BottomNav ───────────────────────────────────────
{
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`W7 ${e.message}`));
  await loadHome(page);
  // BottomNav "Build" tab — matches by label text since no testid on nav items
  const buildTab = page.locator('.bottom-nav__item').filter({ hasText: 'Build' }).first();
  const visible = await buildTab.isVisible().catch(() => false);
  if (!visible) {
    record('W7', false, '"Build" BottomNav tab did not render on home');
  } else {
    await buildTab.click();
    const ok = await expectScreen(page, '.screen-heading', 'wizard screen-heading');
    if (ok) {
      const heading = await page.$eval('.screen-heading', el => el.textContent.trim()).catch(() => '');
      const isWizard = heading.toLowerCase().includes('build') || heading.toLowerCase().includes('scratch');
      record('W7', isWizard, isWizard ? `BottomNav Build → wizard ("${heading}")` : `unexpected heading: "${heading}"`);
    } else {
      record('W7', false, 'did not navigate to wizard');
    }
  }
  await page.close();
}

await browser.close();

// ── Summary ──────────────────────────────────────────────────────────
const passed = results.filter(r => r.pass).length;
const failed = results.length - passed;
console.log('\n============================================================');
console.log(`  Results: ${passed} passed, ${failed} failed (out of ${results.length})`);
console.log('============================================================');
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}: ${r.id} — ${r.note}`);
}
if (errors.length) {
  console.log('\n  Page errors observed:');
  for (const e of errors.slice(0, 10)) console.log('   ', e);
}

process.exit(failed > 0 ? 1 : 0);
