import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);
const [intake, policy] = await Promise.all([
  readJson("config/menu-private-pilot-phase-7h-intake.json"),
  readJson("config/menu-private-pilot-phase-7g.json")
]);
const allGates = new Set([...intake.completedEntryGates, ...intake.pendingEntryGates]);
const checks = [
  { id: "partner_selected", passed: intake.completedEntryGates.includes("partner_business_privately_selected") },
  { id: "identity_not_versioned", passed: intake.realIdentityStoredInRepository === false && !JSON.stringify(intake).includes("Diniz") && !JSON.stringify(intake).includes("Pamela") },
  { id: "gate_accounting", passed: policy.requiredEntryGates.every((gate) => allGates.has(gate)) && allGates.size === policy.requiredEntryGates.length },
  { id: "no_contact", passed: intake.contactPerformed === false },
  { id: "preview_environment_authorized", passed: intake.environmentPreparationAuthorized === true && intake.privatePreview?.environment === "staging" && intake.privatePreview?.productionCalls === 0 },
  { id: "pilot_authorized_production_blocked", passed: intake.pilotExecutionAuthorized === true && intake.productionAuthorized === false }
];
const failures = checks.filter(({ passed }) => !passed);
const report = {
  generatedAt: new Date().toISOString(),
  phase: "7H",
  status: failures.length ? "blocked_by_contract_error" : intake.status,
  completedGates: intake.completedEntryGates.length,
  pendingGates: intake.pendingEntryGates.length,
  checks,
  contactPerformed: false,
  remoteCalls: 0
};
await mkdir(new URL("outputs/", root), { recursive: true });
await writeFile(new URL("outputs/menu-private-pilot-phase-7h-intake.json", root), `${JSON.stringify(report, null, 2)}\n`);
if (failures.length) throw new Error(`Intake inválido: ${failures.map(({ id }) => id).join(", ")}`);
console.log(`OK: parceiro pseudonimizado selecionado; ${intake.pendingEntryGates.length} gates de entrada continuam pendentes.`);
