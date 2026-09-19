import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);

test("fase 7H registra seleção sem versionar identidade real", async () => {
  const intake = await readJson("config/menu-private-pilot-phase-7h-intake.json");
  const serialized = JSON.stringify(intake);
  assert.equal(intake.status, "private_pilot_active_in_staging");
  assert.equal(intake.pilotCode, "PILOTO-CARDAPIO-01");
  assert.equal(intake.segment, "confectionery");
  assert.equal(intake.realIdentityStoredInRepository, false);
  assert.doesNotMatch(serialized, /Diniz|Pamela/i);
});

test("piloto autorizado permanece isolado de contato automático e produção", async () => {
  const intake = await readJson("config/menu-private-pilot-phase-7h-intake.json");
  for (const value of [intake.contactPerformed, intake.productionAuthorized]) assert.equal(value, false);
  assert.equal(intake.pilotExecutionAuthorized, true);
  assert.equal(intake.environmentPreparationAuthorized, true);
  assert.deepEqual(intake.completedEntryGates, ["partner_business_privately_selected", "pilot_operator_and_backup_named", "start_and_end_window_defined", "business_owner_consent_recorded", "support_and_incident_channel_defined", "privacy_notice_and_retention_accepted", "commercial_terms_and_zero_auto_renewal_confirmed", "real_catalog_reviewed_by_business_owner", "staging_or_private_preview_publication_authorized", "rollback_and_export_rehearsed", "final_preflight_passed"]);
  assert.equal(intake.pendingEntryGates.length, 0);
  assert.equal(intake.plannedWindow.durationDays, 14);
  assert.equal(intake.plannedWindow.automaticEnd, true);
  assert.equal(intake.plannedWindow.started, true);
  assert.equal(intake.plannedWindow.startedAt, "2026-09-17T18:44:32-03:00");
  assert.equal(intake.plannedWindow.endsAt, "2026-10-01T18:44:32-03:00");
  assert.equal(intake.supportChannel.code, "SUPORTE-01");
  assert.equal(intake.supportChannel.realContactStoredInRepository, false);
  assert.equal(intake.supportChannel.systemIntegration, false);
  assert.equal(intake.catalogIntake.sourceImages, 5);
  assert.equal(intake.catalogIntake.primaryCatalogYear, 2026);
  assert.equal(intake.catalogIntake.status, "reviewed_and_clarified_by_business_owner");
  assert.equal(intake.catalogIntake.realCatalogStoredInRepository, false);
  assert.deepEqual(intake.catalogIntake.operationalRulesReceived, ["dynamic_delivery_fee", "card_machine_fee", "thirty_percent_advance_payment", "business_hours", "minimum_lead_time", "mixed_filling_highest_tier", "personalized_items_manual_quote"]);
  assert.equal(intake.catalogIntake.privateAudioSources, 4);
  assert.equal(intake.catalogIntake.privateAudioTranscriptionStatus, "completed");
  assert.equal(intake.catalogIntake.personalNonOperationalDetailsStoredInRepository, false);
  assert.equal(intake.catalogIntake.pendingConfirmations, 0);
  assert.equal(intake.privatePreview.published, true);
  assert.equal(intake.privatePreview.exportCompleted, true);
  assert.equal(intake.privatePreview.rollbackRehearsed, true);
  assert.equal(intake.privatePreview.finalPreflightPassed, true);
  assert.equal(intake.privatePreview.ordersCreated, 0);
  assert.equal(intake.privatePreview.productionCalls, 0);
});
