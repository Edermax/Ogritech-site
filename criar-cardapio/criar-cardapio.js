(() => {
  const TERMS_VERSION = "3.3-2026-11-13", form = document.querySelector("#menuTrialForm");
  const message = document.querySelector("#formMessage"), submit = document.querySelector("#submitButton");
  const $ = id => document.querySelector('#' + id), digits = value => value.replace(/\D/g, "");
  const offerChoice=form.elements.offer,cycleChoice=form.elements.cycle;const requested=new URLSearchParams(location.search).get("plano");offerChoice.value=requested==="encomendas"?"encomendas":"cardapio";function updateOffer(){const offer=OgritechOffers.offers[offerChoice.value],annual=cycleChoice.value==="annual";document.querySelector("#selectedOfferPrice").textContent=OgritechOffers.format(annual?offer.annualCents:offer.monthlyCents);document.querySelector("#selectedOfferPeriod").textContent=annual?"/ano após o teste":"/mês após o teste";document.querySelector("#selectedMonthlyPrice").textContent=OgritechOffers.format(offer.monthlyCents);document.querySelector("#selectedAnnualPrice").textContent=OgritechOffers.format(offer.annualCents);document.querySelector("#selectedOfferSummary").textContent=`14 dias completos. Depois: ${OgritechOffers.format(annual?offer.annualCents:offer.monthlyCents)} por ${annual?"ano":"mês"}.`;document.querySelector("#offerDescription").textContent=offer.orders?"Encomendas: receba e acompanhe os pedidos no painel, com entrega, retirada e agendamento.":"Cardápio: o consumidor escolhe os produtos e continua no seu WhatsApp para combinar pagamento e entrega.";form.elements.publish_whatsapp.required=!offer.orders;}offerChoice.addEventListener("change",updateOffer);cycleChoice.addEventListener("change",updateOffer);updateOffer();
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
    if (!["business_name", "tax_document", "responsible_tax_document", "email", "phone"].includes(event.target.name)) return;
    phoneToken = ""; challengeId = ""; $("phoneMessage").textContent = "";
  });
  async function start(body) {
    const url = window.OGRITECH_SUPABASE_URL, key = window.OGRITECH_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("O cadastro está temporariamente indisponível.");
    const response = await fetch(url + "/functions/v1/ogritech-billing", { method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || ({
      trial_already_used: "Este documento já usou o teste gratuito do Cardápio.",
      terms_not_configured: "A abertura de novas contas ainda não foi liberada.",
      provisioning_failed: "Não foi possível preparar seu cardápio. Tente novamente.",
      rate_limited: "Muitas tentativas. Aguarde antes de tentar novamente.",
      challenge_failed: "Confirme a verificação de segurança novamente.",
      phone_verification_required: "Confirme seu telefone pelo código recebido por SMS.",
      phone_verification_unavailable: "A confirmação do telefone está temporariamente indisponível."
    }[result.error?.code]) || "Não foi possível concluir agora.");
    return result.data;
  }
  function resetCaptcha() { captchaToken = ""; if (widgetId !== undefined) window.turnstile.reset(widgetId); }
  function securityReady() {
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
    try { await configReady; securityReady();
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
      await configReady; securityReady();
      if (configuration.phone_verification && !phoneToken) throw new Error("Confirme seu telefone antes de criar o cardápio.");
      const result = await start({ action: "start_trial", product: "menu", offer: data.offer, publish_whatsapp: data.publish_whatsapp === "on", business_name: data.business_name, responsible_name: data.responsible_name,
        tax_document: data.tax_document, responsible_tax_document: data.responsible_tax_document, email: data.email, phone: data.phone,
        phone_verification_token: phoneToken, turnstile_token: captchaToken, segment: data.segment, service_invoice_preference: data.service_invoice_preference,
        cycle: data.cycle, payment_method: "pix", terms_version: TERMS_VERSION, accepted_terms: true, accepted_privacy: true, recurring_authorized: false, website: data.website || "" });
      if (result.status === "review_required") {
        message.textContent = result.message + " Protocolo: " + result.review_id + ".";
        submit.textContent = "Verificar liberação do teste"; return;
      }
      if (!result.trial_ends_at) throw new Error("Não foi possível confirmar a criação do cardápio. Tente novamente.");
      try { if (form.elements.order_notifications?.checked) localStorage.setItem("ogritechOrderPushInterest", String(Date.now())); else localStorage.removeItem("ogritechOrderPushInterest"); } catch {}
      $("signupSection").hidden = true; $("resultSection").hidden = false;
      $("resultMessage").textContent = "Enviamos o convite para " + data.email + ". Seu teste vai até " + new Date(result.trial_ends_at).toLocaleDateString("pt-BR") + ".";
      $("loginLink").href = result.login_url || "/login/";
    } catch (error) { message.textContent = error.message; }
    finally { submit.disabled = false; resetCaptcha(); }
  });
})();
