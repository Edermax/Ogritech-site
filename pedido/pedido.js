(() => {
  const params = new URLSearchParams(location.search);
  const reference = params.get("referencia"), token = params.get("token"), root = document.getElementById("order");
  const menuSlug = params.get("empresa") || "";
  const whatsappByMenu = { "diniz-doces-previa-7d1": "5516991596865" };
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const statusNames = { received: "Recebido", confirmed: "Confirmado", preparing: "Em preparo", ready: "Pronto para retirada", out_for_delivery: "Saiu para entrega", completed: "Concluído", cancelled: "Cancelado" };
  const fulfillmentNames = { pickup: "Retirada", delivery: "Entrega" };
  const clean = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const publicCode = (value) => { const compact = String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8); return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact; };
  async function load() {
    const { data, error } = await supabaseClient.rpc("public_get_menu_order", { target_reference: reference, target_token: token });
    if (error || !data) { root.innerHTML = '<section class="public-hero"><h1>Pedido indisponível</h1><p>Confira o link recebido.</p></section>'; return; }
    const code = publicCode(data.reference), whatsapp = whatsappByMenu[menuSlug];
    const whatsappLink = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Gostaria de falar sobre o pedido ${code}.`)}` : "";
    root.innerHTML = `<section class="public-hero"><small>CÓDIGO DO PEDIDO ${clean(code)}</small><h1>${clean(statusNames[data.status] || "Status em atualização")}</h1><p>${clean(data.customer_name)} · ${clean(fulfillmentNames[data.fulfillment_type] || "Forma de recebimento não informada")}</p></section><article class="public-card">${data.items.map((item) => `<div class="menu-price-row"><span>${item.quantity}x ${clean(item.name)} ${clean(item.label)}</span><strong>${money.format(item.line_total)}</strong></div>`).join("")}<hr><div class="menu-price-row"><strong>Total</strong><strong class="proposal-total">${money.format(data.total_amount)}</strong></div></article>${whatsappLink ? `<p class="order-contact"><a class="public-button order-whatsapp" href="${clean(whatsappLink)}" target="_blank" rel="noopener noreferrer">Falar com o estabelecimento por WhatsApp</a></p>` : ""}`;
  }
  load();
})();
