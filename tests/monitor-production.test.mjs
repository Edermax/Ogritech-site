import test from "node:test";
import assert from "node:assert/strict";
import { buildQuery, checkMenuAvailability, evaluateMetrics, normalizeResult } from "../scripts/monitor-production.mjs";

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
  const result = await checkMenuAvailability("https://example.test/cardapio", async () => ({ ok: true, status: 200 }));
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(typeof result.latency_ms, "number");
  assert.deepEqual(evaluateMetrics(healthy, undefined, { ok: false, status: 503, latency_ms: 20 }), ["Cardápio indisponível (HTTP 503)"]);
});
