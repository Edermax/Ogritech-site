import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const passingStatuses = new Set(["APPROVED"]);
const knownStatuses = new Set(["APPROVED", "BLOCKED_HUMAN", "NEEDS_FRESH_EVIDENCE", "NOT_STARTED", "PARTIAL"]);

export function evaluateMenuProductionLaunch(config) {
  if (config?.product !== "Ogritech Cardápio" || config?.environment !== "production") {
    throw new Error("Contrato de lançamento deve ser exclusivo do Ogritech Cardápio em produção.");
  }
  if (!Array.isArray(config.gates) || config.gates.length !== 10) {
    throw new Error("O contrato deve conter exatamente os dez gates de lançamento.");
  }
  const ids = new Set();
  for (const gate of config.gates) {
    if (!gate.id || ids.has(gate.id)) throw new Error(`Gate inválido ou duplicado: ${gate.id || "sem id"}`);
    ids.add(gate.id);
    if (!knownStatuses.has(gate.status)) throw new Error(`Status desconhecido em ${gate.id}: ${gate.status}`);
    if (!Array.isArray(gate.evidence) || !gate.evidence.length) throw new Error(`Gate sem evidência: ${gate.id}`);
    if (!gate.remaining?.trim() && !passingStatuses.has(gate.status)) throw new Error(`Gate pendente sem próxima ação: ${gate.id}`);
  }
  const pending = config.gates.filter((gate) => !passingStatuses.has(gate.status));
  const approved = config.gates.filter((gate) => passingStatuses.has(gate.status));
  const verdict = config.releaseAuthorized === true && pending.length === 0 ? "APPROVED" : "BLOCKED";
  if (config.releaseAuthorized === true && pending.length) {
    throw new Error("releaseAuthorized não pode ser verdadeiro enquanto houver gates pendentes.");
  }
  return { verdict, approved: approved.length, pending: pending.length, gates: config.gates };
}

async function main() {
  const config = JSON.parse(await readFile(new URL("config/menu-production-launch.json", root), "utf8"));
  const result = evaluateMenuProductionLaunch(config);
  console.log(`Cardápio produção: ${result.verdict}; ${result.approved}/10 aprovados; ${result.pending} pendentes.`);
  for (const gate of result.gates) console.log(`- [${gate.status}] ${gate.label}: ${gate.remaining || "Concluído."}`);
  if (process.env.REQUIRE_MENU_PRODUCTION_APPROVAL === "true" && result.verdict !== "APPROVED") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
