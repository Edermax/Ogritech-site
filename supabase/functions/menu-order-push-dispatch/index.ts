import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { z } from "npm:zod@4.6.6";
import { secretMatches, sendOrderPush } from "../_shared/menu-order-push.ts";

const env = z.object({
  SUPABASE_URL: z.url(), SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MENU_ORDER_PUSH_DISPATCH_SECRET: z.string().min(32),
  MENU_ORDER_PUSH_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
  MENU_ORDER_PUSH_PRIVATE_JWK: z.string().min(1), MENU_ORDER_PUSH_CONTACT: z.string().startsWith("mailto:"),
  MENU_ORDER_PUSH_ENABLED: z.enum(["true", "false"]).default("false")
}).parse(Deno.env.toObject());
const privateJwk = z.object({ kty: z.literal("EC"), crv: z.literal("P-256"), d: z.string(), x: z.string(), y: z.string() }).parse(JSON.parse(env.MENU_ORDER_PUSH_PRIVATE_JWK));
// Check the complete uncompressed P-256 point before accepting traffic.
const publicPoint = Uint8Array.from(atob(env.MENU_ORDER_PUSH_PUBLIC_KEY.replaceAll("-", "+").replaceAll("_", "/") + "="), char => char.charCodeAt(0));
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
if (publicPoint.length !== 65 || publicPoint[0] !== 4 || encode(publicPoint.slice(1, 33)) !== privateJwk.x || encode(publicPoint.slice(33)) !== privateJwk.y) throw new Error("VAPID key pair mismatch");
const key = crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

Deno.serve(async (request: Request) => {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST") return reply({ error: { code: "method_not_allowed" } }, 405);
  if (!secretMatches(env.MENU_ORDER_PUSH_DISPATCH_SECRET, request.headers.get("x-menu-push-secret") || "")) return reply({ error: { code: "access_denied" } }, 403);
  if (env.MENU_ORDER_PUSH_ENABLED !== "true") return reply({ error: { code: "notifications_disabled" } }, 503);
  try {
  const { data: jobs, error } = await client.rpc("claim_menu_order_push_jobs", { supplied_vapid_key: env.MENU_ORDER_PUSH_PUBLIC_KEY });
  if (error) return reply({ error: { code: "queue_unavailable" } }, 503);
  let acknowledged = 0;
  await Promise.all((jobs || []).map(async (job: { job_id: number; lease: string; endpoint: string; topic: string }) => {
    const result = await sendOrderPush(job.endpoint, job.topic, env.MENU_ORDER_PUSH_PUBLIC_KEY, await key, env.MENU_ORDER_PUSH_CONTACT);
    const { data, error: finishError } = await client.rpc("finish_menu_order_push_job", { target_job_id: job.job_id, target_lease: job.lease, target_result: result });
    if (!finishError && data) acknowledged++;
  }));
  return reply({ data: { claimed: jobs?.length || 0, acknowledged } });
  } catch {
    // Leases expire and the scheduled worker retries unacknowledged jobs.
    return reply({ error: { code: "dispatch_unavailable" } }, 503);
  }
});
