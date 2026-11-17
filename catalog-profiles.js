(() => {
  const profiles = Object.freeze({
    food: Object.freeze({ code: "food", label: "Alimentação", noun: "cardápio", title: "Cardápio", template: "restaurant", categoryExample: "Ex.: Pratos, bebidas", optionsExample: "Ex.: tamanho, sabor e adicionais" }),
    crafts: Object.freeze({ code: "crafts", label: "Artesanato e personalizados", noun: "catálogo", title: "Catálogo", template: "crafts", categoryExample: "Ex.: Peças, presentes e lembranças", optionsExample: "Ex.: material, acabamento e tamanho" }),
    products: Object.freeze({ code: "products", label: "Produtos em geral", noun: "catálogo", title: "Catálogo", template: "products", categoryExample: "Ex.: Acessórios e decoração", optionsExample: "Ex.: modelo, cor e tamanho" })
  });
  const foodTemplates = new Set(["pizzeria", "snack-bar", "restaurant", "confectionery"]);
  const resolve = (value = {}) => {
    if (typeof value === "string") value = { segment: value };
    if (profiles[value.profile_code]) return profiles[value.profile_code];
    if (profiles[value.template_code]) return profiles[value.template_code];
    if (foodTemplates.has(value.template_code)) return profiles.food;
    const segment = String(value.segment || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/artesan|personaliz/.test(segment)) return profiles.crafts;
    if (/pizza|hamburg|lanche|restaurante|marmita|confeita|bolo|doce|alimenta/.test(segment)) return profiles.food;
    return profiles.products;
  };
  const originalText = new WeakMap();
  const offerName = (offer, profile) => profile.code === "food" && ["catalogo-essencial", "catalogo-completo"].includes(offer.planCode)
    ? offer.name.replace("Catálogo", "Cardápio") : offer.name;
  function apply(root, profile) {
    if (!root || typeof document === "undefined") return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest('script,style,textarea,input,#catalog,#menuCatalogList,#menuOrdersList,#menuTitle,#menuDescription,#menuWorkspaceTitle,#menuItemPrices,#menuItemOptionGroups')) continue;
      if (!originalText.has(node)) originalText.set(node,node.nodeValue);
      const text=originalText.get(node);
      node.nodeValue=profile.code === "food" ? text.replace(/Catálogo (Essencial|Completo)/g,"Cardápio $1") : text.replace(/CARDÁPIO/g,"CATÁLOGO").replace(/Cardápio/g,"Catálogo").replace(/cardápio/g,"catálogo").replace(/tempo de preparo/gi,"prazo de produção");
    }
    const category=document.getElementById("menuCategoryName"); if(category) category.placeholder=profile.categoryExample;
    root.dataset.catalogProfile=profile.code;
  }
  // Presentation only: segment and profile must never decide subscription entitlements.
  globalThis.OgritechCatalogProfiles = Object.freeze({ profiles, resolve, apply, offerName });
})();
