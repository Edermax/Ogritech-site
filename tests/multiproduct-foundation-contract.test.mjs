import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("contrato da fundação multiproduto fixa produtos, limites e compatibilidade", async () => {
  const contract = JSON.parse(await readFile(new URL("config/multiproduct-foundation.json", root), "utf8"));

  assert.equal(contract.contractVersion, "1.0.0");
  assert.equal(contract.status, "implemented_locally");
  assert.deepEqual(
    contract.platform.products.map(({ code, name }) => [code, name]),
    [
      ["agenda", "Ogritech Agenda"],
      ["pages", "Ogritech Páginas"],
      ["quotes", "Ogritech Orçamentos"],
      ["menu", "Ogritech Cardápio"]
    ]
  );
  assert.equal(contract.platform.tenantTable, "public.barbershops");
  assert.equal(contract.platform.tenantTableRenameIn1B, false);
  assert.ok(contract.phase1B.compatibility.preserveRoutes.includes("/agendar/"));
  assert.ok(contract.phase1B.compatibility.preservePublicRpcs.includes("public.public_create_menu_order"));
  assert.equal(contract.phase1B.security.rlsRequired, true);
  assert.equal(contract.phase1B.security.explicitDataApiGrants, true);
  assert.equal(contract.phase1B.security.denyByDefault, true);
});

test("migração 1B implementa isolamento por produto e compatibilidade do Agenda", async () => {
  const sql = await readFile(
    new URL("supabase/migrations/20260908194456_multiproduct_foundation.sql", root),
    "utf8"
  );

  for (const table of ["platform_products", "platform_modules", "plan_entitlements", "subscription_modules"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\b`, "i"));
  }
  for (const code of ["agenda", "pages", "quotes", "menu"]) {
    assert.match(sql, new RegExp(`'${code}'`));
  }
  assert.match(sql, /platform_subscriptions_one_open_product_idx/i);
  assert.match(sql, /business_has_product_access/i);
  assert.match(sql, /absence means denied|ausência significa negado/i);
  assert.match(sql, /product_id=agenda_product and status<>'cancelled'/i);
  assert.doesNotMatch(sql, /grant\s+[^;]*\s+to\s+anon\s*;/i);
});

test("contrato não amplia autorização para integrações ou ambientes remotos", async () => {
  const contract = JSON.parse(await readFile(new URL("config/multiproduct-foundation.json", root), "utf8"));
  for (const forbidden of ["production deployment", "remote migrations", "whatsapp integration", "ai chatbot"]) {
    assert.ok(contract.scope.forbids.includes(forbidden), `${forbidden} deve permanecer fora do escopo`);
  }
  assert.match(contract.baseline.rule, /Preserve every preexisting change/);
  assert.ok(contract.phase1B.acceptance.includes("No remote environment is changed without a separate authorization."));
});
