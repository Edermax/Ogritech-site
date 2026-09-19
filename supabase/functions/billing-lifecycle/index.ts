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
  const { data: pixDue, error: pixDueError } = await admin.schema("private").from("billing_signups")
    .select("id,email,total_cents,cycle_months,trial_ends_at,access_until,status,barbershop_id")
    .eq("payment_method", "pix").in("status", ["trial_active", "active"])
    .is("payment_requested_at", null).lte("trial_ends_at", pixWindow).limit(100);
  if (pixDueError) return new Response("pix query failed", { status: 500 });
  for (const signup of pixDue || []) {
    const periodEnd = signup.access_until || signup.trial_ends_at;
    if (new Date(periodEnd) > new Date(pixWindow)) continue;
    const externalReference = `signup:${signup.id}:renewal:${Date.now()}`;
    const expiresAt = new Date(Math.max(Date.now() + 72 * 60 * 60 * 1000, new Date(periodEnd).getTime() + 24 * 60 * 60 * 1000)).toISOString();
    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json", "X-Idempotency-Key": externalReference },
      body: JSON.stringify({ transaction_amount: signup.total_cents / 100, description: "Renovação Ogritech Agenda", payment_method_id: "pix", payer: { email: signup.email }, external_reference: externalReference, date_of_expiration: expiresAt, notification_url: `${url}/functions/v1/mercado-pago-webhook`, metadata: { signup_id: signup.id } }),
    });
    const payment = await response.json().catch(() => ({}));
    if (!response.ok || !payment.id) continue;
    const { error: intentError } = await admin.schema("private").from("billing_payment_intents").insert({ signup_id: signup.id, purpose: signup.status === "trial_active" ? "initial" : "renewal", amount_cents: signup.total_cents, provider_payment_id: String(payment.id), external_reference: externalReference, expires_at: expiresAt });
    if (intentError) continue;
    await admin.schema("private").from("billing_signups").update({ provider_payment_id: String(payment.id), payment_requested_at: now.toISOString(), status: "payment_pending" }).eq("id", signup.id);
    await admin.schema("private").from("billing_outbox").upsert({ signup_id: signup.id, event_type: `pix_requested_${payment.id}`, payload: { qr_code: payment.point_of_interaction?.transaction_data?.qr_code || "", expires_at: expiresAt } }, { onConflict: "signup_id,event_type" });
    pixCreated++;
  }

  const { data: expired, error: expiredError } = await admin.schema("private").from("billing_signups")
    .select("id,status,trial_ends_at,access_until,barbershop_id")
    .in("status", ["trial_active", "payment_pending", "active", "cancel_at_period_end"]).limit(500);
  if (expiredError) return new Response("expiry query failed", { status: 500 });
  for (const signup of expired || []) {
    const boundary = signup.access_until || signup.trial_ends_at;
    if (new Date(boundary) > now) continue;
    const cancelled = signup.status === "cancel_at_period_end";
    await admin.schema("private").from("billing_signups").update({ status: cancelled ? "cancelled" : "past_due", suspended_at: now.toISOString() }).eq("id", signup.id);
    if (signup.barbershop_id) await admin.schema("private").rpc("billing_set_business_access", { target_barbershop_id: signup.barbershop_id, enabled: false });
    await admin.schema("private").from("billing_outbox").upsert({ signup_id: signup.id, event_type: cancelled ? "cancellation_effective" : "access_suspended", payload: { access_until: boundary } }, { onConflict: "signup_id,event_type" });
    cancelled ? finalized++ : suspended++;
  }

  return Response.json({ data: { pix_created: pixCreated, suspended, cancellations_finalized: finalized, next_period_example: addMonths(now.toISOString(), 1) } });
});
