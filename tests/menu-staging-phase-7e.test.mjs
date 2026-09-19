import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);

test("fase 7E prepara staging sem autorizar execução ou produção", async () => {
  const contract = await readJson("config/menu-staging-phase-7e-readiness.json");
  assert.equal(contract.status, "ready_for_authorized_synthetic_staging_homologation");
  assert.equal(contract.assessmentOnly, true);
  assert.equal(contract.executionAuthorized, false);
  assert.equal(contract.remoteChangesPerformed, false);
  assert.equal(contract.productionAuthorized, false);
  assert.equal(contract.currentState.menuMigrationsAlreadyRecordedInStaging, true);
  assert.equal(contract.currentState.externalAiEnabled, false);
  assert.ok(contract.requiredPreflightGates.includes("remote_schema_drift_check_before_any_migration"));
  assert.ok(contract.requiredPreflightGates.includes("explicit_grants_and_rls_allow_deny_tests"));
  assert.ok(contract.prohibitedDuringHomologation.includes("paid_ai_calls"));
  assert.equal(contract.acceptanceCriteria.residualSyntheticRecordsAfterCleanup, 0);
});

test("fase 7E cobre mudanças atuais de segurança do Supabase", async () => {
  const { supabaseCompatibility } = await readJson("config/menu-staging-phase-7e-readiness.json");
  assert.equal(supabaseCompatibility.explicitDataApiGrantsRequired, true);
  assert.equal(supabaseCompatibility.rlsAndPoliciesRequiredForEveryExposedTable, true);
  assert.equal(supabaseCompatibility.securityInvokerRequiredForExposedViews, true);
  assert.equal(supabaseCompatibility.deprecatedLogsAllDependencyAllowed, false);
  assert.equal(supabaseCompatibility.realtimeSchemaMutationAllowed, false);
});
