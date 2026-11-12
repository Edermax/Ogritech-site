// Verify rendered pixels: Auto Dark can change paint without changing computed CSS.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { server, setup, extra } = require('./menu-merchant-browser.cjs');
const out = 'outputs/panel-theme-review/account-explicit';
fs.mkdirSync(out, { recursive: true });

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  const results = [];
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'dark', serviceWorkers: 'block', reducedMotion: 'reduce' });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await setup(page, 'owner'); await extra(page);
      await context.route('**/supabase-config.js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
      await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
      await page.goto(`http://127.0.0.1:${server.address().port}/painel/`);
      await page.locator('#menuOrdersList article').first().waitFor();
      await page.locator('.menu-item[data-section="configuracoes"]').click();
      await page.locator('#subscriptionList article').waitFor();
      const cdp = await context.newCDPSession(page);
      const patch = async () => {
        await page.locator('#accountSettings').scrollIntoViewIfNeeded();
        const rect = await page.locator('#accountSettings').boundingBox();
        return page.screenshot({ clip: { x: Math.round(rect.x + 5), y: Math.round(rect.y + 40), width: 6, height: 6 }, animations: 'disabled' });
      };
      for (const theme of ['light', 'dark']) {
        await cdp.send('Emulation.setAutoDarkModeOverride', { enabled: false });
        await page.locator('[data-panel-theme-select]').selectOption(theme);
        await page.mouse.move(1, 1);
        const normal = await patch();
        await cdp.send('Emulation.setAutoDarkModeOverride', { enabled: true });
        const forced = await patch();
        assert.deepEqual(forced, normal, `${theme} appearance must respect the explicit choice with Auto Dark enabled at ${width}px`);
        assert.equal(await page.locator('#accountSettings').evaluate(el => getComputedStyle(el).backgroundColor), theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(16, 33, 45)');
        assert.equal(await page.locator('[data-panel-theme-select]').inputValue(), theme);
        await page.screenshot({ path: `${out}/account-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
        await page.locator('#changePasswordButton').click();
        assert.equal(await page.locator('#changePasswordDialog').evaluate(el => getComputedStyle(el).backgroundColor), theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(16, 33, 45)');
        await page.locator('#changePasswordDialog').evaluate(el => el.close());
        await page.reload(); await page.locator('#menuOrdersList article').first().waitFor();
        await page.locator('.menu-item[data-section="configuracoes"]').click();
        assert.equal(await page.locator('html').getAttribute('data-panel-theme'), theme);
        assert.equal(await page.locator('[data-panel-theme-select]').inputValue(), theme);
        await page.locator('#subscriptionList article').waitFor();
        assert.deepEqual(await patch(), normal, 'The rendered choice persists after reload');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        results.push({ width, theme, systemDark: true, autoDarkPixelsUnchanged: true, persisted: true, passwordDialog: true });
      }
      assert.deepEqual(errors, []); await context.close();
    }
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
