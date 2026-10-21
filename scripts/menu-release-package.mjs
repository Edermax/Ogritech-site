import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateMigrationBatch } from "./menu-production-migration-batch.mjs";
import { evaluateMenuProductionLaunch } from "./menu-production-launch-gate.mjs";

const root = new URL("../", import.meta.url);
const forbidden = new Set(["menu-sandbox-qa", "menu-sandbox-webhook", "menu-ai-assistant"]);

// Reads committed objects, never working-tree files, secrets or remote services.
export function readSnapshot(ref = "HEAD", command = execFileSync) {
  if (ref !== "HEAD" && !/^[0-9a-f]{40}$/.test(ref)) throw new Error("Use HEAD ou um commit completo de 40 caracteres");
  const git = (args, encoding = "utf8") => command("git", args, { cwd: root, encoding, stdio: ["ignore", "pipe", "pipe"] });
  const commit = git(["rev-parse", "--verify", `${ref}^{commit}`]).trim();
  const paths = git(["ls-tree", "-r", "--name-only", commit]).trim().split(/\r?\n/);
  return { commit, paths, read: (path) => {
    if (!paths.includes(path)) throw new Error(`Arquivo ausente no commit: ${path}`);
    return git(["show", `${commit}:${path}`], null);
  } };
}

export function buildReleasePackage(snapshot) {
  const readJson = (path) => JSON.parse(snapshot.read(path).toString("utf8"));
  const config = readJson("config/menu-release-package.json");
  const launch = readJson("config/menu-production-launch.json");
  const policy = readJson("config/migration-release-policy.json");
  const batch = readJson("config/menu-production-migration-batch.json");
  const rollback = readJson("config/menu-production-rollback.json");
  if (!/^[0-9a-f]{40}$/.test(snapshot.commit)) throw new Error("Commit do pacote inválido");
  if (config.productionProjectRef !== policy.production.projectRef || config.productionProjectRef === policy.staging.projectRef) {
    throw new Error("Projeto do pacote não corresponde à produção");
  }
  if (!Array.isArray(config.productionFunctions) || !config.productionFunctions.length ||
    new Set(config.productionFunctions).size !== config.productionFunctions.length ||
    config.productionFunctions.some((name) => forbidden.has(name) || config.excludedFunctions.includes(name))) {
    throw new Error("Lista de funções contém duplicata ou componente de homologação");
  }
  const describe = (path) => ({ path, sha256: createHash("sha256").update(snapshot.read(path)).digest("hex") });
  const migrations = snapshot.paths.filter((path) => /^supabase\/migrations\/\d+_[^/]+\.sql$/.test(path))
    .map((path) => { const match = /\/(\d+)_(.+)\.sql$/.exec(path); return { path, version: match[1], name: match[2] }; })
    .sort((a, b) => a.version.padEnd(14, "0").localeCompare(b.version.padEnd(14, "0")));
  const baseline = migrations.findIndex((item) => item.name === policy.production.appliedThrough);
  if (baseline < 0) throw new Error("Baseline ausente no commit");
  const pending = migrations.slice(baseline + 1).filter((item) => !(policy.production.appliedOutOfOrder || []).includes(item.name));
  evaluateMigrationBatch(batch, policy, pending.map((item) => item.name));
  const gates = evaluateMenuProductionLaunch(launch);
  const functionConfiguration = snapshot.read("supabase/config.toml").toString("utf8");
  const functionFiles = config.productionFunctions.map((name) => {
    if (!/^[a-z][a-z0-9-]+$/.test(name)) throw new Error("Nome de função inválido");
    const prefix = `supabase/functions/${name}/`;
    const files = snapshot.paths.filter((path) => path.startsWith(prefix));
    if (!files.includes(`${prefix}index.ts`)) throw new Error(`Entrypoint ausente: ${name}`);
    const section = functionConfiguration.split(/(?=^\[)/m).find((block) => block.startsWith(`[functions.${name}]`));
    const jwt = section?.match(/^verify_jwt\s*=\s*(true|false)\s*$/m)?.[1];
    if (!jwt) throw new Error(`Configuração verify_jwt ausente: ${name}`);
    return { name, verifyJwt: jwt === "true", files: files.map(describe) };
  });
  return {
    schemaVersion: 1, mode: "read_only_release_package", sourceCommit: snapshot.commit,
    projectRef: config.productionProjectRef, deploymentPerformed: false, applySupported: false,
    releaseAuthorized: launch.releaseAuthorized === true && gates.verdict === "APPROVED" && batch.authorized === true,
    launchVerdict: gates.verdict,
    pendingDecisions: gates.gates.filter((gate) => gate.status !== "APPROVED").map(({ id, status, remaining }) => ({ id, status, remaining })),
    database: { pendingCount: pending.length, migrations: pending.map((item) => ({ ...item, ...describe(item.path) })),
      remoteVersionAliases: policy.production.remoteVersionAliases || {}, repairHistoryAllowed: false },
    functions: functionFiles,
    sharedFunctionFiles: snapshot.paths.filter((path) => path.startsWith("supabase/functions/_shared/")).map(describe),
    functionConfiguration: describe("supabase/config.toml"),
    excludedFunctions: config.excludedFunctions,
    frontend: { sourceCommit: snapshot.commit, files: config.requiredFrontendFiles.map(describe) },
    rollback: { sourceCommit: rollback.rollbackTarget.ref, productionRehearsalRequired: rollback.localRehearsal.productionRehearsalRequired },
    orderedPhases: config.orderedPhases,
    warnings: ["Pacote local não comprova disponibilidade remota, backup fresco ou aprovação de release.",
      "Nunca executar deploy de todas as funções: homologação e IA externa permanecem excluídas."]
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === "--ref" && /^[0-9a-f]{40}$/.test(args[1]))) {
    throw new Error("Uso: node scripts/menu-release-package.mjs [--ref COMMIT]; não existe modo apply");
  }
  console.log(JSON.stringify(buildReleasePackage(readSnapshot(args[1] || "HEAD")), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
