import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("centro de assinatura oferece jornada autônoma e suporte opcional", async () => {
  const page = await read("painel/index.html");
  const script = await read("subscription-admin.js");
  for (const text of ["Suas soluções Ogritech", "Exportar meus dados", "Cancelar renovação", "Manter assinatura"]) assert.match(`${page}\n${script}`, new RegExp(text));
  assert.match(page, /a Ogritech está disponível para ajudar/);
  assert.match(script, /As outras soluções continuarão ativas/);
  assert.match(script, /current_period_end/);
});

test("ações comerciais são delegadas ao servidor e exportação remove tokens", async () => {
  const migration = await read("supabase/migrations/20260909213832_commercial_self_service_lifecycle.sql");
  const script = await read("subscription-admin.js");
  for (const rpc of ["business_subscription_center", "self_service_product_subscription", "self_service_subscription_module", "business_portability_export"]) assert.match(`${migration}\n${script}`, new RegExp(rpc));
  assert.match(migration, /role='owner'/);
  assert.match(migration, /target_action not in \('subscribe','change_plan','cancel','reactivate'\)/);
  assert.match(migration, /to_jsonb\(o\)-'public_access_token'-'idempotency_key'/);
  assert.match(migration, /subscription\.self_service_/);
  assert.match(script, /new Blob\(\[JSON\.stringify\(data/);
});

test("wrappers públicos permanecem invoker e funções privadas não são expostas", async () => {
  const migration = await read("supabase/migrations/20260909213832_commercial_self_service_lifecycle.sql");
  assert.match(migration, /language sql security invoker/g);
  assert.match(migration, /revoke all on function private\.[\s\S]+from public,anon,authenticated/);
  assert.match(migration, /revoke all on function public\.[\s\S]+from public,anon/);
});
