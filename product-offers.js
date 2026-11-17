(() => {
  const offers = Object.freeze({
    cardapio: Object.freeze({ code: "cardapio", planCode: "catalogo-essencial", name: "Ogritech Catálogo Essencial", monthlyCents: 990, annualCents: 9900, orders: false }),
    encomendas: Object.freeze({ code: "encomendas", planCode: "catalogo-completo", name: "Ogritech Catálogo Completo", monthlyCents: 2990, annualCents: 29900, orders: true })
  });
  const forPlan = plan => {
    const family = plan?.offer_code || plan?.menu_offer_code || ({cardapio:"cardapio",foundation:"encomendas","catalogo-essencial":"cardapio","catalogo-completo":"encomendas"})[plan?.code];
    const base = offers[family] || { code: "unavailable", planCode: "", name: "Plano não identificado", monthlyCents: 0, annualCents: 0, orders: false };
    const monthly = Number(plan?.monthly_fee), annual = Number(plan?.annual_fee);
    return { ...base, id: plan?.id, planCode: plan?.code || base.planCode,
      name: plan?.name ? (/^Ogritech\b/i.test(plan.name) ? plan.name : `Ogritech ${plan.name}`) : base.name,
      monthlyCents: Number.isFinite(monthly) && monthly > 0 ? Math.round(monthly*100) : base.monthlyCents,
      annualCents: Number.isFinite(annual) && annual > 0 ? Math.round(annual*100) : base.annualCents };
  };
  const format = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const errorMessage = async ({data,error}, fallback) => {
    let payload = data;
    if (!payload && error?.context?.clone) { try { payload = await error.context.clone().json(); } catch { /* Use the safe fallback for non-JSON failures. */ } }
    return typeof payload?.error?.message === "string" ? payload.error.message : fallback;
  };
  const loadCatalog = async client => {
    const { data, error } = await client.rpc("public_menu_plans");
    if (error || !Array.isArray(data)) throw new Error("Não foi possível carregar os planos. Atualize a página e tente novamente.");
    return data.filter(plan => plan.id && ["cardapio", "encomendas"].includes(plan.offer_code) && Number(plan.monthly_fee)>0 && Number(plan.annual_fee)>0);
  };
  globalThis.OgritechOffers = Object.freeze({ offers, forPlan, format, errorMessage, loadCatalog, trialDays: 14 });
})();
