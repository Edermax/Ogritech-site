import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("métricas do piloto são agregadas, autenticadas e sem dados pessoais", async () => {
  const sql = await readFile(new URL("supabase/migrations/20260919150051_menu_private_pilot_metrics.sql", root), "utf8");
  assert.match(sql, /security invoker/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /public\.is_business_team\(target_barbershop_id\)/);
  assert.match(sql, /revoke all on function public\.menu_pilot_metrics[\s\S]*from public, anon/);
  assert.match(sql, /grant execute on function public\.menu_pilot_metrics[\s\S]*to authenticated/);
  assert.match(sql, /'contains_personal_data', false/);
  assert.doesNotMatch(sql, /jsonb_build_object\([^)]*customer_(?:name|phone|email)/);
});

test("painel mostra limites e condições de interrupção sem listar identidade", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("painel/index.html", root), "utf8"),
    readFile(new URL("commercial-admin.js", root), "utf8")
  ]);
  for (const id of ["menuMetricOrders", "menuMetricConsumers", "menuMetricDuplicates", "menuMetricPrices", "menuPilotMetricsMessage"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(script, /supabaseClient\.rpc\("menu_pilot_metrics"/);
  assert.match(script, /approaching_order_limit/);
  assert.match(script, /consumer_limit_reached/);
  assert.match(script, /price_divergences/);
  assert.match(script, /missing_consent/);
});
