import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("contratação antiga é retirada e o Cardápio mantém sua oferta", async () => {
 const page = await read("contratar/index.html");const home=await read("index.html");
 assert.match(page,/http-equiv="refresh"/);assert.doesNotMatch(page,/contratar\.js/);assert.match(home,/R\$ 49,90/);assert.match(home,/R\$ 499/);
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

test("cadastro do Cardápio exige termos sem solicitar cartão", async () => {
 const page=await read("criar-cardapio/index.html");assert.match(page,/accepted_terms/);assert.doesNotMatch(page,/name="card_number"/);
});

test("backend recusa novas contratações de produtos encerrados", async () => {
 const handler=await read("supabase/functions/ogritech-billing/index.ts");assert.match(handler,/product_retired/);assert.match(handler,/parsed.data.product !== "menu"/);
});

test("ciclo de vida automatiza Pix, suspensão e liberação", async () => {
  const lifecycle = await read("supabase/functions/billing-lifecycle/index.ts");
  const webhook = await read("supabase/functions/mercado-pago-webhook/index.ts");
  const checkout = await read("supabase/functions/ogritech-billing/index.ts");
  const bridge = await read("supabase/migrations/20261002195500_billing_explicit_backend_rpcs.sql");
  for (const marker of ["48 * 60 * 60", "backend_billing_lifecycle_record_pix", "backend_billing_lifecycle_suspend"]) assert.ok(lifecycle.includes(marker), marker);
  assert.match(bridge, /payment_requested_at=null/);
  assert.match(bridge, /billing_set_business_access\(business_id,true\)/);
  assert.match(bridge, /access_suspended/);
  assert.match(webhook, /backend_billing_webhook_apply/);
  assert.doesNotMatch(checkout, /payment_method_id: "pix"/);
  assert.match(checkout, /billing_not_configured/);
});

test("e-mail entrega gerenciamento e elimina o token da fila", async () => {
  const dispatcher = await read("supabase/functions/billing-email-dispatch/index.ts");
  const template = await read("supabase/functions/_shared/billing-email-template.ts");
  assert.match(template, /management_token/);
  assert.match(template, /payment_rejected/);
  assert.match(template, /Não foi possível confirmar seu pagamento/);
  assert.match(template, /role="presentation"/);
  assert.match(template, /max-width:600px/);
  assert.match(template, /@media only screen and \(max-width:620px\)/);
  assert.match(template, /alt="Ogritech"/);
  assert.match(template, /Suporte: suporte@ogritech\.com\.br/);
  assert.match(dispatcher, /text: email\.text/);
  assert.match(dispatcher, /payload: \{ delivered: true \}/);
  assert.match(template, /escapeHtml/);
});
