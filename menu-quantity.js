/* Whole-unit lots and absolute distribution quantities. No price adjustments. */
(() => {
  const LIMIT = 10000;
  function rules(item) {
    const value = item?.metadata?.quantity_rules;
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  }
  function limits(item) {
    const rule = rules(item), step = rule ? Number(rule.step) : 1;
    return { minimum: Math.max(1, Math.ceil(Number(item.minimum_quantity) || 1)), maximum: Math.min(rule ? LIMIT : 100, item.maximum_quantity == null ? (rule ? LIMIT : 100) : Math.floor(Number(item.maximum_quantity))), step, distributionStep: Number(rule?.distribution_step) || step, options: rule?.options || [] };
  }
  function validateRules(value, minimum, maximum) {
    if (value == null) return "";
    const integer = number => Number.isSafeInteger(number) && number >= 1 && number <= LIMIT;
    if (!integer(value.step)) return "Informe um múltiplo de compra inteiro entre 1 e 10.000.";
    if (!integer(minimum) || minimum % value.step) return "A quantidade mínima deve ser um múltiplo da quantidade de compra.";
    if (maximum != null && (!integer(maximum) || maximum < minimum || maximum % value.step)) return "A quantidade máxima deve respeitar o mínimo e o múltiplo de compra, até 10.000 unidades.";
    if (!Array.isArray(value.options) || value.options.length > 50) return "Cadastre até 50 sabores ou opções.";
    const names = value.options.map(name => typeof name === "string" ? name.trim() : "");
    if (names.some(name => !name || [...name].length > 80 || /[\u0000-\u001f\u007f]/.test(name))) return "Cada opção precisa de um nome com até 80 caracteres.";
    if (new Set(names.map(name => name.toLowerCase())).size !== names.length) return "Há opções com o mesmo nome. Revise a lista.";
    if (names.length && (!integer(value.distribution_step) || value.step % value.distribution_step)) return "O múltiplo por opção deve dividir o múltiplo de compra. Ex.: compra de 25 em 25, opções de 5 em 5 ou de 25 em 25.";
    return "";
  }
  function validate(item, quantity, distribution = []) {
    const rule = rules(item), limit = limits(item);
    if (!Number.isSafeInteger(quantity) || quantity < limit.minimum || quantity > limit.maximum || quantity % limit.step) return `Escolha uma quantidade a partir de ${limit.minimum}, de ${limit.step} em ${limit.step}, até ${limit.maximum}.`;
    if (!Array.isArray(distribution)) return "Confira a distribuição das quantidades.";
    if (!limit.options.length) return distribution.length ? "Este produto não permite distribuir quantidades." : "";
    const names = new Set(); let total = 0;
    for (const part of distribution) {
      if (!limit.options.includes(part.name) || names.has(part.name) || !Number.isSafeInteger(part.quantity) || part.quantity <= 0 || part.quantity % limit.distributionStep || part.quantity > quantity) return `Distribua as opções de ${limit.distributionStep} em ${limit.distributionStep}.`;
      names.add(part.name); total += part.quantity;
    }
    return total === quantity ? "" : total < quantity ? `Faltam distribuir ${quantity - total} unidades.` : `A distribuição excede o total em ${total - quantity} unidades.`;
  }
  function distribute(item, quantity) {
    const limit = limits(item), blocks = quantity / limit.distributionStep;
    if (!Number.isInteger(blocks) || !limit.options.length) return [];
    const each = Math.floor(blocks / limit.options.length), extra = blocks % limit.options.length;
    return limit.options.map((name, index) => ({ name, quantity: (each + (index < extra ? 1 : 0)) * limit.distributionStep })).filter(part => part.quantity > 0);
  }
  const describe = distribution => (distribution || []).map(part => `${part.quantity} × ${part.name}`);
  globalThis.OgritechMenuQuantity = { LIMIT, rules, limits, validateRules, validate, distribute, describe };
})();
