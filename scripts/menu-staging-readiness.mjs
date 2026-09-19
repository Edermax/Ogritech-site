import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);
const contract = await readJson("config/menu-staging-phase-7e-readiness.json");
const beta = await readJson("config/menu-beta-phase-7d-result.json");
const ai = await readJson("config/menu-assistant-phase-6l-final.json");
const policy = await readJson("config/migration-release-policy.json");
const config = await readFile(new URL("supabase/config.toml", root), "utf8");
const migrationFiles = (await readdir(new URL("supabase/migrations/", root))).filter((file) => file.endsWith(".sql"));

const migrationByName = new Map(migrationFiles.map((file) => {
  const match = /^\d+_(.+)\.sql$/.exec(file);
  return [match?.[1], file];
}));
const checks = [];
const check = (id, passed, detail) => checks.push({ id, passed: Boolean(passed), detail });

check("phase_7d_passed", beta.status === "passed_local_human_beta" && beta.segmentsCompleted === 4, "Beta humano local concluiu quatro segmentos.");
check("assessment_is_local_only", contract.assessmentOnly && !contract.executionAuthorized && !contract.remoteChangesPerformed, "Contrato não autoriza execução remota.");
check("production_is_blocked", !contract.productionAuthorized && contract.prohibitedDuringHomologation.includes("production_changes"), "Produção permanece fora do escopo.");
check("migration_inventory", migrationFiles.length === contract.currentState.localMigrationCount, `${migrationFiles.length} migrations locais encontradas.`);
check("staging_policy_matches", policy.staging.expectedMigrationNames.length === contract.currentState.stagingMigrationCountRecorded, `${policy.staging.expectedMigrationNames.length} migrations esperadas em staging.`);
check("production_hold_matches", policy.production.heldMigrations.length === contract.currentState.productionMigrationsHeld, `${policy.production.heldMigrations.length} migrations retidas para produção.`);
check("menu_migrations_exist", contract.currentState.menuMigrations.every((name) => migrationByName.has(name)), "Todas as migrations do Cardápio existem localmente.");

const menuSql = (await Promise.all(contract.currentState.menuMigrations.map((name) => readFile(new URL(`supabase/migrations/${migrationByName.get(name)}`, root), "utf8")))).join("\n").toLowerCase();
check("menu_rls_declared", menuSql.includes("enable row level security"), "As migrations do Cardápio habilitam RLS.");
check("menu_access_policies_declared", menuSql.includes("create policy") && (menuSql.includes("grant ") || menuSql.includes("revoke ")), "Políticas e privilégios explícitos estão declarados.");
check("postgres_17", config.includes("major_version = 17"), "Configuração local usa PostgreSQL 17.");
check("ai_remains_disabled", ai.publicMode === "deterministic" && !ai.externalModelEnabled && !ai.externalCallsAuthorized, "IA externa permanece desligada.");
check("synthetic_only", contract.requiredPreflightGates.includes("synthetic_dot_invalid_identities_only") && contract.prohibitedDuringHomologation.includes("real_business_or_customer_data"), "Somente identidades sintéticas .invalid são permitidas.");
check("cleanup_zero", contract.acceptanceCriteria.residualSyntheticRecordsAfterCleanup === 0, "O aceite exige zero registro sintético residual.");

const failed = checks.filter(({ passed }) => !passed);
const report = {
  generatedAt: new Date().toISOString(),
  phase: "7E",
  status: failed.length ? "blocked" : "ready_for_explicit_authorization",
  remoteCalls: 0,
  changesAppliedRemotely: false,
  checks
};
await mkdir(new URL("outputs/", root), { recursive: true });
await writeFile(new URL("outputs/menu-staging-phase-7e-readiness.json", root), `${JSON.stringify(report, null, 2)}\n`);

if (failed.length) {
  throw new Error(`Prontidão bloqueada: ${failed.map(({ id }) => id).join(", ")}`);
}
console.log(`OK: ${checks.length}/${checks.length} gates locais aprovados; execução remota continua desautorizada.`);
