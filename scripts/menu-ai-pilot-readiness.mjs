import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateMonthlyMenuAiCost } from "./lib/menu-ai-cost.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(await readFile(resolve(root, "config/menu-ai-pilot-policy.json"), "utf8"));
const requiredFalse = ["createProviderAccount", "createApiKey", "enableBilling", "makeExternalCalls", "deployToStaging", "deployToProduction"];
const blockers = [];
for (const gate of requiredFalse) if (policy.authorization[gate] !== false) blockers.push(`A autorização ${gate} deve permanecer falsa.`);
if (!policy.pilot.syntheticDataOnly) blockers.push("O ensaio preparado deve usar somente dados sintéticos.");
if (policy.dataPolicy.persistRawPrompt || policy.dataPolicy.persistRawResponse) blockers.push("Prompts e respostas brutos não podem ser persistidos.");
if (policy.acceptance.maximumAuthoritativeFieldViolations !== 0 || policy.acceptance.maximumAutomaticOrderActions !== 0) blockers.push("Ações autoritativas devem ter tolerância zero.");
if (policy.acceptance.fallbackRequired !== "deterministic_phase_6a") blockers.push("O fallback deve ser a Fase 6A determinística.");
if (policy.decision.selectedProvider || policy.decision.selectedModel) blockers.push("Nenhum fornecedor ou modelo pode estar selecionado nesta fase.");

const monthlyScenario = { interactions: 1000, inputTokensPerInteraction: 500, outputTokensPerInteraction: 150, exchangeRate: policy.pilot.assumedExchangeRateBrlPerUsd, safetyMarginPercent: policy.pilot.safetyMarginPercent };
const candidates = policy.candidates.map((candidate) => ({
  provider: candidate.provider,
  model: candidate.model,
  ...estimateMonthlyMenuAiCost({ ...monthlyScenario, inputPricePerMillion: candidate.inputUsdPerMillionTokens, outputPricePerMillion: candidate.outputUsdPerMillionTokens }),
  withinProposedMonthlyBudget: estimateMonthlyMenuAiCost({ ...monthlyScenario, inputPricePerMillion: candidate.inputUsdPerMillionTokens, outputPricePerMillion: candidate.outputUsdPerMillionTokens }).estimatedBrl <= policy.pilot.proposedMonthlyBudgetPerBusinessBrl
}));
const report = { phase: "6C", researchedAt: policy.researchedAt, status: policy.status, readyForLaterAuthorizationDecision: blockers.length === 0, externalCallsPerformedByScript: 0, assumptions: monthlyScenario, proposedBudgetBrl: policy.pilot.proposedMonthlyBudgetPerBusinessBrl, candidates, blockers };
await writeFile(resolve(root, "outputs/menu-ai-pilot-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (blockers.length) process.exitCode = 1;
