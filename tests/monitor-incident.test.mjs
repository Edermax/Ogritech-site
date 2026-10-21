import test from "node:test";
import assert from "node:assert/strict";
import { synchronizeIncident } from "../scripts/monitor-incident.mjs";
import { runMonitorDrill } from "../scripts/monitor-drill.mjs";

function fakeGithub() {
  const issues = [{ number: 1, title: "[Monitor] Alerta operacional de produção", state: "open", labels: ["production-monitor"], body: "Real incident" }];
  const comments = [];
  const api = {
    getLabel: async () => ({}),
    get: async ({ issue_number }) => ({ data: issues.find((issue) => issue.number === issue_number) }),
    listForRepo: async ({ labels }) => ({ data: issues.filter((issue) => issue.state === "open" && issue.labels.includes(labels)) }),
    create: async (payload) => { const issue = { ...payload, number: issues.length + 1, state: "open" }; issues.push(issue); return { data: issue }; },
    update: async ({ issue_number, ...payload }) => Object.assign(issues.find((issue) => issue.number === issue_number), payload),
    createComment: async (payload) => comments.push(payload)
  };
  return { issues, comments, rest: { issues: api }, paginate: async (method, params) => (await method(params)).data };
}

test("isolated drill opens, deduplicates and resolves its own issue while preserving production", async () => {
  const github = fakeGithub();
  const result = await runMonitorDrill({ github, repo: { owner: "fixture", repo: "fixture" }, runUrl: "https://example.test/run" });
  assert.deepEqual(result.transitions.map((step) => step.action), ["opened", "unchanged", "resolved"]);
  assert.equal(github.issues[0].state, "open");
  assert.equal(github.issues[0].body, "Real incident");
  assert.equal(github.issues[1].state, "closed");
  assert.equal(github.comments.length, 1);
  assert.match(github.issues[1].body, /ENSAIO SINTÉTICO/);
});

test("incomplete green reports cannot close any incident", async () => {
  const github = fakeGithub();
  for (const report of [{}, { failures: [] }, { failures: [], metrics: {}, availability: { ok: true } },
    { failures: [], metrics: {}, availability: { ok: true, status: 200 }, billing_readiness: { ok: true, status: 200 }, menu_backend: { ok: true, status: 200 } }]) {
    await assert.rejects(synchronizeIncident({ github, repo: {}, report, runUrl: "https://example.test" }), /inválido|Recuperação/);
  }
  assert.equal(github.issues[0].state, "open");
  assert.equal(github.comments.length, 0);
});

test("drill follows returned issue identifiers even when the label list has not caught up", async () => {
  const github = fakeGithub();
  github.rest.issues.listForRepo = async () => ({ data: [] });
  const result = await runMonitorDrill({ github, repo: {}, runUrl: "https://example.test/run" });
  assert.deepEqual(result.transitions.map((step) => step.action), ["opened", "unchanged", "resolved"]);
  assert.equal(github.issues.length, 2);
  assert.equal(github.issues[0].state, "open");
  assert.equal(github.issues[1].state, "closed");
});

test("changed faults update an incident once and repeated faults remain quiet", async () => {
  const github = fakeGithub();
  const input = { github, repo: {}, runUrl: "https://example.test", report: { failures: ["backend unavailable"] } };
  assert.equal((await synchronizeIncident(input)).action, "updated");
  assert.equal((await synchronizeIncident(input)).action, "unchanged");
  input.report = { failures: ["telemetry unavailable"] };
  assert.equal((await synchronizeIncident(input)).action, "updated");
  assert.equal(github.comments.length, 2);
});
