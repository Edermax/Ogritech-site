import test from "node:test";
import assert from "node:assert/strict";
import { buildQuery, checkMenuAvailability, checkMenuBackend, checkMenuBillingReadiness, collectReport, evaluateMetrics, normalizeResult } from "../scripts/monitor-production.mjs";

const healthy = {
  server_errors: 0,
  rate_limited: 0,
  auth_failures: 0,
  menu_order_attempts: 3,
  menu_order_failures: 0,
  latency_p95_ms: 250,
  latency_samples: 50
};

test("monitor aceita uma janela saudável", () => {
  assert.deepEqual(evaluateMetrics(healthy), []);
});

test("monitor sinaliza todos os limites operacionais", () => {
  const failures = evaluateMetrics({
    server_errors: 1,
    rate_limited: 5,
    auth_failures: 5,
    menu_order_attempts: 2,
    menu_order_failures: 1,
    latency_p95_ms: 1600,
    latency_samples: 20
  });
  assert.equal(failures.length, 5);
});

test("p95 não alerta quando a amostra é insuficiente", () => {
  assert.deepEqual(evaluateMetrics({ ...healthy, latency_p95_ms: 9000, latency_samples: 19 }), []);
});

test("normaliza números retornados como texto pela API", () => {
  assert.deepEqual(normalizeResult({ result: [{
    edge_log_count: "42",
    auth_log_count: "3",
    server_errors: "0",
    rate_limited: "1",
    auth_failures: "2",
    menu_order_attempts: "7",
    menu_order_failures: "0",
    latency_p95_ms: "321.5",
    latency_samples: "40"
  }] }), {
    edge_log_count: 42,
    auth_log_count: 3,
    server_errors: 0,
    rate_limited: 1,
    auth_failures: 2,
    menu_order_attempts: 7,
    menu_order_failures: 0,
    latency_p95_ms: 321.5,
    latency_samples: 40
  });
});

test("consulta monitora tentativas e falhas das RPCs de pedido do Cardápio", () => {
  const query = buildQuery(35);
  assert.match(query, /public_create_menu_order\(_v2\)\?/);
  assert.match(query, /menu_order_attempts/);
  assert.match(query, /menu_order_failures/);
  assert.match(query, /interval 35 minute/);
});

test("health check do Cardápio exige HTTPS e registra somente status e latência", async () => {
  await assert.rejects(() => checkMenuAvailability("http://example.test"), /HTTPS/);
  const result = await checkMenuAvailability("https://example.test/cardapio", async () => new Response('<div id="catalog"></div><script src="cardapio.js"></script>'));
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(typeof result.latency_ms, "number");
  assert.equal((await checkMenuAvailability("https://example.test/cardapio", async () => new Response("Login"))).ok, false);
  assert.deepEqual(evaluateMetrics(healthy, undefined, { ok: false, status: 503, latency_ms: 20 }), ["Cardápio indisponível (HTTP 503)"]);
});

test("monitor detects an unavailable backend behind a healthy static page", async () => {
  const readiness = await checkMenuBillingReadiness("https://fixture.invalid/billing",async(_url,options)=>{
    assert.deepEqual(JSON.parse(options.body),{action:"trial_readiness",product:"menu"});
    return Response.json({error:{code:"product_catalog_unavailable"}},{status:503});
  });
  assert.equal(readiness.ok,false);
  assert.deepEqual(evaluateMetrics(healthy,undefined,{ok:true,status:200,latency_ms:5},readiness),["Contratação do Cardápio indisponível (product_catalog_unavailable)"]);
});

test("billing readiness requires a real menu readiness response", async () => {
  for(const body of [{},{data:{ready:true,product:"agenda"}}]) {
    assert.equal((await checkMenuBillingReadiness("https://fixture.invalid",async()=>Response.json(body))).ok,false);
  }
  assert.equal((await checkMenuBillingReadiness("https://fixture.invalid",async()=>Response.json({data:{ready:true,product:"menu"}}))).ok,true);
});

test("public menu probe validates the actual menu and never uses administrative authentication", async () => {
  const url = "https://example.test/cardapio/?empresa=fixture";
  const probe = (body) => checkMenuBackend("abcdefghijklmnopqrst", "sb_publishable_fixture", url, async (target, options) => {
    assert.equal(target, "https://abcdefghijklmnopqrst.supabase.co/rest/v1/rpc/public_menu");
    assert.equal(options.headers.apikey, "sb_publishable_fixture");
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { target_slug: "fixture" });
    return Response.json(body);
  });
  assert.equal((await probe({ menu: { slug: "fixture", title: "Fixture" }, categories: [] })).ok, true);
  for (const body of [{}, { menu: { slug: "another", title: "Other" }, categories: [] }, { menu: { slug: "fixture", title: "Fixture" } }]) {
    assert.equal((await probe(body)).ok, false);
  }
  await assert.rejects(checkMenuBackend("abcdefghijklmnopqrst", "sb_secret_forbidden", url), /pública/);
  await assert.rejects(checkMenuBackend("abcdefghijklmnopqrst", "sb_publishable_fixture", "https://example.test"), /empresa/);
});

test("a broken probe does not hide the remaining failures or expose exception content", async () => {
  const report = await collectReport({ telemetry: () => { throw new Error("Bearer PRIVATE_TOKEN"); },
    availability: async () => ({ ok: true, status: 200, latency_ms: 1 }),
    billingReadiness: async () => { throw new Error("sensitive provider body"); },
    menuBackend: async () => ({ ok: false, status: 400, code: "public_menu_unavailable" }) });
  assert.equal(report.failures.length, 3);
  assert.equal(report.availability.ok, true);
  assert.equal(report.metrics, null);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_TOKEN|sensitive provider body/);
});

test("missing telemetry and invalid windows cannot be mistaken for a healthy window", () => {
  assert.throws(() => normalizeResult({ result: [{}] }), /ausente/);
  for (const value of [0, -1, 1.5, 1441, NaN, "20; select 1"]) assert.throws(() => buildQuery(value), /Janela/);
  assert.match(buildQuery(), /ifNotFinite/);
});
