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

function menuPixOrderPayload(signup: {email:string;total_cents:number}, attempt:{external_reference:string}) {
  const amount=(signup.total_cents/100).toFixed(2);
  return {type:"online",processing_mode:"automatic",external_reference:attempt.external_reference.replaceAll(":","_").slice(0,64),total_amount:amount,
    payer:{email:signup.email},transactions:{payments:[{amount,payment_method:{id:"pix",type:"bank_transfer"},expiration_time:"PT72H"}]}};
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("BILLING_CRON_SECRET") || "";
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return new Response("unauthorized", { status: 401 });
  const url = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
  if (!url || !key || !mpToken) return new Response("not configured", { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date(), pixWindow = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  let pixCreated = 0, suspended = 0, finalized = 0, failures = 0;

  // Pix não é cobrado no início: o QR é emitido automaticamente 48 h antes do fim do acesso.
  const { data: pixDue, error: pixDueError } = await admin.rpc("backend_billing_lifecycle_pix_due", { target_cutoff: pixWindow });
  if (pixDueError) {
    console.error("billing_lifecycle.pix_query", { code: pixDueError.code, message: pixDueError.message });
    return new Response(`pix query failed:${pixDueError.code || "unknown"}`, { status: 500 });
  }
  for (const signup of pixDue || []) {
    if (signup.product_code !== "menu") continue;
    const sandbox = signup.product_code === "menu" && url === "https://fuesdztsvrkkgnbqhcxi.supabase.co";
    const signupToken = sandbox ? Deno.env.get("MP_MENU_SANDBOX_ACCESS_TOKEN") || "" : mpToken;
    if (!signupToken || (sandbox && !Deno.env.get("MP_MENU_SANDBOX_WEBHOOK_SECRET"))) { failures++; continue; }
    const periodEnd = signup.access_until || signup.trial_ends_at;
    if (new Date(periodEnd) > new Date(pixWindow)) continue;
    const {data:attempt,error:attemptError} = await admin.rpc("backend_billing_lifecycle_prepare_pix", {target_signup_id:signup.id});
    if (attemptError) { failures++; continue; }
    if (!attempt) continue;
    const externalReference = attempt.external_reference, expiresAt = attempt.expires_at;
    const useOrders = sandbox && Deno.env.get("MP_MENU_SANDBOX_PIX_ORDERS") === "true";
    const response = await fetch(`https://api.mercadopago.com/v1/${useOrders ? "orders" : "payments"}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${signupToken}`, "Content-Type": "application/json", "X-Idempotency-Key": attempt.request_id },
      body: JSON.stringify(useOrders ? menuPixOrderPayload(signup,attempt) : { transaction_amount: signup.total_cents / 100, description: "Renovação Ogritech Cardápio", payment_method_id: "pix", payer: { email: signup.email }, external_reference: externalReference, date_of_expiration: expiresAt, notification_url: `${url}/functions/v1/${sandbox ? "menu-sandbox-webhook" : "mercado-pago-webhook"}`, metadata: { signup_id: signup.id } }),
    });
    let payment = await response.json().catch(() => ({}));
    if (useOrders) {
      const order=payment, transaction=order.transactions?.payments?.[0];
      if (!/^ORD[A-Z0-9]+$/.test(String(order.id||"")) || order.transactions?.payments?.length!==1
        || order.country_code!=="BRA" || String(order.user_id)!=="3778177682" || order.live_mode===true || order.external_reference!==menuPixOrderPayload(signup,attempt).external_reference
        || Number(order.total_amount)!==Number(transaction?.amount)) { failures++; continue; }
      payment={id:order.id,payment_method_id:transaction?.payment_method?.id,status:transaction?.status==="action_required"?"pending":transaction?.status,
        currency_id:"BRL",transaction_amount:Number(transaction?.amount),point_of_interaction:{transaction_data:{qr_code:transaction?.payment_method?.qr_code}}};
    }
    const qrCode = payment.point_of_interaction?.transaction_data?.qr_code;
    const expiry = payment.date_of_expiration || expiresAt;
    if (!response.ok || !/^[a-zA-Z0-9_-]{1,128}$/.test(String(payment.id || ""))
      || payment.payment_method_id !== "pix" || payment.status !== "pending" || payment.currency_id !== "BRL"
      || Math.round(Number(payment.transaction_amount) * 100) !== signup.total_cents
      || typeof qrCode !== "string" || !qrCode || qrCode.length > 4096
      || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()) {
      console.error("billing_lifecycle.pix_invalid_response", {status:response.status,provider_code:payment.error || null});
      failures++; continue;
    }
    const { error: intentError } = await admin.rpc("backend_billing_lifecycle_record_pix", { target_signup_id: signup.id, payload: { purpose: signup.access_until ? "renewal" : "initial", amount_cents: signup.total_cents, provider_payment_id: String(payment.id), external_reference: externalReference, expires_at: expiry, qr_code: qrCode } });
    if (intentError) { failures++; continue; }
    pixCreated++;
  }

  const { data: expired, error: expiredError } = await admin.rpc("backend_billing_lifecycle_expired");
  if (expiredError) return new Response("expiry query failed", { status: 500 });
  for (const signup of expired || []) {
    if (signup.product_code !== "menu") continue;
    const boundary = signup.access_until || signup.trial_ends_at;
    if (new Date(boundary) > now) continue;
    const cancelled = signup.status === "cancel_at_period_end";
    const result = await admin.rpc("backend_billing_lifecycle_suspend", { target_signup_id: signup.id, target_cancelled: cancelled, target_boundary: boundary });
    if (result.error) { failures++; continue; }
    cancelled ? finalized++ : suspended++;
  }

  return Response.json({ data: { pix_created: pixCreated, suspended, cancellations_finalized: finalized, failures, next_period_example: addMonths(now.toISOString(), 1) } }, { status: failures ? 502 : 200 });
});
