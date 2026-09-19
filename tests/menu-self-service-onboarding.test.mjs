import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("commercial-admin.js", root), "utf8");
const html = await readFile(new URL("painel/index.html", root), "utf8");
const allChecks = { segment: true, identity: true, catalog: true, fulfillment: true, payments: true, hours: true, test_order: true, review: true };

function fixture() {
  return {
    menu: {
      id: "menu-1", title: "Pizzaria <Centro>", slug: "pizzaria-centro", template_code: "pizzeria", published: false,
      accepts_pickup: true, accepts_delivery: true, minimum_order: 30, delivery_fee: 4,
      visual_identity: { primary_color: "#123456", accent_color: "#fedcba" },
      accepted_payment_methods: ["cash", "credit_card"], weekly_hours: { weekdays: [2, 4], opens_at: "18:00", closes_at: "23:00" },
      menu_delivery_zones: [{ code: "centro", name: "Centro", fee: 7, minimum_order: 20, active: true }],
      menu_categories: [{ id: "category-1", name: "Pizzas", active: true, sort_order: 0, menu_items: [
        { id: "item-1", name: "Marguerita", active: true, available: true, menu_item_prices: [{ price: 50, promotional_price: 40, active: true }, { price: 99, active: false }] },
        { id: "item-2", name: "Especial", active: true, available: false, menu_item_prices: [{ price: 80, active: true }] }
      ] }]
    },
    status: { exists: true, next_step: "ready", completed_count: 8, total_count: 8, checks: { ...allChecks } },
    orders: [
      { id: "test-order", public_reference: "TEST-1", customer_name: "Teste", status: "completed", total_amount: 40, is_test: true },
      { id: "real-order", public_reference: "REAL-1", customer_name: "Cliente", status: "pending", total_amount: 47, is_test: false }
    ],
    templates: [{ code: "pizzeria", name: "Pizzaria" }]
  };
}

function browser(state = fixture(), options = {}) {
  const elements = new Map();
  const calls = [];
  const selections = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id, value: "", checked: false, disabled: false, textContent: "", innerHTML: "", href: "", handlers: {}, attributes: {},
        classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name), toggle: (name, force) => force ? classes.add(name) : classes.delete(name) },
        addEventListener(name, callback) { this.handlers[name] = callback; },
        setAttribute(name, value) { this.attributes[name] = value; },
        querySelectorAll(selector) {
          if (selector === "input,select,textarea,button") return formControls[id] || [];
          return [];
        },
        reset() {}, scrollIntoView() {}
      });
    }
    return elements.get(id);
  }
  const payments = ["pix", "cash", "credit_card", "debit_card"].map((value) => ({ value, checked: false }));
  const weekdays = ["0", "1", "2", "3", "4", "5", "6"].map((value) => ({ value, checked: false }));
  const formControls = {
    menuSettingsForm: ["menuTitle", "menuSlug", "menuDescription", "menuMinimum", "menuDeliveryFee", "menuAcceptsDelivery", "menuPrimaryColor", "menuAccentColor", "menuOpensAt", "menuClosesAt", "menuZoneCode", "menuZoneName", "menuZoneFee", "menuZoneMinimum"].map(element).concat(payments, weekdays),
    menuItemForm: ["menuCategoryName", "menuItemName", "menuItemPrice"].map(element),
    menuTemplateForm: ["menuTemplateCode", "menuTemplateSlug"].map(element)
  };
  const tableResult = (table) => {
    if (options.tableResult) return options.tableResult(table, state);
    return { data: { online_menus: state.menu, menu_orders: state.orders, menu_catalog_templates: state.templates }[table], error: null };
  };
  const supabaseClient = {
    from(table) {
      const query = {
        select(columns) { selections.push({ table, columns }); return query; },
        eq() { return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { return query; },
        then(resolve, reject) { return Promise.resolve(tableResult(table)).then(resolve, reject); }
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === "menu_onboarding_status") {
        if (state.statusError) return { data: null, error: state.statusError };
        return { data: state.status, error: null };
      }
      if (options.rpc) return options.rpc(name, args, state);
      return { data: {}, error: null };
    }
  };
  const context = vm.createContext({
    window: {}, document: {
      getElementById: element,
      querySelectorAll(selector) {
        const list = selector.startsWith(".menu-payment") ? payments : selector.startsWith(".menu-weekday") ? weekdays : [];
        return selector.includes(":checked") ? list.filter((input) => input.checked) : list;
      }
    },
    Intl, Date, console, BARBERSHOP_ID: "business-1", IS_DEMO: false, businessConfig: { name: "Meu negócio" }, supabaseClient,
    escapeHtml: (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
    ogritechEnvironmentUrl: (path) => `https://local.invalid${path}`
  });
  vm.runInContext(source, context);
  return {
    element, state, calls, selections, payments, weekdays,
    load: () => context.window.loadMenuAdmin(),
    fire: (id, name = "click") => element(id).handlers[name]?.({ preventDefault() {}, target: element(id) })
  };
}

test("onboarding explica a autonomia, o suporte opcional e os limites operacionais", () => {
  assert.match(html, /Você pode concluir tudo por conta própria/);
  assert.match(html, /mailto:suporte@ogritech\.com\.br\?subject=Ajuda/);
  assert.match(html, /não há cobrança automática/);
  assert.match(html, /não bloqueiam automaticamente os pedidos fora do expediente/);
  assert.match(html, /id="menuOnboardingBar" aria-label=/);
  assert.match(html, /id="menuPublicationButton"[^>]+disabled/);
  assert.doesNotMatch(source, /menuPublished/);
});

test("retoma os dados salvos, mostra progresso acessível e revisão com valores realmente disponíveis", async () => {
  const page = browser();
  assert.equal(await page.load(), true);
  assert.equal(page.element("menuTitle").value, "Pizzaria <Centro>");
  assert.equal(page.element("menuOpensAt").value, "18:00");
  assert.deepEqual(page.payments.filter((entry) => entry.checked).map((entry) => entry.value), ["cash", "credit_card"]);
  assert.deepEqual(page.weekdays.filter((entry) => entry.checked).map((entry) => entry.value), ["2", "4"]);
  assert.equal(page.element("menuOnboardingBar").attributes["aria-valuetext"], "8 de 8 etapas concluídas");
  assert.equal(page.element("menuPublicationButton").disabled, false);
  const review = page.element("menuReviewSummary").innerHTML;
  assert.match(review, /Pizzaria &lt;Centro&gt;/);
  assert.match(review, /1 produto\(s\)/);
  assert.match(review, /40,00/);
  assert.doesNotMatch(review, /99,00|80,00/);
  assert.match(review, /Centro: taxa .*7,00, mínimo .*30,00/);
  assert.match(review, /Dinheiro, Crédito/);
});

test("pedidos de teste ficam identificados e não recebem ações operacionais", async () => {
  const page = browser();
  await page.load();
  assert.match(page.selections.find((entry) => entry.table === "menu_orders").columns, /is_test/);
  const orders = page.element("menuOrdersList").innerHTML;
  assert.match(orders, /Pedido de teste, sem cobrança real/);
  assert.doesNotMatch(orders, /data-order="test-order"/);
  assert.match(orders, /data-order="real-order"/);
});

test("duplo clique gera somente um pedido de teste e aguarda o estado atualizado do servidor", async () => {
  const state = fixture();
  state.status = { ...state.status, next_step: "test_order", completed_count: 6, checks: { ...allChecks, test_order: false, review: false } };
  let complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  const page = browser(state, { rpc: async (name) => {
    assert.equal(name, "run_menu_test_order");
    await pending;
    state.status = { ...state.status, next_step: "review", completed_count: 7, checks: { ...allChecks, review: false } };
    return { data: { total_amount: 40 }, error: null };
  } });
  await page.load();
  const first = page.fire("menuTestOrderButton");
  const second = page.fire("menuTestOrderButton");
  assert.equal(page.element("menuTestOrderButton").disabled, true);
  assert.equal(page.element("menuPublicationButton").disabled, true);
  complete();
  await Promise.all([first, second]);
  assert.equal(page.calls.filter((call) => call.name === "run_menu_test_order").length, 1);
  assert.equal(page.element("menuReviewButton").disabled, false);
  assert.equal(page.element("menuPublicationButton").disabled, true);
  assert.match(page.element("menuOnboardingChecklist").innerHTML, /aria-current="step"[^]*Revisão final — pendente/);
});

test("alterações locais bloqueiam revisão e publicação até salvar, sem descartar os campos", async () => {
  const page = browser();
  await page.load();
  page.element("menuTitle").value = "Nome ainda não salvo";
  page.fire("menuSettingsForm", "input");
  await page.fire("menuPublicationButton");
  await page.fire("menuReloadButton");
  assert.equal(page.element("menuTitle").value, "Nome ainda não salvo");
  assert.equal(page.element("menuTestOrderButton").disabled, true);
  assert.equal(page.calls.filter((call) => call.name === "set_menu_publication").length, 0);
  assert.match(page.element("menuOnboardingMessage").textContent, /Salve suas alterações/);
});

test("configuração valida seleção e envia valores estruturados; erro do servidor preserva o formulário", async () => {
  const page = browser(fixture(), { rpc: async (name) => {
    assert.equal(name, "save_menu_onboarding_settings");
    return { data: null, error: { code: "23514", message: "Região de entrega inválida" } };
  } });
  await page.load();
  page.payments.forEach((input) => { input.checked = false; });
  await page.fire("menuSettingsForm", "submit");
  assert.match(page.element("menuMessage").textContent, /Selecione ao menos/);
  assert.equal(page.calls.filter((call) => call.name === "save_menu_onboarding_settings").length, 0);
  page.payments[0].checked = true;
  page.element("menuTitle").value = "Meu novo título";
  page.fire("menuSettingsForm", "input");
  await page.fire("menuSettingsForm", "submit");
  const call = page.calls.find((entry) => entry.name === "save_menu_onboarding_settings");
  assert.equal(call.args.target_barbershop_id, "business-1");
  assert.equal(call.args.settings.title, "Meu novo título");
  assert.equal(call.args.settings.delivery_zone.fee, 7);
  assert.equal(typeof call.args.settings.minimum_order, "number");
  assert.equal(page.element("menuTitle").value, "Meu novo título");
  assert.equal(page.element("menuTitle").disabled, false);
  assert.equal(page.element("menuPublicationButton").disabled, true);
  assert.match(page.element("menuMessage").textContent, /Região de entrega inválida/);
});

test("falha de rede não deixa controles presos nem expõe detalhes internos", async () => {
  const page = browser(fixture(), { rpc: async () => { throw new Error("private.sql stack trace"); } });
  await page.load();
  await page.fire("menuPublicationButton");
  assert.equal(page.element("menuPublicationButton").disabled, false);
  assert.match(page.element("menuOnboardingMessage").textContent, /Confira sua conexão/);
  assert.doesNotMatch(page.element("menuOnboardingMessage").textContent, /private\.sql/);
});

test("falha ao retomar bloqueia publicação até atualizar com sucesso", async () => {
  const state = fixture();
  state.statusError = { code: "42501" };
  const page = browser(state);
  assert.equal(await page.load(), false);
  assert.equal(page.element("menuPublicationButton").disabled, true);
  assert.equal(page.element("menuReloadButton").disabled, false);
  state.statusError = null;
  await page.fire("menuReloadButton");
  assert.equal(page.element("menuPublicationButton").disabled, false);
});

test("cardápio publicado bloqueia edição e pode ser despublicado explicitamente", async () => {
  const state = fixture();
  state.menu.published = true;
  const page = browser(state, { rpc: async (name, args) => {
    assert.equal(name, "set_menu_publication");
    assert.equal(args.should_publish, false);
    state.menu.published = false;
    return { data: state.status, error: null };
  } });
  await page.load();
  assert.equal(page.element("menuTitle").disabled, true);
  assert.equal(page.element("menuTestOrderButton").disabled, true);
  assert.equal(page.element("menuPublicationButton").textContent, "Despublicar cardápio");
  assert.equal(page.element("menuPublicLink").href, "https://local.invalid/cardapio/?empresa=pizzaria-centro");
  await page.fire("menuPublicationButton");
  assert.equal(page.element("menuTitle").disabled, false);
  assert.equal(page.element("menuPublicLink").classList.contains("hidden"), true);
});
