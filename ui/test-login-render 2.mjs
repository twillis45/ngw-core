import { chromium } from 'playwright';

const URL = 'http://192.168.4.46:5173/static/ui/?studio=1&persist=1';

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
});
const page = await ctx.newPage();

const errors = [];
const nav = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
page.on('console', (m) => {
  if (m.type() === 'error') {
    const t = m.text();
    if (!/vibrate|AudioContext|pulse seed|sentry/i.test(t)) errors.push(`[console.error] ${t}`);
  }
});
page.on('framenavigated', (f) => { if (f === page.mainFrame()) nav.push(f.url()); });

console.log('Load:', URL);
await page.goto(URL, { waitUntil: 'commit' });
await page.waitForTimeout(3500); // give React time to render login screen

const state = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  rootChildren: document.querySelector('#root')?.children.length ?? 0,
  rootHTML: (document.querySelector('#root')?.innerHTML || '').slice(0, 500),
  bodyText: (document.body.innerText || '').trim().slice(0, 500),
  buttonCount: document.querySelectorAll('button').length,
  inputCount: document.querySelectorAll('input').length,
  hasLoginText: /sign in|log in|login|email|password/i.test(document.body.innerText || ''),
  studioActive: sessionStorage.getItem('ngw_studio_active'),
  studioPersist: localStorage.getItem('ngw_studio_persist'),
  gotoAuth: sessionStorage.getItem('ngw_goto_auth'),
}));

console.log('\n=== Navigation history ===');
nav.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));

console.log('\n=== Final state ===');
console.log(state);

console.log('\n=== Errors (filtered) ===');
if (errors.length === 0) console.log('  (none)');
else errors.slice(0, 15).forEach((e) => console.log(' ', e));

await page.screenshot({ path: '/tmp/studio-login.png', fullPage: true });
console.log('\nScreenshot: /tmp/studio-login.png');

await browser.close();
