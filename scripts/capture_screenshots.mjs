#!/usr/bin/env node
/**
 * Capture screenshots for NGW docs using Puppeteer.
 * Requires the dev server running on port 8000.
 *
 * Usage: npx puppeteer node scripts/capture_screenshots.mjs
 */

import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.resolve(__dirname, '../docs/images');
const BASE = 'http://localhost:8000/ui/';

const THEMES = ['dark', 'light', 'photoshop', 'lightroom', 'daynote'];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem('ngw_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await sleep(300);
}

async function shot(page, name) {
  const fp = path.join(IMG_DIR, `${name}.png`);
  await page.screenshot({ path: fp, type: 'png' });
  console.log(`  -> ${name}.png`);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();

  // ── 1. Welcome screen in each theme ──────────────────────
  console.log('Capturing welcome screen themes...');
  for (const theme of THEMES) {
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await setTheme(page, theme);
    await sleep(500);
    await shot(page, `welcome-${theme}`);
  }

  // ── 2. Wizard (Build From Scratch) ───────────────────────
  console.log('Capturing wizard screens...');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await setTheme(page, 'dark');
  await sleep(300);

  // Click first mode card ("Build From Scratch")
  const modeCards = await page.$$('.mode-card');
  if (modeCards.length > 0) {
    await modeCards[0].click();
    await sleep(600);
    await shot(page, 'wizard-master-mode');

    // Select first master mode option and advance
    const modeOptions = await page.$$('.master-mode-card');
    if (modeOptions.length > 0) {
      await modeOptions[0].click();
      await sleep(300);
    }
    // Click Next
    const nextBtn = await page.$('.wizard__nav-next, .btn--primary');
    if (nextBtn) {
      await nextBtn.click();
      await sleep(400);
      await shot(page, 'wizard-mood');
    }
  }

  // ── 3. Auth screen ───────────────────────────────────────
  console.log('Capturing auth screen...');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await setTheme(page, 'dark');
  // Navigate to auth
  await page.evaluate(() => {
    const event = new CustomEvent('navigate', { detail: 'auth' });
    window.dispatchEvent(event);
  });
  // Try clicking sign-in link if visible
  const authLink = await page.$('[data-screen="auth"], .header__auth-btn');
  if (authLink) {
    await authLink.click();
    await sleep(500);
  }
  // Fallback: set screen directly via React state
  await page.evaluate(() => {
    // Try to find the React context and navigate
    const root = document.getElementById('root');
    if (root && root._reactRootContainer) {
      // Can't easily access — take screenshot of whatever is shown
    }
  });
  await sleep(300);
  await shot(page, 'auth-screen');

  // ── 4. Lab screen ────────────────────────────────────────
  console.log('Capturing Lab screens...');
  // Enable lab flag and reload
  await page.goto(BASE + '?lab=1', { waitUntil: 'networkidle0' });
  await setTheme(page, 'dark');
  await sleep(300);

  // Navigate to Lab via dispatch — inject into the page
  await page.evaluate(() => {
    // Set the feature flag
    const flags = JSON.parse(localStorage.getItem('ngw_feature_flags') || '{}');
    flags.enable_lab = true;
    localStorage.setItem('ngw_feature_flags', JSON.stringify(flags));
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await setTheme(page, 'dark');
  await sleep(500);

  // Try to find Lab mode card and click it
  // Lab is an admin mode, need user to be signed in — we'll navigate directly
  // by manipulating React state through a hacky approach
  // Instead, just screenshot the welcome screen showing Lab mode card if visible
  await shot(page, 'welcome-with-lab');

  // ── 5. All five themes side by side (montage) ────────────
  // Already captured individual themes above

  await browser.close();
  console.log('\nDone! Screenshots saved to docs/images/');
})();
