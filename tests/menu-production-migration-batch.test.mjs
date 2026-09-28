import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateMigrationBatch } from "../scripts/menu-production-migration-batch.mjs";

const names = ["shared", "multiproduct_foundation", "multiproduct_activation", "menu_catalog_core", "menu_cart_orders", "menu_self_service_onboarding", "commercial_self_service_lifecycle", "menu_assistant_foundation", "tenant_specific"];
const policy = { production: { appliedThrough: "baseline", heldMigrations: names.map((name) => ({ name })) } };
const batch = {
  baseline: "baseline",
  strategy: "contiguous_tail",
  authorized: false,
  decision: "BLOCKED_PENDING_REVIEW",
  requiredMenuMigrations: names.slice(1, 8),
  classifications: { shared: ["shared"], menu: names.slice(1, 8), tenant: ["tenant_specific"] }
};

test("lote exige classificação completa e preserva a ordem do Cardápio", () => {
  const result = evaluateMigrationBatch(batch, policy, names);
  assert.equal(result.verdict, "BLOCKED");
  assert.deepEqual(result.interleavedBeforeMenu, ["shared"]);
  assert.deepEqual(result.trailingNonMenu, ["tenant_specific"]);
});

test("lote rejeita histórico parcial ou classificação duplicada", () => {
  assert.throws(() => evaluateMigrationBatch(batch, policy, names.slice(1)), /divergem/);
  const duplicate = structuredClone(batch);
  duplicate.classifications.tenant.push("shared");
  assert.throws(() => evaluateMigrationBatch(duplicate, policy, names), /mais de uma vez/);
});

test("autorização exige decisão explícita", () => {
  const invalid = { ...batch, authorized: true };
  assert.throws(() => evaluateMigrationBatch(invalid, policy, names), /APPROVED/);
});

test("migrations específicas da Diniz são inertes quando a empresa não existe", async () => {
  const files = [
    "20260918123817_diniz_sunday_hours_and_sweets_quantity.sql",
    "20260920171325_diniz_automatic_delivery_distance.sql",
    "20260920173002_restore_diniz_delivery_zones_after_geocode_validation.sql",
    "20260920184240_enable_diniz_geoapify_delivery.sql"
  ];
  for (const file of files) {
    const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    assert.match(sql, /where (?:slug = 'diniz-doces-previa-7d1'|id in \()/i);
    assert.doesNotMatch(sql, /raise exception 'Cardápio da Diniz não encontrado'/i);
  }
  for (const file of files.slice(1)) {
    const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    assert.match(sql, /if target_menu\.id is null then return; end if;/i);
  }
});

test("migrations de IA permanecem negadas por padrão", async () => {
  const controls = await readFile(new URL("../supabase/migrations/20260910162119_menu_ai_staging_controls.sql", import.meta.url), "utf8");
  assert.match(controls, /hybrid_enabled boolean not null default false/i);
  assert.match(controls, /kill_switch boolean not null default true/i);
  assert.match(controls, /if controls\.kill_switch or not controls\.hybrid_enabled then return/i);
});
