import { performance } from "node:perf_hooks";
import { simulatedMenuAiAdapter, validateMenuAiRequest } from "./menu-ai-adapter.mjs";

const clearIntent = /^(?:oi|ol[aá]|bom dia|boa tarde|boa noite)(?:\s|[?.!,]|$)|carrinho|meu pedido|finalizar|pagamento|pix|cart[aã]o|dinheiro|hor[aá]rio|(?:^|\s)(?:abre|fecha|funciona)(?:\s|[?.!,]|$)|\b(?:tem|quero|procuro|buscar|encontrar)\b/i;
const unsafeIntent = /(ignore|desconsidere|revele|mostre).*(instru|prompt|sistema)|developer message|system prompt|burlar|jailbreak/i;

export function createHybridMenuAiAdapter({ modelAdapter, deterministicAdapter = simulatedMenuAiAdapter }) {
  if (!modelAdapter?.interpretWithTelemetry) throw new TypeError("Adaptador de modelo inválido.");
  return Object.freeze({
    id: `hybrid-${modelAdapter.id}`,
    async interpretWithTelemetry(request) {
      const safe = validateMenuAiRequest(request);
      if (unsafeIntent.test(safe.message) || clearIntent.test(safe.message)) {
        const started = performance.now();
        const response = await deterministicAdapter.interpret(safe);
        return { response, telemetry: { provider: "local", model: "deterministic_phase_6a", latencyMs: Math.max(0, Math.round(performance.now() - started)), inputTokens: 0, outputTokens: 0, outcome: "accepted", route: "deterministic" } };
      }
      const result = await modelAdapter.interpretWithTelemetry(safe);
      return { response: result.response, telemetry: { ...result.telemetry, route: "model" } };
    },
    async interpret(request) { return (await this.interpretWithTelemetry(request)).response; }
  });
}
