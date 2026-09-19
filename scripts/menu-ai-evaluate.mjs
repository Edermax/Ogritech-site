import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { simulatedMenuAiAdapter } from "./lib/menu-ai-adapter.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suite = JSON.parse(await readFile(resolve(root, "config/menu-ai-evaluation-cases.json"), "utf8"));
const results = [];
for (const scenario of suite.cases) {
  const response = await simulatedMenuAiAdapter.interpret({ message: scenario.message, locale: suite.locale, allowedTools: ["catalog_search", "business_info", "open_cart"] });
  const checks = [response.intent === scenario.expectedIntent];
  if (scenario.expectedTool) checks.push(response.tool === scenario.expectedTool);
  if (scenario.requiresConfirmation != null) checks.push(response.requiresConfirmation === scenario.requiresConfirmation);
  checks.push(!/R\$\s*\d|\b\d+[,.]\d{2}\b/.test(response.reply));
  results.push({ id: scenario.id, passed: checks.every(Boolean), intent: response.intent, tool: response.tool, requiresConfirmation: response.requiresConfirmation });
}
const passed = results.filter((result) => result.passed).length;
const report = { phase: "6B", adapter: simulatedMenuAiAdapter.id, simulated: true, externalCalls: 0, total: results.length, passed, passRate: passed / results.length, minimumPassRate: suite.minimumPassRate, approved: passed / results.length >= suite.minimumPassRate, results };
await mkdir(resolve(root, "outputs"), { recursive: true });
await writeFile(resolve(root, "outputs/menu-ai-evaluation.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.approved) process.exitCode = 1;
