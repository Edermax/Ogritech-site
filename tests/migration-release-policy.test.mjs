import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("toda migration está classificada para staging e produção", () => {
  const result = spawnSync(process.execPath, ["scripts/check-migration-release-policy.mjs"], {
    cwd: new URL("../", import.meta.url),
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /65 migrations classificadas/);
  assert.match(result.stdout, /produção=36 aplicadas \+ 29 retidas/);
});
