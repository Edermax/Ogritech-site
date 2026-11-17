(() => {
  const TERMS_VERSION = "4.0-2026-11-17", form = document.querySelector("#menuTrialForm");
  const message = document.querySelector("#formMessage"), submit = document.querySelector("#submitButton");
  const $ = id => document.querySelector('#' + id), digits = value => value.replace(/\D/g, "");
  const offerChoice = form.elements.offer, cycleChoice = form.elements.cycle;
  const params = new URLSearchParams(location.search);
  if (["monthly", "annual"].includes(params.get("ciclo"))) cycleChoice.value = params.get("ciclo");
  const segments = {food:"Pizzaria",crafts:"Artesanato e personalizados",products:"Produtos em geral"};
  if (segments[params.get("perfil")]) form.elements.segment.value=segments[params.get("perfil")];
  const requestedPlan = new URLSearchParams(location.search).get("plano_id");
  let planCatalog = [], selectedPlan = null, catalogLoaded = false, catalogError = false, unavailableRequest = false;
  const planLabel = document.createElement("label"), planChoice = document.createElement("select");
  planLabel.textContent = "Plano para o seu negócio"; planChoice.name = "plan_id"; planChoice.id = "signupPlanChoice"; planChoice.required = true;
  planLabel.append(planChoice); cycleChoice.closest("label").before(planLabel); planLabel.hidden = true;
  submit.disabled = true;
  function choosePlan(reset = false) {
    const choices = planCatalog.filter(plan => plan.offer_code === offerChoice.value);
    if (!selectedPlan || selectedPlan.offer_code !== offerChoice.value || reset) selectedPlan = choices.find(plan => plan.code === OgritechOffers.offers[offerChoice.value].planCode) || choices[0] || null;
    if (unavailableRequest) selectedPlan = null;
    planChoice.replaceChildren();
    if (!selectedPlan) { const placeholder = document.createElement("option"); placeholder.value = ""; placeholder.textContent = choices.length ? "Escolha um plano disponível" : "Nenhum plano disponível"; planChoice.append(placeholder); }
    for (const plan of choices) { const option = document.createElement("option"); option.value = plan.id; option.textContent = `${OgritechOffers.forPlan(plan).name} · ${OgritechOffers.format(Math.round(Number(plan.monthly_fee)*100))}/mês`; planChoice.append(option); }
    planChoice.value = selectedPlan?.id || ""; planChoice.disabled = !choices.length;
    planLabel.hidden = choices.length <= 1 && !unavailableRequest;
    submit.disabled = !catalogLoaded || catalogError || !selectedPlan;
  }
  const requested = new URLSearchParams(location.search).get("plano");
  const dedicatedOffer = form.dataset?.offer;
  if (!dedicatedOffer && ["cardapio", "encomendas"].includes(requested)) {
    const destination = new URL(`/criar-cardapio/${requested}/`, location.href);
    destination.search = location.search;
    destination.searchParams.delete("plano");
    destination.hash = location.hash;
    location.replace(destination.href);
    return;
  }
  offerChoice.value = dedicatedOffer === "cardapio" ? "cardapio" : "encomendas";
  function updateOffer() {
    const offer = selectedPlan ? OgritechOffers.forPlan(selectedPlan) : OgritechOffers.offers[offerChoice.value], annual = cycleChoice.value === "annual";
    const presentation = globalThis.OgritechCatalogProfiles;
    const offerName = presentation?.offerName(offer, presentation.resolve(form.elements.segment?.value)) || offer.name;
    $("selectedOfferName").textContent = offerName;
    $("selectedOfferPrice").textContent = OgritechOffers.format(annual ? offer.annualCents : offer.monthlyCents);
    $("selectedOfferPeriod").textContent = annual ? "/ano após o teste" : "/mês após o teste";
    $("selectedMonthlyPrice").textContent = OgritechOffers.format(offer.monthlyCents);
    $("selectedAnnualPrice").textContent = OgritechOffers.format(offer.annualCents);
    $("selectedOfferSummary").textContent = `14 dias grátis no Completo. Sua escolha depois do teste: ${offerName}, ${OgritechOffers.format(annual ? offer.annualCents : offer.monthlyCents)} por ${annual ? "ano" : "mês"}.`;
    $("offerDescription").textContent = offer.orders
      ? "Completo: receba e acompanhe os pedidos no painel, com entrega local, retirada e agendamento."
      : "Essencial: o consumidor escolhe os produtos e continua no seu WhatsApp para combinar pagamento e entrega. Durante os 14 dias, experimente também a gestão de pedidos do Completo.";
    const limits = $("selectedPlanLimits"), features = $("selectedPlanFeatures");
    limits.hidden = !selectedPlan;
    limits.textContent = selectedPlan ? (selectedPlan.max_users == null ? "Usuários sem limite neste plano." : `Até ${selectedPlan.max_users} usuário${Number(selectedPlan.max_users) === 1 ? "" : "s"} no painel, incluindo o responsável.`) : "";
    features.replaceChildren();
    const details = Array.isArray(selectedPlan?.features) ? selectedPlan.features.filter(value => typeof value === "string" && value.trim()) : [];
    features.hidden = !details.length;
    for (const detail of details) { const item = document.createElement("li"); item.textContent = detail; features.append(item); }
    if ($("cardapioSelected")) $("cardapioSelected").textContent = offer.orders ? "" : "Plano selecionado";
    if ($("encomendasSelected")) $("encomendasSelected").textContent = offer.orders ? "Plano selecionado" : "";
    $("orderNotificationsChoice").hidden = false;
    form.elements.publish_whatsapp.required = !offer.orders;
    const profile = globalThis.OgritechCatalogProfiles?.resolve(form.elements.segment?.value) || {noun:"catálogo",code:"products"};
    submit.textContent = `Criar meu ${profile.noun} e testar 14 dias`;
    for(const id of ["choose-cardapio","choose-encomendas"]) {
      const link=$(id); if(!link?.href)continue; const url=new URL(link.href,location.href);
      url.searchParams.set("perfil",profile.code); url.searchParams.set("ciclo",cycleChoice.value); link.href=url.href;
    }
  }
  offerChoice.addEventListener("change", () => { unavailableRequest = false; selectedPlan = null; choosePlan(true); updateOffer(); });
  planChoice.addEventListener("change", () => {
    unavailableRequest = false; selectedPlan = planCatalog.find(plan => plan.id === planChoice.value && plan.offer_code === offerChoice.value) || null;
    choosePlan(); updateOffer(); if (selectedPlan) message.textContent = "";
  });
  cycleChoice.addEventListener("change", updateOffer);
  form.elements.segment?.addEventListener("change", updateOffer);
  updateOffer();
  async function refreshPlanCatalog(initial = false) {
    const previousId = selectedPlan?.id;
    const plans = await OgritechOffers.loadCatalog(supabaseClient);
    planCatalog = plans; catalogLoaded = true; catalogError = false;
    const desired = initial ? requestedPlan : previousId;
    if (desired) { selectedPlan = plans.find(plan => plan.id === desired && plan.offer_code === offerChoice.value) || null; unavailableRequest = !selectedPlan; }
    choosePlan(); updateOffer();
    if (unavailableRequest) message.textContent = "Esse plano não está disponível neste cadastro. Escolha um plano disponível para continuar.";
    else if (!selectedPlan) message.textContent = "Não há planos disponíveis para contratação nesta modalidade.";
  }
  const catalogReady = refreshPlanCatalog(true).catch(error => { catalogError = true; submit.disabled = true; message.textContent = error.message; });
  const documentField = form.elements.tax_document, invoiceField = form.elements.service_invoice_preference;
  let invoiceChosen = false, phoneToken = "", challengeId = "", captchaToken = "", widgetId;
  let configuration = null, configurationError = false;
  invoiceField.addEventListener("change", () => { invoiceChosen = true; });
  function maskCpf(value) { return digits(value).slice(0, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); }
  documentField.addEventListener("input", event => {
    const value = digits(event.target.value).slice(0, 14);
    event.target.value = value.length <= 11 ? maskCpf(value) : value.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2");
    const company = value.length > 11;
    $("responsibleDocumentField").hidden = !company;
    form.elements.responsible_tax_document.required = company;
    if (!invoiceChosen) invoiceField.value = value.length === 11 ? "not_requested" : "";
  });
  form.elements.responsible_tax_document.addEventListener("input", event => { event.target.value = maskCpf(event.target.value); });
  form.elements.phone.addEventListener("input", event => { event.target.value = digits(event.target.value).slice(0, 11).replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2"); });
  form.addEventListener("input", event => {
    if (event.target.name === "email") $("existingAccountHelp").hidden = true;
    if (!["business_name", "tax_document", "responsible_tax_document", "email", "phone"].includes(event.target.name)) return;
    phoneToken = ""; challengeId = ""; $("phoneMessage").textContent = "";
  });
  async function start(body) {
    const url = window.OGRITECH_SUPABASE_URL, key = window.OGRITECH_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("O cadastro está temporariamente indisponível.");
    const response = await fetch(url + "/functions/v1/ogritech-billing", { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(result.error?.message || ({
      trial_already_used: "Este documento já usou o teste gratuito do Cardápio.",
      terms_not_configured: "A abertura de novas contas ainda não foi liberada.",
      provisioning_failed: "Não foi possível preparar seu cardápio. Tente novamente.",
      rate_limited: "Muitas tentativas. Aguarde antes de tentar novamente.",
      challenge_failed: "Confirme a verificação de segurança novamente.",
      phone_verification_required: "Confirme seu telefone pelo código recebido por SMS.",
      phone_verification_unavailable: "A confirmação do telefone está temporariamente indisponível.",
      email_already_registered: "Este e-mail já tem uma conta na Ogritech. Acesse essa conta ou use outro e-mail para um novo cadastro."
      }[result.error?.code]) || "Não foi possível concluir agora.");
      failure.code = result.error?.code || "";
      throw failure;
    }
    return result.data;
  }
  function resetCaptcha() { captchaToken = ""; if (widgetId !== undefined) window.turnstile.reset(widgetId); }
  function securityReady() {
    if (!catalogLoaded || catalogError || !selectedPlan) throw new Error("Escolha um plano disponível antes de continuar.");
    if (!configuration || configurationError || !configuration.available) throw new Error("Não foi possível preparar o cadastro. Atualize a página e tente novamente.");
    if (configuration.turnstile_site_key && !captchaToken) throw new Error("Conclua a verificação de segurança antes de continuar.");
  }
  const configReady = start({ action: "trial_configuration" }).then(config => {
    configuration = config; $("phoneVerification").hidden = !config.phone_verification;
    if (config.turnstile_site_key) {
      const script = document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.onload = () => { widgetId = window.turnstile.render("#trialChallenge", { sitekey: config.turnstile_site_key, action: "menu_trial",
        callback: token => { captchaToken = token; }, "expired-callback": () => { captchaToken = ""; }, "error-callback": () => { captchaToken = ""; } }); };
      script.onerror = () => { message.textContent = "Não foi possível carregar a verificação de segurança. Atualize a página."; };
      document.head.append(script);
    }
  }).catch(() => { configurationError = true; message.textContent = "Não foi possível preparar o cadastro. Atualize a página e tente novamente."; });
  function phoneIdentity() {
    const data = Object.fromEntries(new FormData(form));
    return { business_name: data.business_name, tax_document: data.tax_document, responsible_tax_document: data.responsible_tax_document,
      email: data.email, phone: data.phone, sms_consent: true };
  }
  $("sendPhoneCode").addEventListener("click", async event => {
    form.elements.phone_code.value = "";
    if (!form.reportValidity()) return;
    const button = event.currentTarget; button.disabled = true;
    try { await Promise.all([configReady, catalogReady]); securityReady();
      const result = await start({ ...phoneIdentity(), action: "request_phone_code", turnstile_token: captchaToken });
      challengeId = result.challenge_id; phoneToken = ""; $("phoneMessage").textContent = "Código enviado. Confira seu SMS. Ele expira em 10 minutos.";
    } catch (error) { $("phoneMessage").textContent = error.message; }
    finally { button.disabled = false; resetCaptcha(); }
  });
  $("checkPhoneCode").addEventListener("click", async event => {
    if (!challengeId) { $("phoneMessage").textContent = "Solicite um código primeiro."; return; }
    const button = event.currentTarget; button.disabled = true;
    try { const result = await start({ ...phoneIdentity(), action: "verify_phone_code", challenge_id: challengeId, code: form.elements.phone_code.value });
      phoneToken = result.phone_verification_token; $("phoneMessage").textContent = "Telefone confirmado. Você já pode criar seu cardápio.";
    } catch (error) { $("phoneMessage").textContent = error.message; }
    finally { button.disabled = false; }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    submit.disabled = true; message.textContent = "Conferindo seu cadastro...";
    const data = Object.fromEntries(new FormData(form));
    try {
      await Promise.all([configReady, catalogReady]); securityReady();
      if (configuration.phone_verification && !phoneToken) throw new Error("Confirme seu telefone antes de criar o cardápio.");
      const result = await start({ action: "start_trial", product: "menu", offer: data.offer, plan_id: selectedPlan.id, expected_total_cents: cycleChoice.value === "annual" ? OgritechOffers.forPlan(selectedPlan).annualCents : OgritechOffers.forPlan(selectedPlan).monthlyCents, publish_whatsapp: data.publish_whatsapp === "on", business_name: data.business_name, responsible_name: data.responsible_name,
        tax_document: data.tax_document, responsible_tax_document: data.responsible_tax_document, email: data.email, phone: data.phone,
        phone_verification_token: phoneToken, turnstile_token: captchaToken, segment: data.segment, service_invoice_preference: data.service_invoice_preference,
        cycle: data.cycle, payment_method: "pix", terms_version: TERMS_VERSION, accepted_terms: true, accepted_privacy: true, recurring_authorized: false, website: data.website || "" });
      if (result.status === "review_required") {
        message.textContent = result.message + " Protocolo: " + result.review_id + ".";
        submit.textContent = "Verificar liberação do teste"; return;
      }
      if (!result.trial_ends_at) throw new Error("Não foi possível confirmar a criação do cardápio. Tente novamente.");
      try { if (data.offer === "encomendas" && form.elements.order_notifications?.checked) localStorage.setItem("ogritechOrderPushInterest", String(Date.now())); else localStorage.removeItem("ogritechOrderPushInterest"); } catch {}
      $("signupSection").hidden = true; $("resultSection").hidden = false;
      $("resultMessage").textContent = "Enviamos o convite para " + data.email + ". Seu teste vai até " + new Date(result.trial_ends_at).toLocaleDateString("pt-BR") + ".";
      try { sessionStorage.setItem(`ogritechSignupEmail:${window.OGRITECH_ENV || "production"}`, data.email.trim().toLowerCase()); } catch { /* Login still requires an explicit account when storage is unavailable. */ }
      const accountLogin = new URL(result.login_url || "/login/", location.href);
      accountLogin.searchParams.set("primeiro_acesso", "1");
      $("loginLink").href = accountLogin.href;
    } catch (error) {
      message.textContent = error.message;
      if (["price_changed", "plan_unavailable"].includes(error.code)) {
        try { await refreshPlanCatalog(); if (error.code === "price_changed" && selectedPlan) message.textContent = "O valor do plano foi atualizado. Confira o novo valor antes de confirmar. Seus dados preenchidos foram mantidos."; }
        catch { catalogError = true; message.textContent = "Não foi possível atualizar os planos. Tente carregar a página novamente."; }
      }
      $("existingAccountHelp").hidden = error.code !== "email_already_registered";
    }
    finally { submit.disabled = catalogError || !selectedPlan; resetCaptcha(); }
  });
  $("changeSignupEmail").addEventListener("click", () => {
    form.elements.email.focus();
    form.elements.email.select();
  });
})();
