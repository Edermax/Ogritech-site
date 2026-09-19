import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../scripts/auth-login-bot.mjs", import.meta.url), "utf8");

test("bot de Auth exige segredo no processo e sempre remove sua fixture", () => {
  assert.match(source, /process\.env\.OGRITECH_STAGING_SECRET_KEY/);
  assert.match(source, /\/auth\/v1\/admin\/users\/\$\{userId\}/);
  assert.match(source, /finally\s*\{/);
  assert.match(source, /await deleteFixture\(userId\)/);
  assert.doesNotMatch(source, /service_role\s*[:=]\s*["']/i);
});
