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
  const url = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  const sandbox = new URL(request.url).pathname.endsWith("/menu-sandbox-webhook");
  if (sandbox && url !== "https://fuesdztsvrkkgnbqhcxi.supabase.co") return new Response("not configured", { status: 503 });
  const secret = Deno.env.get(sandbox ? "MP_MENU_SANDBOX_WEBHOOK_SECRET" : "MERCADO_PAGO_WEBHOOK_SECRET") || "";
  const accessToken = Deno.env.get(sandbox ? "MP_MENU_SANDBOX_ACCESS_TOKEN" : "MERCADO_PAGO_ACCESS_TOKEN") || "";
  if (!secret || !accessToken || !url || !key) return new Response("not configured", { status: 503 });
  if (Number(request.headers.get("content-length") || 0) > 16384) return new Response("payload too large", { status: 413 });
  const body = await request.json().catch(() => null);
  const queryId = new URL(request.url).searchParams.get("data.id"), bodyId = body?.data?.id;
  const dataId = String(queryId ?? bodyId ?? "");
  if (!/^[a-z0-9_-]{1,128}$/i.test(dataId) || (queryId && bodyId != null && queryId.toLowerCase() !== String(bodyId).toLowerCase())) return new Response("invalid notification", { status: 400 });
  const requestId = request.headers.get("x-request-id") || "", signature = request.headers.get("x-signature") || "";
  const parts = Object.fromEntries(signature.split(",").map((part) => part.trim().split("=", 2)));
  if (!dataId || !parts.ts || !parts.v1 || !requestId) return new Response("invalid notification", { status: 400 });
  if (!/^\d{10}(?:\d{3})?$/.test(parts.ts) || !/^[a-f0-9]{64}$/i.test(parts.v1)) return new Response("invalid signature", { status: 401 });
  const timestampMs = Number(parts.ts) * (parts.ts.length === 10 ? 1000 : 1);
  if (Math.abs(Date.now() - timestampMs) > 10 * 60_000) return new Response("expired signature", { status: 401 });
  const expected = await hmac(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`, secret);
  if (!secureEqual(expected, parts.v1)) return new Response("invalid signature", { status: 401 });
  const topic = String(body?.type || body?.topic || "payment");
  if (!["payment", "subscription_authorized_payment", "subscription_preapproval"].includes(topic)) return new Response("ignored", { status: 200 });
  const eventId = `${sandbox ? "menu_sandbox:" : ""}${String(body?.id || `${topic}:${dataId}:${parts.ts}`)}`;
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const eventInsert = await admin.from("platform_billing_events").insert({ provider: "mercado_pago", provider_event_id: eventId, event_type: topic, payload: body || {} });
  if (eventInsert.error?.code === "23505") {
    const existing = await admin.from("platform_billing_events").select("processed_at").eq("provider", "mercado_pago").eq("provider_event_id", eventId).single();
    if (existing.error) return new Response("persist failed", { status: 500 });
    if (existing.data?.processed_at) return new Response("ok", { status: 200 });
  } else if (eventInsert.error) return new Response("persist failed", { status: 500 });

  try {
    const isAuthorizedPayment = topic === "subscription_authorized_payment";
    const isSubscription = topic === "subscription_preapproval";
    const encodedId = encodeURIComponent(dataId);
    const endpoint = isSubscription ? `https://api.mercadopago.com/preapproval/${encodedId}` : isAuthorizedPayment ? `https://api.mercadopago.com/authorized_payments/${encodedId}` : `https://api.mercadopago.com/v1/payments/${encodedId}`;
    const resourceResponse = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resourceResponse.ok) throw new Error(`resource_${resourceResponse.status}`);
    const resource = await resourceResponse.json();
    if (isAuthorizedPayment) {
      if (!/^[a-z0-9_-]{1,128}$/i.test(String(resource.payment?.id || ""))) throw new Error("invoice_payment_missing");
      const actualResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(resource.payment.id))}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!actualResponse.ok) throw new Error(`payment_${actualResponse.status}`);
      const actualPayment = await actualResponse.json();
      if (String(actualPayment.id) !== String(resource.payment.id)) throw new Error("invoice_payment_mismatch");
      resource.payment = actualPayment;
    }
    if (sandbox && (String(resource.collector_id ?? resource.payment?.collector_id) !== "3778177682" || resource.live_mode === true || resource.payment?.live_mode === true)) throw new Error("sandbox_resource_mismatch");
    const paymentId = String(resource.payment?.id || dataId);
    const reference = String(resource.external_reference || resource.metadata?.signup_id || "");
    const signupId = reference.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0] || "";
    const subscriptionId = String(resource.preapproval_id || resource.subscription_id || "");
    const { data: signup, error: lookupError } = await admin.rpc("backend_billing_webhook_lookup", { target_signup_id: signupId || null, target_subscription_id: (isSubscription || subscriptionId) ? subscriptionId || dataId : "", target_payment_id: paymentId });
    if (lookupError) throw new Error("signup_lookup_failed");
    if (signup) {
      if (sandbox && signup.product_code !== "menu") throw new Error("sandbox_product_mismatch");
      const paymentStatus = String(resource.payment?.status || resource.status);
      const approved = paymentStatus === "approved";
      if (approved && !isSubscription) {
        const amount = Number(resource.payment?.transaction_amount ?? resource.transaction_amount);
        const currency = resource.payment?.currency_id ?? resource.currency_id;
        if (signup.product_code === "menu" && (!Number.isFinite(amount) || Math.round(amount * 100) !== signup.total_cents || currency !== "BRL")) {
          throw new Error("payment_amount_mismatch");
        }
        const start = Math.max(Date.now(), new Date(signup.trial_ends_at).getTime(), signup.access_until ? new Date(signup.access_until).getTime() : 0);
        const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + Number(signup.cycle_months));
        const applied = await admin.rpc("backend_billing_webhook_apply", { target_signup_id: signup.id, target_payment_id: paymentId, target_status: "approved", target_access_until: end.toISOString() });
        if (applied.error) throw new Error("payment_apply_failed");
        if (signup.saas_client_id && signup.product_code !== "menu") {
          const clientUpdate = await admin.from("saas_clients").update({ status: "Ativo" }).eq("id", signup.saas_client_id);
          if (clientUpdate.error) throw new Error("client_update_failed");
        }
      } else if (["rejected", "cancelled", "refunded", "charged_back"].includes(paymentStatus)) {
        const applied = await admin.rpc("backend_billing_webhook_apply", { target_signup_id: signup.id, target_payment_id: paymentId, target_status: isSubscription && resource.status === "cancelled" ? "subscription_cancelled" : paymentStatus, target_access_until: null });
        if (applied.error) throw new Error("payment_apply_failed");
      }
    }
    const completed = await admin.from("platform_billing_events").update({ processed_at: new Date().toISOString(), error_message: null, payload: { notification: body, resource } }).eq("provider", "mercado_pago").eq("provider_event_id", eventId);
    if (completed.error) throw new Error("event_completion_failed");
    return new Response("ok", { status: 200 });
  } catch (error) {
    await admin.from("platform_billing_events").update({ error_message: error instanceof Error ? error.message : "processing_failed" }).eq("provider", "mercado_pago").eq("provider_event_id", eventId);
    return new Response("retry", { status: 500 });
  }
});
