import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OGRITECH_PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "outputs");
await mkdir(output, { recursive: true });
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
await access(edgePath);
const source = await readFile(join(root, "painel/index.html"), "utf8");
const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag) => tag.includes('src="subscription-admin.js"') ? tag : "");
const origin = "https://assinaturas.ogritech.invalid";
const calls = [];
const state = {
  products: [
    { code: "agenda", name: "Ogritech Agenda", description: "Agenda do negócio.", plans: [{ id: "agenda-plan", name: "Essencial", monthly_fee: 97 }], modules: [] },
    { code: "menu", name: "Ogritech Cardápio", description: "Canal próprio de vendas.", plans: [{ id: "menu-plan", name: "Essencial", monthly_fee: 0 }], modules: [{ id: "reports", name: "Relatórios", description: "Indicadores adicionais." }] }
  ],
  subscriptions: [{ id: "agenda-sub", product_code: "agenda", product_name: "Ogritech Agenda", plan_id: "agenda-plan", status: "active", base_amount: 97, cancel_at_period_end: false, current_period_end: "2026-10-09T12:00:00Z", modules: [] }]
};
const errors = [];
const browser = await chromium.launch({ headless: true, executablePath: edgePath });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    assert.equal(url.origin, origin);
    if (url.pathname === "/painel/") return route.fulfill({ contentType: "text/html", body: html });
    const target = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) return route.fulfill({ status: 403 });
    try { return route.fulfill({ body: await readFile(target), contentType: { ".js": "application/javascript", ".css": "text/css" }[extname(target)] || "application/octet-stream" }); }
    catch { return route.fulfill({ status: 404 }); }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
  await page.addInitScript((fixture) => {
    window.IS_DEMO = false; window.BARBERSHOP_ID = "business-fixture"; window.currentRole = "owner";
    window.escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    window.renderSettings = () => {};
    window.confirm = () => true; window.prompt = () => "Teste local";
    window.supabaseClient = { rpc: async (name, args) => {
      window.__calls.push({ name, args });
      if (name === "business_subscription_center") return { data: structuredClone(window.__state), error: null };
      if (name === "business_portability_export") return { data: { schema_version: 1, business: { id: "business-fixture" } }, error: null };
      const subscription = window.__state.subscriptions.find((item) => item.product_code === args.target_product_code);
      if (name === "self_service_product_subscription" && args.target_action === "cancel") subscription.cancel_at_period_end = true;
      if (name === "self_service_product_subscription" && args.target_action === "reactivate") subscription.cancel_at_period_end = false;
      if (name === "self_service_product_subscription" && args.target_action === "subscribe") window.__state.subscriptions.push({ id: "menu-sub", product_code: "menu", product_name: "Ogritech Cardápio", plan_id: "menu-plan", status: "active", base_amount: 0, cancel_at_period_end: false, modules: [] });
      return { data: {}, error: null };
    }};
    window.__state = fixture; window.__calls = [];
  }, state);
  await page.goto(`${origin}/painel/`, { waitUntil: "networkidle" });
  await page.locator(".view-section").evaluateAll((elements) => elements.forEach((element) => element.classList.add("hidden")));
  await page.locator("#settingsView").evaluate((element) => element.classList.remove("hidden"));
  assert.equal(await page.evaluate(() => typeof window.loadSubscriptionCenter), "function", "subscription script loaded");
  await page.evaluate(() => window.loadSubscriptionCenter());
  await page.waitForTimeout(500);
  if (errors.length) throw new Error(`Browser initialization failed: ${errors.join(" | ")}`);
  assert.ok((await page.evaluate(() => window.__calls.length)) > 0, JSON.stringify(await page.evaluate(() => ({ demo: window.IS_DEMO, business: window.BARBERSHOP_ID, role: window.currentRole, center: Boolean(document.getElementById("subscriptionCenter")) }))));
  await page.waitForFunction(() => document.querySelectorAll("[data-subscription-action]").length === 3);
  await page.locator('[data-product="menu"][data-subscription-action="subscribe"]').click();
  await page.waitForFunction(() => document.querySelector('[data-product="menu"][data-subscription-action="cancel"]'));
  await page.locator('[data-product="agenda"][data-subscription-action="cancel"]').click();
  await page.waitForFunction(() => document.querySelector('[data-product="agenda"][data-subscription-action="reactivate"]'));
  await page.locator('[data-product="agenda"][data-subscription-action="reactivate"]').click();
  await page.locator("#exportBusinessData").click();
  await page.waitForFunction(() => window.__calls.some((call) => call.name === "business_portability_export"));
  assert.match(await page.locator("#subscriptionMessage").innerText(), /Exportação concluída/);
  assert.deepEqual(errors, []);
  const observed = await page.evaluate(() => window.__calls);
  assert.equal(observed.filter((call) => call.name === "self_service_product_subscription").length, 3);
  await page.screenshot({ path: join(output, "subscription-center-desktop.png"), fullPage: true });
  const report = { executedAt: new Date().toISOString(), environment: "local-only", checks: ["subscribe", "isolated cancellation", "reactivation", "JSON export", "no JavaScript errors"], errors, screenshot: "subscription-center-desktop.png" };
  await writeFile(join(output, "subscription-center-ui-smoke.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
