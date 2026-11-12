// Customer tasks through real panel markup/controllers, with isolated tenant fixtures.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { server, setup, extra } = require('./menu-merchant-browser.cjs');
const out = 'outputs/panel-navigation'; fs.mkdirSync(out, { recursive: true });

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  const results = [];
  async function fixture(width, role = 'owner', empty = false) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await setup(page, role); await extra(page);
    if (empty) await page.addInitScript(() => { window.__fixtureEmpty = true; });
    await context.route('**/supabase-config.js*', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.route('https://cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.goto(base + '/painel/');
    await page.waitForFunction(() => window.OgritechMenuWorkspace?.state().ready);
    assert.deepEqual(errors, []);
    return { context, page, errors };
  }
  async function go(page, route) {
    await page.locator(`.menu-item[data-panel-route="${route}"]`).click();
    await page.waitForFunction(route => document.body.dataset.panelRoute === route && window.OgritechMenuWorkspace.state().ready, route);
    await page.mouse.move(1, 1);
  }
  async function fit(page) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
    const links = await page.locator('.menu-item:visible').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { label: el.textContent.trim(), height: r.height, width: r.width }; }));
    assert.deepEqual(links.map(x => x.label), ['Pedidos', 'Produtos', 'Cardápio', 'Vendas', 'Conta']);
    assert.ok(links.every(x => x.height >= 44 && x.width >= 44));
    assert.equal(await page.locator('.menu-item[aria-current="page"]').count(), 1);
  }
  try {
    for (const width of [320, 390, 768, 1440]) {
      const { context, page, errors } = await fixture(width);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => window.OgritechPanelTheme.set(theme), theme);
        await go(page, 'orders');
        await page.locator('#menuOrdersList article').first().waitFor();
        assert.ok(await page.locator('#menuOrdersList [data-order-action="confirm"]').first().evaluate(el => el.getBoundingClientRect().bottom < innerHeight - 85), 'First order action above the mobile navigation');
        assert.equal(await page.locator('#menuShareLink').isVisible(), false);
        assert.equal(await page.locator('#menuPilotMetricsPanel').isVisible(), false);
        await fit(page); await page.screenshot({ path: `${out}/orders-${theme}-${width}.png` });

        await go(page, 'products');
        assert.equal(await page.locator('#panelProductEditor').isVisible(), false);
        assert.ok(await page.locator('[data-edit-menu-item]').first().evaluate(el => el.getBoundingClientRect().bottom < innerHeight - 85));
        await fit(page); await page.screenshot({ path: `${out}/products-${theme}-${width}.png` });
        await page.locator('#panelAddProduct').click();
        await page.locator('#menuItemName').fill('Produto ainda não salvo');
        const rejectDiscard = dialog => dialog.dismiss(); page.once('dialog', rejectDiscard);
        await page.locator('.menu-item[data-panel-route="sales"]').click();
        assert.equal(await page.locator('#menuItemName').inputValue(), 'Produto ainda não salvo');
        assert.equal(await page.locator('body').getAttribute('data-panel-route'), 'products');
        await page.locator('#menuItemCancel').click();
        assert.equal(await page.locator('#panelProductEditor').isVisible(), false);
        await page.locator('[data-edit-menu-item]').first().click();
        assert.equal(await page.locator('#menuItemName').inputValue(), 'Bolo de chocolate');
        assert.equal(await page.locator('#menuItemCancel').isVisible(), true);
        await page.screenshot({ path: `${out}/editor-${theme}-${width}.png` });
        await page.locator('#menuItemCancel').click();

        await go(page, 'menu');
        assert.equal(await page.locator('#menuOperationPublicLink').isVisible(), true);
        assert.equal(await page.locator('#menuShareLink').isVisible(), false);
        await page.locator('#panelShareTools>summary').click();
        assert.equal(await page.locator('#menuShareLink button').isVisible(), true);
        assert.equal(await page.locator('#menuShareLink a').count(), 0);
        await fit(page); await page.screenshot({ path: `${out}/menu-${theme}-${width}.png` });
        await page.locator('[data-menu-workspace="settings"]').click();
        assert.equal(await page.locator('#menuSettingsPanel').isVisible(), true);

        await go(page, 'sales');
        await page.locator('#panelSalesReportList button').first().waitFor();
        assert.equal(await page.locator('#menuPilotMetricsPanel').isVisible(), true);
        assert.equal(await page.locator('#menuOrdersPanel').isVisible(), false);
        await fit(page); await page.screenshot({ path: `${out}/sales-${theme}-${width}.png` });
        await page.locator('#panelSalesReportList button').first().click();
        await page.locator('#salesReportExports').waitFor({ state: 'visible' });
        const exports = await page.locator('.sales-report-export-actions a').evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { y: r.y, height: r.height }; }));
        assert.ok(exports.every(el => el.height >= 44 && Math.abs(el.y - exports[0].y) < 1));
        await page.screenshot({ path: `${out}/report-${theme}-${width}.png` });
        await page.locator('#salesReportClose').click();
        await go(page, 'account');
        assert.equal(await page.locator('#logoutButton').isVisible(), true);
        assert.ok(await page.locator('#panelInstallApp').evaluate(el => !!el.closest('#settingsView')));
        assert.ok(await page.locator('#exportBusinessData').evaluate(el => !!el.closest('.panel-account-card')));
        await fit(page); await page.screenshot({ path: `${out}/account-${theme}-${width}.png` });
        assert.deepEqual(errors, []);
        results.push({ width, theme, stableDestinations: true, orderVisible: true, catalogFirst: true, protectedUnsavedProduct: true, reportsDirect: true, accountGrouped: true });
      }
      await context.close();
    }
    const staff = await fixture(390, 'employee');
    assert.deepEqual(await staff.page.locator('.menu-item:visible').allTextContents(), ['Pedidos', 'Conta']);
    assert.equal(await staff.page.locator('#menuOrdersList [data-order-action]').count(), 0);
    await staff.page.evaluate(() => window.OgritechPanelNavigation.show('vendas'));
    assert.equal(await staff.page.locator('body').getAttribute('data-panel-route'), 'orders');
    await staff.context.close();
    const saved = await fixture(390);
    await saved.page.evaluate(() => {
      const rpc = supabaseClient.rpc.bind(supabaseClient);
      supabaseClient.rpc = async (name, args) => {
        if (name === 'save_menu_catalog_draft') { window.__savedDraft = structuredClone(args.draft_payload); return { data: {} }; }
        if (name === 'menu_catalog_draft_status' && window.__savedDraft) return { data: { exists: true, payload: window.__savedDraft } };
        if (name === 'publish_menu_catalog_draft') {
          const { data: menu } = await supabaseClient.from('online_menus').select().maybeSingle();
          menu.menu_categories = window.__savedDraft.categories;
          window.__publishedDraft = structuredClone(window.__savedDraft); window.__savedDraft = null;
          return { data: {} };
        }
        return rpc(name, args);
      };
    });
    await go(saved.page, 'products');
    await saved.page.locator('[data-edit-menu-item]').first().click();
    await saved.page.locator('#menuItemName').fill('Bolo de chocolate atualizado');
    await saved.page.locator('#menuItemSubmit').click();
    await saved.page.waitForFunction(() => window.__savedDraft && !document.getElementById('panelProductEditor').checkVisibility());
    await saved.page.waitForFunction(() => window.OgritechMenuWorkspace.state().ready && !window.OgritechMenuWorkspace.state().busy);
    assert.match(await saved.page.locator('#menuCatalogList').textContent(), /Bolo de chocolate atualizado/);
    assert.equal(await saved.page.evaluate(() => window.__savedDraft.categories[0].menu_items.length), 2);
    await go(saved.page, 'menu');
    assert.equal(await saved.page.locator('#menuPublicationButton').isEnabled(), true);
    await saved.page.locator('#menuPublicationButton').click();
    await saved.page.waitForFunction(() => window.__publishedDraft && window.OgritechMenuWorkspace.state().ready && !window.OgritechMenuWorkspace.state().busy);
    assert.equal(await saved.page.locator('#menuPublicationButton').isEnabled(), false);
    assert.equal(await saved.page.evaluate(() => window.__publishedDraft.categories[0].menu_items[0].name), 'Bolo de chocolate atualizado');
    assert.deepEqual(saved.errors, []); await saved.context.close();
    const unsaved = await fixture(390);
    await go(unsaved.page, 'menu');
    await unsaved.page.locator('[data-menu-workspace="settings"]').click();
    await unsaved.page.locator('#menuTitle').fill('Nome ainda não salvo');
    await go(unsaved.page, 'account');
    await go(unsaved.page, 'menu');
    assert.equal(await unsaved.page.locator('#menuTitle').inputValue(), 'Nome ainda não salvo');
    await unsaved.page.locator('.menu-item[data-panel-route="sales"]').click();
    assert.equal(await unsaved.page.locator('body').getAttribute('data-panel-route'), 'menu');
    assert.deepEqual(unsaved.errors, []); await unsaved.context.close();
    const start = await fixture(390, 'owner', true);
    assert.equal(await start.page.locator('#menuTemplateForm').isVisible(), true);
    assert.equal(await start.page.locator('#menuJourneyGuide').isVisible(), true);
    await start.page.screenshot({ path: `${out}/first-setup-390.png` });
    assert.deepEqual(start.errors, []); await start.context.close();
    results.push({ employeePermissionsPreserved: true, initialSetupPreserved: true, draftSavedThroughEditor: true, draftPublishedFromCardapio: true, unsavedSettingsPreservedAcrossAccount: true });
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
