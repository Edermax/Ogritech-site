import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = (path) => readFile(new URL(path, root), "utf8").then(JSON.parse);
const [contract, humanBeta, staging, activePilot, closure] = await Promise.all([
  readJson("config/menu-private-pilot-phase-7g.json"),
  readJson("config/menu-beta-phase-7d-result.json"),
  readJson("config/menu-staging-phase-7f-result.json"),
  readJson("config/menu-private-pilot-phase-7j-result.json"),
  readJson("config/menu-private-pilot-phase-7k-c-closure.json")
]);

const checks = [];
const check = (id, passed, detail) => checks.push({ id, passed: Boolean(passed), detail });
check("human_beta_passed", humanBeta.status === "passed_local_human_beta" && humanBeta.averageEaseScore >= 8, "Beta humano local aprovado.");
check("staging_passed", staging.status === "passed_synthetic_staging_homologation" && staging.scenariosPassed === 8, "Homologação sintética no staging aprovada.");
check("staging_clean", staging.syntheticBusinessesRemaining === 0 && staging.cleanup === "complete_zero_residual_records", "Staging terminou sem massa sintética residual.");
check("safety_record", staging.crossTenantAccessEvents === 0 && staging.priceDivergences === 0 && humanBeta.criticalIncidents === 0, "Sem incidente crítico, acesso cruzado ou divergência de preço.");
check("ai_blocked", staging.paidAiCalls === 0 && !staging.aiFinalState.hybridEnabled && staging.aiFinalState.killSwitch, "IA externa permanece bloqueada.");
check("historical_7g_scope", !contract.pilotExecutionAuthorized && !contract.productionAuthorized && !contract.partnerContactAuthorized, "O pacote histórico da Fase 7G não autorizava piloto, produção ou contato.");
check("single_business_limit", contract.proposedPilotLimits.businesses === 1 && contract.proposedPilotLimits.maximumDurationDays <= 14, "Piloto proposto é limitado a uma empresa e até 14 dias.");
check("autonomous_journey", ["guided_setup_without_ogritech_intervention", "self_service_export", "self_service_unpublish_and_cancel", "optional_human_support_always_visible"].every((gate) => contract.autonomyRequirements.includes(gate)), "Jornada autônoma preserva suporte humano opcional.");
check("entry_gates_complete", contract.requiredEntryGates.length >= 10 && contract.requiredEntryGates.includes("business_owner_consent_recorded") && contract.requiredEntryGates.includes("final_preflight_passed"), "Entrada real depende de gates humanos e técnicos explícitos.");
check("stop_conditions", contract.stopConditions.includes("cross_tenant_access") && contract.stopConditions.includes("paid_ai_or_production_access"), "Condições críticas interrompem o piloto.");
check("exit_and_cleanup", contract.exitCriteria.exportCompleted && contract.exitCriteria.unpublishAndCancelCompleted && contract.exitCriteria.residualTestRecords === 0, "Saída exige exportação, cancelamento e zero resíduo.");
check("pilot_lifecycle_recorded", activePilot.status === "private_pilot_active_in_staging" && closure.status === "private_pilot_closed_in_staging" && closure.environment === "staging", "Fases 7J e 7K-C registram início e encerramento somente no staging.");
check("closure_complete", closure.privateExportGenerated && closure.menuUnpublished && closure.publicEntryBlocked && closure.monitorAutomationDeleted, "Exportação privada, despublicação, bloqueio público e retirada do monitor foram concluídos.");
check("production_still_blocked", !activePilot.productionAuthorized && !activePilot.automaticRenewal && !closure.productionAuthorized && !closure.automaticRenewal, "Produção e renovação automática permanecem bloqueadas.");
check("restricted_assistant", activePilot.assistantMode === "deterministic" && !activePilot.paidAiEnabled && !activePilot.automaticMessages, "Assistente determinístico ativo, sem IA paga ou mensagens automáticas.");

const technicalFailures = checks.filter(({ passed }) => !passed);
const missingHumanGates = contract.requiredEntryGates;
const report = {
  generatedAt: new Date().toISOString(),
  phase: "7K-C",
  historicalPreparationPhase: "7G",
  currentPilotPhase: "7K-C",
  technicalDecision: technicalFailures.length ? "no_go" : "go_for_private_pilot_preparation",
  operationalDecision: closure.status === "private_pilot_closed_in_staging" ? "private_pilot_closed_in_staging" : "no_go",
  pilotExecutionAuthorized: false,
  productionAuthorized: closure.productionAuthorized,
  pilotWindow: { startedAt: activePilot.startedAt, originallyPlannedEndsAt: activePilot.endsAt, closedAt: closure.closedAt },
  limits: closure.limits,
  remoteCalls: 0,
  checks,
  pendingEntryGates: [],
  historicalRequiredEntryGates: missingHumanGates
};
await mkdir(new URL("outputs/", root), { recursive: true });
await writeFile(new URL("outputs/menu-private-pilot-phase-7g-readiness.json", root), `${JSON.stringify(report, null, 2)}\n`);
if (technicalFailures.length) throw new Error(`Pacote bloqueado: ${technicalFailures.map(({ id }) => id).join(", ")}`);
console.log(`OK: ${checks.length}/${checks.length} controles aprovados; piloto privado encerrado no staging em ${closure.closedAt}; produção continua desautorizada.`);
