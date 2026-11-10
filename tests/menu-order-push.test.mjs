import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { validPushEndpoint, sendOrderPush, secretMatches } from "../supabase/functions/_shared/menu-order-push.ts";

test("push restricts destinations to browser providers and rejects URL tricks", () => {
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token", "https://web.push.apple.com/token", "https://wns2-test.notify.windows.com/token"]) assert.ok(validPushEndpoint(endpoint));
  for (const endpoint of ["http://fcm.googleapis.com/token", "https://fcm.googleapis.com.evil.test/token", "https://user@fcm.googleapis.com/token", "https://127.0.0.1/token", "https://fcm.googleapis.com:8443/token", "https://web.push.apple.com/token#secret"]) assert.equal(validPushEndpoint(endpoint), false);
  assert.ok(secretMatches("x".repeat(32), "x".repeat(32)));
  assert.equal(secretMatches("x".repeat(32), "y".repeat(32)), false);
  assert.equal(secretMatches("", ""), false);
});

test("empty push signs valid VAPID claims and retries temporary failures", async () => {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("base64url");
  const endpoint = "https://fcm.googleapis.com/fcm/send/fixture";
  const clock = 1730000000000;
  const send = async status => {
    const fetchImpl = async (url, options) => {
      assert.equal(url, endpoint);
      assert.equal(options.redirect, "error");
      assert.equal(options.body, undefined, "customer data is never included");
      const jwt = options.headers.Authorization.match(/^vapid t=(.+), k=/)[1];
      const [header, body, signature] = jwt.split(".");
      assert.deepEqual(JSON.parse(Buffer.from(body, "base64url")), { aud: "https://fcm.googleapis.com", exp: clock / 1000 + 3600, sub: "mailto:fixture@example.invalid" });
      assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, keys.publicKey, Buffer.from(signature, "base64url"), new TextEncoder().encode(`${header}.${body}`)));
      return new Response(null, { status });
    };
    return sendOrderPush(endpoint, "a".repeat(32), publicKey, keys.privateKey, "mailto:fixture@example.invalid", fetchImpl, clock);
  };
  assert.equal(await send(201), "sent");
  for (const status of [404, 410]) assert.equal(await send(status), "expired");
  for (const status of [401, 403, 429, 503]) assert.equal(await send(status), "retry");
  assert.equal(await send(400), "failed");
  assert.equal(await sendOrderPush(endpoint, "a".repeat(32), publicKey, keys.privateKey, "mailto:fixture@example.invalid", async () => { throw new Error("offline"); }), "retry");
});

test("service worker only shows opted-in generic notifications and opens its own panel", async () => {
  const handlers = {}, notices = [], opened = [], acknowledgements = [];
  let context = null;
  const cache = { put: async (_, response) => { context = await response.json(); } };
  const source = await readFile(new URL("../menu-order-push-worker.js", import.meta.url), "utf8");
  vm.runInNewContext(source, { URL, Response, caches: { open: async () => cache, match: async () => context && Response.json(context) }, self: {
    location: { origin: "https://ogritech.com.br" }, addEventListener: (type, fn) => { handlers[type] = fn; },
    registration: { showNotification: async (...args) => notices.push(args) },
    clients: { matchAll: async () => [], openWindow: async url => opened.push(url) }
  } });
  const dispatch = async (type, props = {}) => { let work; handlers[type]({ ...props, waitUntil: promise => { work = promise; } }); await work; };
  await dispatch("push"); assert.equal(notices.length, 0);
  await dispatch("message", { data: { type: "menu-order-push-context", enabled: true, environment: "production" }, ports: [{ postMessage: data => acknowledgements.push(data) }] });
  await dispatch("push"); assert.equal(notices.length, 1);
  assert.equal(notices[0][0], "Novo pedido no seu cardápio");
  await dispatch("notificationclick", { notification: { close() {}, data: { environment: "https://evil.invalid" } } });
  assert.equal(opened[0], "https://ogritech.com.br/painel/?env=production&notificacoes=pedidos");
  await dispatch("message", { data: { type: "menu-order-push-context", enabled: false, environment: "production" }, ports: [] });
  await dispatch("push"); assert.equal(notices.length, 1);
  assert.equal(acknowledgements[0].ok, true);
});
