(() => {
  const $ = (id) => document.getElementById(id), slug = new URLSearchParams(location.search).get("empresa") || "";
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }), cart = new Map(), prices = new Map();
  let page = null, pendingRequestId = null;
  const createUuid = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => { const value = Math.floor(Math.random() * 16); return (char === "x" ? value : (value & 3) | 8).toString(16); });
  const clean = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const isQuoteItem = (item) => item.metadata?.order_mode === "quote";
  const categoryId = (index) => `categoria-${index + 1}`;
  const displayPriceLabel = (label) => String(label || "")
    .replace(/\s*[·|-]\s*\d+\s*pessoas?\b/gi, "")
    .replace(/\s*\(\s*\d+\s*pessoas?\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const weightPickerLabel = (records, quote) => {
    const usesWeight = records.some((record) => /\bkg\b/i.test(record.label || ""));
    if (quote) return usesWeight ? "Peso de referência" : "Tamanho de referência";
    return usesWeight ? "Escolha o formato e o peso" : "Escolha uma opção";
  };
  function servingGuide() {
    const portions = new Map();
    prices.forEach((price) => {
      const match = String(price.label || "").match(/(\d+(?:[.,]\d+)?)\s*kg\b.*?(\d+)\s*pessoas?/i);
      if (!match) return;
      const weight = match[1].replace(".", ","), people = Number(match[2]);
      const values = portions.get(weight) || new Set(); values.add(people); portions.set(weight, values);
    });
    const rows = [...portions].sort(([a], [b]) => Number(a.replace(",", ".")) - Number(b.replace(",", "."))).map(([weight, values]) => {
      const ordered = [...values].sort((a, b) => a - b), people = ordered.length > 1 ? `${ordered[0]} a ${ordered.at(-1)}` : String(ordered[0]);
      return `${weight} kg: cerca de ${people} pessoas`;
    });
    return rows.length ? `Como referência aproximada: ${rows.join("; ")}. O rendimento pode variar conforme o corte e o tipo de recheio.` : "A quantidade de pessoas pode variar conforme o corte. Confirme o rendimento com o estabelecimento.";
  }
  const applyVisualIdentity = (identity) => { if (identity?.customized !== true) return; if (/^#[0-9a-f]{6}$/i.test(identity.accent_color || "")) document.documentElement.style.setProperty("--accent", identity.accent_color); };
  const deliveryZoneLabel = (zone) => Number(zone.fee) === 0 && zone.code === "bolo-agendado" ? `${clean(zone.name)} · taxa calculada após informar o endereço` : `${clean(zone.name)} · ${money.format(zone.fee)}`;
  const estimatedUnitPrice = (entry) => entry.price + entry.selections.reduce((sum, item) => sum + item.price_delta * item.quantity, 0);
  function updateFulfillmentFields() { const delivery = $("fulfillment").value === "delivery"; $("addressLabel").classList.toggle("hidden", !delivery); $("deliveryZoneLabel").classList.toggle("hidden", !delivery || !(page?.delivery_zones || []).length); }
  function updateCart() { let count = 0, total = 0, hasQuote = false; cart.forEach((entry) => { count += entry.quantity; total += entry.quantity * estimatedUnitPrice(entry); hasQuote ||= entry.isQuote; }); $("cartCount").textContent = count; $("cartTotal").textContent = hasQuote ? `Referência: ${money.format(total)}` : money.format(total); $("checkoutButton").textContent = hasQuote ? "Revisar solicitação" : "Finalizar pedido"; $("checkoutTitle").textContent = hasQuote ? "Enviar solicitação para análise" : "Finalizar pedido"; $("orderSubmitButton").textContent = hasQuote ? "Enviar solicitação" : "Enviar pedido"; $("cartBar").classList.toggle("hidden", !count); }
  function addConfigured(price, selections = []) { const signature = `${price.id}:${selections.map((item) => `${item.menu_option_id}x${item.quantity}`).sort().join(",")}`; const entry = cart.get(signature) || { menu_item_price_id: price.id, name: price.item.name, price: price.amount, quantity: 0, selections, isQuote: isQuoteItem(price.item) }; entry.quantity++; cart.set(signature, entry); pendingRequestId = null; updateCart(); }
  function configure(price) {
    const groups = price.item.option_groups || []; if (!groups.length) return addConfigured(price);
    $("configuratorTitle").textContent = price.item.name;
    $("configuratorGroups").innerHTML = groups.map((group) => `<fieldset data-min="${group.minimum_selections}" data-max="${group.maximum_selections}"><legend>${clean(group.name)} <small>Escolha de ${group.minimum_selections} a ${group.maximum_selections}</small></legend>${group.options.map((option) => `<label><input type="${group.selection_type === "single" ? "radio" : "checkbox"}" name="group-${group.id}" value="${option.id}" data-price="${option.price_delta}"> <span>${clean(option.name)}${Number(option.price_delta) ? ` + ${money.format(option.price_delta)}` : ""}</span></label>`).join("")}</fieldset>`).join("");
    $("configurator").dataset.priceId = price.id; $("configuratorMessage").textContent = ""; $("configurator").showModal();
  }
  function assistantMessage(text, kind = "assistant") { const node = document.createElement("p"); node.className = `assistant-message${kind === "user" ? " user" : ""}`; node.textContent = text; $("menuAssistantMessages").append(node); node.scrollIntoView({ block: "nearest" }); }
  function assistantControls(data) {
    if ((data.suggestions || []).length) {
      const list = document.createElement("div"); list.className = "assistant-suggestions";
      data.suggestions.forEach((suggestion) => { const row = document.createElement("div"); row.className = "assistant-suggestion"; const label = document.createElement("span"); label.textContent = `${suggestion.name} · ${suggestion.label} · ${money.format(Number(suggestion.price))}`; const button = document.createElement("button"); button.className = "public-button"; button.type = "button"; button.textContent = "Adicionar"; button.addEventListener("click", () => { const price = prices.get(suggestion.menu_item_price_id); if (!price) return assistantMessage("Este item não está mais disponível. Atualize o cardápio e tente novamente."); configure(price); }); row.append(label, button); list.append(row); });
      $("menuAssistantMessages").append(list);
    }
    if (data.action?.type === "open_cart") { const button = document.createElement("button"); button.className = "public-button"; button.type = "button"; button.textContent = data.action.label || "Revisar carrinho"; button.addEventListener("click", () => { if (!cart.size) return assistantMessage("Seu carrinho ainda está vazio. Escolha um produto primeiro."); $("checkout").classList.remove("hidden"); $("checkout").scrollIntoView({ behavior: "smooth" }); }); $("menuAssistantMessages").append(button); }
    $("menuAssistantNotice").textContent = data.notice || "Confira as informações antes de continuar.";
  }
  async function initAssistant() {
    const { data, error } = await supabaseClient.rpc("public_menu_assistant_status", { target_slug: slug });
    if (error || !data?.available) return;
    $("menuAssistant").classList.remove("hidden");
  }
  $("menuAssistantToggle").addEventListener("click", () => { const opening = $("menuAssistantPanel").classList.contains("hidden"); $("menuAssistantPanel").classList.toggle("hidden", !opening); $("menuAssistantToggle").setAttribute("aria-expanded", String(opening)); $("menuAssistantToggle").setAttribute("aria-label", opening ? "Fechar assistente Ogritech" : "Abrir assistente Ogritech"); });
  $("menuAssistantClose").addEventListener("click", () => { $("menuAssistantPanel").classList.add("hidden"); $("menuAssistantToggle").setAttribute("aria-expanded", "false"); $("menuAssistantToggle").focus(); });
  $("menuAssistantForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const input = $("menuAssistantInput"), message = input.value.trim(), button = event.submitter; if (!message) return;
    assistantMessage(message, "user"); input.value = ""; button.disabled = true; $("menuAssistantNotice").textContent = "Consultando apenas os dados cadastrados...";
    const normalizedMessage = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/(kg|quilo|peso|pessoas?|serve|rende|rendimento)/.test(normalizedMessage) && /(pessoas?|serve|rende|rendimento)/.test(normalizedMessage)) {
      assistantMessage(servingGuide()); $("menuAssistantNotice").textContent = "Estimativa baseada na tabela do estabelecimento. Confirme o rendimento antes de concluir."; button.disabled = false; input.focus(); return;
    }
    let sessionToken = sessionStorage.getItem(`ogritechMenuAssistant:${slug}`); if (!sessionToken) { sessionToken = createUuid().replaceAll("-", ""); sessionStorage.setItem(`ogritechMenuAssistant:${slug}`, sessionToken); }
    const { data, error } = await supabaseClient.rpc("public_menu_assistant_message", { target_slug: slug, session_token: sessionToken, supplied_message: message }); button.disabled = false;
    if (error) return assistantMessage(error.message?.includes("Limite") ? error.message : "Não consegui responder agora. Continue pelo cardápio ou fale com o estabelecimento.");
    const reply = data.intent === "greeting" ? "Posso ajudar a encontrar bolos, doces, recheios, informações de pagamento ou a estimar o rendimento por peso. O que você gostaria de saber?" : data.reply;
    assistantMessage(reply); assistantControls(data); input.focus();
  });
  $("configuratorForm").addEventListener("submit", (event) => { event.preventDefault(); const selections = []; for (const fieldset of $("configuratorGroups").querySelectorAll("fieldset")) { const checked = [...fieldset.querySelectorAll("input:checked")]; if (checked.length < Number(fieldset.dataset.min) || checked.length > Number(fieldset.dataset.max)) { $("configuratorMessage").textContent = "Confira a quantidade de escolhas obrigatórias."; return; } checked.forEach((input) => selections.push({ menu_option_id: input.value, quantity: 1, price_delta: Number(input.dataset.price) })); } addConfigured(prices.get($("configurator").dataset.priceId), selections); $("configurator").close(); });
  $("closeConfigurator").addEventListener("click", () => $("configurator").close());
  async function init() {
    const { data, error } = await supabaseClient.rpc("public_menu", { target_slug: slug }); if (error || !data) { $("loading").innerHTML = "<h1>Cardápio indisponível</h1><p>Confira o endereço ou tente novamente.</p>"; return; }
    page = data; applyVisualIdentity(data.menu.visual_identity); document.title = `${data.menu.title} | Ogritech`; $("menuTitle").textContent = data.menu.title; $("menuDescription").textContent = data.menu.description; $("menuDescription").classList.toggle("hidden", !data.menu.description?.trim());
    const paymentNames = {pix:"Pix",cash:"Dinheiro",credit_card:"Cartão de crédito",debit_card:"Cartão de débito"}, days = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"], hours = data.menu.weekly_hours;
    $("menuPayments").textContent = `Pagamento combinado com o estabelecimento: ${(data.menu.payment_methods || []).map((code) => paymentNames[code] || code).join(", ")}.`;
    $("menuHours").textContent = hours ? `Horário informado: ${(hours.weekdays || []).map((day) => days[day]).join(", ")} · ${hours.opens_at} às ${hours.closes_at}. A confirmação do pedido depende do estabelecimento.` : "";
    $("fulfillment").innerHTML = (data.menu.accepts_pickup ? '<option value="pickup">Retirada</option>' : "") + (data.menu.accepts_delivery ? '<option value="delivery">Entrega</option>' : "");
    const zones = data.delivery_zones || []; $("deliveryZone").innerHTML = '<option value="">Selecione sua região</option>' + zones.map((zone) => `<option value="${zone.code}">${deliveryZoneLabel(zone)}</option>`).join(""); updateFulfillmentFields();
    $("categoryNav").innerHTML = data.categories.map((category, index) => `<a href="#${categoryId(index)}">${clean(category.name)}</a>`).join("");
    $("catalog").innerHTML = data.categories.map((category, categoryIndex) => `<section id="${categoryId(categoryIndex)}" class="catalog-section"><header class="catalog-section-heading"><small>EXPLORE</small><h2>${clean(category.name)}</h2><p>${clean(category.description)}</p></header><div class="catalog-items">${category.items.map((item) => {
      const records = item.prices.map((record) => { const amount = Number(record.promotional_price ?? record.price); prices.set(record.id, { ...record, amount, item }); return { ...record, amount }; });
      const quote = isQuoteItem(item), first = records[0];
      const pricePicker = records.length ? `<label class="menu-price-picker"><span>${weightPickerLabel(records, quote)}</span><select data-price-select="${item.id}">${records.map((record) => `<option value="${record.id}">${clean(displayPriceLabel(record.label))}</option>`).join("")}</select></label><div class="menu-price-action"><strong data-selected-price="${item.id}">${quote ? `A partir de ${money.format(first.amount)}` : money.format(first.amount)}</strong><button class="public-button" data-add-selected="${item.id}">${quote ? "Solicitar análise" : ((item.option_groups || []).length ? "Configurar" : "Adicionar")}</button></div>` : `<p class="menu-quote-notice">Preço e disponibilidade são confirmados após análise dos detalhes.</p>`;
      return `<article class="menu-item-card" data-item="${item.id}">${item.image_url ? `<img class="menu-item-image" src="${clean(item.image_url)}" alt="">` : `<div class="menu-item-placeholder" aria-hidden="true"><small>Feito por encomenda</small></div>`}<div class="menu-item-content"><div class="menu-item-heading"><h3>${clean(item.name)}</h3>${quote ? '<span class="menu-item-badge">Sob consulta</span>' : ((item.option_groups || []).length ? '<span class="menu-item-badge">Personalizável</span>' : "")}</div><p>${clean(item.description)}</p>${pricePicker}</div></article>`;
    }).join("")}</div></section>`).join("");
    $("catalog").querySelectorAll("[data-price-select]").forEach((select) => select.addEventListener("change", () => { const price = prices.get(select.value), output = $("catalog").querySelector(`[data-selected-price="${select.dataset.priceSelect}"]`); output.textContent = `${isQuoteItem(price.item) ? "A partir de " : ""}${money.format(price.amount)}`; }));
    $("catalog").querySelectorAll("[data-add-selected]").forEach((button) => button.addEventListener("click", () => { const select = $("catalog").querySelector(`[data-price-select="${button.dataset.addSelected}"]`); configure(prices.get(select.value)); })); $("loading").classList.add("hidden"); $("content").classList.remove("hidden"); initAssistant();
  }
  $("checkoutButton").addEventListener("click", () => { $("checkout").classList.remove("hidden"); $("checkout").scrollIntoView({ behavior: "smooth" }); });
  $("fulfillment").addEventListener("change", updateFulfillmentFields);
  $("orderSubmitButton").addEventListener("click", () => {
    const form = $("orderForm"), invalid = form.querySelector(":invalid");
    if (!invalid) return;
    $("orderMessage").textContent = invalid.name === "privacy" ? "Aceite o aviso de privacidade para enviar o pedido." : `Revise o campo ${invalid.closest("label")?.firstChild?.textContent?.trim().toLowerCase() || "obrigatório"} para continuar.`;
    invalid.setAttribute("aria-invalid", "true");
    invalid.focus(); invalid.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("orderForm").addEventListener("input", (event) => { event.target.removeAttribute("aria-invalid"); });
  $("orderForm").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!cart.size) return; const form = new FormData(event.target), fulfillment = form.get("fulfillment"); pendingRequestId ||= createUuid(); $("orderMessage").textContent = "Enviando pedido...";
    const hasQuote = [...cart.values()].some((entry) => entry.isQuote); const suppliedNotes = `${hasQuote ? "SOLICITAÇÃO DE ORÇAMENTO — valor exibido é apenas referência e depende de confirmação humana. " : ""}${form.get("notes") || ""}`.trim();
    const commonOrder = { target_slug: slug, supplied_name: form.get("name"), supplied_email: form.get("email"), supplied_phone: form.get("phone"), target_fulfillment_type: fulfillment, supplied_address: fulfillment === "delivery" ? { text: form.get("address"), zone_code: form.get("delivery_zone") || null } : null, supplied_notes: suppliedNotes, supplied_items: [...cart.values()].map(({ menu_item_price_id, quantity, selections }) => ({ menu_item_price_id, quantity, selections: selections.map(({ menu_option_id, quantity }) => ({ menu_option_id, quantity })) })), accepted_privacy: form.get("privacy") === "on", website: form.get("website") };
    let { data, error } = await supabaseClient.rpc("public_create_menu_order_v2", { ...commonOrder, client_request_id: pendingRequestId, requested_for: form.get("scheduled_for") ? new Date(form.get("scheduled_for")).toISOString() : null });
    if (error?.code === "PGRST202" && !commonOrder.supplied_items.some((item) => item.selections.length)) ({ data, error } = await supabaseClient.rpc("public_create_menu_order", { ...commonOrder, supplied_items: commonOrder.supplied_items.map(({ menu_item_price_id, quantity }) => ({ menu_item_price_id, quantity })) }));
    if (error) { $("orderMessage").textContent = error.message; return; } pendingRequestId = null; cart.clear(); updateCart(); event.target.reset(); $("orderMessage").innerHTML = `Pedido recebido: <strong>${clean(data.reference)}</strong>. <a href="${ogritechEnvironmentUrl(`/pedido/?referencia=${encodeURIComponent(data.reference)}&token=${encodeURIComponent(data.token)}`)}">Acompanhar pedido</a>`;
  });
  init();
})();
