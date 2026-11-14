(() => {
  const $ = (id) => document.getElementById(id);
  const pathSlug = location.pathname.match(/^\/cardapio\/([a-z0-9][a-z0-9-]{1,61}[a-z0-9])\/?$/)?.[1];
  const slug = pathSlug || new URLSearchParams(location.search).get("empresa") || "";
  const isDinizMenu = slug === "diniz-doces" || slug === "diniz-doces-previa-7d1";
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }), cart = new Map(), prices = new Map();
  const whatsappOnly = () => page?.menu?.offer_code === "cardapio";
  let page = null, pendingRequestId = null, assistantSessionToken = null, calculatedDeliveryFee = null;
  const createUuid = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => { const value = Math.floor(Math.random() * 16); return (char === "x" ? value : (value & 3) | 8).toString(16); });
  const clean = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  function buildOrderPix(key, city, merchant, amount, orderCode) {
    if (!/^[!-~]{1,77}$/.test(key || "") || !/^[A-Z0-9 ]{1,15}$/.test(city || "")) return "";
    if (!Number.isFinite(amount) || amount <= 0 || amount >= 1e10) return "";
    const field = (id, value) => id + String(value.length).padStart(2, "0") + value;
    const name = merchant.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/ +/g, " ").trim().slice(0, 25);
    if (!name) return "";
    const reference = String(orderCode || "").replace(/[^a-z0-9]/gi, "").slice(0, 25) || "***";
    const account = field("00", "BR.GOV.BCB.PIX") + field("01", key);
    const payload = field("00", "01") + field("26", account) + field("52", "0000")
      + field("53", "986") + field("54", amount.toFixed(2)) + field("58", "BR")
      + field("59", name) + field("60", city) + field("62", field("05", reference)) + "6304";
    let crc = 0xffff;
    for (const character of payload) {
      crc ^= character.charCodeAt(0) << 8;
      for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
    }
    return payload + crc.toString(16).toUpperCase().padStart(4, "0");
  }
  const isQuoteItem = (item) => item.metadata?.order_mode === "quote";
  const categoryId = (index) => `categoria-${index + 1}`;
  const normalizeSearch = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  const displayPriceLabel = (label) => String(label || "")
    .replace(/\s*[·|-]\s*\d+\s*pessoas?\b/gi, "")
    .replace(/\s*\(\s*\d+\s*pessoas?\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const weightPickerLabel = (records, quote) => {
    const usesWeight = records.some((record) => /\d\s*(?:kg|g)\b/i.test(record.label || ""));
    if (quote) return usesWeight ? "Peso de referência" : "Tamanho de referência";
    return usesWeight ? "Escolha o formato e o peso" : "Escolha uma opção";
  };
  const formatItemPrice = (price, item, quantity, showTotal) => {
    const unit = item.unit_label?.trim() || "unidade";
    if (showTotal) return `${quantity} × ${unit} · ${money.format(price.amount * quantity)}`;
    const prefix = isQuoteItem(item) ? "A partir de " : "";
    return `${prefix}${money.format(price.amount)} por ${unit}`;
  };
  const formatHours = (hours) => {
    if (!hours) return "";
    const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const periods = [{ weekdays: hours.weekdays || [], opens_at: hours.opens_at, closes_at: hours.closes_at }, ...(hours.special_hours || [])]
      .filter((period) => period.weekdays?.length && period.opens_at && period.closes_at)
      .map((period) => `${period.weekdays.map((day) => days[day]).join(", ")} · ${period.opens_at} às ${period.closes_at}`);
    return periods.length ? `Horário informado: ${periods.join("; ")}. A confirmação do pedido depende do estabelecimento.` : "";
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
  const applyVisualIdentity = (identity) => { globalThis.OgritechMenuBranding?.applyColors(document.documentElement,identity); };
  const dinizIllustration = (category, item) => {
    if (!isDinizMenu) return null;
    const label = `${category?.name || ""} ${item?.name || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const illustrations = [
      { match: /bolo de corte.*ninho com nutella/, src: "bolo-chocolate-granulado.jpg", alt: "Bolo de chocolate decorado produzido pela Diniz Doces" },
      { match: /bolo de corte/, src: "bolo-de-corte.jpg", alt: "Fatias de bolo de corte produzidas pela Diniz Doces" },
      { match: /bolo personalizado retangular/, src: "bolo-retangular-caramelo.jpg", alt: "Bolo retangular decorado da Diniz Doces" },
      { match: /bolo personalizado redondo/, src: "bolo-redondo.png", alt: "Bolo redondo decorado da Diniz Doces" },
      { match: /doces tradicionais/, src: "doces-sortidos.jpg", alt: "Seleção de doces da Diniz Doces" },
      { match: /doces especiais/, src: "brigadeiros.png", alt: "Brigadeiros da Diniz Doces" },
      { match: /pao de mel/, src: "pao-de-mel.jpg", alt: "Pão de mel personalizado produzido pela Diniz Doces" },
      { match: /pirulito/, src: "pirulito.jpg", alt: "Pirulito personalizado produzido pela Diniz Doces" },
    ];
    const selected = illustrations.find(({ match }) => match.test(label));
    if (selected) return { ...selected, src: `../assets/diniz-doces/${selected.src}` };
    return null;
  };
  const deliveryZoneLabel = (zone) => Number(zone.fee) === 0 && zone.code === "bolo-agendado" ? `${clean(zone.name)} · taxa calculada após informar o endereço` : `${clean(zone.name)} · ${money.format(zone.fee)}`;
  const estimatedUnitPrice = (entry) => globalThis.OgritechMenuPricing.unitPrice(entry.price, entry.selections, entry.optionGroups);
  const localDateTimeValue = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  };
  const requiredLeadTime = () => Math.max(0, ...[...cart.values()].map((entry) => Number(entry.leadTimeHours) || 0));
  function updateSchedulingRequirement() {
    if (whatsappOnly()) { $("scheduledFor").required = false; return; }
    const input = $("scheduledFor"), hint = $("scheduledForHint"), leadTime = requiredLeadTime();
    input.required = leadTime > 0;
    if (!leadTime) { input.removeAttribute("min"); hint.textContent = "(Opcional)"; return; }
    input.min = localDateTimeValue(new Date(Date.now() + (leadTime * 60 + 5) * 60000));
    hint.textContent = `(obrigatório · mínimo de ${leadTime} horas de antecedência)`;
  }
  function resetAutomaticDelivery() {
    if (!isDinizMenu) return;
    calculatedDeliveryFee = null;
    $("deliveryZone").value = "";
    $("deliveryQuote").classList.add("hidden");
    $("deliveryQuoteValue").textContent = "";
    $("deliveryQuoteDetail").textContent = "";
    updateCheckoutEstimate();
  }
  function updateCheckoutEstimate() {
    const subtotal = [...cart.values()].reduce((sum, entry) => sum + entry.quantity * estimatedUnitPrice(entry), 0);
    const delivery = $("fulfillment").value === "delivery";
    const zone = (page?.delivery_zones || []).find((entry) => entry.code === $("deliveryZone").value);
    const fee = delivery && zone ? Number(zone.fee) : 0;
    const automaticFee = delivery && isDinizMenu ? calculatedDeliveryFee : null;
    const knownFee = !delivery || (isDinizMenu ? automaticFee !== null && Number.isFinite(automaticFee) : Boolean(zone));
    const deliveryFee = isDinizMenu && automaticFee !== null ? automaticFee : fee;
    const quote = [...cart.values()].some((entry) => entry.isQuote);
    $("checkoutSubtotal").textContent = money.format(subtotal);
    $("checkoutDelivery").textContent = !delivery ? "Retirada · sem taxa" : knownFee ? money.format(deliveryFee) : "A calcular";
    $("checkoutEstimateTotal").textContent = knownFee ? money.format(subtotal + deliveryFee) : `${money.format(subtotal)} + entrega`;
    $("checkoutEstimateNote").textContent = quote ? "Produtos sob orçamento: os valores exibidos são referências e dependem de confirmação." : !knownFee ? "Informe a região ou calcule a entrega para ver o total estimado. O valor final será confirmado ao enviar." : "Estimativa antes do envio. O valor final será confirmado ao registrar o pedido.";
  }
  function updateFulfillmentFields() {
    const delivery = $("fulfillment").value === "delivery", hasZones = (page?.delivery_zones || []).length > 0;
    $("deliveryAddressFields").classList.toggle("hidden", !delivery); $("deliveryZoneLabel").classList.toggle("hidden", !delivery || !hasZones || isDinizMenu);
    $("deliveryCep").required = delivery; $("deliveryAddress").required = delivery; $("deliveryZone").required = delivery && hasZones && !isDinizMenu;
    const pickupLocation = page?.menu.pickup_location;
    const pickup = Boolean(pickupLocation) && $("fulfillment").value === "pickup";
    if ($("pickupConfirmation")) {
      $("pickupConfirmation").classList.toggle("hidden", !pickup);
      $("pickupLocation").textContent = pickup ? pickupLocation : "";
      $("pickupConfirmed").required = pickup;
      if (!pickup) $("pickupConfirmed").checked = false;
    }
    if (!delivery) resetAutomaticDelivery();
    updateCheckoutEstimate();
  }
  function deliveryHelp(message, cep) {
    $("cepMessage").textContent = message;
    const link = $("deliveryHelpLink"), phone = String(page?.menu.whatsapp_phone || "");
    if (!link || !/^\d{10,15}$/.test(phone)) return;
    const question = `Olá! Vocês entregam no CEP ${cep || "que preciso consultar"}?`;
    link.href = `https://wa.me/${phone}?text=${encodeURIComponent(question)}`;
    link.classList.remove("hidden");
  }
  function postcodeAllowed(cep) {
    const ranges = page?.menu.delivery_postcodes || [];
    return !ranges.length || ranges.some(range => cep >= range.slice(0, 8) && cep <= range.slice(9));
  }
  async function lookupCep() {
    const input = $("deliveryCep"), button = $("lookupCepButton"), message = $("cepMessage"), cep = input.value.replace(/\D/g, "");
    if (cep.length !== 8) { message.textContent = "Informe um CEP com 8 dígitos."; input.setAttribute("aria-invalid", "true"); input.focus(); return; }
    if (!postcodeAllowed(cep)) {
      deliveryHelp("Ainda não entregamos neste CEP. Escolha retirada, se disponível.", cep);
      return;
    }
    $("deliveryHelpLink")?.classList.add("hidden");
    input.value = cep.replace(/^(\d{5})(\d{3})$/, "$1-$2"); input.removeAttribute("aria-invalid"); button.disabled = true; message.textContent = "Buscando endereço...";
    try {
      const { data: result, error } = await supabaseClient.functions.invoke("cep-lookup", { body: { cep, target_slug: slug } });
      if (error || !result?.data) { resetAutomaticDelivery(); message.textContent = isDinizMenu ? "Não foi possível calcular a entrega para este CEP. Confira se o endereço fica em Ribeirão Preto e tente novamente." : "Não foi possível consultar este CEP. Confira o número e tente novamente."; return; }
      const address = result.data;
      const city = address.localidade && address.uf ? `${address.localidade} - ${address.uf}` : address.localidade || address.uf, numberPlaceholder = "[informe o número]", parts = [address.logradouro ? `${address.logradouro}, ${numberPlaceholder}` : "", address.bairro, city].filter(Boolean);
      $("deliveryAddress").value = parts.join(", ");
      $("deliveryAddress").focus(); const placeholderStart = $("deliveryAddress").value.indexOf(numberPlaceholder), placeholderEnd = placeholderStart + numberPlaceholder.length; $("deliveryAddress").setSelectionRange(placeholderStart >= 0 ? placeholderStart : $("deliveryAddress").value.length, placeholderStart >= 0 ? placeholderEnd : $("deliveryAddress").value.length); message.textContent = "Endereço localizado. Complete com o número e, se necessário, o complemento.";
    } catch { resetAutomaticDelivery(); message.textContent = isDinizMenu ? "Não foi possível calcular a entrega agora. Tente novamente em instantes." : "Não foi possível consultar o CEP agora. Preencha o endereço manualmente."; }
    finally { button.disabled = false; }
  }
  async function calculateDelivery() {
    const cep = $("deliveryCep").value.replace(/\D/g, ""), address = $("deliveryAddress").value.trim(), button = $("calculateDeliveryButton"), message = $("cepMessage");
    resetAutomaticDelivery();
    if (cep.length !== 8) { message.textContent = "Informe e busque um CEP válido antes de calcular a entrega."; $("deliveryCep").focus(); return; }
    if (address.length < 8 || !/\d/.test(address) || address.includes("[informe o número]")) { message.textContent = "Complete o endereço com o número antes de calcular a entrega."; $("deliveryAddress").focus(); return; }
    button.disabled = true; message.textContent = "Calculando a melhor rota para entrega...";
    try {
      const { data: result, error } = await supabaseClient.functions.invoke("cep-lookup", { body: { cep, target_slug: slug, address } });
      const quote = result?.data?.delivery_quote, option = quote && [...$("deliveryZone").options].find((item) => item.value === quote.zone_code);
      if (error || !quote || !option) { message.textContent = "Não foi possível localizar o endereço com precisão. Clique em Buscar CEP, confira a rua e complete o número antes de tentar novamente."; return; }
      $("deliveryZone").value = quote.zone_code; calculatedDeliveryFee = Number(quote.fee); $("deliveryQuoteValue").textContent = money.format(calculatedDeliveryFee);
      const duration = quote.duration_minutes ? ` · cerca de ${Number(quote.duration_minutes)} min de carro` : "";
      $("deliveryQuoteDetail").textContent = `Rota estimada: ${Number(quote.distance_km).toLocaleString("pt-BR")} km${duration}. A taxa é incluída automaticamente no pedido.`;
      $("deliveryQuote").classList.remove("hidden"); message.textContent = "Entrega calculada. Confira o valor antes de enviar o pedido.";
      updateCheckoutEstimate();
    } catch { message.textContent = "Não foi possível calcular a entrega agora. Tente novamente em instantes."; }
    finally { button.disabled = false; }
  }
  function renderCartReview(total, hasQuote) {
    $("cartItems").innerHTML = [...cart.entries()].map(([signature, entry]) => {
      const selectionLabel = entry.selections.map((selection) => selection.name).filter(Boolean).join(", ");
      const variation = [displayPriceLabel(entry.label), selectionLabel].filter(Boolean).join(" · ");
      const decrementDisabled = entry.quantity <= entry.minimumQuantity ? " disabled" : "";
      return `<article class="cart-item" data-cart-item="${clean(signature)}"><div class="cart-item-copy"><strong>${clean(entry.name)}</strong>${variation ? `<span>${clean(variation)}</span>` : ""}<small>${money.format(estimatedUnitPrice(entry))} por unidade</small></div><div class="cart-item-controls"><div class="cart-quantity" aria-label="Quantidade de ${clean(entry.name)}"><button type="button" data-cart-decrease="${clean(signature)}" aria-label="Diminuir quantidade"${decrementDisabled}>−</button><output aria-live="polite">${entry.quantity}</output><button type="button" data-cart-increase="${clean(signature)}" aria-label="Aumentar quantidade">+</button></div><strong>${money.format(entry.quantity * estimatedUnitPrice(entry))}</strong><button class="cart-remove" type="button" data-cart-remove="${clean(signature)}">Remover</button></div></article>`;
    }).join("");
    const link = $("whatsappSelectionLink");
    if (link) {
      link.classList.toggle("hidden", !whatsappOnly());
      const customer = { name: $("whatsappCustomerName").value.trim(), phone: $("whatsappCustomerPhone").value.trim() };
      const validCustomer = customer.name.length >= 2 && customer.phone.replace(/\D/g, "").length >= 10 && $("whatsappCustomerForm").checkValidity();
      const target = validCustomer ? globalThis.OgritechWhatsAppSelection?.url(page?.menu?.whatsapp_phone, [...cart.values()], estimatedUnitPrice, customer) : null;
      if (target) link.href = target; else link.removeAttribute("href");
      link.setAttribute("aria-disabled", String(!target));
      $("whatsappCustomerForm").classList.toggle("hidden", !whatsappOnly());
      $("whatsappSelectionNotice").classList.toggle("hidden", !whatsappOnly());
      if (whatsappOnly()) $("whatsappSelectionNotice").textContent = validCustomer
        ? "O WhatsApp abrirá com seu nome, telefone e os itens escolhidos para você enviar. Disponibilidade, pagamento e entrega serão combinados com o estabelecimento."
        : "Informe seu nome e telefone com DDD para continuar pelo WhatsApp.";
      if (whatsappOnly() && validCustomer && !target) $("whatsappSelectionNotice").textContent = "O WhatsApp deste estabelecimento está indisponível. Entre em contato para continuar o atendimento.";
      $("proceedCheckoutButton").classList.toggle("hidden", whatsappOnly());
    }
    $("cartReviewTotal").textContent = hasQuote ? `Referência: ${money.format(total)}` : money.format(total);
  }
  function updateCart() { let count = 0, total = 0, hasQuote = false; cart.forEach((entry) => { count += entry.quantity; total += entry.quantity * estimatedUnitPrice(entry); hasQuote ||= entry.isQuote; }); $("cartCount").textContent = count; $("cartTotal").textContent = hasQuote ? `Referência: ${money.format(total)}` : money.format(total); $("checkoutButton").textContent = whatsappOnly() ? "Revisar para WhatsApp" : hasQuote ? "Continuar solicitação" : "Finalizar pedido"; $("checkoutTitle").textContent = hasQuote ? "Enviar solicitação para análise" : "Finalizar pedido"; $("orderSubmitButton").textContent = hasQuote ? "Enviar solicitação" : "Enviar pedido"; $("cartBar").classList.toggle("hidden", !count); renderCartReview(total, hasQuote); if (!count) { $("cartReview").classList.add("hidden"); $("checkout").classList.add("hidden"); } updateBag(); updateSchedulingRequirement(); updateCheckoutEstimate(); }
  function updateBag() {
    const count = $("cartCount").textContent;
    $("menuBagCount").textContent = count;
    $("menuBagCount").classList.toggle("hidden", !cart.size);
    $("menuBagButton").setAttribute("aria-expanded", String(!$("cartReview").classList.contains("hidden")));
    $("menuBagStatus").textContent = "";
  }
  function addConfigured(price, selections = [], quantity = 1) { const signature = `${price.id}:${selections.map((item) => `${item.menu_option_id}x${item.quantity}`).sort().join(",")}`; const entry = cart.get(signature) || { menu_item_price_id: price.id, name: price.item.name, label: price.label, price: price.amount, quantity: 0, minimumQuantity: Math.max(1, Math.ceil(Number(price.item.minimum_quantity) || 1)), maximumQuantity: price.item.maximum_quantity == null ? 100 : Math.floor(Number(price.item.maximum_quantity)), selections, optionGroups: price.item.option_groups || [], isQuote: isQuoteItem(price.item), leadTimeHours: price.item.lead_time_hours }; entry.quantity = Math.min(entry.maximumQuantity, entry.quantity + quantity); cart.set(signature, entry); pendingRequestId = null; updateCart(); }
  function configure(price, quantity = Math.max(1, Math.ceil(Number(price.item.minimum_quantity) || 1))) {
    const groups = price.item.option_groups || []; if (!groups.length) return addConfigured(price, [], quantity);
    $("configuratorTitle").textContent = price.item.name;
    $("configuratorGroups").innerHTML = groups.map((group) => `<fieldset data-min="${group.minimum_selections}" data-max="${group.maximum_selections}"><legend>${clean(group.name)}${Number(group.minimum_selections) ? "" : " (Opcional)"} <small>Escolha de ${group.minimum_selections} a ${group.maximum_selections}${Number(group.free_selections) ? ` · ${group.free_selections} incluídos` : ""}</small></legend>${group.options.map((option) => `<label><input type="${group.selection_type === "single" ? "radio" : "checkbox"}" name="group-${group.id}" value="${option.id}" data-price="${option.price_delta}" data-option-name="${clean(option.name)}"> <span>${clean(option.name)}${Number(option.price_delta) ? ` + ${money.format(option.price_delta)}` : ""}</span>${group.selection_type !== "single" && Number(option.maximum_quantity) > 1 ? `<input aria-label="Quantidade de ${clean(option.name)}" data-option-quantity="${option.id}" type="number" min="1" max="${option.maximum_quantity}" step="1" value="1">` : ""}</label>`).join("")}</fieldset>`).join("");
    $("configurator").dataset.priceId = price.id; $("configurator").dataset.quantity = quantity; $("configuratorMessage").textContent = ""; $("configurator").showModal();
  }
  function assistantMessage(text, kind = "assistant") { const node = document.createElement("p"); node.className = `assistant-message${kind === "user" ? " user" : ""}`; node.textContent = text; $("menuAssistantMessages").append(node); node.scrollIntoView({ block: "nearest" }); }
  function assistantControls(data) {
    if ((data.suggestions || []).length) {
      const list = document.createElement("div"); list.className = "assistant-suggestions";
      data.suggestions.forEach((suggestion) => {
        const row = document.createElement("article"); row.className = "assistant-suggestion";
        const copy = document.createElement("div"); copy.className = "assistant-suggestion-copy";
        const name = document.createElement("strong"); name.className = "assistant-suggestion-name"; name.textContent = suggestion.name;
        const detail = document.createElement("span"); detail.className = "assistant-suggestion-detail"; detail.textContent = displayPriceLabel(suggestion.label);
        const priceLabel = document.createElement("strong"); priceLabel.className = "assistant-suggestion-price"; priceLabel.textContent = money.format(Number(suggestion.price));
        const button = document.createElement("button"); button.className = "public-button assistant-suggestion-action"; button.type = "button"; button.textContent = "Adicionar";
        button.addEventListener("click", () => { const price = prices.get(suggestion.menu_item_price_id); if (!price) return assistantMessage("Este item não está mais disponível. Atualize o cardápio e tente novamente."); configure(price); });
        copy.append(name, detail, priceLabel); row.append(copy, button); list.append(row);
      });
      $("menuAssistantMessages").append(list);
    }
    if (data.action?.type === "open_cart") { const button = document.createElement("button"); button.className = "public-button"; button.type = "button"; button.textContent = data.action.label || "Revisar carrinho"; button.addEventListener("click", () => { if (!cart.size) return assistantMessage("Seu carrinho ainda está vazio. Escolha um produto primeiro."); $("checkout").classList.remove("hidden"); $("checkout").scrollIntoView({ behavior: "smooth" }); }); $("menuAssistantMessages").append(button); }
    $("menuAssistantNotice").textContent = data.notice || "Confira as informações antes de continuar.";
  }
  async function initAssistant() {
    try {
      const { data, error } = await supabaseClient.rpc("public_menu_assistant_status", { target_slug: slug });
      if (!error && data?.available) $("menuAssistant").classList.remove("hidden");
    } catch { /* Optional help must not interrupt the catalog. */ }
  }
  $("menuAssistantToggle").addEventListener("click", () => { const opening = $("menuAssistantPanel").classList.contains("hidden"); $("menuAssistantPanel").classList.toggle("hidden", !opening); document.body.classList.toggle("menu-assistant-open", opening); $("menuAssistantToggle").setAttribute("aria-expanded", String(opening)); $("menuAssistantToggle").setAttribute("aria-label", opening ? "Fechar assistente Ogritech" : "Abrir assistente Ogritech"); if (opening) $("menuAssistantInput").focus(); });
  $("menuAssistantClose").addEventListener("click", () => { $("menuAssistantPanel").classList.add("hidden"); document.body.classList.remove("menu-assistant-open"); $("menuAssistantToggle").setAttribute("aria-expanded", "false"); $("menuAssistantToggle").focus(); });
  $("menuAssistantForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const input = $("menuAssistantInput"), message = input.value.trim(), button = event.submitter; if (!message) return;
    assistantMessage(message, "user"); input.value = ""; button.disabled = true; $("menuAssistantNotice").textContent = "Consultando apenas os dados cadastrados...";
    const normalizedMessage = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/(kg|quilo|peso|pessoas?|serve|rende|rendimento)/.test(normalizedMessage) && /(pessoas?|serve|rende|rendimento)/.test(normalizedMessage)) {
      assistantMessage(servingGuide()); $("menuAssistantNotice").textContent = "Estimativa baseada na tabela do estabelecimento. Confirme o rendimento antes de concluir."; button.disabled = false; input.focus(); return;
    }
    if (/(horario|abre|fecha|funciona|atendimento|domingo)/.test(normalizedMessage)) {
      assistantMessage(formatHours(page?.menu?.weekly_hours) || "O horário ainda não foi informado pelo estabelecimento."); $("menuAssistantNotice").textContent = "Horário informado pelo estabelecimento. A confirmação do pedido continua sendo humana."; button.disabled = false; input.focus(); return;
    }
    try {
      let sessionToken = assistantSessionToken;
      try { sessionToken = sessionStorage.getItem(`ogritechMenuAssistant:${slug}`) || sessionToken; } catch { /* Private browsing can block storage. */ }
      if (!sessionToken) sessionToken = createUuid().replaceAll("-", "");
      assistantSessionToken = sessionToken;
      try { sessionStorage.setItem(`ogritechMenuAssistant:${slug}`, sessionToken); } catch { /* Keep this conversation in memory. */ }
      const { data, error } = await supabaseClient.rpc("public_menu_assistant_message", { target_slug: slug, session_token: sessionToken, supplied_message: message });
      if (error || !data) { input.value = message; assistantMessage(error?.message?.includes("Limite") ? error.message : "Não consegui responder agora. Continue pelo cardápio ou tente novamente."); return; }
      const reply = data.intent === "greeting" && isDinizMenu ? "Posso ajudar a encontrar bolos, doces, recheios, informações de pagamento ou a estimar o rendimento por peso. O que você gostaria de saber?" : data.reply;
      assistantMessage(reply); assistantControls(data);
    } catch {
      input.value = message;
      assistantMessage("Confira sua conexão e tente novamente. Você também pode continuar pelo cardápio.");
    } finally { button.disabled = false; input.focus(); }

  });
  $("configuratorForm").addEventListener("submit", (event) => {
    event.preventDefault(); const selections = [];
    for (const fieldset of $("configuratorGroups").querySelectorAll("fieldset")) {
      const checked = [...fieldset.querySelectorAll('input[type="radio"]:checked,input[type="checkbox"]:checked')];
      let count = 0;
      for (const input of checked) {
        const quantityInput = fieldset.querySelector(`[data-option-quantity="${input.value}"]`);
        if (quantityInput && !quantityInput.reportValidity()) return;
        const quantity = quantityInput ? Number(quantityInput.value) : 1;
        count += quantity;
        selections.push({menu_option_id:input.value,quantity,price_delta:Number(input.dataset.price),name:input.dataset.optionName});
      }
      if (count < Number(fieldset.dataset.min) || count > Number(fieldset.dataset.max)) { $("configuratorMessage").textContent = "Confira a quantidade de escolhas obrigatórias."; return; }
    }
    addConfigured(prices.get($("configurator").dataset.priceId), selections, Number($("configurator").dataset.quantity) || 1); $("configurator").close();
  });
  $("closeConfigurator").addEventListener("click", () => $("configurator").close());
  async function loadMenuData() {
    $("loading").innerHTML = '<p role="status">Carregando cardápio...</p>';
    try {
      const { data, error } = await supabaseClient.rpc("public_menu", { target_slug: slug });
      if (error || !data?.menu) throw new Error("menu_unavailable");
      return data;
    } catch {
      $("loading").innerHTML = '<h1>Não foi possível abrir o cardápio</h1><p>Confira sua conexão e o endereço recebido.</p><button id="retryMenuLoad" type="button" class="public-button">Tentar novamente</button>';
      $("retryMenuLoad").addEventListener("click", init);
      return null;
    }
  }
  async function init() {
    const data = await loadMenuData(); if (!data) return;
    const menuTitle = isDinizMenu ? data.menu.title.replace(/\s*[—-]\s*piloto privado\s*$/i, "").trim() : data.menu.title;
    data.categories = (data.categories || []).filter(category => (category.items || []).length > 0);
    page = data; document.body.classList.toggle("menu-whatsapp-only", whatsappOnly()); applyVisualIdentity(data.menu.visual_identity); document.title = `${menuTitle} | Ogritech`; $("menuTitle").textContent = menuTitle; $("menuDescription").textContent = data.menu.description; $("menuDescription").classList.toggle("hidden", !data.menu.description?.trim());
    const logoUrl = globalThis.OgritechMenuBranding?.assetUrl(data.menu.visual_identity?.logo_path, window.OGRITECH_SUPABASE_URL);
    $("menuBrandLockup").classList.toggle("hidden", !logoUrl && !(isDinizMenu && data.menu.visual_identity?.customized !== true));
    if (logoUrl) { $("menuBrandLogo").src=logoUrl; $("menuBrandLogo").alt=menuTitle; }
    if (isDinizMenu && !logoUrl && data.menu.visual_identity?.customized !== true) { $("menuBrandLogo").src = "../assets/diniz-doces/logo.jpg"; $("menuBrandLogo").alt = "Diniz Doces"; $("menuBrandLockup").classList.remove("hidden"); }
    if (isDinizMenu) { $("calculateDeliveryButton").classList.remove("hidden"); $("deliveryProviderNotice").classList.remove("hidden"); }
    const paymentNames = {pix:"Pix",cash:"Dinheiro",credit_card:"Cartão de crédito",debit_card:"Cartão de débito"}, hours = data.menu.weekly_hours;
    $("menuPayments").textContent = `Pagamento combinado com o estabelecimento: ${(data.menu.payment_methods || []).map((code) => paymentNames[code] || code).join(", ")}.`;
    $("menuHours").textContent = formatHours(hours);
    $("fulfillment").innerHTML = (data.menu.accepts_pickup ? '<option value="pickup">Retirada</option>' : "") + (data.menu.accepts_delivery ? '<option value="delivery">Entrega</option>' : "");
    const zones = data.delivery_zones || []; $("deliveryZone").innerHTML = '<option value="">Selecione sua região</option>' + zones.map((zone) => `<option value="${zone.code}">${deliveryZoneLabel(zone)}</option>`).join(""); updateFulfillmentFields();
    $("categoryNav").innerHTML = data.categories.map((category, index) => `<a href="#${categoryId(index)}">${clean(category.name)}</a>`).join("");
    $("catalog").innerHTML = data.categories.map((category, categoryIndex) => `<section id="${categoryId(categoryIndex)}" class="catalog-section"><header class="catalog-section-heading"><h2>${clean(category.name)}</h2>${category.description ? `<p>${clean(category.description)}</p>` : ""}</header><div class="catalog-items">${category.items.map((item) => {
      const records = item.prices.map((record) => { const amount = Number(record.promotional_price ?? record.price); prices.set(record.id, { ...record, amount, item }); return { ...record, amount }; });
      const quote = isQuoteItem(item), first = records[0], minimumQuantity = Math.max(1, Math.ceil(Number(item.minimum_quantity) || 1)), maximumQuantity = item.maximum_quantity == null ? "" : Math.floor(Number(item.maximum_quantity)), customQuantity = minimumQuantity > 1;
      const quantityPicker = customQuantity ? `<label class="menu-quantity-picker"><span>Quantidade (mínimo ${minimumQuantity})</span><input type="number" inputmode="numeric" min="${minimumQuantity}"${maximumQuantity ? ` max="${maximumQuantity}"` : ""} step="1" value="${minimumQuantity}" data-quantity-select="${item.id}"></label>` : "";
      const initialPrice = first ? clean(formatItemPrice(first, item, minimumQuantity, customQuantity)) : "Indisponível";
      const singleLabel = records.length === 1 ? displayPriceLabel(first.label) : "";
      const priceOptions = records.length === 1
        ? `<input type="hidden" data-price-select="${item.id}" value="${first.id}">${singleLabel && normalizeSearch(singleLabel) !== "padrao" ? `<p class="menu-single-option">${clean(singleLabel)}</p>` : ""}`
        : `<label class="menu-price-picker"><span>${weightPickerLabel(records, quote)}</span><select data-price-select="${item.id}">${records.map((record) => `<option value="${record.id}">${clean(displayPriceLabel(record.label))}</option>`).join("")}</select></label>`;
      const pricePicker = records.length ? `<div class="menu-item-purchase">${priceOptions}${quantityPicker}<div class="menu-price-action"><strong data-selected-price="${item.id}">${initialPrice}</strong><button type="button" class="public-button" data-add-selected="${item.id}">${quote ? "Solicitar análise" : ((item.option_groups || []).length ? "Personalizar" : "Adicionar")}</button></div></div>` : `<p class="menu-quote-notice">Preço e disponibilidade são confirmados após análise dos detalhes.</p>`;
      const illustration = dinizIllustration(category, item), media = item.image_url
        ? `<div class="menu-item-media"><img class="menu-item-image" loading="lazy" decoding="async" src="${clean(item.image_url)}" alt=""></div>`
        : illustration
          ? `<div class="menu-item-media"><img class="menu-item-image" loading="lazy" decoding="async" src="${illustration.src}" alt="${illustration.alt}"><span class="menu-image-note">Imagem ilustrativa</span></div>`
          : `<div class="menu-item-placeholder" aria-hidden="true"><small>${item.item_type === "preorder" || Number(item.lead_time_hours) > 0 ? "Feito por encomenda" : "Confira as opções"}</small></div>`;
      return `<article class="menu-item-card${records.length > 1 || customQuantity ? " menu-item-card-with-pickers" : ""}" data-item="${item.id}">${media}<div class="menu-item-content"><div class="menu-item-heading"><h3>${clean(item.name)}</h3>${quote ? '<span class="menu-item-badge">Sob consulta</span>' : ((item.option_groups || []).length ? '<span class="menu-item-badge">Personalizável</span>' : "")}</div>${item.description ? `<p>${clean(item.description)}</p>` : ""}${pricePicker}</div></article>`;
    }).join("")}</div></section>`).join("");
    const filterCatalog = () => {
      const query = normalizeSearch($("menuSearch").value);
      let matches = 0;
      data.categories.forEach((category, index) => {
        const section = $(categoryId(index)), categoryMatch = normalizeSearch(category.name).includes(query);
        let categoryCount = 0;
        section.querySelectorAll(".menu-item-card").forEach((card, itemIndex) => {
          const item = category.items[itemIndex];
          const found = !query || categoryMatch || normalizeSearch(`${item.name} ${item.description || ""}`).includes(query);
          card.classList.toggle("hidden", !found);
          if (found) categoryCount++;
        });
        section.classList.toggle("hidden", !categoryCount);
        $("categoryNav").children[index]?.classList.toggle("hidden", !categoryCount);
        matches += categoryCount;
      });
      $("menuSearchResult").textContent = query ? matches ? `${matches} ${matches === 1 ? "produto encontrado" : "produtos encontrados"}.` : "Nenhum produto encontrado. Tente outro nome." : "";
    };
    $("menuSearch").addEventListener("input", filterCatalog);
    const refreshSelectedPrice = (itemId) => { const select = $("catalog").querySelector(`[data-price-select="${itemId}"]`), quantityInput = $("catalog").querySelector(`[data-quantity-select="${itemId}"]`), price = prices.get(select.value), output = $("catalog").querySelector(`[data-selected-price="${itemId}"]`), quantity = quantityInput ? Number(quantityInput.value) : 1; output.textContent = formatItemPrice(price, price.item, quantity, Boolean(quantityInput)); };
    $("catalog").querySelectorAll("[data-price-select]").forEach((select) => select.addEventListener("change", () => refreshSelectedPrice(select.dataset.priceSelect)));
    $("catalog").querySelectorAll("[data-quantity-select]").forEach((input) => input.addEventListener("input", () => { if (!input.validity.valid) return; refreshSelectedPrice(input.dataset.quantitySelect); }));
    $("catalog").querySelectorAll("[data-add-selected]").forEach((button) => button.addEventListener("click", () => { const itemId = button.dataset.addSelected, select = $("catalog").querySelector(`[data-price-select="${itemId}"]`), quantityInput = $("catalog").querySelector(`[data-quantity-select="${itemId}"]`); if (quantityInput && !quantityInput.reportValidity()) return; configure(prices.get(select.value), quantityInput ? Number(quantityInput.value) : 1); })); $("loading").classList.add("hidden"); $("content").classList.remove("hidden"); if (!whatsappOnly()) initAssistant();
    if (whatsappOnly()) { $("menuPayments").textContent = "Pagamento e entrega combinados pelo WhatsApp."; $("checkout").classList.add("hidden"); }
  }
  const enterCheckoutMode = () => { document.body.classList.add("menu-checkout-active"); $("menuAssistantPanel").classList.add("hidden"); document.body.classList.remove("menu-assistant-open"); };
  const leaveCheckoutMode = () => { if ($("checkout").classList.contains("hidden")) document.body.classList.remove("menu-checkout-active"); };
  const openCartReview = () => { if (!cart.size) return; enterCheckoutMode(); $("cartReview").classList.remove("hidden"); updateBag(); $("cartReview").scrollIntoView({ behavior: "smooth", block: "start" }); };
  const openCheckout = () => { if (!cart.size) return; if (whatsappOnly()) return openCartReview(); enterCheckoutMode(); $("cartReview").classList.remove("hidden"); $("checkout").classList.remove("hidden"); updateBag(); $("checkout").scrollIntoView({ behavior: "smooth", block: "start" }); };
  $("menuBagButton").addEventListener("click", () => {
    if (!cart.size) { $("menuBagStatus").textContent = "Sua sacola está vazia."; return; }
    openCartReview();
    $("closeCartReview").focus({ preventScroll: true });
  });
  $("cartReviewButton").addEventListener("click", openCartReview);
  $("checkoutButton").addEventListener("click", openCheckout);
  $("proceedCheckoutButton").addEventListener("click", openCheckout);
  $("continueShoppingButton").addEventListener("click", () => { $("cartReview").classList.add("hidden"); $("checkout").classList.add("hidden"); updateBag(); leaveCheckoutMode(); $("catalog").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("closeCartReview").addEventListener("click", () => { $("cartReview").classList.add("hidden"); updateBag(); leaveCheckoutMode(); $("cartReviewButton").focus(); });
  $("cartItems").addEventListener("click", (event) => {
    const action = event.target.closest("[data-cart-increase],[data-cart-decrease],[data-cart-remove]"); if (!action) return;
    const signature = action.dataset.cartIncrease || action.dataset.cartDecrease || action.dataset.cartRemove, entry = cart.get(signature); if (!entry) return;
    if (action.dataset.cartRemove) cart.delete(signature);
    else if (action.dataset.cartIncrease && entry.quantity < entry.maximumQuantity) entry.quantity = Math.min(entry.maximumQuantity, entry.quantity + 1);
    else if (action.dataset.cartDecrease && entry.quantity > entry.minimumQuantity) entry.quantity -= 1;
    pendingRequestId = null;
    updateCart();
    if (!cart.size) {
      leaveCheckoutMode();
      $("menuBagButton").focus();
    }
  });
  const refreshWhatsappCustomer = () => renderCartReview([...cart.values()].reduce((sum, entry) => sum + entry.quantity * estimatedUnitPrice(entry), 0), [...cart.values()].some(entry => entry.isQuote));
  $("whatsappCustomerForm").addEventListener("input", refreshWhatsappCustomer);
  $("whatsappCustomerForm").addEventListener("submit", event => { event.preventDefault(); $("whatsappSelectionLink").click(); });
  $("whatsappSelectionLink").addEventListener("click", event => {
    if (!$("whatsappCustomerForm").reportValidity() || !$("whatsappSelectionLink").hasAttribute("href")) {
      event.preventDefault();
      $("whatsappSelectionNotice").textContent = "Informe seu nome e telefone com DDD para continuar pelo WhatsApp.";
    }
  });
  $("fulfillment").addEventListener("change", updateFulfillmentFields);
  $("deliveryZone").addEventListener("change", updateCheckoutEstimate);
  $("lookupCepButton").addEventListener("click", lookupCep);
  $("calculateDeliveryButton").addEventListener("click", calculateDelivery);
  $("deliveryCep").addEventListener("input", (event) => { const digits = event.target.value.replace(/\D/g, "").slice(0, 8); event.target.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits; $("cepMessage").textContent = ""; resetAutomaticDelivery(); });
  $("deliveryAddress").addEventListener("input", () => { $("cepMessage").textContent = ""; resetAutomaticDelivery(); });
  $("deliveryCep").addEventListener("blur", () => { if ($("fulfillment").value === "delivery" && $("deliveryCep").value.replace(/\D/g, "").length === 8 && !$("deliveryAddress").value.trim()) lookupCep(); });
  $("orderSubmitButton").addEventListener("click", () => {
    const form = $("orderForm"), invalid = form.querySelector(":invalid");
    if (!invalid) return;
    $("orderMessage").textContent = invalid.name === "privacy" ? "Aceite o aviso de privacidade para enviar o pedido." : invalid.name === "scheduled_for" ? `Escolha uma data e um horário com pelo menos ${requiredLeadTime()} horas de antecedência.` : `Revise o campo ${invalid.closest("label")?.firstChild?.textContent?.trim().toLowerCase() || "obrigatório"} para continuar.`;
    invalid.setAttribute("aria-invalid", "true");
    invalid.focus(); invalid.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("orderForm").addEventListener("input", (event) => { event.target.removeAttribute("aria-invalid"); });
  $("orderForm").addEventListener("submit", async (event) => {
    event.preventDefault(); if (!cart.size) return; if (whatsappOnly()) { openCartReview(); return; } const form = new FormData(event.target), fulfillment = form.get("fulfillment");
    if (isDinizMenu && fulfillment === "delivery" && !form.get("delivery_zone")) { $("orderMessage").textContent = "Complete o endereço e clique em Calcular entrega antes de enviar o pedido."; $("calculateDeliveryButton").focus(); $("calculateDeliveryButton").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const leadTime = requiredLeadTime(), scheduledValue = form.get("scheduled_for"), scheduledDate = scheduledValue ? new Date(scheduledValue) : null;
    if (leadTime > 0 && (!scheduledDate || Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() < Date.now() + leadTime * 60 * 60000)) { $("orderMessage").textContent = `Escolha uma data e um horário com pelo menos ${leadTime} horas de antecedência.`; $("scheduledFor").setAttribute("aria-invalid", "true"); $("scheduledFor").focus(); return; }
    const hasQuote = [...cart.values()].some((entry) => entry.isQuote); const suppliedNotes = `${hasQuote ? "SOLICITAÇÃO DE ORÇAMENTO — valor exibido é apenas referência e depende de confirmação humana. " : ""}${form.get("notes") || ""}`.trim();
    const commonOrder = { target_slug: slug, supplied_name: form.get("name"), supplied_email: "", supplied_phone: form.get("phone"), target_fulfillment_type: fulfillment, supplied_address: fulfillment === "delivery" ? { text: form.get("address"), cep: String(form.get("delivery_cep") || "").replace(/\D/g, ""), zone_code: form.get("delivery_zone") || null } : null, supplied_notes: suppliedNotes, supplied_items: [...cart.values()].map(({ menu_item_price_id, quantity, selections }) => ({ menu_item_price_id, quantity, selections: selections.map(({ menu_option_id, quantity }) => ({ menu_option_id, quantity })) })), accepted_privacy: form.get("privacy") === "on", website: form.get("website") };
    if ($("orderSubmitButton").disabled) return;
    pendingRequestId ||= createUuid(); $("orderMessage").textContent = "Enviando pedido..."; $("orderSubmitButton").disabled = true;
    let data, error;
    try {
      if (fulfillment === "delivery" && page.menu.delivery_postcodes?.length) {
        const cep = commonOrder.supplied_address.cep;
        const failDelivery = (message) => {
          $("orderSubmitButton").disabled = false;
          $("orderMessage").textContent = message;
          deliveryHelp(message, cep);
          $("deliveryCep").focus();
        };
        if (!/^\d{8}$/.test(cep) || !postcodeAllowed(cep)) {
          failDelivery("Ainda não entregamos neste CEP. Escolha retirada, se disponível.");
          return;
        }
        const lookup = await supabaseClient.functions.invoke("cep-lookup", { body: { cep, target_slug: slug } }).catch(() => null);
        const verified = lookup?.data?.data;
        if (lookup?.error || !verified?.localidade || !verified?.uf) {
          failDelivery("Não foi possível confirmar este CEP. Confira o endereço ou consulte a loja.");
          return;
        }
        const location = [verified.bairro, verified.localidade, verified.uf].filter(Boolean).join(" - ");
        commonOrder.supplied_address.text = commonOrder.supplied_address.text.trim().slice(0, 750) + ` | Localidade do CEP: ${location}`;
      }
      ({ data, error } = await supabaseClient.rpc("public_create_menu_order_v2", { ...commonOrder, client_request_id: pendingRequestId, requested_for: form.get("scheduled_for") ? new Date(form.get("scheduled_for")).toISOString() : null }));
      if (error?.code === "PGRST202" && !commonOrder.supplied_items.some((item) => item.selections.length)) ({ data, error } = await supabaseClient.rpc("public_create_menu_order", { ...commonOrder, supplied_items: commonOrder.supplied_items.map(({ menu_item_price_id, quantity }) => ({ menu_item_price_id, quantity })) }));
    } catch { error = {message:"Confira sua conexão e tente novamente. Seus itens foram preservados."}; }
    if (error) { $("orderSubmitButton").disabled = false; $("orderMessage").textContent = error.message === "Item indisponível ou fora dos limites" ? `Confira a data do pedido. Os itens escolhidos exigem pelo menos ${leadTime || 48} horas de antecedência.` : `Não foi possível enviar o pedido: ${error.message}`; $("orderMessage").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    pendingRequestId = null;
    const publicCode = String(data.reference || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8), formattedCode = Number.isSafeInteger(Number(data.order_number)) && Number(data.order_number) > 0 ? `#${data.order_number}` : publicCode.length > 4 ? `${publicCode.slice(0, 4)}-${publicCode.slice(4)}` : publicCode;
    const trackingUrl = ogritechEnvironmentUrl(`/pedido/?referencia=${encodeURIComponent(data.reference)}&token=${encodeURIComponent(data.token)}&empresa=${encodeURIComponent(slug)}`);
    const whatsappPhone = String(page.menu.whatsapp_phone || "");
    const whatsappText = whatsappPhone ? globalThis.OgritechMenuWhatsapp.format({
      code: formattedCode, businessName: $("menuTitle").textContent, customerName: form.get("name"), customerPhone: form.get("phone"),
      items: [...cart.values()].map((entry) => ({ name: entry.name, label: displayPriceLabel(entry.label), quantity: entry.quantity, selections: entry.selections.map((selection) => selection.name), lineTotal: entry.quantity * estimatedUnitPrice(entry) })),
      subtotal: data.subtotal, deliveryFee: data.delivery_fee, total: data.total_amount,
      fulfillment, address: fulfillment === "delivery" ? form.get("address") : "",
      scheduledFor: data.scheduled_for, notes: form.get("notes"), quote: hasQuote
    }) : "";
    const whatsappUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappText)}` : "";
    const pixKey = hasQuote ? "" : page.menu.pix_key;
    const pixCode = pixKey ? buildOrderPix(pixKey, page.menu.pix_amount_city, page.menu.title, Number(data.total_amount), formattedCode) : "";
    const pixLabel = pixCode ? "Pix Copia e Cola" : "Chave Pix";
    const pixPayment = pixKey ? `<aside class="order-payment-alert order-pix-payment" aria-labelledby="orderPixTitle">
      <h3 id="orderPixTitle">Pagar por Pix</h3>
      <p>Valor do pedido: <b>${clean(money.format(Number(data.total_amount)))}</b></p>
      <label>${pixLabel}<textarea readonly rows="3" spellcheck="false">${clean(pixCode || pixKey)}</textarea></label>
      <button type="button" class="public-button secondary" id="copyOrderPixKey">Copiar ${pixCode ? "Pix com valor" : "chave Pix"}</button>
      <p role="status" id="copyOrderPixStatus"></p>
      <p class="order-payment-help">Confira o destinatário no seu banco. A loja confirma o pagamento após receber o Pix.</p>
    </aside>` : "";
    cart.clear(); updateCart();
    $("orderSuccess").innerHTML = `<div class="order-success-heading">
      <span class="order-success-mark" aria-hidden="true">✓</span><div><small>PEDIDO REGISTRADO</small><h2>Recebemos sua solicitação</h2></div>
    </div>
    <div class="order-success-summary">
      <div class="order-summary-box order-code-box"><span>Código do pedido</span><strong>${clean(formattedCode)}</strong></div>
      <div class="order-summary-box order-total-box"><span>${hasQuote ? "Valor de referência" : "Total do pedido"}</span><strong>${clean(money.format(Number(data.total_amount)))}</strong></div>
    </div>
    <aside class="order-payment-alert" aria-labelledby="orderPaymentStatus"><strong id="orderPaymentStatus">Pagamento ainda pendente</strong>
      <p>${whatsappUrl ? "Envie o resumo pelo WhatsApp para confirmar os detalhes e combinar o pagamento." : "Acompanhe a confirmação pelo link abaixo. A loja poderá entrar em contato pelo telefone informado para combinar o pagamento."} O envio do pedido não realiza cobrança automática.</p>
    </aside>
    <div class="order-success-actions">
      ${whatsappUrl ? `<a class="public-button order-whatsapp-action" href="${clean(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Enviar resumo pelo WhatsApp</a>` : ""}
      <a class="public-button secondary" href="${clean(trackingUrl)}">Acompanhar pedido no site</a>
    </div>
    ${whatsappUrl ? '<p class="order-success-note">O WhatsApp será aberto somente se você escolher essa opção, em uma nova aba.</p>' : ""}`;
    $("orderSuccess").insertAdjacentHTML("beforeend", pixPayment);
    $("copyOrderPixKey")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pixCode || pixKey);
        $("copyOrderPixStatus").textContent = pixCode ? "Código Pix copiado." : "Chave Pix copiada.";
      } catch {
        $("copyOrderPixStatus").textContent = "Selecione e copie o conteúdo exibido acima.";
      }
    });
    $("orderSuccess").classList.remove("hidden"); $("orderSuccess").scrollIntoView({ behavior: "smooth", block: "center" }); event.target.reset();
  });
  init();
})();
