import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);

test("fase 7G dá go técnico sem autorizar piloto real", async () => {
  const contract = await readJson("config/menu-private-pilot-phase-7g.json");
  assert.equal(contract.status, "package_prepared_pilot_not_authorized");
  assert.equal(contract.technicalDecision, "go_for_private_pilot_preparation");
  assert.equal(contract.operationalDecision, "no_go_until_entry_gates_are_satisfied");
  for (const value of [contract.pilotExecutionAuthorized, contract.productionAuthorized, contract.partnerContactAuthorized, contract.realDataAuthorized, contract.externalMessagesAuthorized, contract.paidAiAuthorized]) assert.equal(value, false);
  assert.equal(contract.proposedPilotLimits.businesses, 1);
  assert.ok(contract.proposedPilotLimits.maximumDurationDays <= 14);
});

test("piloto proposto mantém autonomia e suporte opcional", async () => {
  const contract = await readJson("config/menu-private-pilot-phase-7g.json");
  assert.ok(contract.autonomyRequirements.includes("guided_setup_without_ogritech_intervention"));
  assert.ok(contract.autonomyRequirements.includes("self_service_unpublish_and_cancel"));
  assert.ok(contract.autonomyRequirements.includes("optional_human_support_always_visible"));
  assert.ok(contract.requiredEntryGates.includes("business_owner_consent_recorded"));
  assert.equal(contract.exitCriteria.residualTestRecords, 0);
});

test("produção, mensagens, IA paga e renovação automática ficam fora do piloto", async () => {
  const contract = await readJson("config/menu-private-pilot-phase-7g.json");
  assert.equal(contract.proposedPilotLimits.whatsapp, false);
  assert.equal(contract.proposedPilotLimits.paidAi, false);
  assert.equal(contract.proposedPilotLimits.automaticRenewal, false);
  assert.ok(contract.stopConditions.includes("external_message_without_specific_consent"));
  assert.ok(contract.stopConditions.includes("paid_ai_or_production_access"));
});
