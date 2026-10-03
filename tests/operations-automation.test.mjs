import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const load = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("backup diário publica e resolve incidente operacional", async () => {
  const workflow = await load(".github/workflows/backup-production.yml");
  assert.match(workflow, /issues: write/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /\$\{\{ job\.status \}\}/);
  assert.match(workflow, /production-backup/);
  assert.match(workflow, /Falha no backup diário de produção/);
  assert.match(workflow, /state: "closed"/);
  assert.match(workflow, /function-acl\.sql/);
  assert.match(workflow, /aclexplode/);
  assert.match(workflow, /revoke execute on all functions in schema public/);
});

test("restauração reaplica ACLs e separa baseline do Cardápio promovido", async () => {
  const workflow = await load(".github/workflows/restore-drill.yml");
  assert.match(workflow, /--file restored\/backup\/function-acl\.sql/);
  assert.match(workflow, /expect_menu_schema/);
  assert.match(workflow, /EXPECT_MENU_SCHEMA/);
  assert.match(workflow, /menu-cart-orders\.test\.sql/);
});

test("workflows usam gerações atuais das Actions de artefato", async () => {
  const paths = [
    ".github/workflows/backup-production.yml",
    ".github/workflows/go-live-readiness.yml",
    ".github/workflows/pilot-agenda-synthetic.yml",
    ".github/workflows/restore-drill.yml"
  ];
  const workflows = (await Promise.all(paths.map(load))).join("\n");
  assert.doesNotMatch(workflows, /actions\/(?:upload|download)-artifact@v[1-6]\b/);
  assert.doesNotMatch(workflows, /supabase\/setup-cli@v[12]\b/);
  assert.match(workflows, /actions\/upload-artifact@v7/);
  assert.match(workflows, /actions\/download-artifact@v8/);
  assert.match(workflows, /supabase\/setup-cli@v3/);
});

test("gate executa em todo push e considera todos os incidentes operacionais", async () => {
  const [workflow, gate] = await Promise.all([
    load(".github/workflows/go-live-readiness.yml"),
    load("scripts/go-live-gate.mjs")
  ]);
  assert.match(workflow, /push:\s*\n\s*branches: \[main\]/);
  assert.doesNotMatch(workflow, /\n\s+paths:/);
  for (const label of ["synthetic-agenda-pilot", "staging-agenda-monitor", "production-monitor", "production-backup", "production-schema-drift", "auth-security-monitor"]) {
    assert.match(gate, new RegExp(`labels=${label}`));
  }
  assert.match(gate, /auditoria-automacoes-2026-09-02\.md/);
});

test("auditoria Auth arquiva somente campos redigidos e alerta regressões", async () => {
  const [workflow, script] = await Promise.all([
    load(".github/workflows/audit-auth-security.yml"),
    load("scripts/audit-auth-config.mjs")
  ]);
  assert.match(workflow, /auth-security-monitor/);
  assert.match(workflow, /AUTH_CONFIG_REPORT/);
  assert.match(script, /password_min_length/);
  assert.match(script, /password_hibp_enabled/);
  assert.match(workflow, /harden_staging/);
  assert.match(workflow, /HARDEN_STAGING_PASSWORD_POLICY/);
  assert.match(workflow, /HARDEN_PRODUCTION_PASSWORD_POLICY/);
  assert.match(script, /password_min_length: 8/);
  assert.match(script, /STRONG_PASSWORD_CHARACTERS/);
  assert.doesNotMatch(script, /smtp_pass/);
});

test("auditoria diária detecta drift real de schema sem bloquear o backup", async () => {
  const [workflow, sql, backup] = await Promise.all([
    load(".github/workflows/audit-schema-production.yml"),
    load("scripts/audit-production-schema.sql"),
    load(".github/workflows/backup-production.yml")
  ]);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /supabase db query --db-url/);
  assert.match(workflow, /production-schema-drift/);
  assert.match(sql, /supabase_migrations\.schema_migrations/);
  assert.match(sql, /actual <> 55/);
  assert.match(sql, /billing_rejected_email_event/);
  assert.match(sql, /not c\.relrowsecurity/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.doesNotMatch(backup, /audit-production-schema\.sql/);
});

test("monitor de staging obtém o commit imutável usado no ensaio de rollback", async () => {
  const workflow = await load(".github/workflows/monitor-agenda-staging.yml");
  assert.match(workflow, /actions\/checkout@v5[\s\S]*?fetch-depth: 0/);
});
