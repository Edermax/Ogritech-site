import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.OGRITECH_PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "outputs", "menu-staging-7f");
await mkdir(output, { recursive: true });
const mime = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".ico": "image/x-icon" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const target = resolve(root, `.${normalize(relative)}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error("invalid path");
    const body = await readFile(target);
    response.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(body);
  } catch { if (!response.headersSent) response.writeHead(404); response.end("Not found"); }
});
await new Promise((resolveReady) => server.listen(0, "127.0.0.1", resolveReady));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const slug = "fase-7f-cardapio-sintetico";
const segments = [
  { code: "pizzeria", product: "Pizza Marguerita", price: 25 },
  { code: "snack_bar", product: "X-Salada", price: 28 },
  { code: "restaurant", product: "Marmita Executiva", price: 30 },
  { code: "confectionery", product: "Bolo de Chocolate", price: 35 }
];
const viewports = [{ name: "desktop", width: 1440, height: 1000 }, { name: "mobile", width: 390, height: 844 }];
const results = [];
const browser = await chromium.launch({ headless: true, executablePath: edgePath });

try {
  for (const segment of segments) {
    for (const viewport of viewports) {
      const errors = [], responses = [];
      const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (entry) => { if (entry.type() === "error") errors.push(entry.text()); });
      page.on("response", (response) => responses.push({ url: response.url(), status: response.status() }));
      await page.goto(`${baseUrl}/cardapio/?empresa=${slug}&env=staging`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => !document.getElementById("content").classList.contains("hidden"));
      assert.equal(await page.locator("#ogritechStagingBadge").innerText(), "STAGING — DADOS DE TESTE");
      assert.match(await page.locator("#menuTitle").innerText(), /homologação sintética/);
      assert.equal(await page.locator("#menuAssistant").isVisible(), true);
      await page.locator("#menuAssistantToggle").click();
      await page.locator("#menuAssistantInput").fill(`Tem ${segment.product}?`);
      await page.locator('#menuAssistantForm button[type="submit"]').click();
      await page.waitForFunction(() => document.querySelectorAll(".assistant-message").length >= 3);
      await page.locator("#menuAssistantClose").click();
      const card = page.locator(".menu-item-card").filter({ hasText: segment.product });
      await card.locator("[data-add]").click();
      assert.equal(await page.locator("#cartCount").innerText(), "1");
      await page.locator("#checkoutButton").click();
      const ordinal = results.length + 1;
      await page.locator('[name="name"]').fill(`Cliente Sintético ${ordinal}`);
      await page.locator('[name="phone"]').fill(`1690000${String(ordinal).padStart(4, "0")}`);
      await page.locator('[name="email"]').fill(`cliente-${ordinal}@fase7f.invalid`);
      await page.locator('[name="privacy"]').check();
      await page.locator("#orderSubmitButton").click();
      await page.waitForFunction(() => document.getElementById("orderMessage").textContent.includes("Pedido recebido"));
      const trackingUrl = await page.locator("#orderMessage a").getAttribute("href");
      assert.match(trackingUrl, /env=staging/);
      await page.goto(trackingUrl, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.body.textContent.includes("Recebido"));
      assert.match(await page.locator("body").innerText(), new RegExp(`R\\$\\s*${segment.price.toFixed(2).replace(".", "[,.]")}`));
      const layout = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(layout.content <= layout.viewport + 1, `Overflow em ${segment.code}/${viewport.name}`);
      assert.deepEqual(errors, [], `Erros no navegador em ${segment.code}/${viewport.name}: ${errors.join(" | ")}`);
      assert.equal(responses.some(({ url, status }) => url.includes("fuesdztsvrkkgnbqhcxi.supabase.co") && status >= 400), false);
      const screenshot = `${segment.code}-${viewport.name}.png`;
      await page.screenshot({ path: join(output, screenshot), fullPage: true });
      results.push({ segment: segment.code, viewport: viewport.name, product: segment.product, expectedTotal: segment.price, status: "passed", orderStatus: "Recebido", javascriptErrors: 0, screenshot });
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

assert.equal(results.length, 8);
const report = { executedAt: new Date().toISOString(), phase: "7F", environment: "staging", fixtureSlug: slug, scenarios: results.length, passed: results.length, failed: 0, segments: 4, viewports: 2, assistantMode: "deterministic", paidAiCallsAuthorized: false, productionCalls: 0, results };
await writeFile(join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
