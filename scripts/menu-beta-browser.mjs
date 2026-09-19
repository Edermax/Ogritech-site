import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OGRITECH_PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "outputs", "menu-beta-7b");
await mkdir(output, { recursive: true });
const plan = JSON.parse(await readFile(join(root, "config/menu-beta-phase-7a.json"), "utf8"));
const source = await readFile(join(root, "cardapio/index.html"), "utf8");
const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => tag.includes('src="cardapio.js"') ? tag : "");
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
await access(edgePath);

const viewports = [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }];
const results = [];
const browser = await chromium.launch({ headless: true, executablePath: edgePath });

try {
  for (const fixture of plan.fixtures) {
    for (const viewport of viewports) {
      const origin = `https://${fixture.slug}.ogritech.invalid`;
      const priceId = `${fixture.segment}-price`;
      const product = fixture.sampleItems[0];
      const menu = {
        menu: { slug: fixture.slug, title: fixture.businessName, description: `Cenário fictício de ${fixture.segment}.`, accepts_pickup: true, accepts_delivery: true, payment_methods: ["pix", "cash"], weekly_hours: { weekdays: [1, 2, 3, 4, 5, 6], opens_at: "10:00", closes_at: "22:00" } },
        delivery_zones: [{ code: "centro", name: "Centro", fee: 5 }],
        categories: [{ id: `${fixture.segment}-category`, name: "Destaques", description: fixture.catalogChecks.join(" · "), items: [{ id: `${fixture.segment}-item`, name: product, description: "Produto demonstrativo, sem venda real.", item_type: "configurable", prices: [{ id: priceId, label: "Padrão", price: 25, promotional_price: null }], option_groups: [{ id: `${fixture.segment}-options`, name: "Escolha obrigatória", selection_type: "single", minimum_selections: 1, maximum_selections: 1, options: [{ id: `${fixture.segment}-option`, name: "Opção demonstrativa", price_delta: 2 }] }] }] }]
      };
      const errors = [], requests = [], calls = [];
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        requests.push(url.href);
        assert.equal(url.origin, origin, "O beta local não pode acessar origem externa");
        if (url.pathname === "/cardapio/") return route.fulfill({ contentType: "text/html", body: html });
        const target = resolve(root, `.${decodeURIComponent(url.pathname)}`);
        if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) return route.fulfill({ status: 403, body: "" });
        try {
          const body = await readFile(target);
          return route.fulfill({ body, contentType: { ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".ico": "image/x-icon" }[extname(target)] || "application/octet-stream" });
        } catch { return route.fulfill({ status: 404, body: "" }); }
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
      await page.addInitScript(({ menuFixture, expectedPriceId, itemName }) => {
        window.ogritechEnvironmentUrl = (path) => new URL(path, location.origin).href;
        window.__betaCalls = [];
        window.supabaseClient = { rpc: async (name, args) => {
          window.__betaCalls.push({ name, args });
          if (name === "public_menu") return { data: menuFixture, error: null };
          if (name === "public_menu_assistant_status") return { data: { available: true, mode: "deterministic", external_model: false }, error: null };
          if (name === "public_menu_assistant_message") return { data: { reply: "Encontrei uma opção no cardápio.", intent: "catalog_search", suggestions: [{ menu_item_price_id: expectedPriceId, name: itemName, label: "Padrão", price: 25, requires_confirmation: true }], action: null, notice: "Confira antes de adicionar." }, error: null };
          if (name === "public_create_menu_order_v2") return { data: { reference: `BETA-${menuFixture.menu.slug}`, token: "token-ficticio" }, error: null };
          throw new Error(`RPC inesperada: ${name}`);
        } };
      }, { menuFixture: menu, expectedPriceId: priceId, itemName: product });

      await page.goto(`${origin}/cardapio/?empresa=${fixture.slug}`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => !document.getElementById("content").classList.contains("hidden"));
      assert.match(await page.locator("#menuTitle").innerText(), /demonstração/);
      assert.match(await page.locator("#catalog").innerText(), new RegExp(product));
      assert.equal(await page.locator("#menuAssistant").isVisible(), true);
      await page.locator("#menuAssistantToggle").click();
      await page.locator("#menuAssistantInput").fill(`Tem ${product}?`);
      await page.locator('#menuAssistantForm button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelector(".assistant-suggestion"));
      assert.equal(await page.locator("#cartCount").innerText(), "0");
      await page.locator(".assistant-suggestion button").click();
      await page.locator("#configuratorGroups input").first().check();
      await page.locator('#configuratorForm button[type="submit"]').click();
      assert.equal(await page.locator("#cartCount").innerText(), "1");
      await page.locator("#menuAssistantClose").click();
      await page.locator("#checkoutButton").click();
      await page.locator('[name="name"]').fill("Cliente Fictício");
      await page.locator('[name="phone"]').fill("11999990000");
      await page.locator('[name="email"]').fill("cliente@beta.invalid");
      await page.locator('[name="privacy"]').check();
      await page.locator("#orderForm button").click();
      await page.waitForFunction(() => document.getElementById("orderMessage").textContent.includes("Pedido recebido"));
      assert.equal(await page.locator("#cartCount").innerText(), "0");
      const layout = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(layout.content <= layout.viewport + 1, `Overflow em ${fixture.segment}/${viewport.name}: ${JSON.stringify(layout)}`);
      assert.deepEqual(errors, [], `Erros no navegador em ${fixture.segment}/${viewport.name}`);
      assert.equal(new Set(requests.map((value) => new URL(value).origin)).size, 1);
      const observed = await page.evaluate(() => window.__betaCalls);
      assert.equal(observed.filter((call) => call.name === "public_menu_assistant_message").length, 1);
      assert.equal(observed.filter((call) => call.name === "public_create_menu_order_v2").length, 1);
      assert.equal(observed.find((call) => call.name === "public_create_menu_order_v2").args.accepted_privacy, true);
      const screenshot = `${fixture.segment}-${viewport.name}.png`;
      await page.screenshot({ path: join(output, screenshot), fullPage: true });
      results.push({ segment: fixture.segment, templateCode: fixture.templateCode, viewport: viewport.name, status: "passed", pageContent: true, errorOverlay: false, javascriptErrors: 0, externalOrigins: 0, ordersCreated: 1, screenshot });
      await context.close();
    }
  }
} finally { await browser.close(); }

assert.equal(results.length, 8);
assert.ok(results.every((result) => result.status === "passed"));
const report = { executedAt: new Date().toISOString(), phase: "7B", environment: "local-only", dataMode: "in-memory synthetic fixtures", segments: plan.fixtures.length, viewports: viewports.map((viewport) => viewport.name), scenarios: results.length, passed: results.length, failed: 0, externalCalls: 0, remoteDatabaseCalls: 0, paidAiCalls: 0, humanParticipants: 0, cleanup: "browser contexts closed; fixture state discarded", results };
await writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
