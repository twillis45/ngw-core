import { chromium } from 'playwright';

const BASE = 'http://192.168.4.46:5173/static/ui/';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

page.on('pageerror', (e) => console.error('[pageerror]', e.message));

const snapshot = (p) => p.evaluate(() => ({
  url: location.href,
  localStorage_persist: localStorage.getItem('ngw_studio_persist'),
  sessionStorage_active: sessionStorage.getItem('ngw_studio_active'),
  sessionStorage_goto: sessionStorage.getItem('ngw_goto_day1_demo'),
})).catch(() => null);

console.log('\n=== STEP 1: load with ?studio=1&persist=1 ===');
await page.goto(`${BASE}?studio=1&persist=1`, { waitUntil: 'commit' });
// Snapshot immediately after main.jsx pre-React flag handler runs, before auth effects navigate away.
await page.waitForFunction(() => localStorage.getItem('ngw_studio_persist') !== null || sessionStorage.getItem('ngw_studio_active') !== null, { timeout: 5000 }).catch(() => {});
const state1 = await snapshot(page);
const url1 = state1?.url ?? page.url();
console.log('URL after load   :', url1);
console.log('Storage state    :', state1);

console.log('\n=== STEP 2: new context (fresh session), same localStorage ===');
// To simulate "reopen browser", we need storageState persistence.
const storageState = await ctx.storageState();
await ctx.close();
const ctx2 = await browser.newContext({ storageState });
const page2 = await ctx2.newPage();
await page2.goto(BASE, { waitUntil: 'commit' });
await page2.waitForFunction(() => sessionStorage.getItem('ngw_studio_active') !== null, { timeout: 5000 }).catch(() => {});
const state2 = await snapshot(page2);
const url2 = state2?.url ?? page2.url();
console.log('URL after load   :', url2);
console.log('Storage state    :', state2);

console.log('\n=== STEP 3: ?studio=off clears everything ===');
await page2.goto(`${BASE}?studio=off`, { waitUntil: 'commit' });
await page2.waitForFunction(() => localStorage.getItem('ngw_studio_persist') === null, { timeout: 5000 }).catch(() => {});
const state3 = await snapshot(page2);
const url3 = state3?.url ?? page2.url();
console.log('URL after load   :', url3);
console.log('Storage state    :', state3);

await browser.close();

// Assertions
const pass = [];
pass.push(['Step1 localStorage.ngw_studio_persist=1', state1.localStorage_persist === '1']);
pass.push(['Step1 sessionStorage.ngw_studio_active=1', state1.sessionStorage_active === '1']);
pass.push(['Step1 URL params stripped', !url1.includes('studio=') && !url1.includes('persist=')]);
pass.push(['Step2 persist survives new session', state2.localStorage_persist === '1']);
pass.push(['Step2 session re-activated from persist', state2.sessionStorage_active === '1']);
pass.push(['Step3 localStorage.ngw_studio_persist cleared', state3.localStorage_persist === null]);
pass.push(['Step3 sessionStorage.ngw_studio_active cleared', state3.sessionStorage_active === null]);

console.log('\n=== RESULTS ===');
let allOk = true;
for (const [label, ok] of pass) {
  console.log((ok ? '✓' : '✗') + ' ' + label);
  if (!ok) allOk = false;
}
process.exit(allOk ? 0 : 1);
