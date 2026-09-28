import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { z } from "npm:zod@4.1.5";

const CYCLES = {
  monthly: { months: 1, discountBps: 0 },
  quarterly: { months: 3, discountBps: 300 },
  semiannual: { months: 6, discountBps: 500 },
  annual: { months: 12, discountBps: 1000 },
} as const;
const PRODUCT_PRICES = { agenda: 9700, menu: 4990 } as const;
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "https://ogritech.com.br,http://127.0.0.1:4173,http://localhost:4173")
  .split(",").map((value) => value.trim()).filter(Boolean);
const clean = (value: string) => value.trim().replace(/\s+/g, " ");
const reply = (body: unknown, status: number, origin: string | null) => new Response(JSON.stringify(body), { status, headers: {
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "apikey, content-type, x-management-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Vary": "Origin",
}});

const StartBody = z.object({
  action: z.literal("start_trial"), business_name: z.string().trim().min(2).max(150),
  responsible_name: z.string().trim().min(2).max(150), tax_document: z.string().max(24),
  email: z.string().trim().toLowerCase().email().max(320), phone: z.string().max(24),
  segment: z.string().trim().min(2).max(80).default("Serviços"),
  cycle: z.enum(["monthly", "quarterly", "semiannual", "annual"]),
  payment_method: z.enum(["card", "pix"]), terms_version: z.string().max(40),
  product: z.enum(["agenda", "menu"]).default("agenda"),
  accepted_terms: z.literal(true), accepted_privacy: z.literal(true), recurring_authorized: z.boolean(),
  website: z.string().max(0).optional().default(""), turnstile_token: z.string().max(2048).optional().default(""),
});
const ManageBody = z.object({ action: z.enum(["status", "cancel"]), reason: z.string().trim().max(300).optional() });

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; }
}
function validCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return "";
  const check = (length: number) => {
    let size = length - 7, sum = 0;
    for (let i = length; i >= 1; i--) { sum += Number(digits[length - i]) * size--; if (size < 2) size = 9; }
    const result = sum % 11; return result < 2 ? 0 : 11 - result;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]) ? digits : "";
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function quote(cycle: keyof typeof CYCLES, product: keyof typeof PRODUCT_PRICES = "agenda") {
  const rule = CYCLES[cycle], base = PRODUCT_PRICES[product], subtotal = base * rule.months;
  return { base_monthly_cents: base, months: rule.months, discount_bps: rule.discountBps,
    subtotal_cents: subtotal, total_cents: Math.round(subtotal * (10_000 - rule.discountBps) / 10_000) };
}
async function verifyTurnstile(token: string, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  const form = new FormData(); form.set("secret", secret); form.set("response", token); if (ip) form.set("remoteip", ip);
  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return result.ok && Boolean((await result.json())?.success);
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return reply({ error: { code: "forbidden_origin" } }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: reply({}, 200, origin).headers });
  if (request.method !== "POST") return reply({ error: { code: "method_not_allowed" } }, 405, origin);
  if (Number(request.headers.get("content-length") || 0) > 16_384) return reply({ error: { code: "payload_too_large" } }, 413, origin);
  let json: unknown; try { json = await request.json(); } catch { return reply({ error: { code: "invalid_json" } }, 400, origin); }
  if (typeof json !== "object" || !json) return reply({ error: { code: "invalid_input" } }, 422, origin);
  if ((json as { action?: string }).action === "quote") {
    const cycle = z.enum(["monthly", "quarterly", "semiannual", "annual"]).safeParse((json as { cycle?: unknown }).cycle);
    const product = z.enum(["agenda", "menu"]).safeParse((json as { product?: unknown }).product || "agenda");
    return cycle.success && product.success ? reply({ data: quote(cycle.data, product.data) }, 200, origin) : reply({ error: { code: "invalid_quote" } }, 422, origin);
  }
  const url = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  if (!url || !key) return reply({ error: { code: "service_unavailable" } }, 503, origin);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if ((json as { action?: string }).action === "trial_readiness") {
    const product = z.enum(["agenda", "menu"]).safeParse((json as { product?: unknown }).product);
    if (!product.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
    const termsVersion = Deno.env.get("BILLING_TERMS_VERSION") || "";
    const termsHash = Deno.env.get("BILLING_TERMS_SHA256") || "";
    const signupAccess = await admin.rpc("backend_billing_store_ready");
    if (signupAccess.error || signupAccess.data !== true) {
      console.error("trial_readiness.billing_signups", { code: signupAccess.error?.code, message: signupAccess.error?.message });
      return reply({ error: { code: "signup_store_unavailable" } }, 503, origin);
    }
    const { data: catalog } = await admin.from("saas_plans").select("id,platform_products!inner(code)").eq("platform_products.code", product.data).eq("code", "foundation").eq("active", true).maybeSingle();
    if (!catalog) return reply({ error: { code: "product_catalog_unavailable" } }, 503, origin);
    if (!termsVersion || !/^[0-9a-f]{64}$/.test(termsHash)) return reply({ error: { code: "terms_not_configured" } }, 503, origin);
    return reply({ data: { ready: true, product: product.data } }, 200, origin);
  }

  if ((json as { action?: string }).action === "start_trial") {
    const parsed = StartBody.safeParse(json);
    if (!parsed.success) return reply({ error: { code: "invalid_input", fields: parsed.error.flatten().fieldErrors } }, 422, origin);
    const input = parsed.data, cnpj = validCnpj(input.tax_document), phone = input.phone.replace(/\D/g, "");
    if (!cnpj || !/^\d{10,11}$/.test(phone)) return reply({ error: { code: "invalid_company_data", message: "Confira o CNPJ e o telefone." } }, 422, origin);
    if (input.payment_method === "card" && !input.recurring_authorized) return reply({ error: { code: "recurring_authorization_required" } }, 422, origin);
    if (input.product === "menu" && (input.cycle !== "monthly" || input.payment_method !== "pix")) return reply({ error: { code: "invalid_menu_offer" } }, 422, origin);
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
    const providerPlanId = input.payment_method === "card" ? Deno.env.get(`MP_PLAN_${input.cycle.toUpperCase()}_ID`) || "" : "";
    if ((input.product === "agenda" && !accessToken) || (input.payment_method === "card" && !providerPlanId)) return reply({ error: { code: "billing_not_configured", message: "A contratação está temporariamente indisponível." } }, 503, origin);
    const termsVersion = Deno.env.get("BILLING_TERMS_VERSION") || "2.0-2026-09-06";
    const termsHash = Deno.env.get("BILLING_TERMS_SHA256") || "";
    if (input.terms_version !== termsVersion || !/^[0-9a-f]{64}$/.test(termsHash)) return reply({ error: { code: "terms_not_configured" } }, 503, origin);
    const ip = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (!(await verifyTurnstile(input.turnstile_token, ip))) return reply({ error: { code: "challenge_failed" } }, 403, origin);
    const cycle = quote(input.cycle, input.product), token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await sha256(token);
    const trialEndsAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const { data: signupId, error: signupError } = await admin.rpc("backend_billing_signup_create", { payload: {
      product_code: input.product, tax_document: cnpj, business_name: clean(input.business_name), responsible_name: clean(input.responsible_name),
      email: input.email, phone, segment: clean(input.segment), cycle: input.cycle, payment_method: input.payment_method,
      base_monthly_cents: cycle.base_monthly_cents, cycle_months: cycle.months, discount_bps: cycle.discount_bps, total_cents: cycle.total_cents,
      terms_version: termsVersion, management_token_hash: tokenHash, trial_ends_at: trialEndsAt,
    } });
    if (signupError?.code === "23505") return reply({ error: { code: "trial_already_used", message: "Este CNPJ já utilizou o teste gratuito." } }, 409, origin);
    if (signupError || !signupId) {
      console.error("start_trial.billing_signup", { code: signupError?.code, message: signupError?.message });
      return reply({ error: { code: "signup_failed" } }, 500, origin);
    }
    const rollback = async () => { await admin.rpc("backend_billing_signup_delete", { target_signup_id: signupId }); };
    try {
      const { data: shop, error: shopError } = await admin.from("barbershops").insert({ name: clean(input.business_name), segment: clean(input.segment), active: true }).select("id").single();
      if (shopError) throw shopError;
      const productName = input.product === "menu" ? "Cardápio" : "Agenda";
      const { data: client, error: clientError } = await admin.from("saas_clients").insert({ name: clean(input.business_name), segment: clean(input.segment), contact_name: clean(input.responsible_name), owner_email: input.email, phone, origin: `Contratação self-service — ${productName}`, plan: productName, monthly_fee: cycle.base_monthly_cents / 100, status: "Ativo", invite_status: "Pendente", barbershop_id: shop.id }).select("id").single();
      if (clientError) { await admin.from("barbershops").delete().eq("id", shop.id); throw clientError; }
      await admin.rpc("backend_billing_signup_link", { target_signup_id: signupId, target_barbershop_id: shop.id, target_saas_client_id: client.id });
      await admin.rpc("backend_billing_accept_terms", { payload: { signup_id: signupId, terms_version: termsVersion, terms_sha256: termsHash, recurring_authorized: input.payment_method === "card", ip_address: ip || "", user_agent: (request.headers.get("user-agent") || "").slice(0, 500) } });
      const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://ogritech.com.br";
      const invitation = await admin.auth.admin.inviteUserByEmail(input.email, { data: { full_name: clean(input.responsible_name), product: input.product }, redirectTo: `${appUrl}/update-password.html?primeiro_acesso=${input.product}` });
      if (invitation.error) throw invitation.error;
      const profile = await admin.from("profiles").insert({ id: invitation.data.user.id, barbershop_id: shop.id, full_name: clean(input.responsible_name), role: "owner", active: true });
      if (profile.error) throw profile.error;
      if (input.product === "menu") {
        const { data: product } = await admin.from("platform_products").select("id").eq("code", "menu").single();
        const { data: plan } = await admin.from("saas_plans").select("id").eq("product_id", product?.id || "").eq("code", "foundation").single();
        const { data: customer, error: customerError } = await admin.from("billing_customers").insert({ saas_client_id: client.id, billing_email: input.email, tax_document: cnpj, payment_method: "pix" }).select("id").single();
        if (customerError || !product || !plan || !customer) throw customerError || new Error("Catálogo comercial do Cardápio indisponível");
        const subscription = await admin.from("platform_subscriptions").insert({ billing_customer_id: customer.id, product_id: product.id, plan_id: plan.id, status: "trial", base_amount: cycle.base_monthly_cents / 100, starts_on: new Date().toISOString().slice(0,10), next_billing_on: trialEndsAt.slice(0,10), current_period_start: new Date().toISOString(), current_period_end: trialEndsAt });
        if (subscription.error) throw subscription.error;
      }
      await admin.from("saas_clients").update({ invite_status: "Enviado" }).eq("id", client.id);
      await admin.rpc("backend_billing_enqueue", { target_signup_id: signupId, target_event_type: "trial_started", target_payload: { email: input.email, management_token: token, product: input.product } });
    } catch (error) { await rollback(); console.error(error); return reply({ error: { code: "provisioning_failed" } }, 500, origin); }

    const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://ogritech.com.br";
    let checkoutUrl = "", pix: Record<string, unknown> | null = null, providerId = "";
    if (accessToken) {
      if (input.payment_method === "card") {
        const planId = providerPlanId;
        if (planId) {
          const response = await fetch("https://api.mercadopago.com/preapproval", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ preapproval_plan_id: planId, payer_email: input.email, external_reference: `signup:${signupId}`, back_url: `${appUrl}/contratar/?retorno=mercadopago`, notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercado-pago-webhook` }) });
          const result = await response.json(); if (response.ok) { checkoutUrl = result.init_point || ""; providerId = result.id || ""; }
        }
      }
    }
    if (input.payment_method === "card") await admin.rpc("backend_billing_signup_provider_update", { target_signup_id: signupId, target_plan_id: providerPlanId, target_subscription_id: providerId });
    return reply({ data: { signup_id: signupId, product: input.product, management_token: token, trial_ends_at: trialEndsAt, login_url: `${appUrl}/login/?produto=${input.product}&primeiro_acesso=1`, checkout_url: checkoutUrl || null, pix, billing_configured: input.payment_method === "pix" || Boolean(providerId), quote: cycle } }, 201, origin);
  }

  const parsed = ManageBody.safeParse(json);
  if (!parsed.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
  const token = request.headers.get("x-management-token") || "";
  if (token.length < 60) return reply({ error: { code: "unauthorized" } }, 401, origin);
  const tokenHash = await sha256(token);
  const { data: signup } = await admin.schema("private").from("billing_signups").select("id,business_name,email,cycle,payment_method,total_cents,status,trial_ends_at,access_until,provider_subscription_id,provider_payment_id").eq("management_token_hash", tokenHash).maybeSingle();
  if (!signup) return reply({ error: { code: "not_found" } }, 404, origin);
  if (parsed.data.action === "status") return reply({ data: signup }, 200, origin);
  if (!["cancelled"].includes(signup.status)) {
    const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
    if (mpToken && signup.provider_subscription_id) await fetch(`https://api.mercadopago.com/preapproval/${signup.provider_subscription_id}`, { method: "PUT", headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    if (mpToken && signup.provider_payment_id) await fetch(`https://api.mercadopago.com/v1/payments/${signup.provider_payment_id}`, { method: "PUT", headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
    const accessUntil = signup.access_until || signup.trial_ends_at;
    const nextStatus = signup.status === "active" && new Date(accessUntil) > new Date() ? "cancel_at_period_end" : "cancelled";
    await admin.schema("private").from("billing_signups").update({ status: nextStatus, cancelled_at: new Date().toISOString(), cancel_reason: parsed.data.reason || null, access_until: accessUntil }).eq("id", signup.id);
    await admin.schema("private").from("billing_outbox").upsert({ signup_id: signup.id, event_type: "cancellation_requested", payload: { access_until: accessUntil } }, { onConflict: "signup_id,event_type" });
    return reply({ data: { status: nextStatus, access_until: accessUntil } }, 200, origin);
  }
  return reply({ data: { status: signup.status, access_until: signup.access_until || signup.trial_ends_at } }, 200, origin);
});
