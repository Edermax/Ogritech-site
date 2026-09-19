import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("fase 7C prepara materiais sem agendar ou contatar participantes", async () => {
  const plan = JSON.parse(await read("config/menu-beta-phase-7c.json"));
  assert.equal(plan.status, "human_beta_materials_prepared_not_scheduled");
  assert.equal(plan.environment, "local-only");
  for (const flag of ["participantsContacted", "participantIdentitiesCollected", "sessionScheduled", "remoteEnvironmentAuthorized", "externalMessagesAuthorized", "paidAiAuthorized"]) assert.equal(plan[flag], false);
  assert.deepEqual(plan.participantCodes, ["OPERADOR-01", "CLIENTE-01", "CLIENTE-02"]);
  assert.equal(plan.maximumSessionMinutes, 90);
  assert.ok(plan.executionRequires.includes("new_explicit_authorization"));
});

test("facilitação é neutra, voluntária e não coleta dados pessoais", async () => {
  const [plan, guide, form] = await Promise.all([
    read("config/menu-beta-phase-7c.json").then(JSON.parse),
    read("docs/BETA_HUMANO_CARDAPIO_EXECUCAO.md"),
    read("docs/modelos/FICHA_AVALIACAO_BETA_CARDAPIO.md")
  ]);
  assert.equal(plan.facilitation.helpDuringTasks, false);
  assert.equal(plan.facilitation.recordDirectQuotes, false);
  assert.equal(plan.facilitation.recordPersonalData, false);
  assert.equal(plan.facilitation.screenRecordingDefault, false);
  assert.equal(plan.facilitation.participantMayStopAnytime, true);
  assert.match(guide, /avaliar o produto, não você/i);
  assert.match(guide, /pode parar a qualquer momento/i);
  assert.match(form, /Não registrar nome, telefone, e-mail, imagem, voz, senha/);
});

test("consolidação cobre quatro segmentos, incidentes e limpeza", async () => {
  const result = JSON.parse(await read("docs/modelos/CONSOLIDACAO_BETA_CARDAPIO.json"));
  assert.deepEqual(Object.keys(result.segments), ["pizzeria", "snack_bar", "restaurant", "confectionery"]);
  for (const field of ["taskCompletionPercent", "averageEaseScore", "javascriptErrors", "criticalIncidents", "crossTenantAccessEvents", "duplicateOrders", "priceDivergences"]) assert.ok(Object.hasOwn(result.totals, field));
  assert.deepEqual(result.cleanup, { menusUnpublished: false, ordersClosed: false, fixturesRemoved: false, browserStateCleared: false, zeroFixtureSlugsVerified: false, passed: false });
  assert.equal(result.decision, "not_evaluated");
});

test("critérios humanos preservam o contrato quantitativo da fase 7A", async () => {
  const [phase7a, phase7c] = await Promise.all([
    read("config/menu-beta-phase-7a.json").then(JSON.parse),
    read("config/menu-beta-phase-7c.json").then(JSON.parse)
  ]);
  assert.deepEqual(phase7c.acceptance, phase7a.acceptance);
});

test("servidor humano preserva pedido fictício para acompanhamento local", async () => {
  const server = await read("scripts/menu-beta-human-server.mjs");
  assert.match(server, /sessionStorage\.setItem\("ogritechBetaOrder:/);
  assert.match(server, /public_get_menu_order/);
  assert.match(server, /beta-order-fixture\.js/);
  assert.match(server, /relative === "pedido"/);
  assert.match(server, /remote|Supabase/i);
});
