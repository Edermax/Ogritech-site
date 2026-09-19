// Browser integration of the real menu admin HTML/CSS/JS with an in-memory RPC fixture.
// This does not authenticate, contact Supabase, or validate the database contract.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const playwrightModule = process.env.OGRITECH_PLAYWRIGHT_MODULE || "playwright";
const { chromium } = require(playwrightModule);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "outputs");
await mkdir(output, { recursive: true });
const originalHtml = await readFile(join(root, "painel/index.html"), "utf8");
const html = originalHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => tag.includes('src="commercial-admin.js"') ? tag : "");
const origin = "https://onboarding.ogritech.invalid";
const allChecks = { segment: true, identity: true, catalog: true, fulfillment: true, payments: true, hours: true, test_order: true, review: true };
const state = {
  menu: {
    id: "menu-fixture", title: "Pizzaria Centro — demonstração", slug: "pizzaria-centro", template_code: "pizzeria", description: "Pizzas artesanais e retirada no bairro.", published: false,
    accepts_pickup: true, accepts_delivery: true, minimum_order: 30, delivery_fee: 5,
    visual_identity: { primary_color: "#123456", accent_color: "#f59e0b" },
    accepted_payment_methods: ["pix", "cash"], weekly_hours: { weekdays: [1, 2, 3, 4, 5, 6], opens_at: "18:00", closes_at: "23:00" },
    menu_delivery_zones: [{ code: "centro", name: "Centro", fee: 7, minimum_order: 30, active: true }],
    menu_categories: [{ id: "category-fixture", name: "Pizzas", active: true, sort_order: 0, menu_items: [{ id: "item-fixture", name: "Marguerita", active: true, available: true, menu_item_prices: [{ label: "Grande", price: 50, promotional_price: 45, active: true }] }] }]
  },
  orders: [], templates: [{ code: "pizzeria", name: "Pizzaria" }],
  status: { exists: true, next_step: "identity", completed_count: 3, total_count: 8, checks: { ...allChecks, identity: false, payments: false, hours: false, test_order: false, review: false } }
};
const calls = [];
const errors = [];
const requests = [];
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
await access(edgePath);
const browser = await chromium.launch({ headless: true, executablePath: edgePath });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    assert.equal(url.origin, origin, "Smoke must not contact an external service");
    if (url.pathname === "/painel/") return route.fulfill({ contentType: "text/html", body: html });
    const target = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) return route.fulfill({ status: 403, body: "" });
    try {
      const body = await readFile(target);
      const contentType = { ".css": "text/css", ".js": "application/javascript", ".png": "image/png", ".jpeg": "image/jpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" }[extname(target)] || "application/octet-stream";
      return route.fulfill({ body, contentType });
    } catch { return route.fulfill({ status: 404, body: "" }); }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.exposeFunction("smokeRead", (table) => ({ data: structuredClone({ online_menus: state.menu, menu_orders: state.orders, menu_catalog_templates: state.templates }[table]), error: null }));
  await page.exposeFunction("smokeRpc", (name, args) => {
    calls.push({ name, args });
    assert.equal(args.target_barbershop_id, "business-fixture");
    if (name === "menu_onboarding_status") return { data: structuredClone(state.status), error: null };
    if (name === "save_menu_onboarding_settings") {
      const settings = args.settings;
      Object.assign(state.menu, { ...settings, accepted_payment_methods: settings.payment_methods, weekly_hours: { weekdays: settings.weekdays, opens_at: settings.opens_at, closes_at: settings.closes_at } });
      state.menu.menu_delivery_zones = [{ ...settings.delivery_zone, active: true }];
      state.status = { ...state.status, next_step: "test_order", completed_count: 6, checks: { ...allChecks, test_order: false, review: false } };
    } else if (name === "run_menu_test_order") {
      state.orders.push({ id: "test-fixture", public_reference: "TESTE-LOCAL", customer_name: "Pedido de teste Ogritech", status: "completed", is_test: true, total_amount: 45 });
      state.status = { ...state.status, next_step: "review", completed_count: 7, checks: { ...allChecks, review: false } };
      return { data: { total_amount: 45, reference: "TESTE-LOCAL" }, error: null };
    } else if (name === "confirm_menu_review") {
      state.status = { ...state.status, next_step: "ready", completed_count: 8, checks: { ...allChecks } };
    } else if (name === "set_menu_publication") state.menu.published = args.should_publish;
    else throw new Error(`Unexpected RPC: ${name}`);
    return { data: structuredClone(state.status), error: null };
  });
  await page.addInitScript(() => {
    window.BARBERSHOP_ID = "business-fixture";
    window.IS_DEMO = false;
    window.businessConfig = { name: "Pizzaria Centro — demonstração" };
    window.escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    window.ogritechEnvironmentUrl = (path) => new URL(path, location.origin).href;
    window.supabaseClient = {
      rpc: (name, args) => window.smokeRpc(name, args),
      from(table) {
        const query = { select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { return query; }, then(resolve, reject) { return window.smokeRead(table).then(resolve, reject); } };
        return query;
      }
    };
    document.addEventListener("DOMContentLoaded", () => {
      document.querySelectorAll(".view-section").forEach((view) => view.classList.add("hidden"));
      document.getElementById("menuView").classList.remove("hidden");
      document.getElementById("tenantName").textContent = "Pizzaria Centro (teste)";
      window.loadMenuAdmin();
    });
  });
  await page.goto(`${origin}/painel/`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.getElementById("menuOnboardingBar").value === 3);
  await page.locator("#menuTitle").fill("Pizzaria Centro — configuração salva");
  assert.equal(await page.locator("#menuPublicationButton").isDisabled(), true);
  await page.locator('#menuSettingsForm button[type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById("menuTestOrderButton").disabled);
  assert.equal(state.menu.title, "Pizzaria Centro — configuração salva");
  assert.equal(await page.locator("#menuZoneCode").getAttribute("readonly"), "");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !document.getElementById("menuTestOrderButton").disabled);
  assert.equal(await page.locator("#menuTitle").inputValue(), state.menu.title);
  await page.locator("#menuTestOrderButton").click();
  await page.waitForFunction(() => !document.getElementById("menuReviewButton").disabled);
  assert.match(await page.locator("#menuOrdersList").innerText(), /sem cobrança real/);
  await page.locator("#menuReviewButton").click();
  await page.waitForFunction(() => !document.getElementById("menuPublicationButton").disabled);
  await page.locator("#menuView").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, "menu-onboarding-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#menuOnboardingPanel").scrollIntoViewIfNeeded();
  const layout = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(layout.content <= layout.viewport + 1, `Horizontal overflow: ${JSON.stringify(layout)}`);
  await page.screenshot({ path: join(output, "menu-onboarding-mobile.png"), fullPage: true });
  await page.locator("#menuPublicationButton").click();
  await page.waitForFunction(() => document.getElementById("menuPublicationButton").textContent === "Despublicar cardápio" && !document.getElementById("menuPublicationButton").disabled);
  assert.equal(state.menu.published, true);
  assert.equal(await page.locator("#menuTitle").isDisabled(), true);
  assert.equal(await page.locator("#menuPublicLink").isVisible(), true);
  await page.locator("#menuPublicationButton").click();
  await page.waitForFunction(() => !document.getElementById("menuTitle").disabled);
  assert.equal(state.menu.published, false);
  assert.equal(calls.filter((call) => call.name === "run_menu_test_order").length, 1);
  assert.deepEqual(errors, [], "Browser errors");
  const report = { executedAt: new Date().toISOString(), mode: "real HTML/CSS/JS with in-memory RPC fixture; no authenticated backend", environment: "local-only", checks: ["configuration save", "reload persistence", "dirty publication guard", "test order", "review", "publish and unpublish", "mobile width", "no JavaScript errors"], viewports: ["1440x1000", "390x844"], errors, networkOrigins: [...new Set(requests.map((url) => new URL(url).origin))], screenshots: ["menu-onboarding-desktop.png", "menu-onboarding-mobile.png"] };
  await writeFile(join(output, "menu-onboarding-ui-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
