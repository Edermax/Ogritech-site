import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../panel-notifications.js", import.meta.url), "utf8");
class Element {
    constructor(tag = "div") { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.textContent = ""; this.disabled = false; this.hidden = false; this.open = false; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.(); }
}
const order = { id: "order-1", public_reference: "TEST-001", order_number: 1, status: "received", fulfillment_type: "pickup", created_at: "2026-01-01T00:00:00Z", is_test: false, customer_name: "Private customer",customer_phone:"11999999999",total_amount:49.9 };
function fixture() {
    const nodes = new Map(), stored = new Map(), filters = [], events = [];
    const state = { orders: [order], notices: [], error: null, pending: null };
    const byId = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
    const context = vm.createContext({
        document: { getElementById: byId, createElement: tag => new Element(tag), addEventListener() {}, querySelectorAll: () => [], visibilityState: "visible" },
        window: { addEventListener() {}, dispatchEvent: event => events.push(event.type), scrollTo() {}, loadMenuAdmin: async () => {} },
        localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
        fetch: async () => ({ ok: true, json: async () => ({ notices: state.notices }) }),
        AbortController, CustomEvent: class { constructor(type) { this.type = type; } },
        setTimeout: () => 1, clearTimeout() {},
        supabaseClient: { from(table) {
            assert.equal(table, "menu_orders");
            const query = { select() { return query; }, eq(key, value) { filters.push({ key, value }); return query; }, order() { return query; }, limit() { return query; }, abortSignal() { return query; },
                then(resolve, reject) { return (state.pending || Promise.resolve({ data: state.orders, error: state.error })).then(resolve, reject); } };
            return query;
        } }
    });
    vm.runInContext(source, context);
    return { api: context.window.OgritechPanelNotifications, byId, stored, filters, state, events };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const scope = { businessId: "business-a", userId: "user-a", environment: "production" };

test("notification reading is isolated by business, user and environment", async () => {
    const f = fixture();
    f.api.start(scope); await f.api.refresh();
    assert.equal(f.byId("panelNotificationBadge").textContent, "1");
    f.byId("panelNotificationReadAll").listeners.click();
    assert.equal(f.byId("panelNotificationBadge").hidden, true);
    for (const other of [{ ...scope, userId: "user-b" }, { ...scope, businessId: "business-b" }, { ...scope, environment: "staging" }]) {
        f.api.start(other); await f.api.refresh();
        assert.equal(f.byId("panelNotificationBadge").textContent, "1");
    }
    f.api.start(scope); await f.api.refresh();
    assert.equal(f.byId("panelNotificationBadge").hidden, true);
    assert.ok(f.filters.some(filter => filter.key === "barbershop_id" && filter.value === "business-b"));
    assert.ok(f.filters.some(filter => filter.key === "is_test" && filter.value === false));
    assert.equal([...f.stored.values()].some(value => value.includes("Private customer")), false);
});

test("reading an order opens operation without changing order status; status changes become unread", async () => {
    const f = fixture(); f.api.start(scope); await f.api.refresh();
    const row = f.byId("panelNotificationOrders").children[0];
    row.listeners.click(); await tick();
    assert.equal(order.status, "received");
    assert.equal(f.byId("panelNotificationBadge").hidden, true);
    assert.ok(f.events.includes("ogritech:menu-order-notification-opened"));
    f.api.setOrders([{ ...order, status: "confirmed" }, { ...order, id: "test", is_test: true }], { businessId: scope.businessId });
    assert.equal(f.byId("panelNotificationBadge").textContent, "1");
    assert.equal(f.byId("panelNotificationOrders").children.length, 1);
    const detail=f.byId("panelNotificationOrders").children[0];
    assert.match(detail.children[0].textContent,/Pedido #1 · Private customer/);
    assert.match(detail.children[1].textContent,/Telefone: 11999999999 · Valor: R\$\s*49,90 · Confirmado · Retirada/);
    assert.match(detail.children[2].textContent,/Enviado em/);
});

test("order refresh failure preserves the last snapshot and releases the retry button", async () => {
    const f = fixture(); f.api.start(scope); await f.api.refresh();
    f.state.error = { code: "08006" }; f.state.orders = null;
    await f.api.refresh();
    assert.equal(f.byId("panelNotificationOrders").children.length, 1);
    assert.match(f.byId("panelNotificationStatus").textContent, /últimas informações foram preservadas/);
    assert.equal(f.byId("panelNotificationRefresh").disabled, false);
});

test("notices exclude future, expired and malformed entries and render text literally", async () => {
    const f = fixture();
    f.state.notices = [
        { id: "valid", title: "Aviso <img src=x>", body: "Texto de teste", published_at: "2020-01-01T00:00:00Z" },
        { id: "future", title: "Futuro", body: "Teste", published_at: "2099-01-01T00:00:00Z" },
        { id: "expired", title: "Expirado", body: "Teste", published_at: "2020-01-01T00:00:00Z", expires_at: "2020-01-02T00:00:00Z" },
        { id: "bad", title: 42, body: "Teste", published_at: "2020-01-01T00:00:00Z" }
    ];
    f.api.start(scope); await tick();
    const rows = f.byId("panelNotificationNotices").children;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].children[0].textContent, "Aviso <img src=x>");
    assert.deepEqual(rows[0].children.map(child => child.tagName), ["strong", "span", "small"]);
});

test("logout discards an in-flight order response and clears visible notifications", async () => {
    const f = fixture(); let complete;
    f.state.pending = new Promise(resolve => { complete = resolve; });
    f.api.start(scope); const refresh = f.api.refresh();
    f.api.stop(); complete({ data: [order], error: null }); await refresh;
    assert.equal(f.byId("panelNotificationButton").disabled, true);
    assert.equal(f.byId("panelNotificationBadge").hidden, true);
    assert.equal(f.byId("panelNotificationOrders").children.some(child => child.className?.includes("panel-notification-item")), false);
});
