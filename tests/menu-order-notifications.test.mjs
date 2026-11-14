import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../menu-order-notifications.js", import.meta.url), "utf8");
function browser({ permission = "default", available = true, failEnable = false, failDisable = false, ios = false, supported = true, existingSubscription = false } = {}) {
  const calls = [], contexts = [], registrations = [];
  let requestCount = 0, activeSubscription = null, serverEnabled = false;
  const nodes = () => ({ textContent: "", disabled: false, attrs: {}, events: {}, setAttribute(key, value) { this.attrs[key] = value; }, addEventListener(key, callback) { this.events[key] = callback; } });
  const cards = [0, 1].map(() => {
    const button = nodes(), status = nodes();
    return { button, status, querySelector: selector => selector.includes("enable") ? button : status };
  });
  const worker = { active: { postMessage(data, ports) { contexts.push(data); ports[0].postMessage({ ok: true }); } }, update: async () => {}, pushManager: {
    async getSubscription() { return activeSubscription; },
    async subscribe(options) {
      calls.push({ action: "browser-subscribe", options });
      activeSubscription = { endpoint: "https://fcm.googleapis.com/fcm/send/fixture", unsubscribe: async () => { calls.push({ action: "browser-unsubscribe" }); activeSubscription = null; return true; } };
      return activeSubscription;
    }
  } };
  if (existingSubscription) activeSubscription = { endpoint: "https://fcm.googleapis.com/fcm/send/old-account", unsubscribe: async () => { calls.push({ action: "browser-unsubscribe" }); activeSubscription = null; return true; } };
  const Notification = { get permission() { return permission; }, requestPermission: async () => { requestCount++; permission = "granted"; return permission; } };
  class Channel {
    constructor() {
      this.port1 = { close() {}, onmessage: null };
      this.port2 = { postMessage: data => this.port1.onmessage?.({ data }) };
    }
  }
  const window = { isSecureContext: true, Notification, matchMedia: () => ({ matches: false }), OGRITECH_ENV: "production", dispatchEvent() {} };
  if (supported) window.PushManager = {};
  const context = vm.createContext({ window, Notification, Uint8Array, atob, MessageChannel: Channel, setTimeout, clearTimeout, Date,
    document: { querySelectorAll: () => cards }, localStorage: { getItem: () => null, removeItem() {} },
    navigator: { userAgent: ios ? "iPhone" : "Desktop", serviceWorker: { register: async (url, options) => { registrations.push({url, scope: options.scope, cache: options.updateViaCache}); return worker; }, getRegistration: async () => worker, addEventListener() {} } },
    supabaseClient: { functions: { async invoke(name, { body }) {
      calls.push(body);
      if (body.action === "config") return { data: { data: { available, public_key: "B" + "A".repeat(86) } } };
      if (body.action === "status") return { data: { data: { enabled: serverEnabled } } };
      if (body.action === "enable" && failEnable || body.action === "disable" && failDisable) return { error: { message: "offline" } };
      serverEnabled = body.action === "enable";
      return { data: { data: { enabled: serverEnabled } } };
    } } }
  });
  vm.runInContext(source, context);
  return { cards, calls, contexts, registrations, controller: window.OgritechOrderNotifications, requests: () => requestCount, serverEnabled: () => serverEnabled };
}

test("initialization never prompts and activation is explicit, tenant-scoped and reversible", async () => {
  const page = browser();
  await page.controller.initialize("tenant-a");
  assert.equal(page.requests(), 0);
  await page.cards[0].button.events.click();
  assert.equal(page.requests(), 1);
  assert.deepEqual(page.registrations.at(-1), {url:"/sw.js?v=20261114.1",scope:"/",cache:"none"});
  assert.equal(page.serverEnabled(), true);
  assert.equal(page.cards[1].button.attrs["aria-pressed"], "true");
  assert.equal(page.calls.find(call => call.action === "enable").barbershop_id, "tenant-a");
  assert.equal(page.contexts.at(-1).enabled, true);
  await page.cards[1].button.events.click();
  assert.equal(page.serverEnabled(), false);
  assert.equal(page.cards[0].button.attrs["aria-pressed"], "false");
  assert.equal(page.contexts.at(-1).enabled, false);
});

test("denied, unsupported and iOS home-screen cases are explained without permission requests", async () => {
  for (const options of [{ permission: "denied" }, { supported: false }, { ios: true }, { available: false }]) {
    const page = browser(options);
    await page.controller.initialize("tenant-a");
    assert.equal(page.requests(), 0);
    assert.equal(page.cards[0].button.disabled, true);
    assert.ok(page.cards[0].status.textContent.length > 20);
  }
});

test("failed registration rolls back browser opt-in and can be retried", async () => {
  const page = browser({ failEnable: true });
  await page.controller.initialize("tenant-a");
  await page.cards[0].button.events.click();
  assert.equal(page.cards[0].button.attrs["aria-pressed"], "false");
  assert.equal(page.cards[0].button.disabled, false);
  assert.equal(page.contexts.at(-1).enabled, false);
  assert.ok(page.calls.some(call => call.action === "browser-unsubscribe"));
});

test("failed server opt-out does not claim success and logout always unsubscribes locally", async () => {
  const page = browser({ failDisable: true });
  await page.controller.initialize("tenant-a");
  await page.cards[0].button.events.click();
  await page.cards[0].button.events.click();
  assert.equal(page.cards[0].button.attrs["aria-pressed"], "true");
  assert.match(page.cards[0].status.textContent, /Não foi possível/);
  await page.controller.disconnect();
  assert.equal(page.contexts.at(-1).enabled, false);
  assert.ok(page.calls.some(call => call.action === "browser-unsubscribe"));
});

test("an old account or retired key cannot retain a local opt-in on initialization", async () => {
  const page = browser({ existingSubscription: true, permission: "granted" });
  await page.controller.initialize("tenant-b");
  assert.equal(page.requests(), 0);
  assert.equal(page.contexts.at(-1).enabled, false);
  assert.ok(page.calls.some(call => call.action === "browser-unsubscribe"));
  assert.equal(page.cards[0].button.attrs["aria-pressed"], "false");
  await page.cards[0].button.events.click();
  assert.equal(page.calls.find(call => call.action === "enable").barbershop_id, "tenant-b");
  assert.equal(page.serverEnabled(), true);
});
