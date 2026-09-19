import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
const staging = config.match(/staging:[\s\S]*?url:\s*"([^"]+)"[\s\S]*?publishableKey:\s*"([^"]+)"/);
assert(staging, "Configuração de staging ausente");
const [, apiUrl, publishableKey] = staging;
assert.equal(apiUrl, "https://fuesdztsvrkkgnbqhcxi.supabase.co", "O bot só pode executar no staging conhecido");

const marker = `bot-contact-${Date.now()}`;
const base = {
  supplied_name: "Bot Contato Ogritech",
  supplied_company: "Empresa Sintética",
  supplied_phone: "11999998888",
  supplied_email: `${marker}@example.com`,
  supplied_location: "Campinas, SP",
  supplied_preference: "WhatsApp",
  supplied_business_type: "Barbearia simulada",
  supplied_employee_range: "2 a 5",
  supplied_customer_source: "Site",
  supplied_current_solution: "Não",
  supplied_current_tool: "",
  supplied_interests: ["Agenda online"],
  supplied_goals: ["Organizar atendimentos", "Reduzir faltas"],
  supplied_timeline: "O quanto antes",
  supplied_investment: "Até R$ 500",
  supplied_challenge: "Validar a captação corporativa no ambiente de staging.",
  supplied_adaptive_answers: { agenda_online_1: "80", agenda_online_2: "3" },
  accepted_privacy: true,
  website: ""
};

async function submit(payload) {
  const response = await fetch(`${apiUrl}/rest/v1/rpc/public_submit_platform_contact`, {
    method: "POST",
    headers: { apikey: publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const createdIds = [];
for (let attempt = 1; attempt <= 5; attempt += 1) {
  const { response, body } = await submit(base);
  assert.equal(response.status, 200, `Tentativa válida ${attempt} deveria ser aceita: ${JSON.stringify(body)}`);
  assert.match(body.id, /^[0-9a-f-]{36}$/i);
  createdIds.push(body.id);
}

const limited = await submit(base);
assert.equal(limited.response.status, 400, "A sexta tentativa na mesma hora deve ser limitada");
assert.match(limited.body.message || "", /Muitas tentativas/);

const noConsent = await submit({ ...base, supplied_email: `no-consent-${marker}@example.com`, accepted_privacy: false });
assert.equal(noConsent.response.status, 400, "Contato sem consentimento deve ser recusado");

const honeypot = await submit({ ...base, supplied_email: `honeypot-${marker}@example.com`, website: "https://spam.invalid" });
assert.equal(honeypot.response.status, 400, "Honeypot preenchido deve ser recusado");

console.log(JSON.stringify({ ok: true, marker, createdIds, rateLimit: true, consentGuard: true, honeypotGuard: true }));
