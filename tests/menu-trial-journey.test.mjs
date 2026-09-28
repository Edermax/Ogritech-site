import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");

test("jornada do Cardápio inicia teste gratuito e provisiona o produto correto", async () => {
  const [landing, page, client, billing, migration] = await Promise.all([
    read("index.html"), read("criar-cardapio/index.html"), read("criar-cardapio/criar-cardapio.js"),
    read("supabase/functions/ogritech-billing/index.ts"), read("supabase/migrations/20260928173425_menu_trial_self_service.sql")
  ]);
  assert.match(landing, /href="\/criar-cardapio\/"/);
  assert.match(page, /14 dias grátis/);
  assert.match(page, /R\$ 49,90/);
  assert.match(page, /Não pedimos cartão agora/);
  assert.match(client, /product:"menu"/);
  assert.match(client, /payment_method:"pix"/);
  assert.match(billing, /menu: 4990/);
  assert.match(billing, /status: "trial"/);
  assert.match(migration, /unique\(product_code,tax_document\)/);
  assert.match(migration, /product_code='menu' and base_monthly_cents=4990/);
});
