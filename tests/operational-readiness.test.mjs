import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateOperationalReadiness } from "../scripts/validate-operational-readiness.mjs";

test("pacote antecipado registra decisões pendentes sem inventar responsáveis", async () => {
  const config = JSON.parse(await readFile("config/operational-readiness.json", "utf8"));
  const result = validateOperationalReadiness(config);
  assert.equal(result.status, "BLOQUEADO");
  assert.ok(!result.blockers.includes("Selecionar cenário de preço"));
  assert.ok(result.blockers.includes("Definir emissão fiscal"));
  assert.equal(config.roles.find((role) => role.id === "technical_support").owner, "Eder Ogrizio Silva");
  assert.ok(result.blockers.includes("Autorização explícita de publicação"));
  assert.ok(config.deferredUntilLast.includes("supabase_leaked_password_protection"));
});

test("gate operacional aprova somente todos os controles preenchidos", () => {
  const config = {
    roles: [{ label: "Operação", owner: "Responsável", backup: "Substituto" }],
    channels: [
      "contato@ogritech.com.br", "suporte@ogritech.com.br", "financeiro@ogritech.com.br", "privacidade@ogritech.com.br"
    ].map((address) => ({ address, status: "VERIFIED" })),
    legal: { corporateDataCompleted: true, termsReviewed: true, privacyReviewed: true, controllerProcessorAgreementReviewed: true },
    commercial: { selectedScenario: "Essencial", billingMethod: "PIX", fiscalIssuanceDefined: true, pilotPolicyApproved: true },
    authorization: { technicalApproved: true, operationalApproved: true, legalApproved: true, commercialApproved: true, customerConfigurationApproved: true, publishApproved: true },
    deferredUntilLast: ["supabase_leaked_password_protection"]
  };
  assert.deepEqual(validateOperationalReadiness(config), { status: "APROVADO", blockers: [] });
});
