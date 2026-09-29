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

test("painel autenticado rejeita sessão demonstrativa e oferece cadastro real", async () => {
  const [auth, login, loginPage, dashboard, commercial, panel] = await Promise.all([
    read("auth.js"), read("login.js"), read("login/index.html"), read("script.js"), read("commercial-admin.js"), read("painel/index.html")
  ]);
  assert.match(auth, /const \{ data: \{ session \}, error: sessionError \} = await supabaseClient\.auth\.getSession\(\)/);
  assert.match(auth, /hadLegacyDemo \? "criar-cardapio\/" : "login\/"/);
  assert.match(auth, /function saveVerifiedSession[\s\S]*removeItem\("japaDemo"\)/);
  assert.match(dashboard, /menuWorkspaceTitle\.textContent = `Operação de \$\{businessConfig\.name\}`/);
  assert.doesNotMatch(panel, /Operação da Diniz Doces/);
  assert.doesNotMatch(login, /window\.location\.replace\(window\.ogritechEnvironmentUrl\(role === "client"/);
  assert.match(login, /sessionStorage\.removeItem\(key\)/);
  assert.match(panel, /Seu negócio/);
  assert.match(loginPage, /Criar meu cardápio grátis/);
  assert.match(loginPage, /14 dias grátis/);
  assert.match(loginPage, /R\$ 49,90 por mês/);
  assert.match(commercial, /businessConfig\.name = menu\.title/);
  assert.match(commercial, /!menu\?\.template_code \|\| onboarding\?\.next_step === "catalog"/);
  assert.match(commercial, /selectMenuWorkspace\("settings"\)/);
});
