import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

export function evaluateMigrationBatch(batch, policy, migrationNames) {
  if (batch.strategy !== "contiguous_tail") throw new Error("A estratégia deve preservar a cauda contígua do histórico.");
  if (batch.baseline !== policy.production.appliedThrough) throw new Error("Baseline do lote diverge da política de produção.");
  const held = policy.production.heldMigrations.map((item) => item.name);
  const classified = Object.values(batch.classifications).flat();
  if (new Set(classified).size !== classified.length) throw new Error("Uma migration foi classificada mais de uma vez.");
  if (JSON.stringify(held) !== JSON.stringify(migrationNames)) throw new Error("Arquivos pendentes divergem da política de produção.");
  if (JSON.stringify([...classified].sort()) !== JSON.stringify([...held].sort())) throw new Error("Toda migration pendente deve possuir classificação explícita.");
  let previous = -1;
  for (const name of batch.requiredMenuMigrations) {
    const index = held.indexOf(name);
    if (index < 0 || index <= previous) throw new Error(`Dependência do Cardápio ausente ou fora de ordem: ${name}`);
    previous = index;
  }
  const firstMenuIndex = held.indexOf(batch.requiredMenuMigrations[0]);
  const interleavedBeforeMenu = held.slice(0, firstMenuIndex);
  const trailingNonMenu = held.slice(firstMenuIndex).filter((name) => !batch.requiredMenuMigrations.includes(name));
  const verdict = batch.authorized === true ? "READY_FOR_DRY_RUN" : "BLOCKED";
  if (batch.authorized === true && batch.decision !== "APPROVED") throw new Error("Lote autorizado exige decisão APPROVED.");
  return { verdict, total: held.length, menuRequired: batch.requiredMenuMigrations.length, interleavedBeforeMenu, trailingNonMenu };
}

async function main() {
  const [batch, policy] = await Promise.all([
    readJson("config/menu-production-migration-batch.json"),
    readJson("config/migration-release-policy.json")
  ]);
  const files = (await readdir(new URL("supabase/migrations/", root))).filter((name) => name.endsWith(".sql"));
  const names = files.map((file) => /^(\d+)_([^/]+)\.sql$/.exec(file)).filter(Boolean)
    .sort((a, b) => BigInt(a[1].padEnd(14, "0")) < BigInt(b[1].padEnd(14, "0")) ? -1 : 1)
    .map((match) => match[2]);
  const baselineIndex = names.indexOf(policy.production.appliedThrough);
  if (baselineIndex < 0) throw new Error("Baseline de produção não encontrado nos arquivos.");
  const appliedOutOfOrder = policy.production.appliedOutOfOrder ?? [];
  const pendingNames = names.slice(baselineIndex + 1).filter((name) => !appliedOutOfOrder.includes(name));
  const result = evaluateMigrationBatch(batch, policy, pendingNames);
  if (batch.productionDryRun?.status === "PASSED" && batch.productionDryRun.migrationCount !== result.total) {
    throw new Error("Contagem do dry-run de produção diverge da fila pendente.");
  }
  console.log(`Lote Cardápio: ${result.verdict}; ${result.total} migrations pendentes, ${result.menuRequired} exigidas diretamente pelo produto.`);
  console.log(`Antes do núcleo do Cardápio: ${result.interleavedBeforeMenu.join(", ") || "nenhuma"}.`);
  console.log(`Após o início do núcleo, fora do MVP: ${result.trailingNonMenu.join(", ") || "nenhuma"}.`);
  if (process.env.REQUIRE_MENU_MIGRATION_BATCH_APPROVAL === "true" && result.verdict !== "READY_FOR_DRY_RUN") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
