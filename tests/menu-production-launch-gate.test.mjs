import test from "node:test";
import assert from "node:assert/strict";
import { evaluateMenuProductionLaunch } from "../scripts/menu-production-launch-gate.mjs";

const gate = (id, status = "APPROVED") => ({ id, label: id, status, evidence: ["evidence.md"], remaining: status === "APPROVED" ? "" : "Concluir pendência." });
const approved = { product: "Ogritech Cardápio", environment: "production", releaseAuthorized: true, gates: Array.from({ length: 10 }, (_, index) => gate(`gate_${index}`)) };

test("gate do Cardápio aprova somente dez controles concluídos e autorização explícita", () => {
  assert.equal(evaluateMenuProductionLaunch(approved).verdict, "APPROVED");
  const blocked = structuredClone(approved);
  blocked.releaseAuthorized = false;
  blocked.gates[4] = gate("gate_4", "NOT_STARTED");
  assert.equal(evaluateMenuProductionLaunch(blocked).verdict, "BLOCKED");
});

test("autorização não pode ignorar pendência de produção", () => {
  const invalid = structuredClone(approved);
  invalid.gates[8] = gate("gate_8", "PARTIAL");
  assert.throws(() => evaluateMenuProductionLaunch(invalid), /não pode ser verdadeiro/);
});

test("contrato rejeita gate duplicado, sem evidência ou fora do Cardápio", () => {
  const duplicate = structuredClone(approved);
  duplicate.gates[1].id = duplicate.gates[0].id;
  assert.throws(() => evaluateMenuProductionLaunch(duplicate), /duplicado/);
  const wrongProduct = { ...approved, product: "Ogritech Agenda" };
  assert.throws(() => evaluateMenuProductionLaunch(wrongProduct), /exclusivo/);
});
