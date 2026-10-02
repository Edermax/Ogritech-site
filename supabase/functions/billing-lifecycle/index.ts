import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; }
}

const addMonths = (iso: string, months: number) => {
  const value = new Date(iso);
  value.setUTCMonth(value.getUTCMonth() + months);
  return value.toISOString();
};

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("BILLING_CRON_SECRET") || "";
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return new Response("unauthorized", { status: 401 });
  const url = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
  if (!url || !key || !mpToken) return new Response("not configured", { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date(), pixWindow = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  let pixCreated = 0, suspended = 0, finalized = 0;

  // Pix não é cobrado no início: o QR é emitido automaticamente 48 h antes do fim do acesso.
  const { data: pixDue, error: pixDueError } = await admin.rpc("backend_billing_lifecycle_pix_due", { target_cutoff: pixWindow });
  if (pixDueError) {
    console.error("billing_lifecycle.pix_query", { code: pixDueError.code, message: pixDueError.message });
    return new Response(`pix query failed:${pixDueError.code || "unknown"}`, { status: 500 });
  }
  for (const signup of pixDue || []) {
    const periodEnd = signup.access_until || signup.trial_ends_at;
    if (new Date(periodEnd) > new Date(pixWindow)) continue;
    const externalReference = `signup:${signup.id}:renewal:${Date.now()}`;
    const expiresAt = new Date(Math.max(Date.now() + 72 * 60 * 60 * 1000, new Date(periodEnd).getTime() + 24 * 60 * 60 * 1000)).toISOString();
    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json", "X-Idempotency-Key": externalReference },
      body: JSON.stringify({ transaction_amount: signup.total_cents / 100, description: "Renovação Ogritech Cardápio", payment_method_id: "pix", payer: { email: signup.email }, external_reference: externalReference, date_of_expiration: expiresAt, notification_url: `${url}/functions/v1/mercado-pago-webhook`, metadata: { signup_id: signup.id } }),
    });
    const payment = await response.json().catch(() => ({}));
    if (!response.ok || !payment.id) continue;
    const { error: intentError } = await admin.rpc("backend_billing_lifecycle_record_pix", { target_signup_id: signup.id, payload: { purpose: signup.status === "trial_active" ? "initial" : "renewal", amount_cents: signup.total_cents, provider_payment_id: String(payment.id), external_reference: externalReference, expires_at: expiresAt, qr_code: payment.point_of_interaction?.transaction_data?.qr_code || "" } });
    if (intentError) continue;
    pixCreated++;
  }

  const { data: expired, error: expiredError } = await admin.rpc("backend_billing_lifecycle_expired");
  if (expiredError) return new Response("expiry query failed", { status: 500 });
  for (const signup of expired || []) {
    const boundary = signup.access_until || signup.trial_ends_at;
    if (new Date(boundary) > now) continue;
    const cancelled = signup.status === "cancel_at_period_end";
    await admin.rpc("backend_billing_lifecycle_suspend", { target_signup_id: signup.id, target_cancelled: cancelled, target_boundary: boundary });
    cancelled ? finalized++ : suspended++;
  }

  return Response.json({ data: { pix_created: pixCreated, suspended, cancellations_finalized: finalized, next_period_example: addMonths(now.toISOString(), 1) } });
});
