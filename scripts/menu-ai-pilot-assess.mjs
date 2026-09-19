import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assessMenuAiPilot } from "./lib/menu-ai-metrics.mjs";

const root = process.cwd();
const report = JSON.parse(await readFile(resolve(root, "outputs/menu-ai-openai-pilot.json"), "utf8"));
const policy = JSON.parse(await readFile(resolve(root, "config/menu-ai-pilot-policy.json"), "utf8"));
const assessment = { phase: "6D", evaluatedAt: new Date().toISOString(), provider: report.provider, model: report.model, calls: report.completedCalls, estimatedCostBrl: report.estimatedCostBrl, ...assessMenuAiPilot(report, policy.acceptance) };
await writeFile(resolve(root, "outputs/menu-ai-openai-assessment.json"), `${JSON.stringify(assessment, null, 2)}\n`);
console.log(JSON.stringify(assessment, null, 2));
