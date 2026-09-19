import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile, writeFile } from "node:fs/promises";

const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const match = config.match(/staging:[\s\S]*?url:\s*"([^"]+)"[\s\S]*?publishableKey:\s*"([^"]+)"/);
assert.ok(match, "Configuração pública de staging ausente");
const [, apiUrl, publishableKey] = match;
assert.equal(apiUrl, "https://fuesdztsvrkkgnbqhcxi.supabase.co", "Piloto restrito ao staging conhecido");

const messages = [
  "Algo leve para dividir, sem muita massa",
  "Quero uma opção diferente que agrade duas pessoas",
  "O que combina melhor com uma noite tranquila?"
];
const results = [];
for (let index = 0; index < messages.length; index += 1) {
  const started = performance.now();
  const response = await fetch(`${apiUrl}/functions/v1/menu-ai-assistant`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json", Origin: "https://ogritech.com.br" },
    body: JSON.stringify({
      slug: "ogritech-ia-fase-6i",
      session_token: `fase6iSyntheticSessionToken0${index}`,
      message: messages[index],
      allowed_tools: ["catalog_search", "business_info", "open_cart"]
    })
  });
  const payload = await response.json();
  results.push({ index: index + 1, status: response.status, latencyMs: Math.round(performance.now() - started), route: payload.route ?? null, intent: payload.data?.intent ?? null, tool: payload.data?.tool ?? null, confirmationRequired: payload.confirmation_required ?? null, error: payload.error?.code ?? null });
}
await writeFile(new URL("../outputs/menu-ai-staging-latency-pilot.json", import.meta.url), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify(results));
