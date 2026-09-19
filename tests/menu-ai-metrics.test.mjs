import test from "node:test";
import assert from "node:assert/strict";
import { assessMenuAiPilot, percentile } from "../scripts/lib/menu-ai-metrics.mjs";

test("p95 usa o pior resultado numa amostra de dez", () => {
  assert.equal(percentile([3201, 2536, 2787, 2548, 1316, 1931, 2153, 1285, 2685, 2037], 0.95), 3201);
});

test("avaliação não aprova piloto que excede latência", () => {
  const results = [3201, 2536, 2787, 2548, 1316, 1931, 2153, 1285, 2685, 2037].map((latencyMs) => ({ outcome: "accepted", passed: true, latencyMs }));
  const assessment = assessMenuAiPilot({ requestedCalls: 10, withinAuthorizedBudget: true, rawContentPersisted: false, results }, { minimumIntentAccuracy: 0.95, minimumToolAccuracy: 0.98, maximumErrorRate: 0.02, maximumP95LatencyMs: 2500 });
  assert.equal(assessment.accuracy, 1);
  assert.equal(assessment.p95LatencyMs, 3201);
  assert.equal(assessment.checks.latency, false);
  assert.equal(assessment.approvedForPublicActivation, false);
});
