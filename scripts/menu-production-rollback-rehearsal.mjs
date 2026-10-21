import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

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

export async function rehearseRollbackHttp(ref, files, readSource = (file) => execFileSync("git", ["show", `${ref}:${file}`], { cwd: root, stdio: "pipe" })) {
  if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error("Ensaio HTTP exige commit imutável");
  if (!files.length || files.some((file) => !/^[a-zA-Z0-9_/-]+\.(html|js)$/.test(file) || file.split("/").includes(".."))) {
    throw new Error("Arquivos inválidos para o ensaio HTTP");
  }
  const sources = new Map(files.map((file) => [`/${file}`, Buffer.from(readSource(file))]));
  const sha256 = (value) => createHash("sha256").update(value).digest("hex");
  const server = createServer((request, response) => {
    if (request.method !== "GET") { response.writeHead(405).end(); return; }
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    const path = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const source = sources.get(path);
    if (!source) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Type": path.endsWith(".js") ? "application/javascript" : "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(source);
  });
  const startedAt = Date.now();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const results = [];
    for (const [path, source] of sources) {
      const route = path.endsWith("/index.html") ? path.slice(0, -"index.html".length) : path;
      const response = await fetch(`${origin}${route}`, { signal: AbortSignal.timeout(5000), redirect: "error" });
      const body = Buffer.from(await response.arrayBuffer());
      const digest = sha256(body);
      if (response.status !== 200 || digest !== sha256(source)) throw new Error(`Conteúdo HTTP divergente: ${path}`);
      results.push({ path: path.slice(1), status: response.status, sha256: digest });
    }
    return { mode: "isolated_loopback_http", sourceCommit: ref, files: results,
      durationMs: Date.now() - startedAt, remoteChangesPerformed: false, productionRehearsalRequired: true };
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--http")) throw new Error("Uso: menu-production-rollback-rehearsal.mjs [--http]");
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
  if (args[0] === "--http" && result.passed) report.httpRehearsal = await rehearseRollbackHttp(contract.rollbackTarget.ref, contract.rollbackTarget.requiredFiles);
  console.log(JSON.stringify(report, null, 2));
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Ensaio local de rollback falhou: ${error.message}`);
    process.exitCode = 1;
  });
}
