(() => {
  if (document.querySelector(".ogri-assistant")) return;
  const panelMode = document.currentScript?.dataset.context === "panel";

  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "/assistant-widget.css?v=20261111.3";
  document.head.append(css);

  const mobileCss = document.createElement("link");
  mobileCss.rel = "stylesheet";
  mobileCss.href = "/assistant-widget-mobile.css?v=20260904.2";
  document.head.append(mobileCss);

  const root = document.createElement("aside");
  root.className = panelMode ? "ogri-assistant ogri-assistant--panel" : "ogri-assistant";
  root.setAttribute("aria-label", panelMode ? "Ajudante Ogritech" : "Assistente comercial Ogritech");
  root.innerHTML = `
    <p class="ogri-assistant__hint">Olá! Estou aqui para ajudar.</p>
    <section class="ogri-assistant__panel" id="ogri-assistant-panel" role="dialog" aria-modal="false" aria-labelledby="ogri-assistant-title" hidden>
      <header class="ogri-assistant__head">
        <img src="/ogritech-assistant-avatar.png" alt="">
        <div class="ogri-assistant__title"><strong id="ogri-assistant-title">${panelMode ? "Ajudante Ogritech" : "Assistente Ogritech"}</strong><small>${panelMode ? "Ajuda para usar o painel" : "Aquisição e dúvidas comerciais"}</small></div>
        <button class="ogri-assistant__close" type="button" aria-label="${panelMode ? "Fechar ajudante" : "Fechar assistente"}">×</button>
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
  let opener = toggle;
  let activeHelpTopic = null;
  let lastHelpContext = "";
  let contactOptions = { channels: ["E-mail"], email: "contato@ogritech.com.br" }, contactEpoch = 0, contactOpen = false;
  const helpContext = () => window.OgritechMenuWorkspace?.state() || {};
  const contextKey = context => JSON.stringify([context.ready, context.offer, context.planName, context.role, context.published, context.next, context.busy, context.dirtySettings]);
  const helpNode = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  function helpActionAvailable(action, context) {
    if (!context.ready || context.busy || !window.OgritechPanelNavigation || typeof navigateTo !== "function") return false;
    if (["plan", "upgrade"].includes(action.id) && (context.role !== "owner" || !document.getElementById("subscriptionCenter") || document.getElementById("subscriptionCenter").classList.contains("hidden"))) return false;
    if (context.dirtySettings && action.section !== "configuracoes" && action.workspace !== "settings") return false;
    const target = action.workspace ? document.querySelector(`[data-menu-workspace="${action.workspace}"]`) : document.querySelector(`.menu-item[data-section="${action.section}"]`);
    return Boolean(target && !target.disabled && !target.hidden && !target.classList.contains("hidden") && !target.classList.contains("menu-offer-hidden"));
  }
  function planHelpUrl() {
    const path = "/painel/?secao=configuracoes";
    const url = new URL(window.ogritechEnvironmentUrl ? window.ogritechEnvironmentUrl(path) : path, location.href);
    if (["local", "staging", "production"].includes(window.OGRITECH_ENV)) url.searchParams.set("env", window.OGRITECH_ENV);
    url.hash = "subscriptionCenter";
    return url.href;
  }
  function renderPanelHelp(topic = null) {
    contactOpen = false; ++contactEpoch;
    activeHelpTopic = topic;
    const context = helpContext(), model = window.OgritechPanelHelp;
    lastHelpContext = contextKey(context);
    const fallback = { greeting: "Aguarde o carregamento do plano e do perfil. Se não carregar, atualize o painel e tente novamente.", topics: [] };
    const entry = topic && model ? model.answer(topic, context) : null;
    const choices = entry ? null : model?.menu(context) || fallback;
    body.replaceChildren(helpNode("p", entry?.text || choices.greeting, "ogri-assistant__message"));
    if (choices?.topics.length) {
      const options = helpNode("div", "", "ogri-assistant__options");
      for (const item of choices.topics) {
        const button = helpNode("button", item.label, "ogri-assistant__option");
        button.type = "button"; button.dataset.topic = item.id; options.append(button);
      }
      body.append(options);
    }
    const contact = helpNode("button", "Falar com atendimento humano", "ogri-assistant__option");
    contact.type = "button"; contact.dataset.requestContact = "contato"; body.append(contact);
    if (entry) {
      const available = entry.actions.filter(action => helpActionAvailable(action, context));
      if (available.length) {
        const actions = helpNode("div", "", "ogri-assistant__actions");
        if (available.length === 1) actions.style.gridTemplateColumns = "1fr";
        for (const action of available) {
          const isPlan = ["plan", "upgrade"].includes(action.id);
          const link = helpNode(isPlan ? "a" : "button", action.label, "ogri-assistant__action");
          if (isPlan) link.href = planHelpUrl(); else link.type = "button";
          link.dataset.panelHelpAction = action.id; actions.append(link);
        }
        body.append(actions);
      }
      if (entry.actions.length && !available.length) body.append(helpNode("p", context.busy ? "Aguarde a operação em andamento para usar os atalhos." : context.dirtySettings ? "Salve as configurações de atendimento antes de mudar de área." : "O atalho ainda não está disponível nesta etapa. Siga as etapas indicadas no painel.", "ogri-assistant__notice"));
      const back = helpNode("button", "← Ver outras dúvidas", "ogri-assistant__back");
      back.type = "button"; back.addEventListener("click", menu); body.append(back);
    }
  }

  const topics = {
    planos: "Ogritech Catálogo Essencial: R$ 9,90/mês ou R$ 99,00/ano, com atendimento no WhatsApp. Catálogo Completo: R$ 29,90/mês ou R$ 299,00/ano, com gestão de pedidos no painel. Para alimentação, artesanato e produtos. Não há comissão por pedido. <a href='/criar-cardapio/'>Começar agora</a>.",
    teste: "Cada CPF ou CNPJ elegível recebe um único teste de 14 dias no Completo, compartilhado entre planos e segmentos. Trocar de plano, segmento ou periodicidade não reinicia o teste. Não há cobrança durante o teste e você pode cancelar sem falar com atendentes. <a href='/criar-cardapio/'>Iniciar teste</a>.",
    beneficios: "O Catálogo Essencial reúne fotos, preços e opções para o consumidor escolher e continuar no WhatsApp. O Completo inclui entrega local, retirada, agendamento e acompanhamento de pedidos no painel.",
    pagamento: "Aceitamos cartão recorrente e Pix. Não oferecemos boleto nem Pix Automático. O cancelamento é feito pela própria conta e o acesso continua até o fim do período pago.",
    contato: "Solicite o retorno de uma pessoa da equipe Ogritech por e-mail."
  };

  function menu() {
    contactOpen = false; ++contactEpoch;
    if (panelMode) { renderPanelHelp(); return; }
    body.innerHTML = `<p class="ogri-assistant__message">Como posso ajudar com a Ogritech Catálogo?</p><div class="ogri-assistant__options">
      <button class="ogri-assistant__option" data-topic="planos">Planos e valores</button>
      <button class="ogri-assistant__option" data-topic="teste">Período gratuito</button>
      <button class="ogri-assistant__option" data-topic="beneficios">Benefícios</button>
      <button class="ogri-assistant__option" data-topic="pagamento">Pagamento e cancelamento</button>
      <button class="ogri-assistant__option" data-topic="contato">Falar com atendimento humano</button>
    </div><p class="ogri-assistant__notice">Atendimento restrito à aquisição, implantação e uso da Ogritech Catálogo.</p>`;
  }

  function answer(topic) {
    if (panelMode) { renderPanelHelp(topic); return; }
    body.innerHTML = `<p class="ogri-assistant__message">${topics[topic]}</p><div class="ogri-assistant__actions"><button class="ogri-assistant__action" type="button" data-request-contact="${topic}">Falar com atendimento humano</button></div><button class="ogri-assistant__back" type="button">← Ver outras dúvidas</button>`;
    body.querySelector(".ogri-assistant__back").addEventListener("click", menu);
  }

  async function callbackForm(returnTopic = "contato") {
    contactOpen = true; const epoch = ++contactEpoch;
    contactOptions = { channels: ["E-mail"], email: "contato@ogritech.com.br" };
    if (panelMode) {
      body.replaceChildren(helpNode("p", "Conferindo os canais de atendimento...", "ogri-assistant__message"));
      const fallback = helpNode("a", "Escrever por e-mail", "ogri-assistant__action");
      fallback.href = "mailto:suporte@ogritech.com.br"; body.append(fallback);
      const back = helpNode("button", "← Voltar", "ogri-assistant__back"); back.type = "button"; back.addEventListener("click", menu); body.append(back);
      try {
        const { data, error } = await supabaseClient.rpc("assistant_contact_options");
        if (!error && Array.isArray(data?.channels)) contactOptions = data;
      } catch { /* E-mail remains available if subscription verification fails. */ }
      if (epoch !== contactEpoch || !contactOpen || panel.hidden) return;
    }
    const extended = panelMode && ["Ligação", "WhatsApp"].every(channel => contactOptions.channels.includes(channel));
    body.innerHTML = `<p class="ogri-assistant__message">Solicite o retorno de uma pessoa da equipe Ogritech. ${extended ? "Escolha telefone, WhatsApp ou e-mail." : "O atendimento está disponível por e-mail."}</p>
      <form class="ogri-assistant__form" novalidate>
        <fieldset><legend>Como prefere receber o contato? *</legend>${extended ? `<label class="ogri-assistant__choice"><input type="radio" name="channel" value="Ligação"><span>Ligação telefônica</span></label><label class="ogri-assistant__choice"><input type="radio" name="channel" value="WhatsApp"><span>WhatsApp</span></label>` : ""}<label class="ogri-assistant__choice"><input type="radio" name="channel" value="E-mail" checked><span>E-mail</span></label></fieldset>
        <label data-phone-field><span>Telefone *</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="(00) 00000-0000" required></label>
        <label data-email-field hidden><span>E-mail *</span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="320" placeholder="voce@empresa.com.br"></label>
        <label class="ogri-assistant__consent" data-whatsapp-consent><input type="checkbox" name="whatsappConsent" required><span>Aceito receber pelo WhatsApp uma mensagem da Ogritech iniciando o contato.</span></label>
        <label class="ogri-assistant__consent"><input type="checkbox" name="privacyConsent" required><span>Autorizo o uso destes dados para a Ogritech entrar em contato. Li a <a href="/privacidade.html" target="_blank" rel="noopener noreferrer">Política de Privacidade</a>.</span></label>
        <label class="ogri-assistant__honeypot" aria-hidden="true">Site<input name="website" tabindex="-1" autocomplete="off"></label>
        <p class="ogri-assistant__form-message" role="alert"></p>
        <button class="ogri-assistant__submit" type="submit">Solicitar contato</button>
      </form><p class="ogri-assistant__notice">Você também pode escrever para <a href="mailto:${extended ? "suporte@ogritech.com.br" : "contato@ogritech.com.br"}">${extended ? "suporte@ogritech.com.br" : "contato@ogritech.com.br"}</a>.${extended ? ' Contato oficial: <a href="tel:+5516994577762">(16) 99457-7762</a> · <a href="https://wa.me/5516994577762" target="_blank" rel="noopener noreferrer">WhatsApp da Ogritech</a>.' : ""}</p><button class="ogri-assistant__back" type="button">← Voltar</button>`;
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
    form.querySelectorAll("[name=channel]").forEach(input => input.addEventListener("change", updateConsent));
    form.addEventListener("submit", submitCallback);
    body.querySelector(".ogri-assistant__back").addEventListener("click", returnTopic === "contato" ? menu : () => answer(returnTopic));
    updateConsent();
    email.focus();
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
    if (submit.disabled) return;
    const digits = form.elements.phone.value.replace(/\D/g, "");
    const email = form.elements.email.value.trim().toLowerCase();
    const channel = form.elements.channel.value;
    if (!contactOptions.channels.includes(channel) || (!panelMode && channel !== "E-mail")) { message.textContent = "Escolha o atendimento por e-mail para continuar."; return; }
    const whatsappAccepted = form.elements.whatsappConsent.checked;
    if (channel !== "E-mail" && (digits.length < 10 || digits.length > 11)) { message.textContent = "Informe um telefone válido com DDD."; form.elements.phone.focus(); return; }
    if (channel === "E-mail" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { message.textContent = "Informe um e-mail válido."; form.elements.email.focus(); return; }
    if (!form.elements.privacyConsent.checked) { message.textContent = "Confirme a autorização para receber o contato."; return; }
    if (channel === "WhatsApp" && !whatsappAccepted) { message.textContent = "Confirme o aceite para receber a mensagem pelo WhatsApp."; return; }
    submit.disabled = true;
    message.textContent = "Enviando seus dados...";
    const { url, key } = apiConfig();
    try {
      const session = panelMode ? await supabaseClient.auth.getSession() : null;
      const accessToken = session?.data?.session?.access_token;
      if (panelMode && channel !== "E-mail" && !accessToken) throw new Error("Sua sessão expirou. Entre novamente ou solicite contato por e-mail.");
      const response = await fetch(`${url}/rest/v1/rpc/public_submit_assistant_callback`, {
        method: "POST",
        headers: { apikey: key, "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ supplied_phone: channel === "E-mail" ? "" : digits, supplied_email: channel === "E-mail" ? email : "", supplied_channel: channel, accepted_privacy: true, accepted_whatsapp: channel === "WhatsApp" && whatsappAccepted, website: form.elements.website.value })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Não foi possível enviar agora.");
      if (!contactOpen || !panel.contains(form)) return;
      const successText = channel === "WhatsApp" ? "Solicitação recebida. Uma pessoa da equipe Ogritech poderá retornar pelo WhatsApp informado." : channel === "E-mail" ? "Solicitação recebida. Uma pessoa da equipe Ogritech poderá retornar pelo e-mail informado." : "Solicitação recebida. Uma pessoa da equipe Ogritech poderá retornar por ligação telefônica.";
      body.innerHTML = `<p class="ogri-assistant__message">${successText}</p><button class="ogri-assistant__back" type="button">← Voltar ao início</button>`;
      body.querySelector(".ogri-assistant__back").addEventListener("click", menu);
    } catch (error) {
      if (!contactOpen || !panel.contains(form)) return;
      message.textContent = error?.message || "Não foi possível enviar agora. Tente novamente.";
      submit.disabled = false;
    }
  }

  function setOpen(open) {
    if (open) hasInteracted = true;
    else { contactOpen = false; ++contactEpoch; }
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", `${open ? "Fechar" : "Abrir"} ${panelMode ? "ajudante" : "assistente"} Ogritech`);
    document.querySelectorAll("[data-open-ogritech-assistant]").forEach(button => button.setAttribute("aria-expanded", String(open)));
    hint.hidden = hasInteracted;
    if (open) { menu(); close.focus(); }
    else opener.focus();
  }

  toggle.addEventListener("click", () => { opener = toggle; setOpen(panel.hidden); });
  close.addEventListener("click", () => setOpen(false));
  document.querySelectorAll("[data-open-ogritech-assistant]").forEach(button => {
    button.disabled = false;
    button.addEventListener("click", () => { opener = button; setOpen(true); });
  });
  toggle.setAttribute("aria-controls", panel.id);
  if (panelMode) toggle.setAttribute("aria-label", "Abrir ajudante Ogritech");
  body.addEventListener("click", event => {
    const requestButton = event.target.closest("[data-request-contact]");
    if (requestButton) { callbackForm(requestButton.dataset.requestContact); return; }
    if (panelMode) {
      const topic = event.target.closest("[data-topic]");
      if (topic) answer(topic.dataset.topic);
      const navigation = event.target.closest("[data-panel-help-action]");
      if (navigation) {
        const context = helpContext();
        const action = window.OgritechPanelHelp?.answer(activeHelpTopic, context).actions.find(item => item.id === navigation.dataset.panelHelpAction);
        if (!action || !helpActionAvailable(action, context)) { event.preventDefault(); renderPanelHelp(activeHelpTopic); return; }
        if (navigation.tagName === "A" && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
        event.preventDefault();
        if (window.OgritechPanelNavigation.canLeave?.(action.section) === false) return;
        navigateTo(action.section, { reload: false });
        const expected = { cardapio: "orders", produtos: "products", loja: "menu", vendas: "sales", configuracoes: "account" }[action.section];
        if (document.body.dataset.panelRoute !== expected) return;
        if (action.workspace) {
          const tab = document.querySelector(`[data-menu-workspace="${action.workspace}"]`);
          if (tab?.disabled) return;
          tab?.click();
          if (helpContext().workspace !== action.workspace) return;
        }
        setOpen(false);
        const target = action.selector ? document.querySelector(action.selector) || document.getElementById("subscriptionCenter") : document.querySelector(`.menu-item[data-section="${action.section}"]`);
        if (target) {
          if (action.selector) { target.setAttribute("tabindex", "-1"); target.scrollIntoView({ block: "start", behavior: "instant" }); }
          target.focus({ preventScroll: true });
        }
      }
      return;
    }
    const topicButton = event.target.closest("[data-topic]");
    if (topicButton) {
      if (topicButton.dataset.topic === "contato") callbackForm("contato");
      else answer(topicButton.dataset.topic);
      return;
    }

  });
  if (panelMode) window.addEventListener("ogritech:menu-context-changed", () => {
    if (contactOpen) { if (!helpContext().ready) { ++contactEpoch; contactOpen = false; renderPanelHelp(); } return; }
    if (!panel.hidden && contextKey(helpContext()) !== lastHelpContext) renderPanelHelp(activeHelpTopic);
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) setOpen(false); });
})();
