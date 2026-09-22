import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
test("não versiona credenciais privilegiadas nem administrador fixo", async () => {
  const files = ["supabase-config.js", "supabase/functions/platform-users/index.ts"];
  const source = (await Promise.all(files.map((file) => readFile(new URL(file, root), "utf8")))).join("\n");
  assert.doesNotMatch(source, /service_role\s*[=:]\s*["'][A-Za-z0-9_-]+/i);
  assert.doesNotMatch(source, /852ca2d2-6249-4c7c-9f9b-5550695121e5/i);
});

test("função administrativa restringe origem, método, tamanho e autenticação", async () => {
  const source = await readFile(new URL("supabase/functions/platform-users/index.ts", root), "utf8");
  for (const marker of ["allowedOrigins", "request.method !== \"POST\"", "content-length", "request.arrayBuffer", "payload.byteLength", "caller.auth.getUser", "platform_check_rate_limit", "auth_users_without_profile"]) assert.ok(source.includes(marker), marker);
});

test("console administrativo interrompe operação quando Auth e perfis divergem", async () => {
  const source = await readFile(new URL("admin.js", root), "utf8");
  assert.match(source, /auth_users_without_profile/);
  assert.match(source, /Não use convites diretos pelo painel Supabase/);
  assert.match(source, /checkPlatformAdminWithRetry/);
  assert.match(source, /const delays = \[0, 300, 900\]/);
});

test("redefinição administrativa de senha é restrita e não devolve a credencial", async () => {
  const edge = await readFile(new URL("../supabase/functions/platform-users/index.ts", import.meta.url), "utf8");
  const admin = await readFile(new URL("../admin.js", import.meta.url), "utf8");
  assert.match(edge, /action === "reset_password"/);
  assert.match(edge, /validTemporaryPassword/);
  assert.match(edge, /credential_reset: true/);
  assert.doesNotMatch(edge, /reply\(\{ ok: true, temporary/);
  assert.match(admin, /Gerar senha temporária/);
  assert.match(admin, /crypto\.getRandomValues/);
  assert.match(admin, /showTemporaryPassword\(temporaryPassword\)/);
  const adminHtml = await readFile(new URL("../admin.html", import.meta.url), "utf8");
  assert.match(adminHtml, /id="temporaryPasswordValue"/);
});

test("frontend seleciona local, staging e produção explicitamente", async () => {
  const [config, headers, admin] = await Promise.all([
    readFile(new URL("supabase-config.js", root), "utf8"),
    readFile(new URL("_headers", root), "utf8"),
    readFile(new URL("admin.js", root), "utf8")
  ]);
  assert.match(config, /REQUESTED_OGRITECH_ENV/);
  assert.match(config, /http:\/\/127\.0\.0\.1:54321/);
  assert.match(config, /https:\/\/fuesdztsvrkkgnbqhcxi\.supabase\.co/);
  assert.match(config, /https:\/\/mvzcoaiiwytycdqcvydf\.supabase\.co/);
  assert.match(config, /STAGING — DADOS DE TESTE/);
  assert.doesNotMatch(config, /eyJ[A-Za-z0-9_-]+\./);
  assert.match(headers, /https:\/\/fuesdztsvrkkgnbqhcxi\.supabase\.co/);
  assert.match(admin, /checkPlatformAdminWithRetry/);
  const adminHtml = await readFile(new URL("admin.html", root), "utf8");
  assert.match(adminHtml, /https:\/\/fuesdztsvrkkgnbqhcxi\.supabase\.co/);
  assert.match(adminHtml, /admin\.js\?v=20260922\.2/);
  assert.match(admin, /functions\.invoke\("platform-users", \{ body: \{ action: "list" \} \}\)/);
  assert.doesNotMatch(admin, /map\(\(profile\) => \(\{ \.\.\.profile, email: "" \}\)\)/);
});

test("env=staging cria o cliente de staging e persiste somente na sessão", async () => {
  const source = await readFile(new URL("supabase-config.js", root), "utf8");
  const saved = new Map();
  let clientConfig;
  const context = {
    URL, URLSearchParams, Set, Object,
    sessionStorage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value)
    },
    document: {
      readyState: "complete",
      getElementById: () => null,
      createElement: () => ({ setAttribute() {}, style: {} }),
      body: { appendChild() {} }
    },
    window: {
      location: { hostname: "localhost", search: "?env=staging", href: "http://localhost:8080/login.html?env=staging" },
      supabase: { createClient: (url, key) => { clientConfig = { url, key }; return {}; } }
    }
  };
  vm.runInNewContext(source, context);
  assert.equal(context.window.OGRITECH_ENV, "staging");
  assert.equal(clientConfig.url, "https://fuesdztsvrkkgnbqhcxi.supabase.co");
  assert.match(clientConfig.key, /^sb_publishable_/);
  assert.equal(saved.get("ogritechEnvironment"), "staging");
  assert.equal(context.window.ogritechEnvironmentUrl("update-password.html"), "http://localhost:8080/update-password.html?env=staging");
});

test("troca de função reconcilia vínculos operacionais e compensa falhas", async () => {
  const source = await readFile(new URL("supabase/functions/platform-users/index.ts", root), "utf8");
  for (const marker of ["employee_id: employeeId", "client_record_id: clientRecordId", "previousAuth.user.email", "createdRelated", "ban_duration: active ? \"876000h\" : \"none\""]) assert.ok(source.includes(marker), marker);
});

test("service worker busca código novo antes de recorrer ao cache", async () => {
  const source = await readFile(new URL("sw.js", root), "utf8");
  assert.match(source, /needsFreshCode/);
  assert.match(source, /fetch\(event\.request\)[\s\S]+catch\(\(\) => caches\.match\(event\.request\)\)/);
});

test("funções privilegiadas removem o EXECUTE implícito de PUBLIC", async () => {
  const source = await readFile(new URL("supabase/migrations/20260825140414_harden_function_execution.sql", root), "utf8");
  assert.match(source, /revoke all on function public\.is_platform_admin\(\) from public, anon/i);
  assert.match(source, /revoke all on function public\.platform_create_business[\s\S]+from public, anon/i);
  assert.match(source, /revoke all on function public\.platform_record_payment[\s\S]+from public, anon/i);
  assert.match(source, /revoke all on function public\.ogritech_set_updated_at\(\) from public, anon, authenticated/i);
});

test("agendamento real usa RPC validada", async () => {
  const migration = (await Promise.all([
    readFile(new URL("supabase/migrations/202608220001_harden_schema_and_booking.sql", root), "utf8"),
    readFile(new URL("supabase/migrations/20260825213752_harden_operations_and_scheduling.sql", root), "utf8")
  ])).join("\n");
  assert.match(migration, /create or replace function public\.create_appointment/);
  assert.match(migration, /Horário indisponível/);
  assert.match(migration, /Serviço ou profissional inválido/);
  assert.match(migration, /business_appointments_no_employee_overlap/);
  assert.match(migration, /caller\.employee_id = selected_employee\.id/);
});

test("cobranças da plataforma são isoladas e transacionais", async () => {
  const migration = await readFile(new URL("supabase/migrations/202608240001_platform_billing.sql", root), "utf8");
  for (const marker of [
    "create table if not exists public.platform_invoices",
    "create table if not exists public.platform_payments",
    "create table if not exists public.platform_refunds",
    "public.is_platform_admin()",
    "create or replace function public.platform_create_invoice",
    "create or replace function public.platform_record_payment",
    "create or replace function public.platform_register_refund",
    "for update",
    "platform_billing_audit_log"
  ]) assert.ok(migration.includes(marker), marker);
  assert.match(migration, /Pagamento excede o saldo da fatura/);
  assert.match(migration, /Crédito maior que o saldo disponível/);
});

test("agendamento público expõe somente RPCs limitadas e tokens protegidos", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260829100629_public_booking_flow.sql", root), "utf8");
  for (const marker of [
    "private.public_create_appointment",
    "private.public_booking_attempts",
    "accepted_privacy",
    "public_token_hash",
    "digest(secret_token,'sha256')",
    "public_cancel_appointment",
    "Muitas tentativas"
  ]) assert.ok(migration.includes(marker), marker);
  assert.match(migration, /revoke all on table private\.public_booking_attempts from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.public_booking_page[\s\S]+to anon,authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(?:select|insert|update|delete)[\s\S]{0,100}to\s+anon/i);
});

test("soluções comerciais possuem telas funcionais e RPCs públicas limitadas", async () => {
  const [migration, admin, landing, menu, proposal, order, panel] = await Promise.all([
    readFile(new URL("supabase/migrations/20260829145553_public_commercial_flows.sql", root), "utf8"),
    readFile(new URL("commercial-admin.js", root), "utf8"),
    readFile(new URL("pagina/pagina.js", root), "utf8"),
    readFile(new URL("cardapio/cardapio.js", root), "utf8"),
    readFile(new URL("proposta/proposta.js", root), "utf8"),
    readFile(new URL("pedido/pedido.js", root), "utf8"),
    readFile(new URL("painel/index.html", root), "utf8")
  ]);
  for (const marker of ["private.public_submit_landing_lead", "private.public_submit_quote_request", "private.public_create_menu_order", "private.public_commercial_attempts", "digest(secret_token,'sha256')", "accepted_privacy"]) assert.ok(migration.includes(marker), marker);
  for (const marker of ["loadLandingAdmin", "loadQuotesAdmin", "loadMenuAdmin", "send_quote_proposal"]) assert.ok(admin.includes(marker), marker);
  assert.match(landing, /public_submit_landing_lead/);
  assert.match(landing, /public_submit_quote_request/);
  assert.match(menu, /public_create_menu_order/);
  assert.match(proposal, /public_respond_quote_proposal/);
  assert.match(order, /public_get_menu_order/);
  assert.match(panel, /data-section="landing"/);
  assert.match(panel, /data-section="orcamentos"/);
  assert.match(panel, /data-section="cardapio"/);
  assert.doesNotMatch([admin, landing, menu, proposal, order].join("\n"), /service_role/i);
});
