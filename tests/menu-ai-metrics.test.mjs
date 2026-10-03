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

test("avaliação separa latência determinística da rota do modelo", () => {
  const results = [
    { outcome: "accepted", passed: true, route: "deterministic", latencyMs: 1 },
    { outcome: "accepted", passed: true, route: "deterministic", latencyMs: 2 },
    { outcome: "accepted", passed: true, route: "model", latencyMs: 2668 }
  ];
  const assessment = assessMenuAiPilot({ requestedCalls: 3, withinAuthorizedBudget: true, rawContentPersisted: false, results }, { minimumIntentAccuracy: 0.95, minimumToolAccuracy: 0.98, maximumErrorRate: 0.02, maximumP95LatencyMs: 3000 });
  assert.deepEqual(assessment.latency, { overallP95Ms: 2668, deterministicP95Ms: 2, modelP50Ms: 2668, modelP95Ms: 2668 });
  assert.deepEqual(assessment.routing, { deterministicCalls: 2, modelCalls: 1, modelRouteRate: 1 / 3 });
});
