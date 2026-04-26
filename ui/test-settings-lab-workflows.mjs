// NGW Settings + Lab — browser smoke test (5 + 5 workflows)
//
//   Settings (5)
//     S1  Navigate Home → Settings (cog in AppHeader)
//     S2  Cycle Units (Imperial ↔ Metric) — verify localStorage updated
//     S3  Toggle Analysis auto-save — verify localStorage updated
//     S4  Open Preferences sub-screen
//     S5  Open Account sub-screen
//
//   Lab (5)
//     L1  Lab loads with dev user + enable_lab — no auth gate, header says LAB / Online
//     L2  Switch nav to Workbench
//     L3  Switch nav to Logs
//     L4  Switch nav to Training
//     L5  Switch nav to Intel
//
// Usage:
//   /usr/local/bin/node ui/test-settings-lab-workflows.mjs
//
// Notes:
//   • Uses ?studio=off to bypass the Studio Matte default and render legacy shell.
//   • Uses ?devmode=1 to set _devModeUser (dev@localhost) and enable_lab feature flag,
//     so Lab renders past the auth gate without a real login.
//   • Vite dev only — ?devmode=1 is gated by import.meta.env.DEV.

import { chromium } from 'playwright';

const SETTINGS_URL = process.env.SETTINGS_URL || 'http://localhost:5173/static/ui/?studio=off';
const LAB_URL      = process.env.LAB_URL      || 'http://localhost:5173/static/ui/?studio=off&devmode=1';

const results = [];
function record(id, pass, note) {
  results.push({ id, pass, note });
  const tag = pass ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m';
  console.log(`  ${tag} ${id}: ${note}`);
}

const browser = await chromium.launch();

console.log('============================================================');
console.log('  NGW Settings — 5-Workflow Browser Smoke Test');
console.log(`  ${SETTINGS_URL}`);
console.log('============================================================');

// ── Settings ────────────────────────────────────────────────────────
{
  const ctx  = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [pageerror]', e.message.slice(0, 200)));

  // Land on Home (legacy shell)
  await page.goto(SETTINGS_URL, { waitUntil: 'commit' });
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('ngw_studio_active');
      sessionStorage.removeItem('ngw_goto_day1_demo');
      localStorage.removeItem('ngw_studio_persist');
    } catch {}
  });
  await page.goto(SETTINGS_URL, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="home-root"]', { state: 'attached', timeout: 15_000 });

  // S1 — open Settings via header cog
  try {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForSelector('.stgx', { state: 'attached', timeout: 8_000 });
    record('S1', true, 'Home → Settings (cog) renders .stgx');
  } catch (e) {
    record('S1', false, `Settings did not render: ${e.message}`);
    await page.close(); await ctx.close();
    throw e;
  }

  // S2 — cycle Units (Imperial ↔ Metric)
  try {
    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('ngw_settings');
      return raw ? JSON.parse(raw).units : null;
    });
    await page.getByTestId('settings-units').click();
    await page.waitForFunction(prev => {
      const raw = localStorage.getItem('ngw_settings');
      const cur = raw ? JSON.parse(raw).units : null;
      return cur && cur !== prev;
    }, before, { timeout: 5_000 });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('ngw_settings')).units);
    record('S2', true, `Units toggled (${before ?? 'unset'} → ${after})`);
  } catch (e) {
    record('S2', false, `Units toggle failed: ${e.message.slice(0, 120)}`);
  }

  // S3 — toggle Analysis auto-save
  try {
    const before = await page.evaluate(() => {
      const raw = localStorage.getItem('ngw_settings');
      return raw ? JSON.parse(raw).sessionStorage : null;
    });
    await page.getByTestId('settings-auto-save').locator('.stgx-toggle').click();
    await page.waitForFunction(prev => {
      const raw = localStorage.getItem('ngw_settings');
      const cur = raw ? JSON.parse(raw).sessionStorage : null;
      return cur !== prev;
    }, before, { timeout: 5_000 });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('ngw_settings')).sessionStorage);
    record('S3', true, `Analysis auto-save toggled (${before ?? 'unset'} → ${after})`);
  } catch (e) {
    record('S3', false, `Auto-save toggle failed: ${e.message.slice(0, 120)}`);
  }

  // S4 — open Preferences sub-screen
  try {
    await page.getByTestId('settings-preferences').click();
    await page.waitForSelector('.stgx-role-chip', { state: 'attached', timeout: 5_000 });
    record('S4', true, 'Preferences sub-screen rendered (.stgx-role-chip present)');
    await page.getByTestId('settings-back').click();
    await page.waitForSelector('[data-testid="settings-account-card"]', { state: 'attached', timeout: 5_000 });
  } catch (e) {
    record('S4', false, `Preferences sub-screen failed: ${e.message.slice(0, 120)}`);
  }

  // S5 — open Account sub-screen (click the user card)
  try {
    await page.getByTestId('settings-account-card').click();
    // Account view shows InfoRow "Email" and SectionHdr "ACCOUNT".
    await page.waitForFunction(() => {
      const headers = Array.from(document.querySelectorAll('.stgx-section-hdr'));
      return headers.some(h => /account/i.test(h.textContent || ''));
    }, { timeout: 5_000 });
    record('S5', true, 'Account sub-screen rendered (ACCOUNT section visible)');
  } catch (e) {
    record('S5', false, `Account sub-screen failed: ${e.message.slice(0, 120)}`);
  }

  await page.close();
  await ctx.close();
}

console.log('\n============================================================');
console.log('  NGW Lab — 5-Workflow Browser Smoke Test');
console.log(`  ${LAB_URL}`);
console.log('============================================================');

// ── Lab ─────────────────────────────────────────────────────────────
{
  const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [pageerror]', e.message.slice(0, 200)));

  // Load with devmode=1 → dev user + enable_lab. Then the header lab button appears.
  await page.goto(LAB_URL, { waitUntil: 'commit' });
  await page.evaluate(() => {
    try {
      sessionStorage.removeItem('ngw_studio_active');
      sessionStorage.removeItem('ngw_goto_day1_demo');
    } catch {}
  });
  await page.goto(LAB_URL, { waitUntil: 'commit' });
  await page.waitForSelector('[data-testid="home-root"]', { state: 'attached', timeout: 15_000 });

  // L1 — open Lab and verify it renders past the auth gate
  try {
    await page.getByRole('button', { name: 'NGW Lab' }).click();
    await page.waitForSelector('.lab-screen', { state: 'attached', timeout: 8_000 });
    // Auth gate would show .lab-auth-gate; logged in shows .lab-nav
    const hasGate = await page.locator('.lab-auth-gate').count();
    const hasNav  = await page.locator('.lab-nav').count();
    if (hasGate > 0) {
      record('L1', false, 'Auth gate shown — devmode user did not authenticate Lab');
    } else if (hasNav > 0) {
      const title = await page.locator('.lab-header__title').first().innerText().catch(() => '');
      record('L1', true, `Lab loaded (header "${title}", nav tabs visible)`);
    } else {
      record('L1', false, 'Lab screen rendered but neither auth-gate nor nav tabs found');
    }
  } catch (e) {
    record('L1', false, `Lab open failed: ${e.message.slice(0, 120)}`);
    await page.close(); await ctx.close();
    await browser.close();
    summarize();
    process.exit(1);
  }

  // Helper — click a Lab nav tab by section id, verify it becomes the active tab.
  async function clickLabTab(id, sectionId) {
    try {
      const tab = page.getByTestId(`lab-nav-${sectionId}`);
      await tab.click();
      await page.waitForFunction(sid => {
        const t = document.querySelector(`[data-testid="lab-nav-${sid}"]`);
        return t && t.classList.contains('lab-nav__tab--active');
      }, sectionId, { timeout: 5_000 });
      record(id, true, `nav switched to "${sectionId}"`);
    } catch (e) {
      record(id, false, `nav to "${sectionId}" failed: ${e.message.slice(0, 120)}`);
    }
  }

  await clickLabTab('L2', 'workbench');
  await clickLabTab('L3', 'logs');
  await clickLabTab('L4', 'training');
  await clickLabTab('L5', 'intelligence');

  await page.close();
  await ctx.close();
}

await browser.close();

function summarize() {
  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  console.log('\n============================================================');
  console.log(`  Results: ${passed} passed, ${failed} failed (out of ${results.length})`);
  console.log('============================================================');
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}: ${r.id} — ${r.note}`);
  }
  return failed;
}

const failed = summarize();
process.exit(failed > 0 ? 1 : 0);
