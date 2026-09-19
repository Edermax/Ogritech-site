const finiteNonNegative = (value, name) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${name} deve ser um número não negativo.`);
  return number;
};

export function estimateMonthlyMenuAiCost(input) {
  const interactions = Math.floor(finiteNonNegative(input.interactions, "interactions"));
  const inputTokens = finiteNonNegative(input.inputTokensPerInteraction, "inputTokensPerInteraction");
  const outputTokens = finiteNonNegative(input.outputTokensPerInteraction, "outputTokensPerInteraction");
  const inputPrice = finiteNonNegative(input.inputPricePerMillion, "inputPricePerMillion");
  const outputPrice = finiteNonNegative(input.outputPricePerMillion, "outputPricePerMillion");
  const exchangeRate = finiteNonNegative(input.exchangeRate, "exchangeRate");
  const safetyMarginPercent = finiteNonNegative(input.safetyMarginPercent ?? 0, "safetyMarginPercent");
  const baseUsd = interactions * ((inputTokens * inputPrice + outputTokens * outputPrice) / 1_000_000);
  const estimatedBrl = baseUsd * exchangeRate * (1 + safetyMarginPercent / 100);
  return Object.freeze({ interactions, estimatedUsd: Number(baseUsd.toFixed(6)), estimatedBrl: Number(estimatedBrl.toFixed(2)), estimatedBrlPerInteraction: interactions ? Number((estimatedBrl / interactions).toFixed(6)) : 0, assumptionsOnly: true });
}
