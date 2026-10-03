import { createHash } from "node:crypto";
import { validateMenuAiRequest, validateMenuAiResponse, MenuAiContractError } from "./menu-ai-adapter.mjs";
import { MENU_AI_INSTRUCTIONS, MENU_AI_MAX_OUTPUT_TOKENS, MENU_AI_MODEL, MENU_AI_REASONING_EFFORT, MENU_AI_RESPONSE_SCHEMA, MENU_AI_VERBOSITY } from "../../supabase/functions/_shared/menu-ai-contract.mjs";

const parseOutputText = (payload) => payload.output_text || payload.output?.flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;

export function createOpenAiMenuAdapter({ apiKey, model = MENU_AI_MODEL, fetchImpl = fetch, timeoutMs = 4000 }) {
  if (typeof apiKey !== "string" || !apiKey.startsWith("sk-")) throw new MenuAiContractError("Chave da OpenAI ausente ou inválida.");
  return Object.freeze({
    id: `openai-${model}`,
    async interpretWithTelemetry(request) {
      const safe = validateMenuAiRequest(request);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = performance.now();
      try {
        const httpResponse = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, store: false, max_output_tokens: MENU_AI_MAX_OUTPUT_TOKENS, reasoning: { effort: MENU_AI_REASONING_EFFORT }, instructions: MENU_AI_INSTRUCTIONS, input: [{ role: "user", content: JSON.stringify({ synthetic_message: safe.message, locale: safe.locale, allowed_tools: safe.allowedTools }) }], text: { verbosity: MENU_AI_VERBOSITY, format: { type: "json_schema", name: "menu_intent", strict: true, schema: MENU_AI_RESPONSE_SCHEMA } } }),
          signal: controller.signal
        });
        const payload = await httpResponse.json();
        if (!httpResponse.ok) {
          const code = typeof payload?.error?.code === "string" ? payload.error.code : "openai_request_failed";
          const error = new Error(`OpenAI API: ${code}`);
          error.code = code;
          throw error;
        }
        const outputText = parseOutputText(payload);
        if (!outputText) throw new MenuAiContractError("A OpenAI não retornou conteúdo estruturado.");
        const validated = validateMenuAiResponse(JSON.parse(outputText));
        if (validated.tool && !safe.allowedTools.includes(validated.tool)) throw new MenuAiContractError("O modelo solicitou ferramenta não concedida.");
        return { response: validated, telemetry: { provider: "openai", model, requestId: payload.id || null, caseHash: createHash("sha256").update(safe.message).digest("hex"), latencyMs: Math.round(performance.now() - started), inputTokens: Number(payload.usage?.input_tokens || 0), outputTokens: Number(payload.usage?.output_tokens || 0), outcome: "accepted" } };
      } finally { clearTimeout(timer); }
    },
    async interpret(request) { return (await this.interpretWithTelemetry(request)).response; }
  });
}
