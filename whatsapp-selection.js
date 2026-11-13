(() => {
  function url(phone, entries, unitPrice) {
    if (!/^55[1-9][0-9]{9,10}$/.test(String(phone || "")) || !entries.length) return null;
    const lines = ["Olá! Gostaria de solicitar os seguintes produtos:"];
    let total = 0, quote = false;
    const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    for (const entry of entries) {
      const amount = entry.quantity * unitPrice(entry); total += amount; quote ||= Boolean(entry.isQuote);
      lines.push(`${entry.quantity} × ${entry.name}${entry.label ? ` — ${entry.label}` : ""} · ${money(amount)}${entry.isQuote ? " (referência)" : ""}`);
      if (entry.selections?.length) lines.push(`Opções: ${entry.selections.map(s => `${s.quantity || 1} × ${s.name}`).join(", ")}`);
    }
    lines.push(`${quote ? "Valor de referência" : "Subtotal estimado dos produtos"}: ${money(total)}`, "Gostaria de confirmar a disponibilidade e combinar pagamento e entrega. A seleção não confirma o pedido.");
    return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
  }
  globalThis.OgritechWhatsAppSelection = Object.freeze({ url });
})();
