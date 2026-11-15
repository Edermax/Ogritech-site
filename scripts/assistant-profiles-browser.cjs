// Real panel and guided assistant; isolated Auth/data fixtures, no customer writes.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { server, setup, extra } = require('./menu-merchant-browser.cjs');
const out = 'outputs/assistant-profiles'; fs.mkdirSync(out, { recursive: true });

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined) });
  const results = [];
  async function fixture(offer, role, width, firstSetup = false) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await setup(page, role); await extra(page);
    await page.addInitScript(({ offer, firstSetup }) => {
      window.__assistantOffer = offer; window.__assistantBillingChanges = [];
      if (firstSetup) { window.__fixtureMenu.published = false; window.__fixtureMenu.template_code = null; }
      const rpc = supabaseClient.rpc.bind(supabaseClient), invoke = supabaseClient.functions.invoke.bind(supabaseClient.functions);
      supabaseClient.functions.invoke = async (name, options) => {
        if (options?.body?.action === 'change_offer') { window.__assistantBillingChanges.push(options.body); throw new Error('Help must never change the plan'); }
        return invoke(name, options);
      };
      supabaseClient.rpc = async (name, args) => {
        if (name === 'business_subscription_center') return { data: {
          products: [{ code: 'menu', name: 'Cardápio e Encomendas', plans: [{ id: 'simple', code: 'cardapio' }, { id: 'full', code: 'foundation' }], modules: [] }],
          subscriptions: [{ product_code: 'menu', plan_id: window.__assistantOffer === 'cardapio' ? 'simple' : 'full', status: 'trial', billing_cycle: 'monthly', current_period_end: '2099-01-01T00:00:00Z' }]
        } };
        const result = await rpc(name, args);
        if (name === 'menu_onboarding_status') {
          const status = () => ({ ...result, data: { ...result.data, offer_code: window.__assistantOffer } });
          if (window.__assistantBlock) return new Promise(resolve => { window.__releaseAssistantContext = () => { window.__assistantBlock = false; resolve(status()); }; });
          return status();
        }
        return result;
      };
    }, { offer, firstSetup });
    await context.route('**/supabase-config.js*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.goto(origin + '/painel/?env=staging');
    await page.waitForFunction(() => window.OgritechMenuWorkspace?.state().ready);
    const panel = page.locator('#ogri-assistant-panel'), body = page.locator('.ogri-assistant__body');
    async function topic(id) {
      if (!await panel.isVisible()) await page.locator('#panelAssistantOpen').click();
      const back = body.locator('.ogri-assistant__back');
      if (await back.count()) await back.click();
      await body.locator(`[data-topic="${id}"]`).click();
    }
    return { context, page, panel, body, topic, errors };
  }
  try {
    for (const width of [390, 1440]) for (const offer of ['cardapio', 'encomendas']) for (const role of ['owner', 'admin', 'employee']) {
      const f = await fixture(offer, role, width), { page, body, topic } = f;
      await page.locator('#panelAssistantOpen').click();
      assert.match(await body.textContent(), offer === 'cardapio' ? /Seu painel: Ogritech Cardápio/ : /Seu painel: Ogritech Encomendas/);
      for (const id of ['pedidos', 'vendas', 'entregas', 'pagamentos', 'notificacoes']) {
        await topic(id);
        if (offer === 'cardapio') {
          assert.match(await body.textContent(), /plano atual, Ogritech Cardápio, não inclui/);
          assert.equal(await body.locator('[data-panel-help-action="upgrade"]').count(), role === 'owner' ? 1 : 0);
          assert.equal(await body.locator('[data-panel-help-action="orders"],[data-panel-help-action="sales"],[data-panel-help-action="settings"]').count(), 0);
        } else if (role === 'employee' && ['vendas', 'entregas', 'pagamentos'].includes(id)) {
          assert.match(await body.textContent(), /perfil de funcionário não permite/);
          assert.equal(await body.locator('[data-panel-help-action="sales"],[data-panel-help-action="settings"]').count(), 0);
        } else {
          assert.ok(await body.locator('[data-panel-help-action]').count() > 0);
          if (role === 'employee' && id === 'pedidos') assert.match(await body.textContent(), /pode consultar os pedidos/);
        }
      }
      for (const id of ['produtos', 'whatsapp', 'configuracoes', 'publicacao']) {
        await topic(id);
        if (role === 'employee') {
          assert.match(await body.textContent(), /perfil de funcionário não permite/);
          assert.equal(await body.locator('[data-panel-help-action="products"],[data-panel-help-action="settings"],[data-panel-help-action="publication"]').count(), 0);
        } else if (id === 'produtos') assert.match(await body.textContent(), /Salvar produto atualiza o catálogo online na mesma aba/);
        else if (id === 'configuracoes' && offer === 'cardapio') assert.match(await body.textContent(), /entrega e o pagamento são combinados no WhatsApp/);
      }
      await topic('assinatura');
      assert.equal(await body.locator('[data-panel-help-action="plan"]').count(), role === 'owner' ? 1 : 0);
      if (role !== 'owner') assert.match(await body.textContent(), /Somente o proprietário/);
      await topic('aplicativo'); await body.locator('[data-panel-help-action="app"]').click();
      assert.equal(await page.locator('body').getAttribute('data-panel-route'), 'account');
      assert.equal(await page.locator('#panelInstallApp').isVisible(), true);
      if (role === 'owner' && offer === 'cardapio') {
        await topic('pedidos');
        const link = body.locator('[data-panel-help-action="upgrade"]'), href = new URL(await link.getAttribute('href'));
        assert.equal(href.searchParams.get('secao'), 'configuracoes');
        assert.equal(href.searchParams.get('env'), 'production'); // Fixture's resolved environment wins over an arbitrary URL query.
        assert.equal(href.hash, '#subscriptionCenter');
        await page.screenshot({ path: `${out}/cardapio-upgrade-${width}.png` });
        await link.click();
        assert.equal(await page.locator('body').getAttribute('data-panel-route'), 'account');
        assert.equal(await page.locator('[data-alternative-plan="encomendas"]').isVisible(), true);
      }
      if (role === 'owner' && offer === 'encomendas') {
        await topic('vendas'); await body.locator('[data-panel-help-action="sales"]').click();
        assert.equal(await page.locator('body').getAttribute('data-panel-route'), 'sales');
      }
      assert.equal(await page.evaluate(() => window.__assistantBillingChanges.length), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(f.errors, []);
      results.push({ width, offer, role, correctGuidanceAndLinks: true, noPlanMutation: true });
      await f.context.close();
    }
    const live = await fixture('cardapio', 'owner', 390);
    await live.topic('vendas');
    await live.page.evaluate(() => { window.__assistantBlock = true; window.__assistantOffer = 'encomendas'; window.dispatchEvent(new Event('ogritech:offer-changed')); });
    await live.body.getByText(/Ainda não consegui confirmar seu plano e perfil/).waitFor();
    assert.equal(await live.body.locator('[data-panel-help-action]').count(), 0);
    await live.page.waitForFunction(() => typeof window.__releaseAssistantContext === 'function');
    await live.page.evaluate(() => window.__releaseAssistantContext());
    await live.body.locator('[data-panel-help-action="sales"]').waitFor();
    await live.page.evaluate(() => { window.__assistantOffer = 'cardapio'; window.dispatchEvent(new Event('ogritech:offer-changed')); });
    await live.body.locator('[data-panel-help-action="upgrade"]').waitFor();
    await live.page.evaluate(() => {
      const state = window.OgritechMenuWorkspace.state;
      window.__originalHelpState = state;
      window.OgritechMenuWorkspace.state = () => ({ ...state(), role: 'admin' });
    });
    await live.body.locator('[data-panel-help-action="upgrade"]').click();
    assert.equal(await live.body.locator('[data-panel-help-action="upgrade"]').count(), 0);
    assert.match(await live.body.textContent(), /Peça ao proprietário/);
    await live.page.evaluate(() => { window.OgritechMenuWorkspace.state = window.__originalHelpState; window.dispatchEvent(new Event('ogritech:menu-context-changed')); });
    await live.topic('produtos'); await live.body.locator('[data-panel-help-action="products"]').click();
    await live.page.locator('[data-edit-menu-item]').first().click();
    await live.page.locator('#menuItemName').fill('Alteração ainda não salva');
    await live.topic('pedidos');
    live.page.once('dialog', dialog => dialog.dismiss());
    await live.body.locator('[data-panel-help-action="upgrade"]').click();
    assert.equal(await live.page.locator('body').getAttribute('data-panel-route'), 'products');
    assert.equal(await live.page.locator('#menuItemName').inputValue(), 'Alteração ainda não salva');
    assert.deepEqual(live.errors, []); await live.context.close();
    for (const offer of ['cardapio', 'encomendas']) {
      const first = await fixture(offer, 'owner', 390, true);
      await first.topic('produtos');
      assert.match(await first.body.textContent(), /Primeiro, abra Cardápio e escolha o modelo/);
      await first.body.locator('[data-panel-help-action="start"]').click();
      assert.equal(await first.page.locator('#menuTemplateForm').isVisible(), true);
      assert.deepEqual(first.errors, []); await first.context.close();
    }
    results.push({ livePlanChange: true, loadingFailsClosed: true, staleActionRechecked: true, unsavedProductProtected: true, initialSetupRespected: true });
    fs.writeFileSync(`${out}/result.json`, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; server.close(); });
