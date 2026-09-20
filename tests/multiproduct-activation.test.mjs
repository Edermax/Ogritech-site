import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("painel master administra produtos isoladamente", async () => {
  const [html,admin,sql] = await Promise.all([
    readFile(new URL("admin.html",root),"utf8"),
    readFile(new URL("admin.js",root),"utf8"),
    readFile(new URL("supabase/migrations/20260908200932_multiproduct_activation.sql",root),"utf8")
  ]);
  assert.match(html,/id="products"/);
  assert.match(html,/Produtos por negócio/);
  assert.match(admin,/platform_set_product_subscription/);
  assert.match(admin,/Cancelar somente/);
  assert.match(sql,/target_product_code/);
  assert.match(sql,/subscription\.product_status_changed/);
  assert.match(sql,/create function public\.business_product_catalog[^]*?security invoker/i);
  assert.match(sql,/create function public\.platform_set_product_subscription[^]*?security invoker/i);
});

test("painel do negócio oculta solução não contratada e abre a primeira solução ativa", async () => {
  const script = await readFile(new URL("script.js",root),"utf8");
  const html = await readFile(new URL("painel/index.html",root),"utf8");
  const commercial = await readFile(new URL("commercial-admin.js",root),"utf8");
  assert.match(script,/business_product_catalog/);
  assert.match(script,/solution-hidden/);
  assert.match(script,/dataset\.productAllowed === "false"/);
  assert.match(script,/activeProductCodes\.has\("menu"\) \? "cardapio"/);
  assert.match(script,/showSection\(defaultSection\)/);
  assert.match(script,/if \(activeProductCodes\.has\("agenda"\)\)/);
  assert.match(html,/id="menuOrdersPanel"/);
  assert.match(commercial,/view\.prepend\(health\)/);
  assert.match(commercial,/health\.after\(orders\)/);
  assert.match(commercial,/received: "Recebido"/);
  assert.deepEqual([...script.matchAll(/(?:landing|orcamentos|cardapio):\s*"(pages|quotes|menu)"/g)].map((item)=>item[1]),["pages","quotes","menu"]);
});
