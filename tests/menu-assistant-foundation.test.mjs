import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("assistente do Cardápio é opcional, determinístico e sem modelo externo", async () => {
  const migration = await read("supabase/migrations/20260910131725_menu_assistant_foundation.sql");
  const page = await read("cardapio/index.html");
  const admin = await read("painel/index.html");
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /'mode','deterministic','external_model',false/);
  assert.match(admin, /ASSISTENTE DO CARDÁPIO · PADRÃO/);
  assert.match(admin, /Ele não usa IA paga, não inventa preços e nunca envia pedidos sem confirmação/);
  assert.match(admin, /IA · RECURSO FUTURO DESATIVADO/);
  assert.match(page, /Não envia pedidos sozinho/);
  assert.match(page, /baseadas somente nos dados cadastrados/);
});

test("decisão final mantém IA preparada, desligada e fora das ações críticas", async () => {
  const decision = JSON.parse(await read("config/menu-assistant-phase-6l-final.json"));
  assert.equal(decision.status, "deterministic_default_ai_disabled");
  assert.equal(decision.publicMode, "deterministic");
  assert.equal(decision.publicAI, false);
  assert.equal(decision.externalModelPrepared, true);
  assert.equal(decision.externalModelEnabled, false);
  assert.equal(decision.externalCallsAuthorized, false);
  assert.equal(decision.criticalActionsByModel, false);
  assert.equal(decision.productionAuthorized, false);
  assert.equal(decision.billingImpact, "none");
  assert.ok(decision.reactivationRequirements.includes("new_explicit_authorization"));
});

test("ferramentas retornam referências estruturadas e exigem confirmação humana", async () => {
  const migration = await read("supabase/migrations/20260910131725_menu_assistant_foundation.sql");
  const script = await read("cardapio/cardapio.js");
  assert.match(migration, /'menu_item_price_id',price\.id/);
  assert.match(migration, /'requires_confirmation',true/);
  assert.match(migration, /'type','open_cart'/);
  assert.match(script, /button\.addEventListener\("click", \(\) =>/);
  assert.doesNotMatch(script, /public_create_menu_order_v2[\s\S]*menuAssistant/);
});

test("limites, hashes e defesa contra prompt injection ficam no servidor", async () => {
  const migration = await read("supabase/migrations/20260910131725_menu_assistant_foundation.sql");
  for (const marker of ["monthly_interaction_limit", "per_session_hourly_limit", "monthly_cost_cap_cents", "session_hash", "message_hash", "unsafe_instruction", "Limite do assistente atingido"]) assert.ok(migration.includes(marker), marker);
  const eventTable = migration.match(/create table private\.menu_assistant_events \(([\s\S]*?)\);/)?.[1] || "";
  assert.doesNotMatch(eventTable, /message text|session_token|supplied_message/);
  assert.match(migration, /estimated_unit_cost_micros integer not null default 0/);
});
