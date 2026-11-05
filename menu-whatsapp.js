/* Resumo do pedido para a mensagem iniciada pelo próprio cliente. */
(() => {
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const amount = (value) => money.format(Number(value) || 0);
  const format = ({ code, items = [], subtotal, deliveryFee, total, fulfillment, address, scheduledFor, notes, quote = false }) => {
    const lines = [`Olá, Diniz Doces! Meu pedido é ${code}.`, "", "Itens:"];
    for (const item of items) {
      const detail = [item.label, ...(item.selections || [])].filter(Boolean).join(" · ");
      lines.push(`• ${item.quantity}x ${item.name}${detail ? ` (${detail})` : ""} — ${amount(item.lineTotal)}`);
    }
    lines.push("", `Subtotal: ${amount(subtotal)}`);
    lines.push(fulfillment === "delivery" ? `Entrega: ${amount(deliveryFee)}` : "Retirada no local");
    lines.push(`${quote ? "Total de referência" : "Total do pedido"}: ${amount(total)}`);
    if (fulfillment === "delivery" && address) lines.push(`Endereço: ${address}`);
    if (scheduledFor) lines.push(`Data solicitada: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(scheduledFor))}`);
    if (notes) lines.push(`Observações: ${notes}`);
    lines.push("", quote ? "Os valores são uma referência e dependem da confirmação da Diniz." : "Gostaria de confirmar os dados e combinar o pagamento. O pedido ainda não foi pago.");
    return lines.join("\n");
  };
  globalThis.OgritechMenuWhatsapp = { format };
})();
