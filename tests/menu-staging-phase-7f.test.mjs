import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);

test("fase 7F aprova oito jornadas em staging e termina sem resíduos", async () => {
  const [result, browser] = await Promise.all([
    readJson("config/menu-staging-phase-7f-result.json"),
    readJson("outputs/menu-staging-7f/report.json")
  ]);
  assert.equal(result.status, "passed_synthetic_staging_homologation");
  assert.equal(result.migrationsLocal, 60);
  assert.equal(result.migrationsRemote, 60);
  assert.equal(result.schemaChangesApplied, 0);
  assert.equal(result.scenariosPassed, 8);
  assert.equal(result.ordersReceived, 8);
  assert.equal(result.uniqueRequestIds, 8);
  assert.equal(result.priceDivergences, 0);
  assert.equal(result.javascriptErrors, 0);
  assert.equal(result.syntheticBusinessesRemaining, 0);
  assert.equal(result.cleanup, "complete_zero_residual_records");
  assert.equal(browser.passed, 8);
  assert.ok(browser.results.every((item) => item.orderStatus === "Recebido" && item.javascriptErrors === 0));
});

test("fase 7F mantém IA e produção bloqueadas", async () => {
  const result = await readJson("config/menu-staging-phase-7f-result.json");
  assert.equal(result.assistantMode, "deterministic");
  assert.equal(result.paidAiCalls, 0);
  assert.deepEqual(result.aiFinalState, { hybridEnabled: false, killSwitch: true, maximumCalls: 0, maximumCostCents: 0 });
  assert.equal(result.productionCalls, 0);
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.publicReleaseApproved, false);
});

test("acompanhamento traduz estados e selo de staging não bloqueia cliques", async () => {
  const [tracking, config, html] = await Promise.all([
    readFile(new URL("pedido/pedido.js", root), "utf8"),
    readFile(new URL("supabase-config.js", root), "utf8"),
    readFile(new URL("pedido/index.html", root), "utf8")
  ]);
  assert.match(tracking, /received:\s*"Recebido"/);
  assert.match(tracking, /pickup:\s*"Retirada"/);
  assert.match(config, /pointer-events:none/);
  assert.match(html, /ogritech-favicon\.ico/);
});
