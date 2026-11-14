import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Real public markup and styles, with all services replaced by local fixtures.
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = resolve(root, 'outputs/menu-light-theme');
const origin = 'https://menu-theme.ogritech.invalid';
await mkdir(output, {recursive: true});
const report = {scenarios: [], errors: [], externalRequests: []};
const browser = await chromium.launch({headless: true, executablePath: process.env.OGRITECH_BROWSER_PATH || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined)});

async function checkStyles(page, selectors, surfaces = []) {
  const result = await page.evaluate(({selectors, surfaces}) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const rgb = color => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    };
    const background = el => {
      if (!el) return [255, 255, 255];
      const c = rgb(getComputedStyle(el).backgroundColor), a = c[3] / 255;
      const parent = a < 1 ? background(el.parentElement) : [];
      return c.slice(0, 3).map((v, i) => v * a + (parent[i] || 0) * (1 - a));
    };
    const luminance = c => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = selectors.flatMap(selector => [...document.querySelectorAll(selector)].map(el => {
      const style = getComputedStyle(el), bg = background(el), fg = rgb(style.color);
      const a = luminance(fg), b = luminance(bg);
      return {selector, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05)};
    }));
    const panels = surfaces.map(selector => {
      const el = document.querySelector(selector), style = getComputedStyle(el);
      return {selector, scheme: style.colorScheme, lightness: luminance(background(el)), image: style.backgroundImage};
    });
    return {contrast, panels, overflow: document.documentElement.scrollWidth > innerWidth + 1};
  }, {selectors, surfaces});
  assert.equal(result.overflow, false, 'No horizontal overflow');
  for (const check of result.contrast) assert.ok(check.ratio >= 4.5, `${check.selector}: contrast ${check.ratio.toFixed(2)}`);
  for (const check of result.panels) {
    assert.equal(check.scheme, 'light', `${check.selector} follows catalog scheme`);
    assert.ok(check.lightness > .7, `${check.selector} has a light surface`);
    assert.equal(check.image, 'none', `${check.selector} has no legacy dark gradient`);
  }
  return result.contrast.length;
}

try {
  for (const width of [320, 390, 1440]) for (const offer of ['cardapio', 'encomendas']) for (const accent of ['#f8a8d3', '#ffffff', '#000000']) {
    const colorScheme = accent === '#ffffff' ? 'light' : 'dark';
    const context = await browser.newContext({viewport: {width, height: 900}, colorScheme, reducedMotion: 'reduce', serviceWorkers: 'block'});
    await context.addInitScript(({offer, accent, origin}) => {
      window.ogritechEnvironmentUrl = path => new URL(path, location.origin).href;
      window.__calls = [];
      Object.defineProperty(navigator, "clipboard", {value: {writeText: async text => { window.__copiedPix = text; }}, configurable: true});
      const item = {id: 'item', name: 'Brigadeiro Cremoso', description: 'Chocolate e leite condensado', prices: [{id: 'price', label: 'Padrão', price: 14.9}], option_groups: [{id: 'group', name: 'Escolha a cobertura', selection_type: 'single', minimum_selections: 1, maximum_selections: 1, options: [{id: 'option', name: 'Granulado', price_delta: 0}]}]};
      window.supabaseClient = {
        rpc: async (name, args) => {
          window.__calls.push({name, args});
          if (name === 'public_menu') return {data: {menu: {title: 'Loja de teste', offer_code: offer, whatsapp_phone: '5511999999999', accepts_pickup: true, accepts_delivery: true, payment_methods: ['pix'], pix_key: 'fixture@example.invalid', pix_amount_city: 'SAO PAULO', visual_identity: {primary_color: '#a21d44', accent_color: accent, customized: true}}, delivery_zones: [{code: 'centro', name: 'Centro', fee: 5}], categories: [{id: 'category', name: 'Doces', items: [item]}]}};
          if (name === 'public_menu_assistant_status') return {data: {available: true}};
          if (name === 'public_menu_assistant_message') return {data: {reply: 'Confira esta opção.', suggestions: [{menu_item_price_id: 'price', name: item.name, label: 'Padrão', price: 14.9, requires_confirmation: true}]}};
          if (name === 'public_create_menu_order_v2') return {data: {reference: 'TEST1234', token: 'local-fixture', order_number: 1, subtotal: 29.8, delivery_fee: 5, total_amount: 34.8}};
          if (name === 'public_get_menu_order') return {data: {reference: 'TEST1234', order_number: 1, menu_title: 'Loja de teste', whatsapp_phone: '5511999999999', customer_name: 'Cliente de teste', customer_phone: '11999999999', fulfillment_type: 'delivery', status: 'received', payment_status: 'pending', subtotal: 29.8, delivery_fee: 5, total_amount: 34.8, items: [{name: item.name, label: 'Padrão', quantity: 2, line_total: 29.8}]}};
          throw new Error(`Unexpected fixture call ${name}`);
        },
        functions: {invoke: async () => ({data: {data: {delivery_quote: {zone_code: 'centro', fee: 5, distance_km: 2}}}})}
      };
      window.OGRITECH_SUPABASE_URL = origin;
    }, {offer, accent, origin});
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) { report.externalRequests.push(url.href); return route.abort(); }
      const pathname = decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname);
      const target = resolve(root, '.' + pathname);
      if (!target.startsWith(root + sep)) return route.fulfill({status: 403});
      try {
        let body = await readFile(target);
        const contentType = {'.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon'}[extname(target)] || 'application/octet-stream';
        if (contentType === 'text/html') body = Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, tag => /https:|supabase-config/.test(tag) ? '' : tag));
        await route.fulfill({body, contentType});
      } catch { await route.fulfill({status: 404}); }
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/cardapio/?empresa=diniz-doces', {waitUntil: 'networkidle'});
    let checks = 0;
    if (offer === 'encomendas') {
      await page.click('#menuAssistantToggle');
      await page.fill('#menuAssistantInput', 'Quero brigadeiro');
      await page.locator('#menuAssistantForm button').click();
      await page.locator('.assistant-suggestion').waitFor();
      checks += await checkStyles(page, ['.assistant-message', '.assistant-suggestion-name', '.assistant-suggestion-detail', '.assistant-suggestion-price', '.assistant-suggestion button', '.menu-assistant-heading h2', '.menu-assistant-heading small', '#menuAssistantInput', '#menuAssistantForm label', '#menuAssistantNotice', '#menuAssistantForm button'], ['#menuAssistantPanel', '.menu-assistant-heading', '.menu-assistant-messages', '.assistant-suggestion', '#menuAssistantForm']);
      if (accent === '#f8a8d3') await page.locator('#menuAssistantPanel').screenshot({path: resolve(output, `assistant-${width}.png`)});
      await page.click('#menuAssistantClose');
    }
    await page.click('[data-add-selected]');
    await page.locator('#configurator').waitFor({state: 'visible'});
    await page.locator('#configuratorGroups input').check();
    checks += await checkStyles(page, ['#configuratorTitle', '#configurator legend', '#configurator legend small', '#configurator fieldset label', '#configuratorForm > button'], ['#configurator', '.configurator-heading', '#configurator fieldset', '#configurator fieldset label']);
    if (accent === '#f8a8d3') await page.locator('#configurator').screenshot({path: resolve(output, `customize-${width}.png`)});
    await page.locator('#configuratorForm > button').click();
    await page.click('#menuBagButton');
    await page.locator('#cartReview').waitFor({state: 'visible'});
    await page.locator('[data-cart-increase]').click();
    assert.equal(await page.locator('#cartCount').textContent(), '2');
    checks += await checkStyles(page, ['#cartBar', '#cartBar button', '#cartReviewTitle', '.cart-item-copy strong', '.cart-item-copy span', '.cart-item-copy small', '.cart-quantity output', '[data-cart-increase]', '.cart-remove', '.cart-item-controls > strong', '.cart-review-footer span', '#cartReviewTotal', '.cart-review-actions .public-button:not(.hidden)'], ['#cartBar', '#cartReview', '.cart-review-heading', '.cart-quantity']);
    if (accent === '#f8a8d3') await page.locator('#cartReview').screenshot({path: resolve(output, `bag-${offer}-${width}.png`)});
    if (offer === 'cardapio') {
      assert.equal(await page.locator('#checkout').isVisible(), false);
      assert.equal(await page.locator('#whatsappSelectionLink').getAttribute('href'), null);
      await page.fill('#whatsappCustomerName','Cliente de teste');
      await page.fill('#whatsappCustomerPhone','11999999999');
      assert.match(await page.locator('#whatsappSelectionLink').getAttribute('href'), /^https:\/\/wa.me\//);
      assert.match(new URL(await page.locator('#whatsappSelectionLink').getAttribute('href')).searchParams.get('text'), /Nome: Cliente de teste\nTelefone: 11999999999/);
    } else {
      await page.click('#proceedCheckoutButton');
      assert.equal(await page.locator('#orderForm [name=email]').count(),0);
      await page.selectOption('#fulfillment', 'delivery');
      await page.fill('#deliveryCep', '14000000');
      await page.fill('#deliveryAddress', 'Rua de Teste, 123');
      await page.click('#calculateDeliveryButton');
      await page.locator('#deliveryQuote').waitFor({state: 'visible'});
      checks += await checkStyles(page, ['#orderForm label', '#orderForm input:not([type=checkbox])', '#orderForm select', '#orderForm textarea', '#orderForm .public-button', '.checkout-estimate > div', '.checkout-estimate strong', '.checkout-estimate p', '.order-confirmation-notice', '.delivery-quote small', '.delivery-quote strong', '.delivery-quote span', '#cepMessage'], ['#checkout', '.checkout-estimate', '.order-confirmation-notice', '.delivery-quote']);
      if (accent === '#f8a8d3') await page.locator('#checkout').screenshot({path: resolve(output, `checkout-${width}.png`)});
      await page.fill('[name=name]', 'Cliente de teste');
      await page.fill('[name=phone]', '11999999999');
      await page.check('[name=privacy]');
      await page.click('#orderSubmitButton');
      await page.locator('#orderSuccess').waitFor({state: 'visible'});
      const confirmationStyle = await page.locator('#orderSuccess').evaluate(el => ({
        background:getComputedStyle(el).backgroundColor,
        button:getComputedStyle(el.querySelector('.order-whatsapp-action')).backgroundColor,
        headingSize:parseFloat(getComputedStyle(el.querySelector('h2')).fontSize),
        font:getComputedStyle(el).fontFamily,
        merchantAccent:getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
      }));
      assert.equal(confirmationStyle.background,'rgb(255, 255, 255)');
      assert.equal(confirmationStyle.button,'rgb(8, 185, 211)');
      assert.ok(confirmationStyle.headingSize>=22 && confirmationStyle.headingSize<=28);
      assert.match(confirmationStyle.font,/ui-sans-serif/);
      assert.equal(confirmationStyle.merchantAccent,accent);
      assert.match(await page.locator('.order-pix-payment textarea').inputValue(),/^000201/);
      if (accent === '#f8a8d3') {
        await page.locator('#orderSuccess').evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));
        await page.locator('#orderSuccess').screenshot({path: resolve(output, `success-${width}.png`)});
      }
      await page.click('#copyOrderPixKey');
      await page.waitForFunction(()=>Boolean(window.__copiedPix));
      assert.equal(await page.evaluate(()=>window.__copiedPix),await page.locator('.order-pix-payment textarea').inputValue());
      assert.match(await page.locator('#copyOrderPixStatus').textContent(),/copiado/);

      checks += await checkStyles(page, ['.order-success h2', '.order-success h3', '.order-total-box span', '.order-total-box strong', '.order-success small', '.order-code-box span', '.order-code-box strong', '.order-payment-alert strong', '.order-payment-alert p', '.order-payment-alert b', '.order-payment-alert label', '.order-payment-alert textarea', '.order-success .public-button', '.order-success-note'], ['#orderSuccess', '.order-code-box', '.order-payment-alert', '.order-payment-alert textarea']);
      assert.equal(await page.evaluate(() => window.__calls.filter(c => c.name.startsWith('public_create_menu_order')).length), 1);
      assert.equal(await page.evaluate(() => window.__calls.find(c => c.name==='public_create_menu_order_v2').args.supplied_email), '');
      assert.match(new URL(await page.locator('.order-whatsapp-action').getAttribute('href')).searchParams.get('text'), /Nome: Cliente de teste\nTelefone: 11999999999/);
      await page.locator('.order-success-actions a.secondary').click();
      await page.locator('.order-summary').waitFor({state: 'visible'});
      assert.match(new URL(await page.locator('.order-whatsapp').getAttribute('href')).searchParams.get('text'), /Nome: Cliente de teste\nTelefone: 11999999999/);
      checks += await checkStyles(page, ['.order-hero h1', '.order-hero small', '.order-hero p', '.order-status', '.payment-status-card strong', '.payment-status-card p', '.order-summary h2', '.order-items .menu-price-row', '.order-items small', '.order-total span', '.proposal-total', '.order-whatsapp', '#refreshOrder', '#orderRefreshMessage'], ['.order-hero', '.order-status', '.payment-status-card', '.order-summary', '.order-contact']);
      if (accent === '#f8a8d3') await page.screenshot({path: resolve(output, `tracking-${width}.png`), fullPage: true});
    }
    assert.equal(await page.evaluate(() => window.__calls.filter(c => c.name.startsWith('public_create_menu_order')).length), 0);
    report.scenarios.push({width, offer, accent, systemScheme: colorScheme, contrastChecks: checks, status: 'passed'});
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.externalRequests, []);
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
