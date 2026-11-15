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
        assert.equal(await page.locator('.panel-product-more').count(),0);
        const product=page.locator('.menu-catalog-editor-item').first();
        assert.equal(await product.locator('[data-delete-menu-item]').textContent(),'Excluir produto');
        await product.locator('[data-toggle-menu-item]').click();
        await page.waitForFunction(()=>document.querySelector('[data-toggle-menu-item]')?.textContent==='Reativar produto');
        assert.match(await product.textContent(),/Oculto/);
        assert.equal(await page.locator('.menu-catalog-editor-item').count(),2);
        const hidden=await page.evaluate(()=>window.__fixtureMenu.menu_categories[0].menu_items[0]);
        assert.equal(hidden.active,false);assert.equal(hidden.available,false);assert.equal(hidden.menu_item_prices[0].price,16.9);
        await page.screenshot({path:`${out}/hidden-product-${theme}-${width}.png`});
        await product.locator('[data-toggle-menu-item]').click();
        await page.waitForFunction(()=>document.querySelector('[data-toggle-menu-item]')?.textContent==='Ocultar produto');
        assert.match(await product.textContent(),/Disponível/);
        page.once('dialog',dialog=>dialog.dismiss());
        await product.locator('[data-delete-menu-item]').click();
        assert.equal(await page.locator('.menu-catalog-editor-item').count(),2);
        if(width===390 && theme==='light'){
          await page.evaluate(()=>{window.__visibilityError=true;});
          await product.locator('[data-toggle-menu-item]').click();
          await page.waitForFunction(()=>!document.querySelector('[data-toggle-menu-item]').disabled);
          assert.equal(await product.locator('[data-toggle-menu-item]').textContent(),'Ocultar produto');
          assert.equal(await page.evaluate(()=>window.__fixtureMenu.menu_categories[0].menu_items[0].active),true);
          await page.evaluate(()=>{window.__visibilityError=false;});
        }

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
    for (const width of [390, 1440]) {
      const saved = await fixture(width);
      const page = saved.page;
      await page.evaluate(() => {
        const rpc = supabaseClient.rpc.bind(supabaseClient);
        const from = supabaseClient.from.bind(supabaseClient);
        supabaseClient.from = table => {
          const query = from(table), then = query.then.bind(query);
          query.then = (resolve, reject) => then(result => resolve(structuredClone(result)), reject);
          return query;
        };
        window.__catalogCalls = [];
        supabaseClient.rpc = async (name, args) => {
          if (['save_menu_catalog_draft', 'publish_menu_catalog_draft', 'save_menu_catalog_item'].includes(name)) window.__catalogCalls.push(name);
          if (name === 'save_menu_catalog_draft') {
            if (window.__saveFailure) return { error: { code: '08006' } };
            window.__savedDraft = structuredClone(args.draft_payload); return { data: {} };
          }
          if (name === 'menu_catalog_draft_status' && window.__savedDraft) return { data: { exists: true, payload: window.__savedDraft } };
          if (name === 'publish_menu_catalog_draft') {
            if (window.__publicationFailure === 'network') throw new Error('fixture transport failure');
            if (window.__publicationFailure) return { error: { code: '23514' } };
            window.__fixtureMenu.menu_categories = structuredClone(window.__savedDraft.categories);
            window.__publishedDraft = structuredClone(window.__savedDraft); window.__savedDraft = null;
            if (window.__losePublicationResponse) throw new Error("fixture response lost after commit");
            return { data: {} };
          }
          if (name === 'save_menu_catalog_item') return { data: { id: 'new-unpublished-item' } };
          return rpc(name, args);
        };
      });
      async function settled() {
        await page.waitForFunction(() => !document.getElementById('panelProductEditor').checkVisibility() && window.OgritechMenuWorkspace.state().ready && !window.OgritechMenuWorkspace.state().busy);
        assert.equal(await page.locator('body').getAttribute('data-panel-route'), 'products');
      }
      async function edit(name) {
        await page.locator('[data-edit-menu-item="item-a"]').click();
        await page.locator('#menuItemName').fill(name);
      }
      await page.evaluate(() => window.loadMenuAdmin());
      await go(page, 'products');
      await edit('Bolo de chocolate atualizado');
      await page.locator('#menuItemSubmit').click(); await settled();
      assert.equal(await page.evaluate(() => window.__publishedDraft.categories[0].menu_items[0].name), 'Bolo de chocolate atualizado');
      assert.equal(await page.evaluate(() => window.__savedDraft), null);
      assert.match(await page.locator('#menuWorkspaceMessage').textContent(), /atualizado no cardápio online/);
      assert.equal(await page.locator('#menuCatalogPublicationNotice').isVisible(), false);

      await page.locator('#panelAddProduct').click();
      await page.locator('#menuCategoryName').fill('Mais pedidos');
      await page.locator('#menuItemName').fill('Produto novo');
      await page.locator('[data-price-label]').fill('Unidade');
      await page.locator('[data-price-value]').fill('18.50');
      await page.locator('#menuItemSubmit').click(); await settled();
      assert.equal(await page.evaluate(() => window.__fixtureMenu.menu_categories[0].menu_items.length), 3);
      assert.equal(await page.evaluate(() => window.__fixtureMenu.menu_categories[0].menu_items[2].name), 'Produto novo');

      await edit('Produto oculto');
      await page.locator('#menuItemActive').uncheck();
      await page.locator('#menuItemSubmit').click(); await settled();
      assert.equal(await page.evaluate(() => window.__fixtureMenu.menu_categories[0].menu_items[0].active), false);
      assert.match(await page.locator('#menuWorkspaceMessage').textContent(), /salvo como oculto/);
      assert.equal(await page.evaluate(() => window.__fixtureMenu.menu_categories[0].menu_items.filter(item => item.active && item.available).some(item => item.name === 'Produto oculto')), false);
      await edit('Produto indisponível');
      await page.locator('#menuItemActive').check();
      await page.locator('#menuItemAvailable').uncheck();
      await page.locator('#menuItemSubmit').click(); await settled();
      assert.equal(await page.evaluate(() => window.__fixtureMenu.menu_categories[0].menu_items[0].available), false);
      assert.match(await page.locator('#menuWorkspaceMessage').textContent(), /salvo como oculto/);

      for (const failure of ['server', 'network']) {
        await page.evaluate(failure => { window.__publicationFailure = failure; }, failure);
        await edit('Alteração aguardando ' + failure);
        await page.locator('#menuItemActive').check(); await page.locator('#menuItemAvailable').check();
        await page.locator('#menuItemSubmit').click(); await settled();
        assert.match(await page.locator('#menuWorkspaceMessage').textContent(), /Produto salvo, mas não foi possível atualizar/);
        assert.equal(await page.locator('#menuCatalogPublishButton').isVisible(), true);
        assert.notEqual(await page.evaluate(() => window.__fixtureMenu.menu_categories[0].menu_items[0].name), 'Alteração aguardando ' + failure);
        const saves = await page.evaluate(() => window.__catalogCalls.filter(name => name === 'save_menu_catalog_draft').length);
        await page.evaluate(() => { window.__publicationFailure = false; });
        await page.locator('#menuCatalogPublishButton').click();
        await page.waitForFunction(() => !window.__savedDraft && !window.OgritechMenuWorkspace.state().busy);
        assert.equal(await page.evaluate(() => window.__fixtureMenu.menu_categories[0].menu_items[0].name), 'Alteração aguardando ' + failure);
        assert.equal(await page.evaluate(() => window.__catalogCalls.filter(name => name === 'save_menu_catalog_draft').length), saves);
        assert.equal(await page.locator('body').getAttribute('data-panel-route'), 'products');
      }
      await page.evaluate(() => { window.__losePublicationResponse = true; });
      await edit('Publicação confirmada pela atualização');
      await page.locator('#menuItemSubmit').click(); await settled();
      assert.match(await page.locator('#menuWorkspaceMessage').textContent(), /atualizado no cardápio online/);
      assert.equal(await page.locator('#menuCatalogPublicationNotice').isVisible(), false);
      await page.evaluate(() => { window.__losePublicationResponse = false; window.__saveFailure = true; });
      await edit('Nome que falhou ao salvar');
      const publications = await page.evaluate(() => window.__catalogCalls.filter(name => name === 'publish_menu_catalog_draft').length);
      await page.locator('#menuItemSubmit').click();
      await page.waitForFunction(() => !window.OgritechMenuWorkspace.state().busy);
      assert.equal(await page.locator('#panelProductEditor').isVisible(), true);
      assert.equal(await page.locator('#menuItemName').inputValue(), 'Nome que falhou ao salvar');
      assert.equal(await page.evaluate(() => window.__catalogCalls.filter(name => name === 'publish_menu_catalog_draft').length), publications);
      await page.locator('#menuItemCancel').click();
      await page.evaluate(() => { window.__fixtureMenu.published = false; });
      await page.evaluate(() => window.loadMenuAdmin());
      await go(page, 'products');
      await edit('Produto antes da primeira publicação');
      await page.locator('#menuItemSubmit').click(); await settled();
      assert.equal(await page.evaluate(() => window.__catalogCalls.at(-1)), 'save_menu_catalog_item');
      assert.equal(await page.evaluate(() => window.__fixtureMenu.published), false);
      assert.deepEqual(saved.errors, []);
      results.push({ width, immediateProductUpdate: true, immediateNewProduct: true, hiddenProductsPreserved: true, publicationFailureRetryInProducts: true, failedSavePreservesEditor: true, firstPublicationStillExplicit: true });
      await saved.context.close();
    }
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
    results.push({ employeePermissionsPreserved: true, initialSetupPreserved: true, unsavedSettingsPreservedAcrossAccount: true });
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
