import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { estimateMonthlyMenuAiCost } from "../scripts/lib/menu-ai-cost.mjs";

const root = new URL("../", import.meta.url);
const policy = JSON.parse(await readFile(new URL("config/menu-ai-pilot-policy.json", root), "utf8"));

test("plano 6C prepara decisão sem autorizar fornecedor ou gasto", () => {
  assert.equal(policy.status, "prepared_not_authorized");
  assert.equal(policy.decision.selectedProvider, null);
  assert.equal(policy.decision.selectedModel, null);
  assert.ok(Object.values(policy.authorization).every((value) => value === false));
  assert.equal(policy.pilot.syntheticDataOnly, true);
});

test("política elimina identidade e conteúdo bruto da telemetria", () => {
  for (const field of ["sendRawCustomerIdentity", "sendPhone", "sendEmail", "sendAddress", "sendOrderNotes", "persistRawPrompt", "persistRawResponse"]) assert.equal(policy.dataPolicy[field], false, field);
  assert.doesNotMatch(policy.dataPolicy.retainedTelemetry.join(" "), /prompt|response|phone|email|address/i);
});

test("aceite mantém autoridade no sistema e fallback determinístico", () => {
  assert.equal(policy.acceptance.maximumAuthoritativeFieldViolations, 0);
  assert.equal(policy.acceptance.maximumAutomaticOrderActions, 0);
  assert.equal(policy.acceptance.minimumPromptInjectionRefusalRate, 1);
  assert.equal(policy.acceptance.fallbackRequired, "deterministic_phase_6a");
});

test("todos os candidatos possuem fonte oficial e cabem no cenário proposto", () => {
  assert.equal(policy.candidates.length, 3);
  for (const candidate of policy.candidates) {
    assert.match(candidate.pricingSource, /^https:\/\//);
    assert.match(candidate.dataSource, /^https:\/\//);
    assert.equal(candidate.status, "candidate_only");
    const estimate = estimateMonthlyMenuAiCost({ interactions: 1000, inputTokensPerInteraction: 500, outputTokensPerInteraction: 150, inputPricePerMillion: candidate.inputUsdPerMillionTokens, outputPricePerMillion: candidate.outputUsdPerMillionTokens, exchangeRate: policy.pilot.assumedExchangeRateBrlPerUsd, safetyMarginPercent: policy.pilot.safetyMarginPercent });
    assert.ok(estimate.estimatedBrl <= policy.pilot.proposedMonthlyBudgetPerBusinessBrl, `${candidate.model}: ${estimate.estimatedBrl}`);
  }
});

test("plano documenta limites, LGPD e autorização posterior", async () => {
  const document = await readFile(new URL("docs/FASE_6C_PLANO_PILOTO_IA.md", root), "utf8");
  for (const marker of ["LGPD", "sintéticos", "fallback", "não autorização de gasto", "Autorização ainda necessária"]) assert.match(document, new RegExp(marker, "i"));
});
