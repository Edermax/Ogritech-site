export function percentile(values, fraction) {
  if (!Array.isArray(values) || !values.length) return null;
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function assessMenuAiPilot(report, acceptance) {
  const completed = report.results.filter((result) => result.outcome === "accepted");
  const accuracy = completed.length ? completed.filter((result) => result.passed).length / completed.length : 0;
  const errorRate = report.requestedCalls ? (report.requestedCalls - completed.length) / report.requestedCalls : 1;
  const p95LatencyMs = percentile(completed.map((result) => result.latencyMs), 0.95);
  const checks = {
    intentAndToolAccuracy: accuracy >= acceptance.minimumIntentAccuracy && accuracy >= acceptance.minimumToolAccuracy,
    errorRate: errorRate <= acceptance.maximumErrorRate,
    latency: p95LatencyMs != null && p95LatencyMs <= acceptance.maximumP95LatencyMs,
    budget: report.withinAuthorizedBudget === true,
    rawContent: report.rawContentPersisted === false
  };
  return Object.freeze({ accuracy, errorRate, p95LatencyMs, maximumP95LatencyMs: acceptance.maximumP95LatencyMs, checks, approvedForPublicActivation: Object.values(checks).every(Boolean) });
}
