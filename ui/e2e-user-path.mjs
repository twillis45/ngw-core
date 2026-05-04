/**
 * e2e-user-path.mjs — Core user-path verifier for NGW.
 *
 * Purpose:
 *   Smoke-tests the full local user path before release. Not production UI code.
 *   Verifies: home screen → Try Sample → ResultsScreenV2 (Rembrandt) →
 *             Lighting Study artifact → Dispatch templates (Story, Blueprint, Carousel).
 *
 * Prerequisites:
 *   - Local backend running and healthy (http://localhost:8000/health → 200)
 *   - Vite dev server running (http://localhost:5173)
 *   - playwright installed (npm i -D playwright in ui/)
 *
 * Run:
 *   /usr/local/bin/node e2e-user-path.mjs
 *
 * Output:
 *   Screenshots saved to ../review-artifacts/YYYY-MM-DD-e2e-user-path/
 *   Console summary printed to stdout.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TODAY     = new Date().toISOString().slice(0, 10);
const OUT_DIR   = path.resolve(__dirname, `../review-artifacts/${TODAY}-e2e-user-path`);
const BASE_URL  = 'http://localhost:5173';
const VIEWPORT  = { width: 390, height: 844 };

const consoleMessages = [];

async function shot(page, name) {
  const p = path.join(OUT_DIR, name);
  await page.screenshot({ path: p });
  console.log(`  ✓ ${name}`);
}

async function run() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });

  // Bypass onboarding + teach overlay before page loads
  await context.addInitScript(() => {
    try {
      localStorage.setItem('ngw_onboarding_done', '1');
      localStorage.setItem('ngw_onboarding_skipped', '1');
      localStorage.setItem('ngw_home_teach_seen', '1');
      localStorage.setItem('ngw_result_teach_seen', '1');
    } catch { /* ignore */ }
  });

  const page = await context.newPage();

  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text });
    if (type === 'error') console.log(`  [console.error] ${text.slice(0, 160)}`);
  });
  page.on('pageerror', err => {
    consoleMessages.push({ type: 'pageerror', text: err.message });
    console.log(`  [pageerror] ${err.message.slice(0, 160)}`);
  });

  // ── 1. HOME SCREEN ────────────────────────────────────────────────────────
  console.log('\n── 1. Home Screen ──');
  await page.goto(`${BASE_URL}/?devmode=1`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot(page, '01_home.png');

  const homeText = await page.evaluate(() => document.body.innerText);
  const hasSample = /try a sample/i.test(homeText);
  console.log(`  "Try a sample" in DOM: ${hasSample ? 'YES' : 'NO'}`);

  // ── 2. TRY SAMPLE ─────────────────────────────────────────────────────────
  console.log('\n── 2. Try Sample ──');

  // Use force:true to bypass the overlay intercept
  const sampleLocator = page.getByText(/try a sample/i).first();
  const sampleCount = await sampleLocator.count();
  if (sampleCount > 0) {
    console.log('  Clicking "Try a sample" (force) ...');
    await sampleLocator.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(1000);
    await shot(page, '02_processing.png');
  } else {
    console.log('  "Try a sample" button NOT FOUND');
    await shot(page, '02_no_button.png');
  }

  // ── 2b. CLICK READ LIGHT ──────────────────────────────────────────────────
  console.log('\n── 2b. Click READ LIGHT ──');
  // After sample loads, READ LIGHT button submits for analysis
  await page.waitForTimeout(600);
  const readLightBtn = page.getByText(/read light/i).first();
  const readLightCount = await readLightBtn.count();
  console.log(`  READ LIGHT button found: ${readLightCount > 0 ? 'YES' : 'NO'}`);
  if (readLightCount > 0) {
    await readLightBtn.click({ force: true, timeout: 5000 });
    await page.waitForTimeout(800);
    await shot(page, '02b_after_read_light.png');
  }

  // ── 3. WAIT FOR RESULTS ───────────────────────────────────────────────────
  console.log('\n── 3. Waiting for results (45s max) ... ──');
  let resultFound = false;
  try {
    await page.waitForFunction(() => {
      const t = document.body.innerText;
      return t.includes('Rembrandt') || t.includes('Loop') || t.includes('Butterfly') ||
             t.includes('confidence') || t.includes('SETUP') || t.includes('Export') ||
             t.includes('went wrong') || t.includes('Error');
    }, { timeout: 45000 });
    resultFound = true;
  } catch {
    console.log('  WARNING: timed out waiting for result — capturing state');
  }

  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shot(page, '03_results_top.png');

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  await shot(page, '03b_results_mid.png');

  const resultText = await page.evaluate(() => document.body.innerText);
  console.log(`  Result found:       ${resultFound ? 'YES' : 'NO'}`);
  console.log(`  Rembrandt present:  ${resultText.includes('Rembrandt') ? 'YES' : 'NO'}`);
  console.log(`  Confidence present: ${/\d+%/.test(resultText) || resultText.includes('confidence') ? 'YES' : 'NO'}`);
  console.log(`  Export visible:     ${resultText.includes('Export') ? 'YES' : 'NO'}`);
  console.log(`  Error state:        ${resultText.includes('went wrong') ? 'YES — BLOCKER' : 'NO'}`);

  // ── 4. SCROLL TO DISPATCH PANEL ───────────────────────────────────────────
  console.log('\n── 4. Dispatch Panel ──');
  let dispatchScrollY = 0;
  for (const y of [800, 1400, 2000, 2800, 3500]) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y);
    await page.waitForTimeout(200);
    const t = await page.evaluate(() => document.body.innerText);
    if (t.includes('Export') || t.includes('Signal Card') || t.includes('Blueprint')) {
      dispatchScrollY = y;
      console.log(`  Dispatch found at scroll Y=${y}`);
      break;
    }
  }
  await page.waitForTimeout(400);
  await shot(page, '04_dispatch_study.png');
  const dispatchText = await page.evaluate(() => document.body.innerText);
  console.log(`  Export panel visible: ${dispatchText.includes('Export') ? 'YES' : 'NO'}`);

  // ── 5. DISPATCH STATE CYCLING ─────────────────────────────────────────────
  console.log('\n── 5. Dispatch State Cycling ──');

  async function tryClickState(labelRe, filename, stateName) {
    // Find any clickable element matching label
    for (const loc of [
      page.getByRole('button', { name: labelRe }),
      page.getByText(labelRe),
    ]) {
      const n = await loc.count();
      if (n > 0) {
        try {
          await loc.first().click({ force: true, timeout: 3000 });
          await page.waitForTimeout(900);
          await page.evaluate((y) => window.scrollTo(0, y), dispatchScrollY || 1500);
          await page.waitForTimeout(300);
          await shot(page, filename);
          console.log(`  ${stateName}: ✓`);
          return true;
        } catch { /* try next */ }
      }
    }
    console.log(`  ${stateName}: button not found`);
    return false;
  }

  await tryClickState(/tall/i,           '05_dispatch_story.png',     'TALL');
  await tryClickState(/build/i,          '06_dispatch_blueprint.png', 'BUILD');
  await tryClickState(/light.by.light/i, '07_dispatch_carousel.png',  'LIGHT-BY-LIGHT');

  // Full page final
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT_DIR, '08_fullpage.png'), fullPage: true });
  console.log('  ✓ 08_fullpage.png');

  await browser.close();

  // ── CONSOLE SUMMARY ───────────────────────────────────────────────────────
  console.log('\n── Console Summary ──');
  const errors   = consoleMessages.filter(m => m.type === 'error' || m.type === 'pageerror');
  const warnings = consoleMessages.filter(m => m.type === 'warning' || m.type === 'warn');
  const knownBrowserErrors = errors.filter(e =>
    e.text.includes('navigator.vibrate') || e.text.includes('AudioContext')
  );
  const realErrors = errors.filter(e =>
    !e.text.includes('navigator.vibrate') && !e.text.includes('AudioContext')
  );
  console.log(`  Total errors:    ${errors.length} (${knownBrowserErrors.length} known browser API, ${realErrors.length} real)`);
  console.log(`  Total warnings:  ${warnings.length}`);
  realErrors.slice(0, 5).forEach(e => console.log(`  REAL ERROR: ${e.text.slice(0, 160)}`));
  warnings.filter(w => !w.text.includes('AudioContext')).slice(0, 5)
    .forEach(w => console.log(`  WARN: ${w.text.slice(0, 160)}`));

  console.log(`\n── Done → ${OUT_DIR}\n`);
}

run().catch(err => {
  console.error('[e2e] FATAL:', err.message);
  process.exit(1);
});
