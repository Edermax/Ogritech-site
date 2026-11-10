import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { z } from "npm:zod@4.6.6";
import { validPushEndpoint } from "../_shared/menu-order-push.ts";

const env = z.object({
  SUPABASE_URL: z.url(), SUPABASE_ANON_KEY: z.string().min(1), ALLOWED_ORIGINS: z.string().min(1),
  MENU_ORDER_PUSH_ENABLED: z.enum(["true", "false"]).default("false"),
  MENU_ORDER_PUSH_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/).optional()
}).parse(Deno.env.toObject());
const origins = env.ALLOWED_ORIGINS.split(",").map(value => value.trim());
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("config") }).strict(),
  z.object({ action: z.enum(["status", "enable", "disable"]), barbershop_id: z.uuid(), endpoint: z.string().max(2048).refine(validPushEndpoint) }).strict()
]);
const enabled = env.MENU_ORDER_PUSH_ENABLED === "true" && Boolean(env.MENU_ORDER_PUSH_PUBLIC_KEY);

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const headers = { "Access-Control-Allow-Origin": origin && origins.includes(origin) ? origin : origins[0],
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info", "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store", "Vary": "Origin", "X-Content-Type-Options": "nosniff" };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !origins.includes(origin)) return reply({ error: { code: "origin_not_allowed" } }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: { code: "method_not_allowed" } }, 405);
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return reply({ error: { code: "authentication_required" } }, 401);
  try {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await client.auth.getUser(authorization.slice(7));
  if (authError || !auth.user) return reply({ error: { code: "authentication_required" } }, 401);
  let input;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return reply({ error: { code: "payload_too_large" } }, 413);
    input = inputSchema.safeParse(JSON.parse(raw));
  } catch { return reply({ error: { code: "invalid_input" } }, 422); }
  if (!input.success) return reply({ error: { code: "invalid_input" } }, 422);
  const body = input.data;
  if (body.action === "config") return reply({ data: { available: enabled, public_key: enabled ? env.MENU_ORDER_PUSH_PUBLIC_KEY : null } });
  if (!enabled && body.action !== "disable") return reply({ error: { code: "notifications_unavailable" } }, 503);
  const { data, error } = await client.rpc("menu_order_push_device", {
    target_barbershop_id: body.barbershop_id, supplied_endpoint: body.endpoint,
    supplied_vapid_key: env.MENU_ORDER_PUSH_PUBLIC_KEY || null, operation: body.action
  });
  if (error) {
    const code = error.code === "42501" ? "access_denied" : error.code === "23514" ? "device_limit" : "subscription_failed";
    return reply({ error: { code } }, error.code === "42501" ? 403 : error.code === "23514" ? 409 : 500);
  }
  return reply({ data });
  } catch {
    return reply({ error: { code: "service_unavailable" } }, 503);
  }
});
