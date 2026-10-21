import { createHash } from "node:crypto";
import { normalizeResult } from "./monitor-production.mjs";

export function validateReport(report) {
  if (!report || !Array.isArray(report.failures) || report.failures.some((value) => typeof value !== "string")) {
    throw new Error("Relatório do monitor inválido");
  }
  if (!report.failures.length) {
    if (![report.availability, report.billing_readiness, report.menu_backend]
      .every((probe) => probe?.ok === true && probe.status >= 200 && probe.status < 300)) {
      throw new Error("Recuperação exige todas as verificações saudáveis");
    }
    try { normalizeResult({ result: [report.metrics] }); } catch {
      throw new Error("Recuperação exige métricas completas");
    }
  }
}

export async function synchronizeIncident({ github, repo, report, runUrl, drill = false, knownIssueNumbers = [] }) {
  validateReport(report);
  const label = drill ? "monitor-drill" : "production-monitor";
  const title = drill ? "[Monitor drill] Ensaio isolado do Cardápio" : "[Monitor] Alerta operacional de produção";
  try {
    await github.rest.issues.getLabel({ ...repo, name: label });
  } catch (error) {
    if (error.status !== 404) throw error;
    await github.rest.issues.createLabel({ ...repo, name: label, color: drill ? "5319e7" : "b60205",
      description: drill ? "Ensaio sintético; não representa falha de produção" : "Incidente detectado pelo monitor automático de produção" });
  }
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: "open", labels: label, per_page: 100,
    headers: { "cache-control": "no-cache" } });
  // Label-filtered lists can lag behind a newly-created issue. Follow the
  // returned identifiers directly during one execution, verifying their scope.
  for (const issue_number of new Set(knownIssueNumbers)) {
    const { data } = await github.rest.issues.get({ ...repo, issue_number });
    if (!issues.some((issue) => issue.number === data.number)) issues.push(data);
  }
  const incidents = issues.filter((issue) => issue.state === "open" && !issue.pull_request && issue.title === title &&
    issue.labels.some((item) => (typeof item === "string" ? item : item.name) === label));
  const fingerprint = createHash("sha256").update(JSON.stringify([...report.failures].sort())).digest("hex");
  const marker = `<!-- monitor-fingerprint:${fingerprint} -->`;
  const body = `${drill ? "ENSAIO SINTÉTICO. Nenhum serviço real foi interrompido.\n\n" : ""}${report.failures.length ? "Condição de alerta detectada." : "Condição normalizada; todas as verificações concluídas."}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n\nExecução: ${runUrl}\n${marker}`;
  if (report.failures.length) {
    if (!incidents.length) {
      const { data } = await github.rest.issues.create({ ...repo, title, body, labels: [label] });
      return { action: "opened", issue: data.number };
    }
    const incident = incidents[0];
    // The issue body holds the latest state, so the same fault does not generate
    // a comment every fifteen minutes. Changes retain their timeline as comments.
    if (!incident.body?.includes(marker)) {
      await github.rest.issues.createComment({ ...repo, issue_number: incident.number, body });
      await github.rest.issues.update({ ...repo, issue_number: incident.number, body });
      return { action: "updated", issue: incident.number };
    }
    return { action: "unchanged", issue: incident.number };
  }
  for (const incident of incidents) {
    await github.rest.issues.createComment({ ...repo, issue_number: incident.number, body });
    await github.rest.issues.update({ ...repo, issue_number: incident.number, state: "closed", state_reason: "completed" });
  }
  return { action: incidents.length ? "resolved" : "healthy", issues: incidents.map((issue) => issue.number) };
}
