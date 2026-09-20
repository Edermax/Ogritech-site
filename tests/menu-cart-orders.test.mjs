import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Cardápio calcula pedidos no servidor e protege reenvios", async () => {
  const [html, js, sql] = await Promise.all([
    readFile(new URL("cardapio/index.html", root), "utf8"),
    readFile(new URL("cardapio/cardapio.js", root), "utf8"),
    readFile(new URL("supabase/migrations/20260908204304_menu_cart_orders.sql", root), "utf8")
  ]);

  for (const id of ["configurator", "deliveryZone", "scheduled_for", "orderForm"]) {
    assert.match(html, new RegExp(id));
  }
  assert.match(js, /public_create_menu_order_v2/);
  assert.match(js, /createUuid\(\)/);
  assert.match(js, /globalThis\.crypto\?\.randomUUID/);
  assert.match(js, /xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /menu_order_idempotency/);
  assert.match(sql, /coalesce\(selected_price\.promotional_price,selected_price\.price\)/);
  assert.doesNotMatch(sql, /item->>'price'/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /private\.business_product_is_active\(m\.barbershop_id,'menu'\)/);
});

test("checkout público explica campos obrigatórios antes de enviar", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("cardapio/index.html", root), "utf8"),
    readFile(new URL("cardapio/cardapio.js", root), "utf8")
  ]);
  assert.match(html, /id="orderSubmitButton"/);
  assert.match(script, /form\.querySelector\(":invalid"\)/);
  assert.match(script, /Aceite o aviso de privacidade para enviar o pedido/);
  assert.match(script, /setAttribute\("aria-invalid", "true"\)/);
});

test("checkout exige a antecedência cadastrada para itens sob encomenda", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("cardapio/index.html", root), "utf8"),
    readFile(new URL("cardapio/cardapio.js", root), "utf8")
  ]);
  assert.match(html, /id="scheduledFor"/);
  assert.match(script, /price\.item\.lead_time_hours/);
  assert.match(script, /input\.required = leadTime > 0/);
  assert.match(script, /pelo menos \$\{leadTime\} horas de antecedência/);
  assert.match(script, /error\.message === "Item indisponível ou fora dos limites"/);
});

test("cardápio aceita quantidade mínima e acréscimos unitários definidos no catálogo", async () => {
  const script = await readFile(new URL("cardapio/cardapio.js", root), "utf8");
  assert.match(script, /data-quantity-select/);
  assert.match(script, /step="1"/);
  assert.match(script, /Math\.ceil\(Number\(item\.minimum_quantity\)/);
  assert.match(script, /entry\.quantity = Math\.min\(entry\.maximumQuantity, entry\.quantity \+ quantity\)/);
  assert.match(script, /price\.amount \* quantity/);
});

test("carrinho permite revisar, alterar quantidade e remover antes do envio", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("cardapio/index.html", root), "utf8"),
    readFile(new URL("cardapio/cardapio.js", root), "utf8")
  ]);
  for (const id of ["cartReviewButton", "cartReview", "cartItems", "continueShoppingButton", "proceedCheckoutButton"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(script, /data-cart-increase/);
  assert.match(script, /data-cart-decrease/);
  assert.match(script, /data-cart-remove/);
  assert.match(script, /entry\.quantity > entry\.minimumQuantity/);
  assert.match(script, /cart\.delete\(signature\)/);
  assert.match(script, /pendingRequestId = null; updateCart\(\)/);
});

test("Diniz registra domingo reduzido e doces a partir de 50 unidades", async () => {
  const migration = await readFile(new URL("supabase/migrations/20260918123817_diniz_sunday_hours_and_sweets_quantity.sql", root), "utf8");
  assert.match(migration, /"weekdays":\[0\],"opens_at":"09:00","closes_at":"13:00"/);
  assert.match(migration, /minimum_quantity = 50/);
  assert.match(migration, /price = price \/ 100/);
  assert.match(migration, /unit_label = 'unidade'/);
});

test("entrega exige CEP e endereço com preenchimento assistido", async () => {
  const [html, script] = await Promise.all([
    readFile(new URL("cardapio/index.html", root), "utf8"),
    readFile(new URL("cardapio/cardapio.js", root), "utf8")
  ]);
  assert.match(html, /id="deliveryCep"/);
  assert.match(html, /id="deliveryAddress"/);
  assert.match(html, /https:\/\/viacep\.com\.br/);
  assert.match(script, /deliveryCep"\)\.required = delivery/);
  assert.match(script, /deliveryAddress"\)\.required = delivery/);
  assert.match(script, /deliveryZone"\)\.required = delivery && hasZones/);
  assert.match(script, /functions\.invoke\("cep-lookup", \{ body: \{ cep \} \}\)/);
  assert.match(script, /cep: String\(form\.get\("delivery_cep"\)/);
});
