import assert from "node:assert/strict";
import { checkMenuAvailability, checkMenuBackend, checkMenuBillingReadiness, collectReport, normalizeResult } from "./monitor-production.mjs";
import { synchronizeIncident } from "./monitor-incident.mjs";

// Injected responses exercise production probes without credentials, requests to
// real services, orders, or a production incident. Only the drill issue is real.
export async function runMonitorDrill({ github, repo, runUrl }) {
  let backendDown = false;
  const fixtureFetch = async (url) => {
    const path = new URL(url).pathname;
    if (path === "/cardapio/") return new Response('<!doctype html><div id="catalog"></div><script src="cardapio.js"></script>');
    if (path === "/billing") return Response.json({ data: { ready: true, product: "menu" } });
    if (path === "/rest/v1/rpc/public_menu") return backendDown
      ? Response.json({ code: "unavailable" }, { status: 503 })
      : Response.json({ menu: { slug: "monitor-drill", title: "Ensaio" }, categories: [] });
    throw new Error("Destino inesperado no ensaio");
  };
  const collect = () => collectReport({
    telemetry: async () => normalizeResult({ result: [{ edge_log_count: 0, auth_log_count: 0, server_errors: 0,
      rate_limited: 0, auth_failures: 0, menu_order_attempts: 0, menu_order_failures: 0, latency_p95_ms: 0, latency_samples: 0 }] }),
    availability: () => checkMenuAvailability("https://fixture.invalid/cardapio/?empresa=monitor-drill", fixtureFetch),
    billingReadiness: () => checkMenuBillingReadiness("https://fixture.invalid/billing", fixtureFetch),
    menuBackend: () => checkMenuBackend("abcdefghijklmnopqrst", "sb_publishable_fixture", "https://fixture.invalid/cardapio/?empresa=monitor-drill", fixtureFetch)
  });
  assert.deepEqual((await collect()).failures, []);
  const transitions = [];
  const knownIssueNumbers = [];
  try {
    backendDown = true;
    const failure = await collect();
    assert.equal(failure.availability.ok, true);
    assert.equal(failure.failures.length, 1);
    transitions.push(await synchronizeIncident({ github, repo, runUrl, drill: true, report: failure }));
    knownIssueNumbers.push(transitions[0].issue);
    assert.ok(["opened", "updated", "unchanged"].includes(transitions[0].action));
    const repeated = await synchronizeIncident({ github, repo, runUrl, drill: true, knownIssueNumbers, report: await collect() });
    assert.equal(repeated.action, "unchanged");
    transitions.push(repeated);
  } finally {
    backendDown = false;
    const recovery = await collect();
    assert.deepEqual(recovery.failures, []);
    transitions.push(await synchronizeIncident({ github, repo, runUrl, drill: true, knownIssueNumbers, report: recovery }));
  }
  assert.equal(transitions.at(-1).action, "resolved");
  return { synthetic: true, productionInterrupted: false, transitions };
}
