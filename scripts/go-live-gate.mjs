import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collectLaunchEvidence } from "./launch-evidence.mjs";
import { evaluateMenuProductionLaunch } from "./menu-production-launch-gate.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

export function evaluateGate(input) {
  const launch = evaluateMenuProductionLaunch(input.launch);
  const technicalFailures = [];
  const humanBlockers = [];
  if (!input.validationPassed) technicalFailures.push("Suíte de validação não foi confirmada");
  for (const evidence of input.missingEvidence) technicalFailures.push(`Evidência ausente: ${evidence}`);
  if (input.openIncidents > 0) technicalFailures.push(`${input.openIncidents} incidente(s) técnico(s) aberto(s)`);
  for (const gate of launch.gates.filter((gate) => gate.status !== "APPROVED")) {
    humanBlockers.push(`${gate.label}: ${gate.remaining}`);
  }
  if (input.launch.releaseAuthorized !== true) humanBlockers.push("Lançamento comercial do Cardápio ainda não autorizado no contrato.");
  const verdict = technicalFailures.length ? "NAO_APROVADO" : humanBlockers.length ? "BLOQUEADO" : "APROVADO";
  return { verdict, technicalFailures, humanBlockers };
}

async function githubJson(path) {
  const repository = process.env.GITHUB_REPOSITORY || "Edermax/Ogritech-site";
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "Ogritech-Go-Live-Gate/1.0" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub API ${path}: HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const launch = JSON.parse(await read("config/menu-production-launch.json"));
  evaluateMenuProductionLaunch(launch);
  const { missing: missingEvidence } = await collectLaunchEvidence(root, launch.gates.flatMap((gate) => gate.evidence));
  // Keep live operational incidents; retired Agenda pilots cannot approve or block this product.
  const incidentPaths = [
    "/issues?state=open&labels=production-monitor&per_page=100",
    "/issues?state=open&labels=production-backup&per_page=100",
    "/issues?state=open&labels=production-schema-drift&per_page=100",
    "/issues?state=open&labels=auth-security-monitor&per_page=100"
  ];
  const incidents = (await Promise.all(incidentPaths.map((path) => githubJson(path)))).flat();
  const input = {
    checkedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || "local",
    product: launch.product,
    validationPassed: process.env.VALIDATION_STATUS === "passed",
    missingEvidence,
    openIncidents: new Set(incidents.filter((issue) => !issue.pull_request).map((issue) => issue.number)).size,
    launch
  };
  const result = { ...input, ...evaluateGate(input) };
  const markdown = [
    "# Gate automático de entrada em operação",
    "",
    `- Veredito: **${result.verdict}**`,
    `- Verificado em: ${result.checkedAt}`,
    `- Commit: ${result.commit}`,
    `- Incidentes técnicos abertos: ${result.openIncidents}`,
    `- Produto: ${result.product}`,
    `- Autorização comercial: ${launch.releaseAuthorized === true ? "sim" : "pendente"}`,
    "",
    "## Falhas técnicas",
    ...(result.technicalFailures.length ? result.technicalFailures.map((item) => `- ${item}`) : ["- Nenhuma."]),
    "",
    "## Bloqueios humanos ou temporais",
    ...(result.humanBlockers.length ? result.humanBlockers.map((item) => `- ${item}`) : ["- Nenhum."]),
    ""
  ].join("\n");
  const outputDir = process.env.GO_LIVE_OUTPUT_DIR || "outputs/go-live";
  await mkdir(new URL(`${outputDir}/`, root), { recursive: true });
  await writeFile(new URL(`${outputDir}/gate.json`, root), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(new URL(`${outputDir}/gate.md`, root), markdown);
  console.log(JSON.stringify(result, null, 2));
  if (result.verdict === "NAO_APROVADO") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
