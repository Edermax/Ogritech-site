import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("beta do Cardápio cobre os quatro segmentos sem ampliar autorização", async () => {
  const plan = JSON.parse(await read("config/menu-beta-phase-7a.json"));
  assert.equal(plan.status, "prepared_not_executed");
  assert.equal(plan.environment, "local");
  assert.deepEqual(plan.fixtures.map((item) => item.segment), ["pizzeria", "snack_bar", "restaurant", "confectionery"]);
  assert.deepEqual(plan.fixtures.map((item) => item.templateCode), ["pizzeria", "snack-bar", "restaurant", "confectionery"]);
  assert.ok(plan.fixtures.every((item) => item.businessName.includes("demonstração")));
  assert.ok(plan.fixtures.every((item) => item.slug.startsWith("beta-") && item.contactEmail.endsWith(".invalid")));
  for (const flag of ["realBusinesses", "realCustomers", "productionAuthorized", "externalMessagesAuthorized", "whatsappAuthorized", "paidAiAuthorized"]) assert.equal(plan[flag], false);
  assert.equal(plan.assistantMode, "deterministic");
});

test("roteiro mede autonomia completa e exige confirmação humana", async () => {
  const plan = JSON.parse(await read("config/menu-beta-phase-7a.json"));
  assert.deepEqual(plan.journeys.map((journey) => journey.code), ["OWNER-SETUP", "CUSTOMER-ORDER", "ASSISTANT", "SELF-SERVICE-EXIT"]);
  const tasks = plan.journeys.flatMap((journey) => journey.tasks).join(" ");
  for (const marker of ["contratar", "pedido de teste", "sem cadastro", "revisar total", "confirmar ação manualmente", "exportar", "cancelar solução"]) assert.match(tasks, new RegExp(marker));
  assert.ok(plan.stopConditions.includes("order_without_confirmation"));
  assert.ok(plan.stopConditions.includes("external_ai_call"));
});

test("aceite é objetivo e limpeza termina sem massas ativas", async () => {
  const plan = JSON.parse(await read("config/menu-beta-phase-7a.json"));
  assert.deepEqual(plan.acceptance, {
    segmentsCompleted: 4,
    criticalIncidents: 0,
    minimumTaskCompletionPercent: 90,
    minimumAverageEaseScore: 8,
    maximumJavascriptErrors: 0,
    crossTenantAccessEvents: 0,
    duplicateOrders: 0,
    priceDivergences: 0,
    cleanupRequired: true
  });
  assert.equal(plan.cleanup.required, true);
  assert.ok(plan.cleanup.steps.includes("verify_zero_fixture_slugs_and_active_orders"));
  assert.equal(plan.cleanup.successCondition, "zero_fixture_businesses_and_active_orders");
});

test("documentação separa preparação, execução humana e ambientes remotos", async () => {
  const doc = await read("docs/BETA_CONTROLADO_CARDAPIO.md");
  assert.match(doc, /PREPARADO LOCALMENTE; NÃO EXECUTADO/);
  assert.match(doc, /não convoca participantes nem executa o beta/i);
  assert.match(doc, /Publicação em staging ou produção também exige autorização própria/);
  assert.match(doc, /Falha de limpeza reprova o beta/);
});

test("ensaio 7B usa navegador real com fixtures em memória e oito cenários", async () => {
  const script = await read("scripts/menu-beta-browser.mjs");
  assert.match(script, /environment: "local-only"/);
  assert.match(script, /dataMode: "in-memory synthetic fixtures"/);
  assert.match(script, /assert\.equal\(results\.length, 8\)/);
  assert.match(script, /assert\.equal\(url\.origin, origin/);
  assert.match(script, /remoteDatabaseCalls: 0/);
  assert.match(script, /paidAiCalls: 0/);
  assert.match(script, /humanParticipants: 0/);
});

test("resultado 7B registra aprovação local sem liberar ambiente público", async () => {
  const result = JSON.parse(await read("config/menu-beta-phase-7b-result.json"));
  assert.equal(result.status, "passed_local_browser");
  assert.equal(result.scenarios, 8);
  assert.equal(result.passed, 8);
  assert.equal(result.failed, 0);
  assert.equal(result.javascriptErrors, 0);
  assert.equal(result.externalCalls, 0);
  assert.equal(result.remoteDatabaseCalls, 0);
  assert.equal(result.paidAiCalls, 0);
  assert.equal(result.humanParticipants, 0);
  assert.equal(result.publicReleaseApproved, false);
});
