import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { z } from "zod";
import { validPushEndpoint, secretMatches } from "../supabase/functions/_shared/menu-order-push.ts";

const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("base64url");
const environment = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "public-fixture", SUPABASE_SERVICE_ROLE_KEY: "private-fixture",
  ALLOWED_ORIGINS: "https://ogritech.com.br", MENU_ORDER_PUSH_ENABLED: "true", MENU_ORDER_PUSH_PUBLIC_KEY: publicKey,
  MENU_ORDER_PUSH_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey("jwk", keys.privateKey)),
  MENU_ORDER_PUSH_DISPATCH_SECRET: "x".repeat(40), MENU_ORDER_PUSH_CONTACT: "mailto:fixture@example.invalid" };
async function load(name, client, overrides = {}, send = async () => "sent") {
  let handler;
  const code = stripTypeScriptTypes((await readFile(new URL(`../supabase/functions/${name}/index.ts`, import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, ""));
  runInNewContext(code, { createClient: (...args) => { client.options = args; return client; }, z, validPushEndpoint, secretMatches, sendOrderPush: send,
    crypto, Request, Response, URL, Uint8Array, atob, btoa,
    Deno: { env: { toObject: () => ({ ...environment, ...overrides }) }, serve: value => { handler = value; } } });
  return handler;
}
const request = (body, headers = {}, method = "POST") => new Request("https://fixture.invalid", { method, headers: { Origin: "https://ogritech.com.br", Authorization: "Bearer fixture", ...headers }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
const device = { action: "enable", barbershop_id: "11111111-1111-4111-8111-111111111111", endpoint: "https://fcm.googleapis.com/fcm/send/fixture" };
function client() {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: { id: "fixture" } } }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data: { enabled: true } }; } };
}
test("subscription handler authenticates, validates and uses the user's token for tenant RPCs", async () => {
  const db = client(), handle = await load("menu-order-notifications", db);
  assert.equal((await handle(request(device, { Origin: "https://evil.invalid" }))).status, 403);
  assert.equal((await handle(request(device, { Authorization: "" }))).status, 401);
  assert.equal((await handle(request(device, {}, "GET"))).status, 405);
  for (const body of [{ ...device, barbershop_id: "invalid" }, { ...device, endpoint: "https://127.0.0.1/private" }, { ...device, user_id: "victim" }, { action: "unknown" }]) {
    assert.equal((await handle(request(body))).status, 422);
  }
  assert.equal((await handle(request({ action: "config", padding: "x".repeat(9000) }))).status, 413);
  assert.equal(db.calls.length, 0);
  const response = await handle(request(device));
  assert.equal(response.status, 200);
  assert.equal(db.options[1], "public-fixture");
  assert.equal(db.options[2].global.headers.Authorization, "Bearer fixture");
  assert.equal(db.calls[0].args.target_barbershop_id, device.barbershop_id);
  db.rpc = async () => ({ error: { code: "42501" } });
  assert.equal((await handle(request(device))).status, 403);
  db.rpc = async () => { throw new Error("connection failed"); };
  assert.equal((await handle(request(device))).status, 503);
  db.auth.getUser = async () => ({ data: {}, error: { code: "invalid_jwt" } });
  assert.equal((await handle(request(device))).status, 401);
});
test("disabled delivery still allows an authenticated device to opt out", async () => {
  const db = client(), handle = await load("menu-order-notifications", db, { MENU_ORDER_PUSH_ENABLED: "false" });
  assert.equal((await (await handle(request({ action: "config" }))).json()).data.available, false);
  assert.equal((await handle(request(device))).status, 503);
  assert.equal((await handle(request({ ...device, action: "disable" }))).status, 200);
});
test("dispatcher checks its private secret, leases work and acknowledges only persisted results", async () => {
  const calls = [], deliveries = [];
  const db = { rpc: async (name, args) => {
    calls.push({ name, args });
    return name === "claim_menu_order_push_jobs" ? { data: [{ job_id: 1, lease: "lease-a", endpoint: device.endpoint, topic: "a".repeat(32) }] } : { data: true };
  } };
  const handle = await load("menu-order-push-dispatch", db, {}, async (...args) => { deliveries.push(args); return "expired"; });
  assert.equal((await handle(request({}))).status, 403);
  assert.equal(calls.length, 0);
  const response = await handle(request({}, { "x-menu-push-secret": environment.MENU_ORDER_PUSH_DISPATCH_SECRET }));
  assert.deepEqual(await response.json(), { data: { claimed: 1, acknowledged: 1 } });
  assert.equal(deliveries.length, 1);
  assert.equal(calls[1].args.target_result, "expired");
  assert.equal(calls[1].args.target_lease, "lease-a");
  db.rpc = async () => { throw new Error("unavailable"); };
  assert.equal((await handle(request({}, { "x-menu-push-secret": environment.MENU_ORDER_PUSH_DISPATCH_SECRET }))).status, 503);
  await assert.rejects(load("menu-order-push-dispatch", db, { MENU_ORDER_PUSH_PUBLIC_KEY: "B" + "A".repeat(86) }), /key pair mismatch/);
});
