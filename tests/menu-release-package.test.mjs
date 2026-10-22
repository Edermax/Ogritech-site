import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildReleasePackage, readSnapshot } from "../scripts/menu-release-package.mjs";

const root = new URL("../", import.meta.url);
function fixture() {
  const config = JSON.parse(readFileSync(new URL("config/menu-release-package.json", root), "utf8"));
  const paths = [
    ...readdirSync(new URL("supabase/migrations/", root)).filter((name) => name.endsWith(".sql")).map((name) => `supabase/migrations/${name}`),
    ...config.requiredFrontendFiles, "supabase/config.toml",
    ...[...config.productionFunctions, "_shared"].flatMap((name) =>
      readdirSync(new URL(`supabase/functions/${name}/`, root)).map((file) => `supabase/functions/${name}/${file}`))
  ];
  const overrides = new Map();
  return { commit: "1".repeat(40), paths, config, overrides,
    read: (path) => overrides.get(path) || readFileSync(new URL(path, root)) };
}

test("release package pins production inputs and preserves all launch blockers", () => {
  const source = fixture();
  const report = buildReleasePackage(source);
  assert.equal(report.database.pendingCount, 24);
  assert.equal(report.functions.length, 7);
  assert.equal(report.functions.find((item) => item.name === "cep-lookup").verifyJwt, false);
  assert.equal(report.functions.find((item) => item.name === "platform-users").verifyJwt, true);
  assert.equal(report.sourceCommit, source.commit);
  assert.equal(report.releaseAuthorized, false);
  assert.equal(report.applySupported, false);
  assert.equal(report.deploymentPerformed, false);
  assert.equal(report.pendingDecisions.length, 7);
  const file = report.database.migrations[0];
  assert.equal(file.sha256, createHash("sha256").update(source.read(file.path)).digest("hex"));
  assert.equal(report.database.remoteVersionAliases.billing_rejected_email_event, "20261003162614");
});

test("sandbox or external AI handlers cannot enter the production function list", () => {
  for (const name of ["menu-sandbox-qa", "menu-sandbox-webhook", "menu-ai-assistant"]) {
    const source = fixture();
    source.config.productionFunctions.push(name);
    source.overrides.set("config/menu-release-package.json", Buffer.from(JSON.stringify(source.config)));
    assert.throws(() => buildReleasePackage(source), /homologação/);
  }
});

test("release package rejects a staging project or an incomplete migration inventory", () => {
  const source = fixture();
  source.config.productionProjectRef = "fuesdztsvrkkgnbqhcxi";
  source.overrides.set("config/menu-release-package.json", Buffer.from(JSON.stringify(source.config)));
  assert.throws(() => buildReleasePackage(source), /produção/);
  const missing = fixture();
  missing.paths = missing.paths.filter((path) => !path.includes("menu_pix_expiry_recovery.sql"));
  assert.throws(() => buildReleasePackage(missing), /divergem/);
});

test("missing function entrypoints cannot be silently omitted", () => {
  const source = fixture();
  source.paths = source.paths.filter((path) => path !== "supabase/functions/cep-lookup/index.ts");
  assert.throws(() => buildReleasePackage(source), /Entrypoint/);
});

test("every production function must have explicit gateway authentication configuration", () => {
  const source = fixture();
  const config = source.read("supabase/config.toml").toString().replace(/\[functions\.cep-lookup\][^]*?(?=\[functions\.)/, "");
  source.overrides.set("supabase/config.toml", Buffer.from(config));
  assert.throws(() => buildReleasePackage(source), /verify_jwt ausente: cep-lookup/);
});

test("snapshot is immutable and rejects branch names and untracked files", () => {
  const sourceCommit = "a".repeat(40);
  const calls = [];
  const command = (_binary, args) => {
    calls.push(args);
    if (args[0] === "rev-parse") return `${sourceCommit}\n`;
    if (args[0] === "ls-tree") return "index.html\n";
    return Buffer.from("committed source");
  };
  const snapshot = readSnapshot("HEAD", command);
  assert.equal(snapshot.read("index.html").toString(), "committed source");
  assert.deepEqual(calls.at(-1), ["show", `${sourceCommit}:index.html`]);
  assert.throws(() => snapshot.read(".env"), /ausente/);
  assert.throws(() => readSnapshot("main", command), /40 caracteres/);
  assert.throws(() => readSnapshot("--help", command), /40 caracteres/);
});
