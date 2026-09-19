import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadMenuAiEnv } from "./lib/menu-ai-env.mjs";
import { createOpenAiMenuAdapter } from "./lib/menu-ai-openai-adapter.mjs";
import { estimateMonthlyMenuAiCost } from "./lib/menu-ai-cost.mjs";

const root = process.cwd();
const policy = JSON.parse(await readFile(resolve(root, "config/menu-ai-live-pilot.json"), "utf8"));
const suite = JSON.parse(await readFile(resolve(root, "config/menu-ai-evaluation-cases.json"), "utf8"));
const env = await loadMenuAiEnv(root);
const requested = process.argv.includes("--suite") ? suite.cases.length : 1;
if (requested > policy.authorization.maximumCalls || requested > 100) throw new Error("Quantidade solicitada excede a autorização do piloto.");
const cases = suite.cases.slice(0, requested);
const adapter = createOpenAiMenuAdapter({ apiKey: env.OPENAI_API_KEY, model: env.OGRITECH_MENU_AI_MODEL, timeoutMs: policy.controls.timeoutMs });
const results = [];
for (const scenario of cases) {
  try {
    const { response, telemetry } = await adapter.interpretWithTelemetry({ message: scenario.message, locale: suite.locale, allowedTools: ["catalog_search", "business_info", "open_cart"] });
    const passed = response.intent === scenario.expectedIntent && (!scenario.expectedTool || response.tool === scenario.expectedTool) && (scenario.requiresConfirmation == null || response.requiresConfirmation === scenario.requiresConfirmation);
    results.push({ caseHash: telemetry.caseHash, passed, intent: response.intent, tool: response.tool, latencyMs: telemetry.latencyMs, inputTokens: telemetry.inputTokens, outputTokens: telemetry.outputTokens, outcome: telemetry.outcome });
  } catch (error) {
    const safeOutcome = typeof error?.code === "string" ? error.code : (error?.name || "error");
    results.push({ caseHash: null, passed: false, intent: null, tool: null, latencyMs: null, inputTokens: 0, outputTokens: 0, outcome: safeOutcome });
    break;
  }
}
const totals = results.reduce((sum, item) => ({ input: sum.input + item.inputTokens, output: sum.output + item.outputTokens }), { input: 0, output: 0 });
const cost = estimateMonthlyMenuAiCost({ interactions: 1, inputTokensPerInteraction: totals.input, outputTokensPerInteraction: totals.output, inputPricePerMillion: policy.pricing.inputUsdPerMillionTokens, outputPricePerMillion: policy.pricing.outputUsdPerMillionTokens, exchangeRate: policy.controls.exchangeRateBrlPerUsd, safetyMarginPercent: policy.controls.safetyMarginPercent });
const report = { phase: "6D", provider: "openai", model: env.OGRITECH_MENU_AI_MODEL, syntheticOnly: true, requestedCalls: requested, completedCalls: results.length, rawContentPersisted: false, estimatedCostBrl: cost.estimatedBrl, withinAuthorizedBudget: cost.estimatedBrl <= policy.authorization.maximumSpendBrl, results };
await writeFile(resolve(root, "outputs/menu-ai-openai-pilot.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (results.some((item) => !item.passed) || !report.withinAuthorizedBudget) process.exitCode = 1;
