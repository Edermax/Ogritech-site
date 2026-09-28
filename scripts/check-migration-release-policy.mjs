import { readdir, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const policy = JSON.parse(await readFile(new URL("config/migration-release-policy.json", root), "utf8"));
const files = (await readdir(new URL("supabase/migrations/", root)))
  .filter((name) => name.endsWith(".sql"));

const migrations = files.map((file) => {
  const match = /^(\d+)_([^/]+)\.sql$/.exec(file);
  if (!match) throw new Error(`Nome de migration inválido: ${file}`);
  return { version: match[1], name: match[2], file };
});

migrations.sort((a, b) => {
  const left = BigInt(a.version.padEnd(14, "0"));
  const right = BigInt(b.version.padEnd(14, "0"));
  return left < right ? -1 : left > right ? 1 : 0;
});
const names = migrations.map(({ name }) => name);
const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
if (duplicateNames.length) throw new Error(`Nomes de migration duplicados: ${[...new Set(duplicateNames)].join(", ")}`);

const stagingNames = policy.staging.expectedMigrationNames;
if (JSON.stringify(names) !== JSON.stringify(stagingNames)) {
  const missing = names.filter((name) => !stagingNames.includes(name));
  const stale = stagingNames.filter((name) => !names.includes(name));
  throw new Error(
    `Política de staging fora de sincronia. Novas/não classificadas: ${missing.join(", ") || "nenhuma"}; ` +
    `ausentes no repositório: ${stale.join(", ") || "nenhuma"}.`
  );
}

const baselineIndex = names.indexOf(policy.production.appliedThrough);
if (baselineIndex < 0) throw new Error(`Baseline de produção desconhecido: ${policy.production.appliedThrough}`);
const tailNames = names.slice(baselineIndex + 1);
const appliedOutOfOrder = policy.production.appliedOutOfOrder ?? [];
const duplicateApplied = appliedOutOfOrder.filter((name, index) => appliedOutOfOrder.indexOf(name) !== index);
if (duplicateApplied.length) {
  throw new Error(`Migrations aplicadas fora de ordem duplicadas: ${[...new Set(duplicateApplied)].join(", ")}`);
}
const unknownApplied = appliedOutOfOrder.filter((name) => !tailNames.includes(name));
if (unknownApplied.length) {
  throw new Error(`Migrations fora de ordem não pertencem à cauda local: ${unknownApplied.join(", ")}`);
}
const pendingNames = tailNames.filter((name) => !appliedOutOfOrder.includes(name));
const heldNames = policy.production.heldMigrations.map(({ name }) => name);
if (JSON.stringify(pendingNames) !== JSON.stringify(heldNames)) {
  throw new Error(
    `Fila de produção não classificada. Pendentes locais: ${pendingNames.join(", ") || "nenhuma"}; ` +
    `bloqueadas na política: ${heldNames.join(", ") || "nenhuma"}.`
  );
}
for (const item of policy.production.heldMigrations) {
  if (!item.reason?.trim()) throw new Error(`Migration bloqueada sem justificativa: ${item.name}`);
}

console.log(
  `OK: ${names.length} migrations classificadas; staging=${stagingNames.length}; ` +
  `produção=${baselineIndex + 1 + appliedOutOfOrder.length} aplicadas ` +
  `(${baselineIndex + 1} contíguas + ${appliedOutOfOrder.length} fora de ordem) + ${heldNames.length} retidas.`
);
