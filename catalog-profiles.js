(() => {
  // Stable identifiers for new selections; legacy text is never rewritten on load.
  const segments = Object.freeze([
    ["food", "Alimentos e bebidas", "food", "restaurant", ["Outro negócio de alimentação", "Alimentação"]],
    ["pizzeria", "Pizzaria", "food", "pizzeria", []],
    ["snack-bar", "Hamburgueria e lanchonete", "food", "snack-bar", ["Lanchonete", "Hamburgueria"]],
    ["restaurant", "Restaurante e marmitaria", "food", "restaurant", ["Restaurante", "Marmitaria"]],
    ["confectionery", "Confeitaria, bolos e doces", "food", "confectionery", ["Confeitaria"]],
    ["crafts", "Artesanato e trabalhos manuais", "crafts", "crafts", ["Artesanato e personalizados", "Artesanato"]],
    ["personalized", "Personalizados e lembrancinhas", "crafts", "crafts", []],
    ["collectibles", "Colecionáveis e hobbies", "products", "products", []],
    ["fashion", "Moda, calçados e acessórios", "products", "products", []],
    ["jewelry", "Bijuterias e semijoias", "products", "products", []],
    ["beauty", "Beleza e cuidados pessoais", "products", "products", []],
    ["home-gifts", "Casa, decoração e presentes", "products", "products", []],
    ["stationery", "Papelaria e artigos para festas", "products", "products", []],
    ["books-records", "Livros, revistas e discos", "products", "products", []],
    ["secondhand", "Brechó e produtos usados", "products", "products", []],
    ["pet-accessories", "Acessórios para pets", "products", "products", []],
    ["plants", "Plantas, flores e jardinagem", "products", "products", []],
    ["utilities-tech", "Utilidades e acessórios de tecnologia", "products", "products", []],
    ["products", "Outros produtos", "products", "products", ["Produtos em geral", "Outro"]]
  ].map(([code, label, profile, template, aliases]) => Object.freeze({code, label, profile, template, aliases: Object.freeze(aliases)})));
  const normalize = value => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const lookup = new Map();
  for (const entry of segments) for (const value of [entry.code, entry.label, ...entry.aliases]) lookup.set(normalize(value), entry);
  const segment = value => lookup.get(normalize(value?.segment_code || value?.segment || value)) || null;
  const label = value => segment(value)?.label || String(value || "Não informado");
  const profiles = Object.freeze({
    food: Object.freeze({code: "food", label: "Alimentação", noun: "cardápio", title: "Cardápio", template: "restaurant", categoryExample: "Ex.: Pratos e bebidas", optionsExample: "Ex.: tamanho, sabor e adicionais"}),
    crafts: Object.freeze({code: "crafts", label: "Artesanato e personalizados", noun: "catálogo", title: "Catálogo", template: "crafts", categoryExample: "Ex.: Peças, presentes e lembranças", optionsExample: "Ex.: material, acabamento e tamanho"}),
    products: Object.freeze({code: "products", label: "Produtos", noun: "vitrine", title: "Vitrine", template: "products", categoryExample: "Ex.: Colecionáveis, acessórios e decoração", optionsExample: "Ex.: modelo, cor e tamanho"})
  });
  const foodTemplates = new Set(["pizzeria", "snack-bar", "restaurant", "confectionery"]);
  function resolve(value = {}) {
    if (typeof value === "string") value = {segment: value};
    if (profiles[value.profile_code]) return profiles[value.profile_code];
    if (profiles[value.template_code]) return profiles[value.template_code];
    if (foodTemplates.has(value.template_code)) return profiles.food;
    const known=segment(value);
    if(known)return profiles[known.profile];
    // Compatibility only for free-text registrations made before the stable taxonomy.
    const legacy=normalize(value.segment);
    if(/artesan|personaliz/.test(legacy))return profiles.crafts;
    if(/pizza|hamburg|lanche|restaurante|marmita|confeita|bolo|doce|alimenta/.test(legacy))return profiles.food;
    return profiles.products;
  }
  function fillSelect(select, current = "", {placeholder = false, preserveLegacy = true} = {}) {
    if (!select) return;
    select.replaceChildren();
    const option = (value, text) => { const node = document.createElement("option"); node.value = value; node.textContent = text; select.append(node); };
    if (placeholder) option("", "Selecione");
    for (const entry of segments) option(entry.code, entry.label);
    if (current && !segments.some(entry => entry.code === current) && preserveLegacy) option(current, label(current));
    select.value = current || "";
  }
  const originals = new WeakMap(), attributes = new WeakMap(), roots = new WeakMap();
  const excluded = 'script,style,textarea,input,option,[data-catalog-user-content],#catalog,#cartItems,#categoryNav,#configuratorTitle,#configuratorGroups,#configuratorMessage,.assistant-suggestion-name,#catalogHistory,#menuCatalogList,#menuOrdersList,#menuTitle,#menuDescription,#menuWorkspaceTitle,#tenantName,#businessPanelEyebrow,#menuBrandingPreviewTitle,#menuReviewSummary dd,#menuSavedSettingsSummary dd,#menuItemPrices,#menuItemOptionGroups,.sidebar-business-name';
  const offerName = (offer, profile) => profile.code === "food" && ["catalogo-essencial", "catalogo-completo"].includes(offer.planCode)
    ? offer.name.replace("Catálogo", "Cardápio") : offer.name;
  function textFor(text, profile) {
    if (profile.code === "food") return text.replace(/Catálogo (Essencial|Completo)/g, "Cardápio $1");
    const noun = profile.noun, title = profile.title;
    let result = text.replace(/CARDÁPIO/g, title.toUpperCase()).replace(/Cardápio/g, title).replace(/cardápio/g, noun).replace(/tempo de preparo/gi, "prazo de produção");
    if (profile.code === "products") {
      result = result.replace(/\b(seu|Seu) vitrine/g, (_, word) => word === "Seu" ? "Sua vitrine" : "sua vitrine")
        .replace(/\b(meu|Meu) vitrine/g, (_, word) => word === "Meu" ? "Minha vitrine" : "minha vitrine")
        .replace(/\b(do|Do) vitrine/g, (_, word) => word === "Do" ? "Da vitrine" : "da vitrine")
        .replace(/\b(no|No) vitrine/g, (_, word) => word === "No" ? "Na vitrine" : "na vitrine")
        .replace(/\b(um|Um) vitrine/g, (_, word) => word === "Um" ? "Uma vitrine" : "uma vitrine")
        .replace(/\b(o|O) vitrine/g, (_, word) => word === "O" ? "A vitrine" : "a vitrine")
        .replace(/vitrine publicado/g, "vitrine publicada").replace(/vitrine público/g, "vitrine pública");
    }
    return result;
  }
  function render(root, profile) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest(excluded)) continue;
      const previous = originals.get(node), source = previous?.result === node.nodeValue ? previous.source : node.nodeValue;
      const result = textFor(source, profile);
      originals.set(node, {source, result});
      if (node.nodeValue !== result) node.nodeValue = result;
    }
    for (const element of root.querySelectorAll('[aria-label],[placeholder],[title]')) {
      if (element.closest(excluded.replace('input,',''))) continue;
      const saved = attributes.get(element) || {};
      for (const name of ['aria-label','placeholder','title']) {
        if (!element.hasAttribute(name)) continue;
        const value = element.getAttribute(name), previous = saved[name], source = previous?.result === value ? previous.source : value;
        const result = textFor(source, profile); saved[name] = {source, result};
        if (result !== value) element.setAttribute(name, result);
      }
      attributes.set(element, saved);
    }
    const eyebrow=document.getElementById('businessPanelEyebrow');
    if(eyebrow && typeof businessConfig!=='undefined') {
      const next=`${businessConfig.name.toUpperCase()} • PAINEL ${profile.code==='products'?'DA SUA':'DO SEU'} ${profile.title.toUpperCase()}`;
      if(eyebrow.textContent!==next)eyebrow.textContent=next;
    }
    const category = document.getElementById("menuCategoryName");
    if (category && category.placeholder !== profile.categoryExample) category.placeholder = profile.categoryExample;
  }
  function apply(root, profile) {
    if (!root || typeof document === "undefined") return;
    root.dataset.catalogProfile = profile.code;
    let state = roots.get(root);
    if (!state) {
      state = {profile}; roots.set(root, state);
      if (typeof MutationObserver !== "undefined") {
        state.observer = new MutationObserver(() => render(root, state.profile));
        state.observer.observe(root, {childList: true, characterData: true, subtree: true});
      }
    }
    state.profile = profile; render(root, profile);
  }
  // Presentation never determines permissions, subscription entitlements or checkout mode.
  globalThis.OgritechCatalogProfiles = Object.freeze({segments, segment, label, profiles, resolve, fillSelect, apply, offerName, textFor});
})();
