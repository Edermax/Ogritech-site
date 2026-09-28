import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);

export function evaluateRollbackContract(contract, repositoryFiles) {
  const failures = [];
  if (!/^[0-9a-f]{40}$/i.test(contract.rollbackTarget?.ref ?? "")) failures.push("rollback_ref_not_immutable");
  for (const file of contract.rollbackTarget?.requiredFiles ?? []) {
    if (!repositoryFiles.includes(file)) failures.push(`rollback_file_missing:${file}`);
  }
  if (!contract.entryControl?.closeBeforeRollback) failures.push("entry_not_closed_before_rollback");
  if (!contract.entryControl?.preserveExistingOrderTracking) failures.push("existing_order_tracking_not_preserved");
  if (contract.database?.downMigrationsAllowed !== false) failures.push("down_migrations_not_blocked");
  if (contract.database?.strategy !== "forward_only_additive_correction") failures.push("database_strategy_not_additive");
  const steps = contract.orderedSteps ?? [];
  for (const required of [
    "close_new_menu_orders",
    "redeploy_immutable_previous_frontend_ref",
    "verify_existing_order_tracking",
    "observe_monitor_window"
  ]) {
    if (!steps.includes(required)) failures.push(`rollback_step_missing:${required}`);
  }
  return { passed: failures.length === 0, failures };
}

export function inspectRollbackRef(ref, command = execFileSync) {
  command("git", ["cat-file", "-e", `${ref}^{commit}`], { cwd: root, stdio: "pipe" });
  return command("git", ["ls-tree", "-r", "--name-only", ref], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).split(/\r?\n/).filter(Boolean);
}

async function main() {
  const contract = JSON.parse(await readFile(new URL("config/menu-production-rollback.json", root), "utf8"));
  const files = inspectRollbackRef(contract.rollbackTarget.ref);
  const result = evaluateRollbackContract(contract, files);
  const report = {
    checkedAt: new Date().toISOString(),
    mode: "local_read_only",
    rollbackRef: contract.rollbackTarget.ref,
    rollbackRefVerifiedAsCurrentProduction: contract.rollbackTarget.verifiedAsCurrentProduction,
    requiredFiles: contract.rollbackTarget.requiredFiles.length,
    passed: result.passed,
    failures: result.failures,
    remoteChangesPerformed: false
  };
  console.log(JSON.stringify(report, null, 2));
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Ensaio local de rollback falhou: ${error.message}`);
    process.exitCode = 1;
  });
}
