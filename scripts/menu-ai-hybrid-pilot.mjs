import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadMenuAiEnv } from "./lib/menu-ai-env.mjs";
import { createOpenAiMenuAdapter } from "./lib/menu-ai-openai-adapter.mjs";
import { createHybridMenuAiAdapter } from "./lib/menu-ai-hybrid-adapter.mjs";
import { estimateMonthlyMenuAiCost } from "./lib/menu-ai-cost.mjs";
import { assessMenuAiPilot } from "./lib/menu-ai-metrics.mjs";

const root = process.cwd();
const [livePolicy, pilotPolicy, suite, env] = await Promise.all([
  readFile(resolve(root, "config/menu-ai-live-pilot.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "config/menu-ai-pilot-policy.json"), "utf8").then(JSON.parse),
  readFile(resolve(root, "config/menu-ai-hybrid-evaluation-cases.json"), "utf8").then(JSON.parse),
  loadMenuAiEnv(root)
]);
if (suite.cases.length > livePolicy.authorization.maximumCalls) throw new Error("A suíte excede a quantidade autorizada.");
const openai = createOpenAiMenuAdapter({ apiKey: env.OPENAI_API_KEY, model: env.OGRITECH_MENU_AI_MODEL, timeoutMs: livePolicy.controls.timeoutMs });
const hybrid = createHybridMenuAiAdapter({ modelAdapter: openai });
const results = [];
for (const scenario of suite.cases) {
  try {
    const { response, telemetry } = await hybrid.interpretWithTelemetry({ message: scenario.message, locale: suite.locale, allowedTools: ["catalog_search", "business_info", "open_cart"] });
    results.push({ caseHash: createHash("sha256").update(scenario.message).digest("hex"), passed: response.intent === scenario.expectedIntent && telemetry.route === scenario.expectedRoute, intent: response.intent, tool: response.tool, route: telemetry.route, latencyMs: telemetry.latencyMs, inputTokens: telemetry.inputTokens, outputTokens: telemetry.outputTokens, outcome: telemetry.outcome });
  } catch (error) {
    results.push({ caseHash: createHash("sha256").update(scenario.message).digest("hex"), passed: false, intent: null, tool: null, route: scenario.expectedRoute, latencyMs: null, inputTokens: 0, outputTokens: 0, outcome: typeof error?.code === "string" ? error.code : (error?.name || "error") });
  }
}
const totals = results.reduce((sum, item) => ({ input: sum.input + item.inputTokens, output: sum.output + item.outputTokens }), { input: 0, output: 0 });
const cost = estimateMonthlyMenuAiCost({ interactions: 1, inputTokensPerInteraction: totals.input, outputTokensPerInteraction: totals.output, inputPricePerMillion: livePolicy.pricing.inputUsdPerMillionTokens, outputPricePerMillion: livePolicy.pricing.outputUsdPerMillionTokens, exchangeRate: livePolicy.controls.exchangeRateBrlPerUsd, safetyMarginPercent: livePolicy.controls.safetyMarginPercent });
const baseReport = { phase: "6E", provider: "hybrid", model: env.OGRITECH_MENU_AI_MODEL, syntheticOnly: true, requestedCalls: suite.cases.length, completedCalls: results.length, modelCalls: results.filter((item) => item.route === "model").length, deterministicCalls: results.filter((item) => item.route === "deterministic").length, rawContentPersisted: false, estimatedCostBrl: cost.estimatedBrl, withinAuthorizedBudget: cost.estimatedBrl <= livePolicy.authorization.maximumSpendBrl, results };
const report = { ...baseReport, assessment: assessMenuAiPilot(baseReport, pilotPolicy.acceptance) };
await writeFile(resolve(root, "outputs/menu-ai-hybrid-pilot.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ phase: report.phase, requestedCalls: report.requestedCalls, modelCalls: report.modelCalls, deterministicCalls: report.deterministicCalls, estimatedCostBrl: report.estimatedCostBrl, assessment: report.assessment }, null, 2));
if (!report.assessment.approvedForPublicActivation) process.exitCode = 1;
