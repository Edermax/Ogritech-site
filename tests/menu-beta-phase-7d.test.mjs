import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);

test("resultado humano aprova os quatro segmentos sem liberar produção", async () => {
  const [result, evidence] = await Promise.all([
    readJson("config/menu-beta-phase-7d-result.json"),
    readJson("outputs/menu-beta-human-2026-09-16.json")
  ]);
  assert.equal(result.status, "passed_local_human_beta");
  assert.equal(result.participants, 3);
  assert.equal(result.participantIdentitiesStored, false);
  assert.equal(result.segmentsCompleted, 4);
  assert.equal(result.taskCompletionPercent, 100);
  assert.equal(result.averageEaseScore, 10);
  for (const value of [result.criticalIncidents, result.crossTenantAccessEvents, result.duplicateOrders, result.priceDivergences, result.externalCalls, result.remoteDatabaseCalls, result.paidAiCalls]) assert.equal(value, 0);
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.publicReleaseApproved, false);
  assert.ok(Object.values(evidence.segments).every((segment) => segment.completed && segment.easeScore === 10 && segment.finalStatusVisible === "Recebido"));
});
