import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { evaluateRollbackContract, rehearseRollbackHttp, undoCloudflareEmailProtection } from "../scripts/menu-production-rollback-rehearsal.mjs";

const root = new URL("../", import.meta.url);

test("hosted verification reverses only observed Cloudflare email protection", () => {
  const encoded = (value) => {
    const key = 7;
    return Buffer.from([key, ...Buffer.from(value).map((byte) => byte ^ key)]).toString("hex");
  };
  const email = "suporte@example.invalid";
  const original = `<a href="mailto:${email}">${email}</a><script src="app.js"></script>`;
  const hosted = `<a href="/cdn-cgi/l/email-protection#${encoded(email)}"><span class="__cf_email__" data-cfemail="${encoded(email)}">[email&#160;protected]</span></a><script data-cfasync="false" src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script><script src="app.js"></script>`;
  assert.equal(undoCloudflareEmailProtection(hosted), original);
  assert.notEqual(undoCloudflareEmailProtection(hosted.replace("app.js", "changed.js")), original);
  assert.notEqual(undoCloudflareEmailProtection(`${hosted}<script src="injected.js"></script>`), original);
  assert.throws(() => undoCloudflareEmailProtection('<a href="/cdn-cgi/l/email-protection#abc">x</a>'), /inválida/);
});

test("rollback serves exactly the immutable snapshot over isolated HTTP", async () => {
  const result = await rehearseRollbackHttp("a".repeat(40), ["index.html", "pedido/pedido.js"], (file) => Buffer.from(`snapshot:${file}`));
  assert.equal(result.files.length, 2);
  assert.ok(result.files.every((file) => file.status === 200 && /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.equal(result.remoteChangesPerformed, false);
  assert.equal(result.productionRehearsalRequired, true);
  await assert.rejects(rehearseRollbackHttp("main", ["index.html"]), /imutável/);
  await assert.rejects(rehearseRollbackHttp("a".repeat(40), ["../private/data.html"]), /inválidos/);
});

test("contrato de rollback bloqueia reversão destrutiva e preserva acompanhamento", async () => {
  const contract = JSON.parse(await readFile(new URL("config/menu-production-rollback.json", root), "utf8"));
  const result = evaluateRollbackContract(contract, contract.rollbackTarget.requiredFiles);
  assert.equal(result.passed, true);
  assert.equal(contract.database.downMigrationsAllowed, false);
  assert.equal(contract.entryControl.preserveExistingOrderTracking, true);
  assert.ok(contract.stopConditions.includes("rollback_ref_not_verified_as_current_production"));
});

test("ensaio confirma que o commit imutável pode fornecer o frontend anterior", () => {
  const result = spawnSync(process.execPath, ["scripts/menu-production-rollback-rehearsal.mjs"], {
    cwd: root,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.passed, true);
  assert.equal(report.remoteChangesPerformed, false);
  assert.equal(report.requiredFiles, 6);
});

test("contrato incompleto falha fechado", () => {
  const result = evaluateRollbackContract({
    rollbackTarget: { ref: "main", requiredFiles: ["missing.html"] },
    entryControl: {},
    database: { downMigrationsAllowed: true },
    orderedSteps: []
  }, []);
  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("rollback_ref_not_immutable"));
  assert.ok(result.failures.includes("down_migrations_not_blocked"));
});
