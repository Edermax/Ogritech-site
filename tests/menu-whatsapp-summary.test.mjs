import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../menu-whatsapp.js", import.meta.url), "utf8");
const menu = await readFile(new URL("../cardapio/cardapio.js", import.meta.url), "utf8");
const tracking = await readFile(new URL("../pedido/pedido.js", import.meta.url), "utf8");
const menuHtml = await readFile(new URL("../cardapio/index.html", import.meta.url), "utf8");
const trackingHtml = await readFile(new URL("../pedido/index.html", import.meta.url), "utf8");

test("WhatsApp informa itens, valores, entrega, total e pendência de pagamento", () => {
  const context = { Intl, globalThis: {} };
  runInNewContext(source, context);
  const message = context.globalThis.OgritechMenuWhatsapp.format({
    code: "ABCD-1234", businessName: "Diniz Doces", customerName: " Ana Lima ", customerPhone: " (11) 99999-9999 ", items: [{ name: "Bolo", label: "1 kg", quantity: 2, selections: ["Morango"], lineTotal: 120 }],
    subtotal: 120, deliveryFee: 8, total: 128, fulfillment: "delivery", address: "Rua Exemplo, 10", notes: "Sem açúcar"
  });
  assert.match(message, /ABCD-1234/);
  assert.match(message, /Nome: Ana Lima\nTelefone: \(11\) 99999-9999/);
  assert.match(message, /2x Bolo \(1 kg · Morango\) — R\$\s?120,00/);
  assert.match(message, /Entrega: R\$\s?8,00/);
  assert.match(message, /Total do pedido: R\$\s?128,00/);
  assert.match(message, /Endereço: Rua Exemplo, 10/);
  assert.match(message, /Observações: Sem açúcar/);
  assert.match(message, /ainda não foi pago/);
});

test("pedido sob orçamento apresenta o valor como referência", () => {
  const context = { Intl, globalThis: {} };
  runInNewContext(source, context);
  const message = context.globalThis.OgritechMenuWhatsapp.format({
    code: "ABCD-1234", businessName: "Nova Loja", items: [{ name: "Bolo especial", quantity: 1, lineTotal: 90 }],
    subtotal: 90, deliveryFee: 0, total: 90, fulfillment: "pickup", quote: true
  });
  assert.match(message, /Total de referência/);
  assert.match(message, /dependem da confirmação de Nova Loja/);
});

test("resumo é usado no envio e no acompanhamento do pedido", () => {
  for (const html of [menuHtml, trackingHtml]) assert.match(html, /menu-whatsapp\.js\?v=20261114\.3/);
  for (const script of [menu, tracking]) assert.match(script, /OgritechMenuWhatsapp\.format/);
  assert.match(menu, /customerName: form\.get\("name"\)/);
  assert.match(menu, /customerPhone: form\.get\("phone"\)/);
  assert.match(tracking, /customerPhone: data\.customer_phone/);
  assert.match(menu, /total: data\.total_amount/);
  assert.match(tracking, /total: data\.total_amount/);
});
