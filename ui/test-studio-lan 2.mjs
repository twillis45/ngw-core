import { chromium } from 'playwright';

const URL = 'http://10.238.192.127:5173/static/ui/?studio=1&persist=1';

const browser = await chromium.launch();
// Simulate an iPhone viewport to match real tester conditions.
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (u.includes('/api/') || u.includes('/static/ui/')) {
    errors.push(`[reqfailed] ${r.method()} ${u} → ${r.failure()?.errorText}`);
  }
});

console.log('Loading:', URL);
const t0 = Date.now();
await page.goto(URL, { waitUntil: 'commit' });
await page.waitForFunction(() => sessionStorage.getItem('ngw_studio_active') === '1', { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2000); // let Studio shell render

const state = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  studioActive: sessionStorage.getItem('ngw_studio_active'),
  studioPersist: localStorage.getItem('ngw_studio_persist'),
  rootHasContent: !!document.querySelector('#root')?.children.length,
  bodyText: (document.body.innerText || '').slice(0, 400),
  // Look for Studio Matte signature elements
  hasViewfinder: !!document.querySelector('[class*="viewfinder" i], [class*="Viewfinder"]'),
  hasAnalyzeButton: !!Array.from(document.querySelectorAll('button')).find(b => /analyze/i.test(b.textContent || '')),
  buttonCount: document.querySelectorAll('button').length,
}));

console.log(`\nLoaded in ${Date.now() - t0}ms`);
console.log('State:', state);

await page.screenshot({ path: '/tmp/studio-lan.png', fullPage: false });
console.log('\nScreenshot: /tmp/studio-lan.png');

if (errors.length) {
  console.log('\nErrors:');
  errors.slice(0, 10).forEach((e) => console.log(' ', e));
}

await browser.close();

const ok = state.studioActive === '1' && state.rootHasContent;
console.log(ok ? '\n✓ Studio Matte active on LAN' : '\n✗ Studio Matte NOT active');
process.exit(ok ? 0 : 1);
