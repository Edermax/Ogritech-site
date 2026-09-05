(() => {
  if (document.querySelector(".ogri-assistant")) return;

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/assistant-widget.css?v=20260904.3";
  document.head.append(css);

  const mobileCss = document.createElement("link");
  mobileCss.rel = "stylesheet";
  mobileCss.href = "/assistant-widget-mobile.css?v=20260904.2";
  document.head.append(mobileCss);

  const root = document.createElement("aside");
  root.className = "ogri-assistant";
  root.setAttribute("aria-label", "Assistente comercial Ogritech");
  root.innerHTML = `
    <p class="ogri-assistant__hint">Olá! Estou aqui para ajudar.</p>
    <section class="ogri-assistant__panel" role="dialog" aria-modal="false" aria-labelledby="ogri-assistant-title" hidden>
      <header class="ogri-assistant__head">
        <img src="/ogritech-assistant-avatar.png" alt="">
        <div class="ogri-assistant__title"><strong id="ogri-assistant-title">Assistente Ogritech</strong><small>Aquisição e dúvidas comerciais</small></div>
        <button class="ogri-assistant__close" type="button" aria-label="Fechar assistente">×</button>
      </header>
      <div class="ogri-assistant__body" aria-live="polite"></div>
    </section>
    <button class="ogri-assistant__toggle" type="button" aria-label="Abrir assistente Ogritech" aria-expanded="false">
      <img src="/ogritech-assistant-avatar.png" alt="">
    </button>`;
  document.body.append(root);

  const panel = root.querySelector(".ogri-assistant__panel");
  const body = root.querySelector(".ogri-assistant__body");
  const toggle = root.querySelector(".ogri-assistant__toggle");
  const close = root.querySelector(".ogri-assistant__close");
  const hint = root.querySelector(".ogri-assistant__hint");
  let hasInteracted = false;

  const topics = {
    planos: "Os planos são definidos conforme a operação e o número de profissionais. Envie seus dados para receber os valores adequados ao seu estabelecimento.",
    teste: "A Ogritech Agenda poderá oferecer período gratuito de teste conforme a condição comercial vigente. Confirmamos a disponibilidade no primeiro contato.",
    beneficios: "A Ogritech Agenda reúne agenda, equipe, serviços, histórico e relacionamento com clientes, com atendimento focado em agendamentos.",
    pagamento: "As formas de pagamento são apresentadas na proposta. O cancelamento não tem taxa; eventuais condições do plano são informadas antes da contratação.",
    contato: "Você pode solicitar retorno por ligação telefônica, WhatsApp ou e-mail. Escolha o canal e informe seus dados."
  };

  function menu() {
    body.innerHTML = `<p class="ogri-assistant__message">Como posso ajudar com a Ogritech Agenda?</p><div class="ogri-assistant__options">
      <button class="ogri-assistant__option" data-topic="planos">Planos e valores</button>
      <button class="ogri-assistant__option" data-topic="teste">Período gratuito</button>
      <button class="ogri-assistant__option" data-topic="beneficios">Benefícios</button>
      <button class="ogri-assistant__option" data-topic="pagamento">Pagamento e cancelamento</button>
      <button class="ogri-assistant__option" data-topic="contato">Solicitar contato</button>
    </div><p class="ogri-assistant__notice">Atendimento restrito à aquisição, implantação e uso da Ogritech Agenda.</p>`;
  }

  function answer(topic) {
    body.innerHTML = `<p class="ogri-assistant__message">${topics[topic]}</p><div class="ogri-assistant__actions"><button class="ogri-assistant__action" type="button" data-request-contact="${topic}">Solicitar contato</button></div><button class="ogri-assistant__back" type="button">← Ver outras dúvidas</button>`;
    body.querySelector(".ogri-assistant__back").addEventListener("click", menu);
  }

  function callbackForm(returnTopic = "contato") {
    body.innerHTML = `<p class="ogri-assistant__message">Informe como prefere receber o contato da Ogritech.</p>
      <form class="ogri-assistant__form" novalidate>
        <fieldset><legend>Como prefere receber o contato? *</legend><label class="ogri-assistant__choice"><input type="radio" name="channel" value="Ligação" checked><span>Ligação telefônica</span></label><label class="ogri-assistant__choice"><input type="radio" name="channel" value="WhatsApp"><span>WhatsApp</span></label><label class="ogri-assistant__choice"><input type="radio" name="channel" value="E-mail"><span>E-mail</span></label></fieldset>
        <label data-phone-field><span>Telefone *</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="(00) 00000-0000" required></label>
        <label data-email-field hidden><span>E-mail *</span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="320" placeholder="voce@empresa.com.br"></label>
        <label class="ogri-assistant__consent" data-whatsapp-consent><input type="checkbox" name="whatsappConsent" required><span>Aceito receber pelo WhatsApp uma mensagem da Ogritech iniciando o contato.</span></label>
        <label class="ogri-assistant__consent"><input type="checkbox" name="privacyConsent" required><span>Autorizo o uso destes dados para a Ogritech entrar em contato. Li a <a href="/privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</span></label>
        <label class="ogri-assistant__honeypot" aria-hidden="true">Site<input name="website" tabindex="-1" autocomplete="off"></label>
        <p class="ogri-assistant__form-message" role="alert"></p>
        <button class="ogri-assistant__submit" type="submit">Solicitar contato</button>
      </form><button class="ogri-assistant__back" type="button">← Voltar</button>`;
    const form = body.querySelector(".ogri-assistant__form");
    const phone = form.elements.phone;
    const email = form.elements.email;
    const phoneField = body.querySelector("[data-phone-field]");
    const emailField = body.querySelector("[data-email-field]");
    const whatsappConsent = body.querySelector("[data-whatsapp-consent]");
    const updateConsent = () => {
      const channel = form.elements.channel.value;
      const isWhatsApp = channel === "WhatsApp";
      const isEmail = channel === "E-mail";
      phoneField.hidden = isEmail;
      emailField.hidden = !isEmail;
      phone.required = !isEmail;
      email.required = isEmail;
      whatsappConsent.hidden = !isWhatsApp;
      form.elements.whatsappConsent.required = isWhatsApp;
      if (!isWhatsApp) form.elements.whatsappConsent.checked = false;
    };
    phone.addEventListener("input", event => {
      event.target.value = event.target.value.replace(/\D/g, "").slice(0, 11).replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
    });
    form.elements.channel.forEach(input => input.addEventListener("change", updateConsent));
    form.addEventListener("submit", submitCallback);
    body.querySelector(".ogri-assistant__back").addEventListener("click", returnTopic === "contato" ? menu : () => answer(returnTopic));
    updateConsent();
    phone.focus();
  }

  function apiConfig() {
    if (window.OGRITECH_SUPABASE_URL && window.OGRITECH_SUPABASE_PUBLISHABLE_KEY) return { url: window.OGRITECH_SUPABASE_URL, key: window.OGRITECH_SUPABASE_PUBLISHABLE_KEY };
    const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    const staging = new URLSearchParams(window.location.search).get("env") === "staging";
    if (local) return { url: "http://127.0.0.1:54321", key: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH" };
    if (staging) return { url: "https://fuesdztsvrkkgnbqhcxi.supabase.co", key: "sb_publishable_CxrxTe7nMD4MBxMcZwQmxA_HHzDpYHv" };
    return { url: "https://mvzcoaiiwytycdqcvydf.supabase.co", key: "sb_publishable_Mv7A4NxC6zr1s7Ob1ROEUw_Au212ibY" };
  }

  async function submitCallback(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.querySelector(".ogri-assistant__form-message");
    const submit = form.querySelector(".ogri-assistant__submit");
    const digits = form.elements.phone.value.replace(/\D/g, "");
    const email = form.elements.email.value.trim().toLowerCase();
    const channel = form.elements.channel.value;
    const whatsappAccepted = form.elements.whatsappConsent.checked;
    if (channel !== "E-mail" && (digits.length < 10 || digits.length > 11)) { message.textContent = "Informe um telefone válido com DDD."; form.elements.phone.focus(); return; }
    if (channel === "E-mail" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { message.textContent = "Informe um e-mail válido."; form.elements.email.focus(); return; }
    if (!form.elements.privacyConsent.checked) { message.textContent = "Confirme a autorização para receber o contato."; return; }
    if (channel === "WhatsApp" && !whatsappAccepted) { message.textContent = "Confirme o aceite para receber a mensagem pelo WhatsApp."; return; }
    submit.disabled = true;
    message.textContent = "Enviando seus dados...";
    const { url, key } = apiConfig();
    try {
      const response = await fetch(`${url}/rest/v1/rpc/public_submit_assistant_callback`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json" },
        body: JSON.stringify({ supplied_phone: channel === "E-mail" ? "" : digits, supplied_email: channel === "E-mail" ? email : "", supplied_channel: channel, accepted_privacy: true, accepted_whatsapp: channel === "WhatsApp" && whatsappAccepted, website: form.elements.website.value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Não foi possível enviar agora.");
      const delivery = result?.data?.delivery_status;
      const successText = channel === "WhatsApp" && delivery === "sent" ? "Enviei uma mensagem para o seu WhatsApp. Podemos continuar por lá." : channel === "WhatsApp" ? "Solicitação recebida. Seu contato por WhatsApp foi autorizado e está na fila de atendimento." : channel === "E-mail" ? "Solicitação recebida. Seu contato por e-mail foi registrado." : "Solicitação recebida. A Ogritech entrará em contato por ligação telefônica.";
      body.innerHTML = `<p class="ogri-assistant__message">${successText}</p><button class="ogri-assistant__back" type="button">← Voltar ao início</button>`;
      body.querySelector(".ogri-assistant__back").addEventListener("click", menu);
    } catch (error) {
      message.textContent = error?.message || "Não foi possível enviar agora. Tente novamente.";
      submit.disabled = false;
    }
  }

  function setOpen(open) {
    if (open) hasInteracted = true;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fechar assistente Ogritech" : "Abrir assistente Ogritech");
    hint.hidden = hasInteracted;
    if (open) { menu(); close.focus(); }
  }

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => { setOpen(false); toggle.focus(); });
  body.addEventListener("click", event => {
    const topicButton = event.target.closest("[data-topic]");
    if (topicButton) {
      if (topicButton.dataset.topic === "contato") callbackForm("contato");
      else answer(topicButton.dataset.topic);
      return;
    }
    const requestButton = event.target.closest("[data-request-contact]");
    if (requestButton) callbackForm(requestButton.dataset.requestContact);
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });
})();
