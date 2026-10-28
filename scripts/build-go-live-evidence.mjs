import { collectLaunchEvidence } from "./launch-evidence.mjs";
import { consolidateReadiness } from "./launch-readiness-result.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../outputs/go-live/", import.meta.url);
await mkdir(output, { recursive: true });

async function json(name) {
  try { return JSON.parse(await readFile(new URL(name, output), "utf8")); } catch { return null; }
}

const gate = await json("gate.json");
const audit = await json("public-audit.json");
const integrity = await json("integrity-audit.json");
const launch = JSON.parse(await readFile(new URL("config/menu-production-launch.json", root), "utf8"));
const evidence = await collectLaunchEvidence(root, ["config/menu-production-launch.json", ...launch.gates.flatMap((gate) => gate.evidence)]);
const evidenceFiles = evidence.files;
const manifest = evidence.missing.map((path) => ({ path, missing: true }));
for (const path of evidenceFiles) {
  try {
    const bytes = await readFile(new URL(path, root));
    manifest.push({ path, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  } catch { manifest.push({ path, missing: true }); }
}

const databaseStatus = process.env.DATABASE_VALIDATION_STATUS || "not_run";
const overall = consolidateReadiness({ gate, audit, integrity, databaseStatus, missingEvidence: manifest.some((file) => file.missing) });
const summary = [
  "# Pacote automático de evidências de go-live",
  "",
  `Gerado em: ${new Date().toISOString()}`,
  `Resultado consolidado: **${overall}**`,
  "",
  `- Gate operacional: ${gate?.verdict || "ausente"}`,
  `- Auditoria pública: ${audit?.verdict || "ausente"}`,
  `- Integridade, links e semântica: ${integrity?.verdict || "ausente"}`,
  `- Banco isolado, permissões e pedidos: ${databaseStatus}`,
  `- Incidentes abertos: ${gate?.openIncidents ?? "desconhecido"}`,
  `- Evidências ausentes: ${gate?.missingEvidence?.length ?? "desconhecido"}`,
  "",
  "## Falhas técnicas públicas",
  ...(audit?.failures?.length ? audit.failures.map((item) => `- ${item}`) : ["- Nenhuma detectada."]),
  ...(integrity?.failures?.length ? integrity.failures.map((item) => `- ${item}`) : []),
  "",
  "## Bloqueios de operação",
  ...(gate?.humanBlockers?.length ? gate.humanBlockers.map((item) => `- ${item}`) : ["- Nenhum detectado."]),
  "",
  "## Integridade das evidências",
  ...manifest.map((item) => item.missing ? `- \`${item.path}\` — AUSENTE` : `- \`${item.path}\` — ${item.sha256} (${item.bytes} bytes)`),
  ""
].join("\n");
await writeFile(new URL("SUMMARY.md", output), summary);
await writeFile(new URL("manifest.json", output), `${JSON.stringify({ generatedAt: new Date().toISOString(), overall, databaseStatus, files: manifest }, null, 2)}\n`);
console.log(JSON.stringify({ overall, evidenceFiles: manifest.length }, null, 2));
