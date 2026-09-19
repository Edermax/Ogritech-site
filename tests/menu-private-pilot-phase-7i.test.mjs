import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);

test("fase 7I publica somente a prévia privada em staging", async () => {
  const result = await readJson("config/menu-private-pilot-phase-7i-result.json");
  const serialized = JSON.stringify(result);
  assert.equal(result.status, "private_preview_published_entry_gates_complete");
  assert.equal(result.environment, "staging");
  assert.equal(result.realIdentityStoredInRepository, false);
  assert.equal(result.realPreviewUrlStoredInRepository, false);
  assert.doesNotMatch(serialized, /Diniz|Pamela|Rafael|Judy/i);
  assert.deepEqual(result.catalog, { categories: 4, items: 12, prices: 60, deliveryZones: 4 });
  assert.equal(result.browserValidation, "passed");
});

test("prévia conclui gates sem iniciar piloto ou produção", async () => {
  const result = await readJson("config/menu-private-pilot-phase-7i-result.json");
  assert.equal(result.entryGatesCompleted, 11);
  assert.equal(result.entryGatesPending, 0);
  assert.equal(result.export, "completed_private_local");
  assert.equal(result.rollback, "unpublish_verified_and_republished");
  assert.equal(result.ordersCreated, 0);
  assert.equal(result.paidAiCalls, 0);
  assert.equal(result.externalMessages, 0);
  assert.equal(result.productionCalls, 0);
  assert.equal(result.anonymousDirectOrderTableRead, false);
  assert.equal(result.pilotExecutionAuthorized, false);
  assert.equal(result.productionAuthorized, false);
});
