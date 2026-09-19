import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("contrato de staging falha fechado em todas as camadas", async () => {
  const [contract, migration, config] = await Promise.all([
    read("config/menu-ai-staging-contract.json").then(JSON.parse),
    read("supabase/migrations/20260910162119_menu_ai_staging_controls.sql"),
    read("supabase/config.toml")
  ]);
  assert.equal(contract.status, "staging_prepared_ai_disabled");
  assert.equal(contract.operatingMode, "ambiguous_messages_only");
  assert.equal(contract.model, "gpt-5.6-luna");
  assert.equal(contract.serviceTier, "default");
  assert.equal(contract.providerTimeoutMs, 6000);
  assert.deepEqual(contract.latencyPolicy, { hybridJourneyP95Ms: 2500, modelRouteDiagnosticP95Ms: 6000, modelRouteIsExcludedFromCriticalActions: true });
  assert.deepEqual(contract.defaults, { functionEnabled: true, globalHybridEnabled: false, globalKillSwitch: true, businessOptIn: false, maximumCalls: 0, maximumCostCents: 0 });
  assert.match(migration, /hybrid_enabled boolean not null default false/);
  assert.match(migration, /kill_switch boolean not null default true/);
  assert.match(migration, /hybrid_staging_enabled boolean not null default false/);
  assert.match(config, /\[functions\.menu-ai-assistant\][\s\S]*?enabled = true[\s\S]*?verify_jwt = false/);
});

test("função valida entrada, origem e PII antes da inferência controlada", async () => {
  const source = await read("supabase/functions/menu-ai-assistant/index.ts");
  assert.match(source, /\.strict\(\)/);
  assert.match(source, /payload_too_large/);
  assert.match(source, /forbidden_origin/);
  assert.match(source, /sensitive_data_rejected/);
  assert.match(source, /OGRITECH_MENU_AI_ENV/);
  assert.match(source, /OGRITECH_MENU_AI_SERVICE_TIER:z\.enum\(\["default","priority"\]\)\.default\("default"\)/);
  assert.match(source, /OPENAI_API_KEY:z\.string\(\)\.startsWith\("sk-"\)/);
  assert.match(source, /Deno\.env\.toObject\(\)/);
  assert.match(source, /deterministic_phase_6a/);
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/);
  assert.match(source, /store:false/);
  assert.match(source, /max_output_tokens:80/);
  assert.match(source, /service_tier:Env\.OGRITECH_MENU_AI_SERVICE_TIER/);
  assert.match(source, /processing_tier:payload\.service_tier/);
  assert.match(source, /OGRITECH_MENU_AI_SERVICE_TIER==="priority"\?2:1/);
  assert.match(source, /setTimeout\(\(\)=>controller\.abort\(\),6000\)/);
  assert.match(source, /EdgeRuntime\.waitUntil/);
  assert.match(source, /menu_ai_telemetry_failed/);
  assert.match(source, /record_menu_ai_staging_event/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("segredo de provedor não é referenciado no front-end público", async () => {
  const sources = await Promise.all([read("cardapio/index.html"), read("cardapio/cardapio.js"), read("painel/index.html")]);
  for (const source of sources) assert.doesNotMatch(source, /OPENAI_API_KEY|NEXT_PUBLIC_OPENAI|VITE_OPENAI/);
});
