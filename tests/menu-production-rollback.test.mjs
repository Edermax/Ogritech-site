import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateRollbackContract } from "../scripts/menu-production-rollback-rehearsal.mjs";

const root = new URL("../", import.meta.url);

test("contrato de rollback bloqueia reversão destrutiva e preserva acompanhamento", async () => {
  const contract = JSON.parse(await readFile(new URL("config/menu-production-rollback.json", root), "utf8"));
  const result = evaluateRollbackContract(contract, contract.rollbackTarget.requiredFiles);
  assert.equal(result.passed, true);
  assert.equal(contract.database.downMigrationsAllowed, false);
  assert.equal(contract.entryControl.preserveExistingOrderTracking, true);
  assert.ok(contract.stopConditions.includes("rollback_ref_not_verified_as_current_production"));
});

test("ensaio confirma que o commit imutável pode fornecer o frontend anterior", () => {
  const result = spawnSync(process.execPath, ["scripts/menu-production-rollback-rehearsal.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true);
  assert.equal(report.remoteChangesPerformed, false);
  assert.equal(report.requiredFiles, 6);
});

test("contrato incompleto falha fechado", () => {
  const result = evaluateRollbackContract({
    rollbackTarget: { ref: "main", requiredFiles: ["missing.html"] },
    entryControl: {},
    database: { downMigrationsAllowed: true },
    orderedSteps: []
  }, []);
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("rollback_ref_not_immutable"));
  assert.ok(result.failures.includes("down_migrations_not_blocked"));
});
