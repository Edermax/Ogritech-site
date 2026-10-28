(() => {
  const params = new URLSearchParams(location.search);
  const reference = params.get("referencia"), token = params.get("token"), root = document.getElementById("order");
  const menuSlug = params.get("empresa") || "";
  const whatsappByMenu = { "diniz-doces-previa-7d1": "5516991596865" };
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const statusNames = { received: "Recebido", confirmed: "Confirmado", preparing: "Em preparo", ready: "Pronto para retirada", out_for_delivery: "Saiu para entrega", completed: "Concluído", cancelled: "Cancelado" };
  const paymentNames = { pending: "Pagamento pendente", paid: "Pagamento confirmado", refunded: "Pagamento devolvido", failed: "Falha no pagamento" };
  const fulfillmentNames = { pickup: "Retirada", delivery: "Entrega" };
  const clean = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const publicCode = (value) => { const compact = String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8); return compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact; };
  const refresh = document.getElementById("refreshOrder"), message = document.getElementById("orderRefreshMessage");
  let loading = false, hasOrder = false;
  async function load() {
    if (loading) return;
    if (!reference || !token) {
      root.innerHTML = '<section class="public-hero"><h1>Pedido indisponível</h1><p>Abra o link de acompanhamento recebido ao enviar o pedido.</p></section>';
      refresh.disabled = true; return;
    }
    loading = true; refresh.disabled = true; message.textContent = "Consultando situação do pedido...";
    try {
    const { data, error } = await supabaseClient.rpc("public_get_menu_order", { target_reference: reference, target_token: token });
    if (error || !data) throw new Error("order_unavailable");
    const code = publicCode(data.reference), whatsapp = whatsappByMenu[menuSlug], paymentPending = data.payment_status === "pending";
    const whatsappLink = whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Meu pedido é ${code}. Gostaria de confirmar os dados e combinar o pagamento diretamente com a Diniz Doces.`)}` : "";
    root.innerHTML = `<section class="order-hero"><div><small>ACOMPANHAMENTO DO PEDIDO</small><h1>${clean(code)}</h1><p>${clean(data.customer_name)} · ${clean(fulfillmentNames[data.fulfillment_type] || "Forma de recebimento não informada")}</p></div><span class="order-status">${clean(statusNames[data.status] || "Status em atualização")}</span></section>${paymentPending ? `<aside class="payment-status-card"><span aria-hidden="true">!</span><div><strong>${clean(paymentNames[data.payment_status])}</strong><p>${whatsapp ? `Envie o código <b>${clean(code)}</b> à Diniz Doces para confirmar os dados e combinar o pagamento.` : "Acompanhe a confirmação nesta página. O estabelecimento poderá entrar em contato pelo telefone informado para conferir os dados e combinar o pagamento diretamente com você."} O status do pedido é separado da confirmação do pagamento.</p></div></aside>` : `<aside class="payment-status-card is-paid"><span aria-hidden="true">✓</span><div><strong>${clean(paymentNames[data.payment_status] || "Situação do pagamento em atualização")}</strong></div></aside>`}<article class="public-card order-summary"><header><div><small>RESUMO</small><h2>Itens do pedido</h2></div></header><div class="order-items">${data.items.map((item) => `<div class="menu-price-row"><span>${item.quantity}x ${clean(item.name)} <small>${clean(item.label)}</small></span><strong>${money.format(item.line_total)}</strong></div>`).join("")}</div><div class="order-total"><span>Total do pedido</span><strong class="proposal-total">${money.format(data.total_amount)}</strong></div></article>${whatsappLink ? `<div class="order-contact"><a class="public-button order-whatsapp" href="${clean(whatsappLink)}" target="_blank" rel="noopener noreferrer">Enviar código pelo WhatsApp</a><p>O WhatsApp abre somente ao clicar e em uma nova aba. Esta página continuará disponível para acompanhamento.</p></div>` : ""}`;
    hasOrder = true; message.textContent = "Situação consultada. Use Atualizar pedido para conferir novamente.";
    } catch {
      if (!hasOrder) root.innerHTML = '<section class="public-hero"><h1>Não foi possível consultar o pedido</h1><p>Confira sua conexão e o link recebido. Use Atualizar pedido para tentar novamente.</p></section>';
      message.textContent = hasOrder ? "Não foi possível atualizar. A última situação consultada foi preservada. Confira sua conexão e tente novamente." : "A consulta não foi concluída. Você pode tentar novamente.";
    } finally { loading = false; refresh.disabled = false; }
  }
  refresh.addEventListener("click", load);
  load();
})();
