import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateGate } from "../scripts/go-live-gate.mjs";

const launch = JSON.parse(await readFile(new URL('../config/menu-production-launch.json',import.meta.url),'utf8'));
const approvedLaunch = { ...launch, releaseAuthorized: true, gates: launch.gates.map((gate) => ({ ...gate, status: 'APPROVED', remaining: '' })) };
const base = { validationPassed: true, missingEvidence: [], openIncidents: 0, launch: approvedLaunch };

test("gate aprova somente quando não há falhas ou bloqueios", () => {
  assert.equal(evaluateGate(base).verdict, "APROVADO");
});

test("gate separa dependência humana de falha técnica", () => {
  const blocked = evaluateGate({ ...base, launch: { ...approvedLaunch, releaseAuthorized: false } });
  assert.equal(blocked.verdict, "BLOQUEADO");
  assert.equal(blocked.technicalFailures.length, 0);
  const failed = evaluateGate({ ...base, openIncidents: 1 });
  assert.equal(failed.verdict, "NAO_APROVADO");
});

test("gate preserves every pending Cardapio requirement and commercial authorization", () => {
  const result = evaluateGate({ ...base, launch });
  assert.equal(result.verdict, "BLOQUEADO");
  for(const gate of launch.gates.filter(gate=>gate.status!=='APPROVED')) assert.ok(result.humanBlockers.some(item=>item.includes(gate.label)));
  assert.ok(result.humanBlockers.some(item=>item.includes('não autorizado')));
});

test("gate fails when evidence disappears even with all approvals", () => {
  const result=evaluateGate({...base,missingEvidence:['missing.sql']});
  assert.equal(result.verdict,'NAO_APROVADO');
  assert.ok(result.technicalFailures.some(item=>item.includes('missing.sql')));
});
