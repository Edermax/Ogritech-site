import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("auditoria de schema acompanha a baseline de migrações aprovada para produção", async () => {
  const [source, policy, files] = await Promise.all([
    readFile(new URL("scripts/audit-production-schema.sql", root), "utf8"),
    readFile(new URL("config/migration-release-policy.json", root), "utf8").then(JSON.parse),
    readdir(new URL("supabase/migrations/", root))
  ]);
  const migrations = files.filter((file) => /^\d+_.+\.sql$/.test(file)).sort().map((file) => file.replace(/^\d+_/, "").replace(/\.sql$/, ""));
  const baselineIndex = migrations.indexOf(policy.production.appliedThrough);
  assert.ok(baselineIndex >= 0, "baseline de produção deve existir no repositório");
  const expected = baselineIndex + 1 + policy.production.appliedOutOfOrder.length;
  assert.match(source, new RegExp(`if actual <> ${expected} then`));
  assert.match(source, new RegExp(`latest_name is distinct from '${policy.production.appliedThrough}'`));
});
