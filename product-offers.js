(() => {
  const offers = Object.freeze({
    cardapio: Object.freeze({ code: "cardapio", planCode: "cardapio", name: "Ogritech Cardápio", monthlyCents: 2990, annualCents: 29900, orders: false }),
    encomendas: Object.freeze({ code: "encomendas", planCode: "foundation", name: "Ogritech Encomendas", monthlyCents: 4990, annualCents: 49900, orders: true })
  });
  const forPlan = plan => plan?.code === "cardapio" ? offers.cardapio : offers.encomendas;
  const format = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const errorMessage = async ({data,error}, fallback) => {
    let payload = data;
    if (!payload && error?.context?.clone) { try { payload = await error.context.clone().json(); } catch { /* Use the safe fallback for non-JSON failures. */ } }
    return typeof payload?.error?.message === "string" ? payload.error.message : fallback;
  };
  globalThis.OgritechOffers = Object.freeze({ offers, forPlan, format, errorMessage, trialDays: 14 });
})();
