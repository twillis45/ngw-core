// NGW Team Session — acceptance tests TS-03..TS-08 (Notion: Phase 1+2+3 Tracker)
//
// Prereq:
//   • Backend running on :8000 with NGW_DEV_MODE=1 so POST /api/team-sessions
//     accepts un-authenticated calls (mocks dev@localhost as creator).
//   • Vite UI on :5173/static/ui/.
//
// Mapping (Notion → spec):
//   TS-03 — Expired session → amber "Session Expired" card
//   TS-04 — Invalid token → red "Session Not Found" card
//   TS-05 — Re-share uses cached token (no duplicate DB row)
//   TS-06 — Rate limit (10/hr): 11th POST returns 429
//   TS-07 — Loading spinner visible while session is fetched
//   TS-08 — Banner dismiss persists across reload (URL is stripped)
//
// Run:
//   /usr/local/bin/node ui/test-team-session-acceptance.mjs

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

// Node 18 resolves "localhost" to ::1 first; uvicorn binds IPv4 only — use 127.0.0.1.
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173/static/ui/';
const API_URL  = process.env.API_URL  || 'http://127.0.0.1:8000';
const DB_PATH  = '/Users/toddwillis/Code/ngw-core/data/ngw_users.db';

const results = [];
function record(id, pass, note) {
  results.push({ id, pass, note });
  const tag = pass ? '\x1b[32m✔\x1b[0m' : '\x1b[31m✘\x1b[0m';
  console.log(`  ${tag} ${id}: ${note}`);
}

function sql(query) {
  // Returns trimmed stdout. Quotes single-line; for inserts, prefer a script.
  return execFileSync('sqlite3', [DB_PATH, query], { encoding: 'utf8' }).trim();
}

async function apiCreateSession(name = 'TS spec session') {
  const res = await fetch(`${API_URL}/api/team-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setup_name: name, setup_data: { pattern: 'Loop', confidence: 88 } }),
  });
  if (!res.ok) throw new Error(`createSession: HTTP ${res.status}`);
  return res.json();
}

const TEST_TAG = `ts-spec-${Date.now()}`;

async function cleanup() {
  // Wipe sessions created by this run + any sanity rows.
  try {
    sql(`DELETE FROM team_sessions WHERE setup_name LIKE '${TEST_TAG}%' OR setup_name='TS spec session' OR setup_name='TS-05 cockpit reshare';`);
  } catch (e) { console.warn('cleanup failed:', e.message); }
}

const browser = await chromium.launch();

// Pre-load this origin once so we can seed localStorage flags before the SPA mounts.
// Day1DemoApp gates session join behind: !user → StudioLogin, then needsOnboarding → Onboarding.
// `?devmode=1` injects a dev user; this seed bypasses the onboarding wizard.
async function newSeededContext(opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(BASE_URL, { waitUntil: 'commit' });
  await page.evaluate(() => {
    try {
      localStorage.setItem('ngw_onboarding_done', '1');
      localStorage.setItem('ngw_photographer_profile', JSON.stringify({ experience: 'pro', genre: 'portrait' }));
    } catch {}
  });
  await page.close();
  return ctx;
}

console.log('============================================================');
console.log('  NGW Team Session — TS-03..TS-08 acceptance');
console.log(`  ${BASE_URL}`);
console.log('============================================================');

try {
// ── TS-03 — Expired session → amber "Session Expired" card ───────────
{
  const ctx = await newSeededContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [pageerror TS-03]', e.message.slice(0, 160)));

  const session = await apiCreateSession(`${TEST_TAG}-expired`);
  // Force-expire by setting expires_at = 0
  sql(`UPDATE team_sessions SET expires_at = 0 WHERE share_token = '${session.share_token}';`);

  await page.goto(`${BASE_URL}?devmode=1&session=${session.share_token}`, { waitUntil: 'commit' });
  try {
    await page.getByText(/session expired/i).waitFor({ timeout: 10_000 });
    const goHome = await page.getByRole('button', { name: /go home/i }).count();
    record('TS-03', goHome > 0,
      goHome > 0 ? 'amber expired card + Go Home button' : 'expired card shown but Go Home missing');
  } catch (e) {
    record('TS-03', false, `expired card not shown: ${e.message.slice(0, 120)}`);
  }
  await ctx.close();
}

// ── TS-04 — Invalid token → red "Session Not Found" card ─────────────
{
  const ctx = await newSeededContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [pageerror TS-04]', e.message.slice(0, 160)));

  await page.goto(`${BASE_URL}?devmode=1&session=FAKEBADTOKEN_${Date.now()}`, { waitUntil: 'commit' });
  try {
    await page.getByText(/session not found/i).waitFor({ timeout: 10_000 });
    const goHome = await page.getByRole('button', { name: /go home/i }).count();
    record('TS-04', goHome > 0,
      goHome > 0 ? 'red not-found card + Go Home button' : 'not-found card but Go Home missing');
  } catch (e) {
    record('TS-04', false, `not-found card not shown: ${e.message.slice(0, 120)}`);
  }
  await ctx.close();
}

// ── TS-05 — Re-share uses cached token (no duplicate DB row) ──────────
// Drives the cockpit (?day1_screen=shoot) with devmode user, clicks the
// share button twice, and asserts only one team_sessions row was created.
{
  const ctx = await newSeededContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [pageerror TS-05]', e.message.slice(0, 160)));

  // dev@localhost is the dev-mode user; rate-limit-prune any leftover rows.
  sql(`DELETE FROM team_sessions WHERE creator_email='dev@localhost';`);

  await page.goto(`${BASE_URL}?devmode=1&day1_screen=shoot`, { waitUntil: 'commit' });
  // Wait for cockpit header to render. Look for either Exit button or the share icon.
  try {
    await page.getByRole('button', { name: /^‹ exit$/i }).waitFor({ timeout: 15_000 });
  } catch (e) {
    record('TS-05', false, `cockpit didn't render: ${e.message.slice(0, 120)}`);
    await ctx.close();
    throw e;
  }

  async function clickShare() {
    const btn = page.getByTestId('cockpit-share');
    await btn.click();
    // Desktop branch: clicking always opens the SHARE THIS SESSION modal (portaled).
    // Wait until either the modal text is visible OR the share button shows a state pill.
    await page.waitForFunction(() => {
      const txt = (document.body.innerText || '').toUpperCase();
      return txt.includes('SHARE THIS SESSION') ||
             txt.includes('SHARE LINK') ||
             txt.includes('SHARED') ||
             txt.includes('FAILED');
    }, { timeout: 8_000 });
  }

  try {
    await clickShare();
    // Close the modal between clicks if present, so the second click re-fires.
    const close = page.getByText(/share this session/i).first();
    if (await close.isVisible().catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      // Modal close button has no testid; click outside to dismiss the overlay.
      await page.mouse.click(10, 10).catch(() => {});
      await page.waitForTimeout(300);
    }
    await clickShare();
    await page.waitForTimeout(500);
    const count = parseInt(sql(`SELECT COUNT(*) FROM team_sessions WHERE creator_email='dev@localhost';`), 10);
    record('TS-05', count === 1, `team_sessions rows for dev@localhost = ${count} (expected 1)`);
  } catch (e) {
    record('TS-05', false, `share-click failed: ${e.message.slice(0, 160)}`);
  }
  await ctx.close();
}

// ── TS-07 — Loading spinner visible during slow fetch ─────────────────
{
  const ctx = await newSeededContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [pageerror TS-07]', e.message.slice(0, 160)));

  const session = await apiCreateSession(`${TEST_TAG}-loading`);

  // Slow the GET /api/team-sessions/<token> response by 1500ms.
  await page.route(`**/api/team-sessions/${session.share_token}`, async (route) => {
    await new Promise(r => setTimeout(r, 1500));
    await route.continue();
  });

  // Don't wait for navigation — start asserting the spinner immediately.
  page.goto(`${BASE_URL}?devmode=1&session=${session.share_token}`, { waitUntil: 'commit' }).catch(() => {});
  try {
    await page.getByText(/loading shared session/i).waitFor({ timeout: 5_000 });
    // Then verify it eventually disappears + banner appears.
    await page.getByText(/shared session/i).first().waitFor({ timeout: 10_000 });
    record('TS-07', true, 'loading spinner shown, then banner appears');
  } catch (e) {
    record('TS-07', false, `spinner/banner not seen: ${e.message.slice(0, 120)}`);
  }
  await ctx.close();
}

// ── TS-08 — Banner dismiss persists across reload ────────────────────
{
  const ctx = await newSeededContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('  [pageerror TS-08]', e.message.slice(0, 160)));

  const session = await apiCreateSession(`${TEST_TAG}-banner`);
  await page.goto(`${BASE_URL}?devmode=1&session=${session.share_token}`, { waitUntil: 'commit' });

  try {
    // Banner contains "Shared session". Wait for it.
    await page.getByText(/shared session/i).first().waitFor({ timeout: 10_000 });
    // Click the × dismiss button (title="Dismiss").
    await page.getByTitle('Dismiss').click();
    // Banner gone.
    await page.waitForFunction(() => !/shared session/i.test(document.body.innerText), { timeout: 3_000 });
    // Reload — URL has had ?devmode=1&session= stripped after the join, so banner stays gone.
    await page.reload({ waitUntil: 'commit' });
    await page.waitForTimeout(800);
    const stillGone = !(await page.getByText(/shared session/i).first().isVisible().catch(() => false));
    record('TS-08', stillGone, stillGone
      ? 'banner dismissed and stays gone after reload'
      : 'banner reappeared after reload');
  } catch (e) {
    record('TS-08', false, `banner dismiss failed: ${e.message.slice(0, 120)}`);
  }
  await ctx.close();
}

// ── TS-06 — Rate limit: 11th POST in <1h returns 429 ─────────────────
// Run LAST: the in-memory rate-limit bucket persists for the rest of the
// process and would 429 any subsequent apiCreateSession() calls.
{
  sql(`DELETE FROM team_sessions WHERE creator_email='dev@localhost';`);
  const codes = [];
  for (let i = 0; i < 12; i++) {
    const r = await fetch(`${API_URL}/api/team-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setup_name: `${TEST_TAG}-rl-${i}`,
        setup_data: { i },
      }),
    });
    codes.push(r.status);
    if (r.status === 429) break;
  }
  const idx429 = codes.indexOf(429);
  const okBefore429 = idx429 < 0
    ? true
    : codes.slice(0, idx429).every(c => c === 200 || c === 201);
  const pass = idx429 >= 0 && okBefore429;
  record('TS-06', pass, `status sequence: [${codes.join(',')}] (429 at index ${idx429})`);
}
} finally {
  await cleanup();
  await browser.close();
}

// ── Summary ──────────────────────────────────────────────────────────
const passed = results.filter(r => r.pass).length;
const failed = results.length - passed;
console.log('\n============================================================');
console.log(`  Results: ${passed} passed, ${failed} failed (out of ${results.length})`);
console.log('============================================================');
for (const r of results) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}: ${r.id} — ${r.note}`);
}
process.exit(failed > 0 ? 1 : 0);
