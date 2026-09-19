import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAiMenuAdapter } from "../scripts/lib/menu-ai-openai-adapter.mjs";

const request = { message: "Tem pizza de calabresa?", locale: "pt-BR", allowedTools: ["catalog_search"] };

test("adaptador OpenAI envia somente payload sintético, schema estrito e store false", async () => {
  let captured;
  const fetchImpl = async (_url, options) => {
    captured = { headers: options.headers, body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ id: "synthetic-request", output_text: JSON.stringify({ intent: "catalog_search", reply: "Vou consultar o catálogo.", query: "pizza de calabresa", tool: "catalog_search" }), usage: { input_tokens: 50, output_tokens: 20 } }) };
  };
  const result = await createOpenAiMenuAdapter({ apiKey: "sk-test-safe-placeholder-value", fetchImpl }).interpretWithTelemetry(request);
  assert.equal(captured.body.store, false);
  assert.equal(captured.body.text.format.strict, true);
  assert.equal(captured.body.max_output_tokens, 120);
  assert.equal(captured.body.reasoning.effort, "none");
  assert.equal(captured.body.text.verbosity, "low");
  assert.doesNotMatch(JSON.stringify(captured.body), /telefone|endereço|email|customer_name/i);
  assert.match(captured.headers.authorization, /^Bearer sk-/);
  assert.equal(result.response.tool, "catalog_search");
  assert.equal(result.telemetry.inputTokens, 50);
});

test("adaptador recusa ferramenta não concedida mesmo com JSON válido", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ output_text: JSON.stringify({ intent: "cart_review", reply: "Abrir carrinho", query: null, tool: "open_cart" }) }) });
  await assert.rejects(createOpenAiMenuAdapter({ apiKey: "sk-test-safe-placeholder-value", fetchImpl }).interpretWithTelemetry(request), /não concedida/);
});

test("erro da API expõe somente código seguro", async () => {
  const fetchImpl = async () => ({ ok: false, json: async () => ({ error: { code: "insufficient_quota", message: "sensitive provider detail" } }) });
  await assert.rejects(createOpenAiMenuAdapter({ apiKey: "sk-test-safe-placeholder-value", fetchImpl }).interpretWithTelemetry(request), (error) => error.message === "OpenAI API: insufficient_quota");
});
