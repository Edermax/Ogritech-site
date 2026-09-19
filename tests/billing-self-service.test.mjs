import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("oferta única calcula descontos sobre o total do período", async () => {
  const page = await read("contratar/index.html");
  const script = await read("contratar/contratar.js");
  for (const value of ["R$ 97,00", "R$ 282,27", "R$ 552,90", "R$ 1.047,60"]) assert.match(page, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(script, /quarterly:\{months:3,discount:3,total:28227/);
  assert.match(script, /semiannual:\{months:6,discount:5,total:55290/);
  assert.match(script, /annual:\{months:12,discount:10,total:104760/);
});

test("billing protege teste por CNPJ e dados pré-autenticação", async () => {
  const migration = await read("supabase/migrations/20260906194944_ogritech_billing_self_service.sql");
  assert.match(migration, /tax_document text not null unique/);
  assert.match(migration, /interval '14 days'/);
  assert.match(migration, /revoke all on table private\.billing_signups[\s\S]+from public, anon, authenticated/);
  assert.match(migration, /monthly_fee=97/);
});

test("webhook valida assinatura e processa eventos idempotentemente", async () => {
  const webhook = await read("supabase/functions/mercado-pago-webhook/index.ts");
  for (const marker of ["x-signature", "x-request-id", "MERCADO_PAGO_WEBHOOK_SECRET", "provider_event_id", "23505", "secureEqual"]) assert.ok(webhook.includes(marker), marker);
  assert.doesNotMatch(webhook, /APP_USR-[A-Za-z0-9-]+/);
});

test("checkout restringe meios e exige aceites", async () => {
  const page = await read("contratar/index.html");
  assert.match(page, /Cartão recorrente/); assert.match(page, />Pix</);
  assert.doesNotMatch(page, /name="payment_method" value="(?:boleto|pix_automatico|point)"/);
  assert.match(page, /name="accepted_terms" required/);
  assert.match(page, /name="recurring_authorized"/);
});

test("ciclo de vida automatiza Pix, suspensão e liberação", async () => {
  const lifecycle = await read("supabase/functions/billing-lifecycle/index.ts");
  const webhook = await read("supabase/functions/mercado-pago-webhook/index.ts");
  const checkout = await read("supabase/functions/ogritech-billing/index.ts");
  for (const marker of ["48 * 60 * 60", "payment_pending", "billing_set_business_access", "access_suspended"]) assert.ok(lifecycle.includes(marker), marker);
  assert.match(webhook, /payment_requested_at: null/);
  assert.match(webhook, /enabled: true/);
  assert.doesNotMatch(checkout, /payment_method_id: "pix"/);
  assert.match(checkout, /billing_not_configured/);
});

test("e-mail entrega gerenciamento e elimina o token da fila", async () => {
  const dispatcher = await read("supabase/functions/billing-email-dispatch/index.ts");
  assert.match(dispatcher, /management_token/);
  assert.match(dispatcher, /payload: \{ delivered: true \}/);
  assert.match(dispatcher, /escapeHtml/);
});
