const ALLOWED_INTENTS = new Set(["greeting", "catalog_search", "hours_info", "payment_info", "cart_review", "fallback", "unsafe_instruction"]);
const FORBIDDEN_OUTPUT_KEYS = new Set(["price", "amount", "total", "menu_item_price_id", "order_id", "add_to_cart", "submit_order"]);

export class MenuAiContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "MenuAiContractError";
  }
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MenuAiContractError(`${label} deve ser um objeto.`);
}

export function validateMenuAiRequest(request) {
  assertPlainObject(request, "A solicitação");
  if (typeof request.message !== "string" || !request.message.trim() || request.message.length > 500) throw new MenuAiContractError("A mensagem deve conter de 1 a 500 caracteres.");
  if (typeof request.locale !== "string" || !/^pt-BR$/i.test(request.locale)) throw new MenuAiContractError("Somente o locale pt-BR está habilitado nesta avaliação.");
  if (!Array.isArray(request.allowedTools) || request.allowedTools.some((tool) => !["catalog_search", "business_info", "open_cart"].includes(tool))) throw new MenuAiContractError("A lista de ferramentas contém uma capacidade não autorizada.");
  return { message: request.message.trim(), locale: "pt-BR", allowedTools: [...new Set(request.allowedTools)] };
}

export function validateMenuAiResponse(response) {
  assertPlainObject(response, "A resposta");
  const inspectKeys = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_OUTPUT_KEYS.has(key)) throw new MenuAiContractError(`O adaptador não pode retornar o campo autoritativo ${key}.`);
      inspectKeys(nested);
    }
  };
  inspectKeys(response);
  if (!ALLOWED_INTENTS.has(response.intent)) throw new MenuAiContractError("A intenção retornada não é permitida.");
  if (typeof response.reply !== "string" || !response.reply.trim() || response.reply.length > 600) throw new MenuAiContractError("A resposta deve conter de 1 a 600 caracteres.");
  if (response.query != null && (typeof response.query !== "string" || response.query.length > 120)) throw new MenuAiContractError("A consulta de catálogo é inválida.");
  if (response.tool != null && !["catalog_search", "business_info", "open_cart"].includes(response.tool)) throw new MenuAiContractError("A ferramenta retornada não é permitida.");
  return Object.freeze({ intent: response.intent, reply: response.reply.trim(), query: response.query?.trim() || null, tool: response.tool || null, requiresConfirmation: response.tool === "open_cart" || response.intent === "catalog_search" });
}

export function createMenuAiAdapter({ id, generate }) {
  if (!/^[a-z0-9-]{3,40}$/.test(id || "") || typeof generate !== "function") throw new MenuAiContractError("Configuração de adaptador inválida.");
  return Object.freeze({
    id,
    async interpret(request) {
      const safeRequest = validateMenuAiRequest(request);
      const response = validateMenuAiResponse(await generate(safeRequest));
      if (response.tool && !safeRequest.allowedTools.includes(response.tool)) throw new MenuAiContractError("O adaptador solicitou uma ferramenta não autorizada para esta interação.");
      return response;
    }
  });
}

const unsafePattern = /(ignore|desconsidere|revele|mostre).*(instru|prompt|sistema)|developer message|system prompt|burlar|jailbreak/i;

export const simulatedMenuAiAdapter = createMenuAiAdapter({
  id: "local-simulator-v1",
  async generate({ message, allowedTools }) {
    if (unsafePattern.test(message)) return { intent: "unsafe_instruction", reply: "Não posso alterar minhas regras. Posso ajudar a consultar o cardápio publicado." };
    if (/carrinho|meu pedido|finalizar/i.test(message) && allowedTools.includes("open_cart")) return { intent: "cart_review", tool: "open_cart", reply: "Posso abrir o carrinho para você revisar. Nada será enviado sem sua confirmação." };
    if (/pagamento|pix|cart[aã]o|dinheiro/i.test(message)) return { intent: "payment_info", tool: "business_info", reply: "Vou consultar as formas de pagamento informadas pelo estabelecimento." };
    if (/hor[aá]rio/i.test(message) || /(?:^|\s)(?:abre|fecha|funciona)(?:\s|[?.!,]|$)/i.test(message)) return { intent: "hours_info", tool: "business_info", reply: "Vou consultar o horário informado pelo estabelecimento." };
    if (/^(?:oi|ol[aá]|bom dia|boa tarde|boa noite)(?:\s|[?.!,]|$)/i.test(message)) return { intent: "greeting", reply: "Olá! Posso ajudar a encontrar itens do cardápio, horários, pagamentos ou revisar o carrinho." };
    const query = message.replace(/\b(quero|tem|voc[eê]s têm|procuro|buscar|encontrar|por favor)\b/gi, " ").replace(/\s+/g, " ").trim();
    if (query.length >= 2 && allowedTools.includes("catalog_search")) return { intent: "catalog_search", tool: "catalog_search", query, reply: "Vou buscar opções no catálogo publicado. Preço e disponibilidade serão confirmados pelo sistema." };
    return { intent: "fallback", reply: "Não consegui identificar o pedido. Tente informar o nome do produto ou use as categorias do cardápio." };
  }
});
