import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);

test("fase 7J inicia piloto limitado somente em staging", async () => {
  const result = await readJson("config/menu-private-pilot-phase-7j-result.json");
  assert.equal(result.status, "private_pilot_active_in_staging");
  assert.equal(result.environment, "staging");
  assert.equal(result.durationDays, 14);
  assert.equal(result.automaticEnd, true);
  assert.deepEqual(result.limits, { businesses: 1, maximumConsumers: 25, maximumOrders: 100 });
  assert.equal(result.initialOrders, 0);
  assert.equal(result.browserValidation, "passed");
});

test("piloto mantém integrações e produção bloqueadas", async () => {
  const result = await readJson("config/menu-private-pilot-phase-7j-result.json");
  assert.equal(result.assistantMode, "deterministic");
  assert.equal(result.paidAiEnabled, false);
  assert.equal(result.whatsappIntegration, false);
  assert.equal(result.automaticMessages, false);
  assert.equal(result.automaticRenewal, false);
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.stopConditionsActive, true);
});

test("fase 7K-A consolida a base sem ampliar o piloto", async () => {
  const consolidation = await readJson("config/menu-private-pilot-phase-7k-a.json");
  assert.equal(consolidation.status, "repository_consolidation_in_progress");
  assert.equal(consolidation.currentOperationalPhase, "7J");
  assert.equal(consolidation.environment, "staging");
  assert.equal(consolidation.productionAuthorized, false);
  assert.equal(consolidation.paidAiEnabled, false);
  assert.equal(consolidation.automaticMessages, false);
  assert.equal(consolidation.automaticRenewal, false);
  assert.equal(consolidation.generatedOutputsVersioned, false);
  assert.equal(consolidation.privatePersonalDataVersioned, false);
  assert.equal(consolidation.nextPhase, "7K-B");
});

test("fase 7K-C encerra o piloto ao atingir o limite autorizado", async () => {
  const closure = await readJson("config/menu-private-pilot-phase-7k-c-closure.json");
  assert.equal(closure.status, "private_pilot_closed_in_staging");
  assert.deepEqual(closure.limits, { businesses: 1, maximumConsumers: 7, maximumOrders: 15 });
  assert.equal(closure.finalMetrics.orders, 15);
  assert.equal(closure.finalMetrics.consumers, 4);
  assert.equal(closure.finalMetrics.possibleDuplicateGroups, 0);
  assert.equal(closure.finalMetrics.priceDivergences, 0);
  assert.equal(closure.finalMetrics.missingConsent, 0);
  assert.equal(closure.privateExportGenerated, true);
  assert.equal(closure.privateExportVersioned, false);
  assert.equal(closure.publicTokensExported, false);
  assert.equal(closure.menuUnpublished, true);
  assert.equal(closure.publicEntryBlocked, true);
  assert.equal(closure.monitorAutomationDeleted, true);
  assert.equal(closure.automaticRenewal, false);
  assert.equal(closure.productionAuthorized, false);
  assert.equal(closure.legitimateDataDeleted, false);
});
