import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [script, css, mobileCss, journey, callbackMigration, emailMigration, emailFunction] = await Promise.all([
  readFile(new URL("../assistant-widget.js", import.meta.url), "utf8"),
  readFile(new URL("../assistant-widget.css", import.meta.url), "utf8"),
  readFile(new URL("../assistant-widget-mobile.css", import.meta.url), "utf8"),
  readFile(new URL("../docs/JORNADA_CLIENTE_AGENDA.md", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260904184313_assistant_callback_requests.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260904234332_assistant_email_callbacks.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/assistant-email-dispatch/index.ts", import.meta.url), "utf8")
]);

test("assistente comercial mantém escopo e não inventa WhatsApp", () => {
  assert.match(script, /Aquisição e dúvidas comerciais/);
  assert.match(script, /Ogritech Agenda/);
  assert.match(emailFunction, /contato@ogritech\.com\.br/);
  assert.doesNotMatch(script, /wa\.me|api\.whatsapp\.com/);
  assert.doesNotMatch(script, /99457.?7762/);
});

test("avatar flutuante é acessível e acompanha a viewport", () => {
  assert.match(script, /aria-expanded/);
  assert.match(script, /Escape/);
  assert.match(css, /position:fixed/);
  assert.match(mobileCss, /max-height: calc\(100dvh/);
  assert.match(mobileCss, /top: auto/);
  assert.match(mobileCss, /panel:not\(\[hidden\]\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("balão permanece até a primeira interação com o avatar", () => {
  assert.match(script, /let hasInteracted = false/);
  assert.match(script, /if \(open\) hasInteracted = true/);
  assert.match(script, /hint\.hidden = hasInteracted/);
  assert.doesNotMatch(script, /setTimeout/);
});

test("jornada oficial registra os campos obrigatórios", () => {
  for (const field of ["nome do cliente", "número de celular", "profissional escolhido", "ao menos um serviço", "data completa", "confirmação explícita"]) {
    assert.match(journey, new RegExp(field, "i"));
  }
  assert.match(journey, /sem celular/i);
  assert.match(journey, /consentimento/i);
  assert.match(journey, /migração/i);
});

test("solicitação de contato exige telefone e consentimento específico", () => {
  assert.match(script, /name="phone"[\s\S]*required/);
  assert.match(script, /name="channel" value="WhatsApp"/);
  assert.match(script, /name="whatsappConsent" required/);
  assert.match(script, /name="privacyConsent" required/);
  assert.match(script, /public_submit_assistant_callback/);
  assert.match(callbackMigration, /enable row level security/i);
  assert.match(callbackMigration, /contact_channel <> 'WhatsApp' or whatsapp_consent_at is not null/i);
  assert.match(callbackMigration, /private\.platform_whatsapp_outbox/i);
  assert.match(callbackMigration, /Muitas solicitações/i);
});

test("solicitação oferece ligação, WhatsApp e e-mail com envio institucional", () => {
  assert.doesNotMatch(script, />Pedir contato</);
  assert.match(script, />Solicitar contato</);
  assert.match(script, /value="Ligação"/);
  assert.match(script, /value="WhatsApp"/);
  assert.match(script, /value="E-mail"/);
  assert.match(script, /name="email" type="email"/);
  assert.match(emailMigration, /private\.platform_email_outbox/);
  assert.match(emailMigration, /platform_claim_assistant_email/);
  assert.match(emailFunction, /Ogritech <contato@ogritech\.com\.br>/);
  assert.match(emailFunction, /RESEND_API_KEY/);
});

test("opção solicitar contato abre diretamente a escolha do canal", () => {
  assert.match(script, /topicButton\.dataset\.topic === "contato"/);
  assert.match(script, /callbackForm\("contato"\)/);
  assert.doesNotMatch(script, /if \(topicButton\) answer\(topicButton\.dataset\.topic\)/);
});
