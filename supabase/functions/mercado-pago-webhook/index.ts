import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

function serviceKey() {
  if (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; }
}
async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0; for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET") || "", accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
  const url = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  if (!secret || !accessToken || !url || !key) return new Response("not configured", { status: 503 });
  const body = await request.json().catch(() => null), dataId = String(body?.data?.id || new URL(request.url).searchParams.get("data.id") || "");
  const requestId = request.headers.get("x-request-id") || "", signature = request.headers.get("x-signature") || "";
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  if (!dataId || !parts.ts || !parts.v1 || !requestId) return new Response("invalid notification", { status: 400 });
  const expected = await hmac(`id:${dataId};request-id:${requestId};ts:${parts.ts};`, secret);
  if (!secureEqual(expected, parts.v1)) return new Response("invalid signature", { status: 401 });
  const eventId = String(body?.id || `${body?.type || body?.topic}:${dataId}:${parts.ts}`), topic = String(body?.type || body?.topic || "payment");
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const eventInsert = await admin.from("platform_billing_events").insert({ provider: "mercado_pago", provider_event_id: eventId, event_type: topic, payload: body || {} });
  if (eventInsert.error?.code === "23505") return new Response("ok", { status: 200 });
  if (eventInsert.error) return new Response("persist failed", { status: 500 });

  try {
    const isAuthorizedPayment = topic.includes("authorized_payment");
    const isSubscription = topic.includes("subscription_preapproval") && !isAuthorizedPayment;
    const endpoint = isSubscription ? `https://api.mercadopago.com/preapproval/${dataId}` : isAuthorizedPayment ? `https://api.mercadopago.com/authorized_payments/${dataId}` : `https://api.mercadopago.com/v1/payments/${dataId}`;
    const resourceResponse = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resourceResponse.ok) throw new Error(`resource_${resourceResponse.status}`);
    const resource = await resourceResponse.json();
    const reference = String(resource.external_reference || resource.metadata?.signup_id || "");
    const signupId = reference.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0] || "";
    const subscriptionId = String(resource.preapproval_id || resource.subscription_id || "");
    const { data: signup } = await admin.rpc("backend_billing_webhook_lookup", { target_signup_id: signupId || null, target_subscription_id: (isSubscription || subscriptionId) ? subscriptionId || dataId : "", target_payment_id: dataId });
    if (signup) {
      const approved = ["approved", "authorized", "processed"].includes(String(resource.status));
      if (approved && !isSubscription) {
        const start = Math.max(Date.now(), new Date(signup.trial_ends_at).getTime(), signup.access_until ? new Date(signup.access_until).getTime() : 0);
        const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + Number(signup.cycle_months));
        await admin.rpc("backend_billing_webhook_apply", { target_signup_id: signup.id, target_payment_id: dataId, target_status: "approved", target_access_until: end.toISOString() });
        if (signup.saas_client_id) await admin.from("saas_clients").update({ status: "Ativo" }).eq("id", signup.saas_client_id);
      } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(String(resource.status))) {
        await admin.rpc("backend_billing_webhook_apply", { target_signup_id: signup.id, target_payment_id: dataId, target_status: isSubscription && resource.status === "cancelled" ? "subscription_cancelled" : String(resource.status), target_access_until: null });
      }
    }
    await admin.from("platform_billing_events").update({ processed_at: new Date().toISOString(), payload: { notification: body, resource } }).eq("provider", "mercado_pago").eq("provider_event_id", eventId);
    return new Response("ok", { status: 200 });
  } catch (error) {
    await admin.from("platform_billing_events").update({ error_message: error instanceof Error ? error.message : "processing_failed" }).eq("provider", "mercado_pago").eq("provider_event_id", eventId);
    return new Response("retry", { status: 500 });
  }
});
