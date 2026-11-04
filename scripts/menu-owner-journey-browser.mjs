import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// The real menu HTML, CSS and controller run against an isolated, stateful fixture.
// Login and authenticated panel routing use their real controllers with fixture Auth.
// Database policy checks belong to their integration suite.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OGRITECH_PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "outputs", "menu-owner-journey");
await mkdir(output, { recursive: true });
const mime = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon" };
const checkNames = ["segment", "identity", "catalog", "fulfillment", "payments", "hours", "test_order", "review"];
let state;

function resetFixture() {
  state = { menu: null, draft: null, calls: [], checks: {}, orders: [], failDraft: false };
}

function onboarding() {
  const next = checkNames.find((key) => !state.checks[key]) || "ready";
  return { exists: Boolean(state.menu), checks: state.checks, next_step: next, completed_count: Object.values(state.checks).filter(Boolean).length, total_count: 8 };
}

function respondToApi({ table, name, args = {}, update, filters, role }) {
  state.calls.push({ table, name, args, role });
  if (table === "online_menus") return { data: state.menu };
  if (table === "profiles") return { data: { id: "user-test", full_name: "Usuário de teste", role, active: true, barbershop_id: "business-test" } };
  if (table === "barbershops") return { data: { name: "Confeitaria de teste", segment: "confectionery" } };
  if (table === "menu_catalog_templates") return { data: [{ code: "confectionery", name: "Confeitaria" }] };
  if (table === "menu_orders") {
    if (update) {
      const order = state.orders.find((entry) => entry.id === filters.id);
      Object.assign(order, update);
      return { data: order };
    }
    return { data: state.orders };
  }
  if (name === "menu_onboarding_status") return { data: onboarding() };
  if (name === "is_platform_admin") return { data: false };
  if (role === "employee") return { error: { code: "42501", message: "Manager access required" } };
  if (name === "apply_menu_catalog_template") {
    state.menu = { id: "menu-test", title: "Confeitaria de teste", slug: args.target_slug, template_code: args.target_template_code, published: false, accepts_pickup: true, accepts_delivery: false, menu_categories: [], menu_delivery_zones: [], accepted_payment_methods: ["pix"], weekly_hours: { weekdays: [1, 2, 3, 4, 5, 6], opens_at: "10:00", closes_at: "18:00", special_hours: [{ weekdays: [0], opens_at: "09:00", closes_at: "13:00" }] } };
    state.checks.segment = true;
  } else if (name === "save_menu_onboarding_settings") {
    const settings = args.settings;
    Object.assign(state.menu, settings, { accepted_payment_methods: settings.payment_methods });
    Object.assign(state.menu.weekly_hours, { weekdays: settings.weekdays, opens_at: settings.opens_at, closes_at: settings.closes_at });
    for (const key of ["identity", "fulfillment", "payments", "hours"]) state.checks[key] = true;
  } else if (name === "save_menu_delivery_zones") {
    state.menu.menu_delivery_zones = args.zones;
  } else if (name === "save_menu_catalog_item") {
    const item = args.payload;
    state.menu.menu_categories = [{ id: "category-test", name: item.category_name, active: true, sort_order: 0, menu_items: [{ ...item, id: "item-test", menu_item_prices: item.prices.map((price) => ({ ...price, active: true })), menu_item_option_groups: [] }] }];
    state.checks.catalog = true;
  } else if (name === "run_menu_test_order") {
    state.checks.test_order = true;
    return { data: { total_amount: 20 } };
  } else if (name === "confirm_menu_review") {
    state.checks.review = true;
  } else if (name === "set_menu_publication") {
    state.menu.published = args.should_publish;
  } else if (name === "menu_catalog_draft_status") {
    return { data: { exists: Boolean(state.draft), payload: state.draft } };
  } else if (name === "save_menu_catalog_draft") {
    if (state.failDraft) return { error: { code: "22023", message: "Falha simulada ao salvar rascunho" } };
    state.draft = structuredClone(args.draft_payload);
  } else if (name === "publish_menu_catalog_draft") {
    state.menu.menu_categories = state.draft.categories;
    state.draft = null;
  } else if (name !== "menu_assistant_admin_settings" && name !== "menu_pilot_metrics") {
    throw new Error(`Unexpected fixture RPC ${name || table}`);
  }
  return { data: {} };
}

const bootstrap = `
const currentRole = new URLSearchParams(location.search).get("role") || sessionStorage.getItem("fixtureRole") || "owner";
sessionStorage.setItem("fixtureRole", currentRole);
const BARBERSHOP_ID = "business-test";
const IS_DEMO = false;
const businessConfig = { name: "Confeitaria de teste" };
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const ogritechEnvironmentUrl = (path) => new URL(path + (path.includes("?") ? "&" : "?") + "env=production", location.origin).href;
window.ogritechEnvironmentUrl = ogritechEnvironmentUrl;
const api = (request) => fetch("/test-api", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...request, role:currentRole})}).then(r=>r.json());
const supabaseClient = {
  auth: {
    async getSession() { return {data:{session:sessionStorage.getItem("fixtureSignedIn") ? {user:{id:"user-test",email:"owner@example.invalid"}} : null}}; },
    async signInWithPassword() { sessionStorage.setItem("fixtureSignedIn", "yes"); return {data:{user:{id:"user-test",email:"owner@example.invalid"}}}; },
    async signOut() { sessionStorage.removeItem("fixtureSignedIn"); return {}; }
  },
  functions: { async invoke() { return {data:{data:{status:"trial",boundary:"2099-01-01T00:00:00Z"}}}; } },
  from(table) {
    const request={table, filters:{}};
    const query={select(){return query},eq(key,value){request.filters[key]=value;return query},order(){return query},limit(){return query},maybeSingle(){return query},single(){return query},update(value){request.update=value;return query},then(resolve,reject){return api(request).then(resolve,reject)}};
    return query;
  },
  rpc(name,args) { return api({name,args}); }
};
document.documentElement.style.visibility="visible";
document.body.classList.add("single-product-panel");
document.getElementById("menuView")?.classList.remove("hidden");
document.getElementById("newAppointment")?.classList.add("hidden");
if(currentRole === "employee") document.querySelectorAll("[data-manager-only]").forEach(el=>el.classList.add("hidden"));
`;

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/test-api") {
      let body = "";
      for await (const chunk of request) body += chunk;
      response.writeHead(200, { "Content-Type": "application/json" });
      return response.end(JSON.stringify(respondToApi(JSON.parse(body))));
    }
    if (url.pathname === "/journey-fixture.js") {
      response.writeHead(200, { "Content-Type": "application/javascript" });
      return response.end(bootstrap);
    }
    if (url.pathname === "/journey-start.js") {
      response.writeHead(200, { "Content-Type": "application/javascript" });
      return response.end("window.journeyReady = window.loadMenuAdmin();");
    }
    const pathname = url.pathname.endsWith("/") ? url.pathname + "index.html" : url.pathname;
    const target = resolve(root, `.${pathname}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("Invalid path");
    let body = await readFile(target);
    if (pathname === "/painel/index.html") {
      body = Buffer.from(body.toString().replace(/<script\b[^>]*src="[^"]*"[^>]*><\/script>/g, "").replace("</body>", '<script src="/journey-fixture.js"></script><script src="/auth.js"></script><script src="/commercial-admin.js"></script><script src="/journey-start.js"></script></body>'));
    }
    if (pathname === "/login/index.html") {
      body = Buffer.from(body.toString().replace(/<script\b[^>]*src="[^"]*"[^>]*><\/script>/g, "").replace("</body>", '<script src="/journey-fixture.js"></script><script src="/login.js"></script></body>'));
    }
    response.writeHead(200, { "Content-Type": `${mime[extname(target)] || "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(body);
  } catch (error) {
    response.writeHead(500);
    response.end(error.message);
  }
});
await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.OGRITECH_BROWSER_PATH ? { executablePath: process.env.OGRITECH_BROWSER_PATH } : {}) });
const results = [];

async function selected(page, key) {
  await page.waitForFunction((value) => document.querySelector(`[data-menu-workspace="${value}"]`)?.getAttribute("aria-selected") === "true", key);
}
async function tab(page, key) {
  await page.locator(`[data-menu-workspace="${key}"]`).click();
  await selected(page, key);
}
async function settled(page) {
  await page.waitForFunction(() => document.getElementById("menuOnboardingPanel").getAttribute("aria-busy") === "false");
}

try {
  for (const viewport of [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }]) {
    resetFixture();
    const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(`${origin}/login/?env=production`);
    await page.locator("#email").fill("owner@example.invalid");
    await page.locator("#password").fill("fixture-password-only");
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForURL("**/painel/?env=production");
    await page.waitForFunction(() => Boolean(window.journeyReady));
    assert.equal(await page.evaluate(() => window.journeyReady), true);
    await selected(page, "start");
    assert.equal(await page.locator("#menuCatalogWorkspace").isVisible(), false);
    await page.screenshot({ path: join(output, `${viewport.name}-start.png`), fullPage: true });
    await page.locator("#menuTemplateCode").selectOption("confectionery");
    await page.locator("#menuTemplateSlug").fill("confeitaria-teste");
    await page.locator('#menuTemplateForm button[type="submit"]').click();
    await selected(page, "settings");
    await settled(page);
    assert.equal(await page.locator("#menuTemplatePanel").isVisible(), false);
    assert.match(await page.locator("#menuWorkspaceMessage").innerText(), /Modelo salvo/);
    await page.screenshot({ path: join(output, `${viewport.name}-settings.png`), fullPage: true });
    await page.locator('#menuSettingsForm button[type="submit"]').click();
    await selected(page, "catalog");
    await settled(page);
    await page.locator("#menuCategoryName").fill("Doces");
    await page.locator("#menuItemName").fill("Brigadeiro");
    await page.locator("[data-price-value]").fill("20");
    await page.locator("#menuItemSubmit").click();
    await page.waitForFunction(() => document.getElementById("menuCatalogList").textContent.includes("Brigadeiro"));
    await settled(page);
    await page.screenshot({ path: join(output, `${viewport.name}-catalog.png`), fullPage: true });
    await tab(page, "review");
    await page.locator("#menuTestOrderButton").click();
    await page.waitForFunction(() => !document.getElementById("menuReviewButton").disabled);
    await page.locator("#menuReviewButton").click();
    await page.waitForFunction(() => !document.getElementById("menuPublicationButton").disabled);
    await page.screenshot({ path: join(output, `${viewport.name}-review.png`), fullPage: true });
    await page.locator("#menuPublicationButton").click();
    await selected(page, "operation");
    await settled(page);
    assert.equal(state.menu.published, true);
    for (const selector of ["#menuJourneyGuide", "#menuJourneyNavigation", "#menuTabStart", "#menuOnboardingChecklist", "#menuTemplatePanel"]) assert.equal(await page.locator(selector).isVisible(), false, selector);
    assert.match(await page.locator("#menuWorkspaceMessage").innerText(), /Cardápio publicado/);
    assert.match(await page.locator("#menuOperationPublicLink").getAttribute("href"), /empresa=confeitaria-teste&env=production/);
    await tab(page, "settings");
    assert.equal(await page.locator("#menuSavedSettingsSummary").isVisible(), true);
    assert.match(await page.locator("#menuSavedSettingsSummary").innerText(), /09:00.*13:00/);
    await tab(page, "catalog");
    state.failDraft = true;
    await page.locator("[data-edit-menu-item]").click();
    await page.locator("#menuCategoryName").fill("Categoria que falhou");
    await page.locator("#menuItemName").fill("Produto que falhou");
    await page.locator("#menuItemSubmit").click();
    await page.waitForFunction(() => document.getElementById("menuWorkspaceMessage").textContent.includes("Falha simulada"));
    await settled(page);
    assert.equal(state.draft, null);
    state.failDraft = false;
    await page.locator("#menuItemCancel").click();
    // Reopening uses the controller's in-memory catalog. It must match saved data.
    await page.locator("[data-edit-menu-item]").click();
    assert.equal(await page.locator("#menuCategoryName").inputValue(), "Doces");
    assert.equal(await page.locator("#menuItemName").inputValue(), "Brigadeiro");
    await page.locator("#menuItemCancel").click();
    await page.locator("[data-edit-menu-item]").click();
    await page.locator("#menuItemName").fill("Brigadeiro especial");
    await page.locator("#menuItemSubmit").click();
    await page.waitForFunction(() => document.getElementById("menuCatalogList").textContent.includes("Brigadeiro especial"));
    await settled(page);
    await selected(page, "catalog");
    assert.equal(state.menu.menu_categories[0].menu_items[0].name, "Brigadeiro");
    assert.equal(state.draft.categories[0].menu_items[0].name, "Brigadeiro especial");
    await tab(page, "review");
    assert.equal(await page.locator("#menuPublicationButton").innerText(), "Publicar alterações");
    await page.locator("#menuPublicationButton").click();
    await page.waitForFunction(() => document.getElementById("menuPublicationButton").disabled);
    await settled(page);
    assert.equal(state.menu.menu_categories[0].menu_items[0].name, "Brigadeiro especial");
    assert.equal(state.menu.published, true);
    const unpublishCalls = () => state.calls.filter((call) => call.name === "set_menu_publication" && !call.args.should_publish).length;
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#menuUnpublishButton").click();
    assert.equal(unpublishCalls(), 0);
    await tab(page, "operation");
    const size = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    assert.ok(size.width <= size.viewport + 1, `Horizontal overflow ${JSON.stringify(size)}`);
    await page.screenshot({ path: join(output, `${viewport.name}-published.png`), fullPage: true });

    state.orders = [{ id: "order-test", public_reference: "TEST-EMPLOYEE", customer_name: "Cliente de teste", status: "received", total_amount: 20, is_test: false }];
    const beforeEmployee = state.calls.length;
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${origin}/login/?role=employee&env=production`);
    await page.locator("#email").fill("employee@example.invalid");
    await page.locator("#password").fill("fixture-password-only");
    await page.locator('#loginForm button[type="submit"]').click();
    await page.waitForURL("**/painel/?env=production");
    await page.waitForFunction(() => Boolean(window.journeyReady));
    assert.equal(await page.evaluate(() => window.journeyReady), true);
    await selected(page, "operation");
    assert.equal(await page.locator("#menuOrdersPanel").isVisible(), true);
    assert.equal(await page.locator("#menuItemForm").isVisible(), false);
    assert.equal(await page.locator("#menuTabCatalog").isVisible(), false);
    assert.equal(state.calls.slice(beforeEmployee).some((call) => call.name === "menu_catalog_draft_status"), false);
    await page.locator('[data-order-status="confirmed"]').click();
    await page.locator('[data-order-status="completed"]').waitFor();
    await page.locator('[data-order-status="completed"]').click();
    await settled(page);
    assert.equal(state.orders[0].status, "completed");
    assert.deepEqual(errors, []);
    results.push({ viewport: viewport.name, ownerAndEmployeeLoginRouting: true, newOwnerPublished: true, publishedDraftReviewed: true, failedDraftRestoresCatalog: true, specialHoursVisible: true, accidentalUnpublishPrevented: true, employeeOrdersCompleted: true, javascriptErrors: 0 });
    await context.close();
  }
} finally {
  await browser.close();
  await new Promise((closed) => server.close(closed));
}
const report = { environment: "isolated local fixture", productionWrites: 0, results };
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
