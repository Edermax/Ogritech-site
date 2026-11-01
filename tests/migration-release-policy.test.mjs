import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

test("toda migration estÃ¡ classificada para staging e produÃ§Ã£o", () => {
  const result = spawnSync(process.execPath, ["scripts/check-migration-release-policy.mjs"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /81 migrations classificadas/);
  const policy = JSON.parse(readFileSync(new URL("../config/migration-release-policy.json", import.meta.url), "utf8"));
  const held = policy.production.heldMigrations.length;
  const applied = policy.staging.expectedMigrationNames.length - held;
  assert.ok(result.stdout.includes(`produ\u00e7\u00e3o=${applied} aplicadas (`), result.stdout);
  assert.ok(result.stdout.includes(`) + ${held} retidas`), result.stdout);
});
