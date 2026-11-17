import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { z } from "npm:zod@4.6.6";
import { phoneVerificationConfiguration, sendPhoneCode, checkPhoneCode } from "./phone-verification.ts";

const CYCLES = {
  monthly: { months: 1, discountBps: 0 },
  quarterly: { months: 3, discountBps: 300 },
  semiannual: { months: 6, discountBps: 500 },
  annual: { months: 12, discountBps: 1000 },
} as const;
const PRODUCT_PRICES = { agenda: 9700, menu: 4990 } as const;
const MENU_OFFERS = { cardapio: { name: "Catálogo Essencial", planCode: "catalogo-essencial", monthly: 990, annual: 9900 }, encomendas: { name: "Catálogo Completo", planCode: "catalogo-completo", monthly: 2990, annual: 29900 } } as const;
type MenuOffer = keyof typeof MENU_OFFERS;
type MenuPricing = { monthly: number; annual: number; name?: string };
type MenuPlan = { id: string; code: string; name: string; menu_offer_code: MenuOffer; monthly_fee: number; annual_fee: number };
const planPricing = (plan: MenuPlan): MenuPricing => ({ monthly: Math.round(Number(plan.monthly_fee) * 100), annual: Math.round(Number(plan.annual_fee) * 100), name: plan.name });
const signupPricing = (signup: { base_monthly_cents?: number; plan_annual_cents?: number; plan_name_snapshot?: string }): MenuPricing | undefined =>
  signup.base_monthly_cents && signup.plan_annual_cents ? { monthly: signup.base_monthly_cents, annual: signup.plan_annual_cents, name: signup.plan_name_snapshot } : undefined;
async function findMenuPlan(admin: ReturnType<typeof createClient>, offer: MenuOffer, id?: string) {
  let query = admin.from("saas_plans").select("id,code,name,menu_offer_code,monthly_fee,annual_fee,platform_products!inner(code)").eq("platform_products.code", "menu").eq("active", true);
  query = id ? query.eq("id", id) : query.eq("code", MENU_OFFERS[offer].planCode);
  const result = await query.maybeSingle();
  const plan = result.data as MenuPlan | null;
  if (result.error || !plan || plan.menu_offer_code !== offer || !Number.isFinite(Number(plan.monthly_fee)) || !Number.isFinite(Number(plan.annual_fee))) return null;
  return plan;
}
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "https://ogritech.com.br,http://127.0.0.1:4173,http://localhost:4173")
  .split(",").map((value) => value.trim()).filter(Boolean);
const clean = (value: string) => value.trim().replace(/\s+/g, " ");
const reply = (body: unknown, status: number, origin: string | null) => new Response(JSON.stringify(body), { status, headers: {
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-management-token, x-client-info, x-retry-count, traceparent, tracestate, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Vary": "Origin",
}});

const StartBody = z.object({
  action: z.literal("start_trial"), plan_id: z.string().uuid().optional(), expected_total_cents: z.number().int().positive().optional(), offer: z.enum(["cardapio", "encomendas"]).default("encomendas"), business_name: z.string().trim().min(2).max(150),
  responsible_name: z.string().trim().min(2).max(150), tax_document: z.string().max(24),
  responsible_tax_document: z.string().max(24).optional().default(""),
  phone_verification_token: z.string().max(256).optional().default(""),
  email: z.string().trim().toLowerCase().email().max(320), phone: z.string().max(24),
  publish_whatsapp: z.boolean().default(false),
  segment: z.string().trim().min(2).max(80).default("Serviços"),
  service_invoice_preference: z.enum(["requested", "not_requested", "not_informed"]).default("not_informed"),
  cycle: z.enum(["monthly", "quarterly", "semiannual", "annual"]),
  payment_method: z.enum(["card", "pix"]), terms_version: z.string().max(40),
  product: z.enum(["agenda", "menu"]).default("agenda"),
  accepted_terms: z.literal(true), accepted_privacy: z.literal(true), recurring_authorized: z.boolean(),
  website: z.string().max(0).optional().default(""), turnstile_token: z.string().max(2048).optional().default(""),
});
const ManageBody = z.object({ action: z.enum(["status", "cancel"]), reason: z.string().trim().max(300).optional() });
const ChoosePaymentBody = z.object({
  action: z.literal("choose_payment"), product: z.literal("menu"), barbershop_id: z.string().uuid(),
  cycle: z.enum(["monthly", "annual"]), payment_method: z.enum(["card", "pix"]),
  recurring_authorized: z.boolean(),
});
const BillingStatusBody = z.object({
  action: z.literal("billing_status"), product: z.literal("menu"), barbershop_id: z.string().uuid(),
});
const PhoneBody = z.object({
  action: z.enum(["request_phone_code", "verify_phone_code"]),
  tax_document: z.string().max(24), responsible_tax_document: z.string().max(24).optional().default(""),
  business_name: z.string().trim().min(2).max(150), email: z.string().trim().toLowerCase().email().max(320),
  phone: z.string().max(24), turnstile_token: z.string().max(2048).optional().default(""),
  challenge_id: z.string().uuid().optional(), code: z.string().regex(/^[0-9]{6}$/).optional(),
  sms_consent: z.literal(true),
});

function serviceKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; }
}
function firstAccessUrl(path: string, product: string) {
  const target = new URL(path, Deno.env.get("PUBLIC_APP_URL") || "https://ogritech.com.br");
  target.searchParams.set("primeiro_acesso", product);
  if (Deno.env.get("SUPABASE_URL") === "https://fuesdztsvrkkgnbqhcxi.supabase.co") target.searchParams.set("env", "staging");
  return target.href;
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
function validCpf(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return "";
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i);
    const check = (sum * 10 % 11) % 10;
    if (check !== Number(digits[length])) return "";
  }
  return digits;
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
}
async function trialRateLimit(admin: ReturnType<typeof createClient>, action: string, request: Request, identity: { phone: string; tax_document: string; email: string }) {
  const address = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 100);
  const entries = await Promise.all(Object.entries({ ip: address, phone: identity.phone, document: identity.tax_document, email: identity.email })
    .map(async ([key, value]) => [key, await sha256(`${key}:${value}`)]));
  const { data, error } = await admin.rpc("backend_menu_trial_rate_limit", { action_name: action, signals: Object.fromEntries(entries) });
  return error ? { available: false, allowed: false, retry: 60 } : { available: true, allowed: data?.allowed === true, retry: Number(data?.retry_after_seconds || 60) };
}
function trialReviewResponse(result: { review_id?: string; review_status?: string }, origin: string | null) {
  return reply({ data: { status: "review_required", review_id: result.review_id, review_status: result.review_status,
    message: result.review_status === "rejected" ? "Não foi possível liberar outro teste gratuito para este cadastro. Fale com o suporte."
      : "Encontramos dados que precisam de revisão antes de liberar o teste. Sua solicitação foi registrada. Você pode verificar novamente com os mesmos dados. Nenhuma conta ou cobrança foi criada." } }, 202, origin);
}
function quote(cycle: keyof typeof CYCLES, product: keyof typeof PRODUCT_PRICES = "agenda", offer: MenuOffer = "encomendas", pricing?: MenuPricing) {
  const rule = CYCLES[cycle], base = product === "menu" ? (pricing?.monthly ?? MENU_OFFERS[offer].monthly) : PRODUCT_PRICES[product], subtotal = base * rule.months;
  if (product === "menu" && cycle === "annual") { const total = pricing?.annual ?? MENU_OFFERS[offer].annual; return { base_monthly_cents: base, months: 12, discount_bps: Math.round((subtotal-total)*10000/subtotal),
    subtotal_cents: subtotal, total_cents: total }; }
  return { base_monthly_cents: base, months: rule.months, discount_bps: rule.discountBps,
    subtotal_cents: subtotal, total_cents: Math.round(subtotal * (10_000 - rule.discountBps) / 10_000) };
}
async function verifyTurnstile(token: string, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  const form = new FormData(); form.set("secret", secret); form.set("response", token); if (ip) form.set("remoteip", ip);
  try {
    const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(8000) });
    const data = result.ok ? await result.json() : null;
    return data?.success === true && data.action === "menu_trial"
      && ["ogritech.com.br", "localhost", "127.0.0.1"].includes(data.hostname);
  } catch { return false; }
}

function safeCheckoutUrl(value: unknown) {
  try { const target = new URL(String(value || ""));
    return target.protocol === "https:" && target.hostname === "www.mercadopago.com.br" && !target.username && !target.password
      && target.pathname.startsWith("/subscriptions/") ? target.href : "";
  } catch { return ""; }
}

// Hosted checkout: associated plans require a card token before subscription creation.
// Keep recurrence on the server and collect the card only on Mercado Pago's page.
function menuCheckoutPayload(signup: { id: string; email: string; trial_ends_at: string; access_until?: string | null; offer_code?: MenuOffer; base_monthly_cents?: number; plan_annual_cents?: number; plan_name_snapshot?: string }, cycle: "monthly" | "annual", appUrl: string, backendUrl: string) {
  const offer = quote(cycle, "menu", signup.offer_code || "encomendas", signupPricing(signup));
  const start = Math.max(Date.now() + 60_000, Date.parse(signup.access_until || signup.trial_ends_at));
  if (!Number.isFinite(start)) throw new Error("invalid_billing_boundary");
  return {
    reason: `Ogritech ${signup.plan_name_snapshot || MENU_OFFERS[signup.offer_code || "encomendas"].name} ${cycle === "annual" ? "anual" : "mensal"}`,
    payer_email: signup.email, external_reference: `signup:${signup.id}`, status: "pending",
    auto_recurring: { frequency: offer.months, frequency_type: "months", transaction_amount: offer.total_cents / 100,
      currency_id: "BRL", start_date: new Date(start).toISOString() },
    back_url: `${appUrl}/assinatura/?pagamento=retorno${backendUrl === "https://fuesdztsvrkkgnbqhcxi.supabase.co" ? "&env=staging" : ""}`, notification_url: `${backendUrl}/functions/v1/mercado-pago-webhook`,
  };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return reply({ error: { code: "forbidden_origin" } }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: reply({}, 200, origin).headers });
  if (request.method !== "POST") return reply({ error: { code: "method_not_allowed" } }, 405, origin);
  if (Number(request.headers.get("content-length") || 0) > 16_384) return reply({ error: { code: "payload_too_large" } }, 413, origin);
  let json: unknown;
  try {
    const reader = request.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
    if (!reader) return reply({ error: { code: "invalid_json" } }, 400, origin);
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); return reply({ error: { code: "payload_too_large" } }, 413, origin); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    json = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return reply({ error: { code: "invalid_json" } }, 400, origin); }
  if (typeof json !== "object" || !json) return reply({ error: { code: "invalid_input" } }, 422, origin);
  if ((json as { action?: string }).action === "quote") {
    const cycle = z.enum(["monthly", "quarterly", "semiannual", "annual"]).safeParse((json as { cycle?: unknown }).cycle);
    const product = z.enum(["agenda", "menu"]).safeParse((json as { product?: unknown }).product || "agenda");
    const offer = z.enum(["cardapio", "encomendas"]).safeParse((json as { offer?: unknown }).offer || "encomendas");
    if (!cycle.success || !product.success || !offer.success || (product.data === "menu" && !["monthly", "annual"].includes(cycle.data))) return reply({ error: { code: "invalid_quote" } }, 422, origin);
    const planId = z.string().uuid().optional().safeParse((json as { plan_id?: unknown }).plan_id);
    if (!planId.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
    if (product.data === "menu") {
      const backend = Deno.env.get("SUPABASE_URL") || "", secret = serviceKey();
      if (!backend || !secret) return reply({ error: { code: "service_unavailable" } }, 503, origin);
      const plan = await findMenuPlan(createClient(backend, secret, { auth: { persistSession: false } }), offer.data, planId.data);
      if (!plan) return reply({ error: { code: "plan_unavailable", message: "Este plano não está disponível para contratação." } }, 409, origin);
      return reply({ data: { ...quote(cycle.data, product.data, offer.data, planPricing(plan)), plan_id: plan.id, plan_name: plan.name } }, 200, origin);
    }
    return reply({ data: quote(cycle.data, product.data, offer.data) }, 200, origin);
  }
  if ((json as { action?: string }).action === "trial_configuration") {
    const config = phoneVerificationConfiguration();
    return reply({ data: { phone_verification: config.enabled, available: !config.enabled || config.ready,
      turnstile_site_key: Deno.env.get("TURNSTILE_SECRET_KEY") ? Deno.env.get("TURNSTILE_SITE_KEY") || "" : "" } }, 200, origin);
  }
  const url = Deno.env.get("SUPABASE_URL") || "", key = serviceKey();
  if (!url || !key) return reply({ error: { code: "service_unavailable" } }, 503, origin);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (["request_phone_code", "verify_phone_code"].includes((json as { action?: string }).action || "")) {
    const parsed = PhoneBody.safeParse(json), config = phoneVerificationConfiguration();
    if (!parsed.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
    if (!config.enabled || !config.ready) return reply({ error: { code: "phone_verification_unavailable", message: "A confirmação por SMS ainda não está disponível." } }, 503, origin);
    const input = parsed.data, taxDocument = validCnpj(input.tax_document) || validCpf(input.tax_document);
    const responsible = taxDocument.length === 11 ? taxDocument : validCpf(input.responsible_tax_document);
    const phone = normalizePhone(input.phone);
    if (!taxDocument || !responsible || !/^[1-9][0-9]9[0-9]{8}$/.test(phone)) return reply({ error: { code: "invalid_company_data" } }, 422, origin);
    const identity = { tax_document: taxDocument, responsible_tax_document: responsible, phone, email: input.email, business_name: clean(input.business_name) };
    const limit = await trialRateLimit(admin, input.action === "request_phone_code" ? "phone_send" : "phone_check", request, identity);
    if (!limit.available) return reply({ error: { code: "trial_protection_unavailable" } }, 503, origin);
    if (!limit.allowed) { const response = reply({ error: { code: "rate_limited", message: "Muitas tentativas. Aguarde antes de tentar novamente." } }, 429, origin); response.headers.set("Retry-After", String(limit.retry)); return response; }
    try {
      if (input.action === "request_phone_code") {
        if (!await verifyTurnstile(input.turnstile_token, "")) return reply({ error: { code: "challenge_failed" } }, 403, origin);
        const providerId = await sendPhoneCode(phone);
        const result = await admin.rpc("backend_menu_trial_phone", { action_name: "create", payload: { ...identity, provider_id: providerId } });
        if (result.error || !result.data?.challenge_id) throw new Error("phone_challenge_unavailable");
        return reply({ data: { challenge_id: result.data.challenge_id, expires_in_seconds: 600 } }, 200, origin);
      }
      if (!input.challenge_id || !input.code) return reply({ error: { code: "invalid_input" } }, 422, origin);
      const attempt = await admin.rpc("backend_menu_trial_phone", { action_name: "attempt", payload: { ...identity, challenge_id: input.challenge_id } });
      if (attempt.error || !attempt.data?.provider_id || !await checkPhoneCode(attempt.data.provider_id, input.code)) return reply({ error: { code: "invalid_phone_code", message: "Código inválido ou expirado. Confira o SMS ou solicite um novo código." } }, 422, origin);
      const token = crypto.randomUUID() + crypto.randomUUID();
      const approval = await admin.rpc("backend_menu_trial_phone", { action_name: "approve", payload: { ...identity, challenge_id: input.challenge_id, proof_hash: await sha256(token) } });
      if (approval.error || approval.data?.verified !== true) throw new Error("phone_challenge_unavailable");
      return reply({ data: { phone_verification_token: token } }, 200, origin);
    } catch { return reply({ error: { code: "phone_verification_unavailable", message: "Não foi possível confirmar o telefone agora. Tente novamente em instantes." } }, 503, origin); }
  }

  if ((json as { action?: string }).action === "change_offer") {
    const parsed = z.object({ action: z.literal("change_offer"), product: z.literal("menu"), barbershop_id: z.string().uuid(), offer: z.enum(["cardapio", "encomendas"]), plan_id: z.string().uuid().optional(), cycle: z.enum(["monthly", "annual"]).optional(), expected_total_cents: z.number().int().positive().optional() }).safeParse(json);
    if (!parsed.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
    const bearer = request.headers.get("authorization") || "";
    if (!bearer.toLowerCase().startsWith("bearer ")) return reply({ error: { code: "unauthorized" } }, 401, origin);
    const { data: authData, error: authError } = await admin.auth.getUser(bearer.slice(7));
    if (authError || !authData.user) return reply({ error: { code: "unauthorized" } }, 401, origin);
    const { data: profile } = await admin.from("profiles").select("role,active,barbershop_id").eq("id", authData.user.id).maybeSingle();
    let allowed = Boolean(profile?.active && profile.role === "owner" && profile.barbershop_id === parsed.data.barbershop_id);
    if (!allowed) {
      const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") || key, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } });
      const permission = await caller.rpc("is_platform_admin");
      allowed = !permission.error && permission.data === true;
    }
    if (!allowed) return reply({ error: { code: "forbidden" } }, 403, origin);
    const selectedPlan = await findMenuPlan(admin, parsed.data.offer, parsed.data.plan_id);
    if (!selectedPlan) return reply({ error: { code: "plan_unavailable", message: "Este plano não está disponível. Atualize a assinatura." } }, 409, origin);
    const { data: signup, error } = await admin.rpc("backend_billing_status", { target_barbershop_id: parsed.data.barbershop_id, target_product_code: "menu" });
    if (error) return reply({ error: { code: "billing_status_unavailable" } }, 503, origin);
    if (!signup) {
      if (parsed.data.cycle) return reply({ error: { code: "billing_setup_required", message: "Configure o pagamento da assinatura antes de alterar sua periodicidade. O contrato atual foi preservado." } }, 409, origin);
      const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY") || key, { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } });
      const { data: product } = await admin.from("platform_products").select("id").eq("code", "menu").single();
      const plan = selectedPlan;
      if (!plan) return reply({ error: { code: "product_catalog_unavailable" } }, 503, origin);
      const result = await caller.rpc("self_service_product_subscription", { target_barbershop_id: parsed.data.barbershop_id, target_product_code: "menu", target_action: "change_plan", target_plan_id: plan.id });
      if (result.error) return reply({ error: { code: "billing_change_failed", message: result.error.message } }, 409, origin);
      return reply({ data: { ...result.data, offer: parsed.data.offer } }, 200, origin);
    }
    const claimed = await admin.rpc(parsed.data.cycle ? "backend_catalog_offer_change_claim" : "backend_billing_offer_change_claim", { target_barbershop_id: parsed.data.barbershop_id, target_offer: selectedPlan.code, expected_updated_at: signup.updated_at, ...(parsed.data.cycle ? {target_cycle: parsed.data.cycle} : {}) });
    if (claimed.error) return reply({ error: { code: "billing_change_unavailable", message: ["55000", "40001", "23514"].includes(claimed.error.code) ? claimed.error.message : "Não foi possível iniciar a troca. Atualize sua assinatura e tente novamente." } }, 409, origin);
    const operation = claimed.data;
    if (!operation?.signup) return reply({ error: { code: "billing_status_unavailable" } }, 503, origin);
    if (operation.unchanged) return reply({ data: { offer: operation.signup.offer_code, trial_ends_at: operation.signup.trial_ends_at } }, 200, origin);
    const reserved = operation.signup;
    const target = quote(operation.target_cycle || reserved.cycle, "menu", parsed.data.offer, planPricing(operation.target_plan || selectedPlan));
    const sandbox = url === "https://fuesdztsvrkkgnbqhcxi.supabase.co";
    const token = Deno.env.get(sandbox ? "MP_MENU_SANDBOX_ACCESS_TOKEN" : "MERCADO_PAGO_ACCESS_TOKEN") || "";
    const finish = async (needsReconciliation: boolean) => {
      const result = await admin.rpc("backend_billing_offer_change_finish", { target_operation_id: operation.operation_id, target_token: operation.lease_token, needs_reconciliation: needsReconciliation });
      if (result.error) console.error("change_offer.reservation_cleanup_failed", { signup_id: reserved.id });
    };
    if (parsed.data.expected_total_cents !== undefined && parsed.data.expected_total_cents !== target.total_cents) {
      await finish(false); return reply({ error: { code: "price_changed", message: "O valor do plano mudou. Atualize a página antes de confirmar." } }, 409, origin);
    }
    const updateProvider = async (providerId: string, amount: number, months: number) => {
      if (!token) return false;
      const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(providerId)}`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ auto_recurring: { transaction_amount: amount / 100, currency_id: "BRL", frequency: months, frequency_type: "months" } }), signal: AbortSignal.timeout(10000)
      });
      const resource = await response.json().catch(() => ({}));
      return response.ok && String(resource.id) === String(providerId)
        && Math.round(Number(resource.auto_recurring?.transaction_amount) * 100) === amount
        && Number(resource.auto_recurring?.frequency) === months && resource.auto_recurring?.frequency_type === "months";
    };
    // A timeout can hide a successful commit. Always reconcile to the current DB price, never a stale snapshot.
    const reconcile = async () => {
      try {
        const latest = await admin.rpc("backend_billing_status", { target_barbershop_id: parsed.data.barbershop_id, target_product_code: "menu" });
        if (latest.error || latest.data?.id !== reserved.id) return false;
        return !latest.data.provider_subscription_id || await updateProvider(latest.data.provider_subscription_id, latest.data.total_cents, latest.data.cycle_months);
      } catch { return false; }
    };
    if (reserved.provider_subscription_id && !token) {
      await finish(false); return reply({ error: { code: "billing_not_configured" } }, 503, origin);
    }
    try {
      if (reserved.provider_subscription_id && !(await updateProvider(reserved.provider_subscription_id, target.total_cents, target.months))) {
        await finish(!(await reconcile()));
        return reply({ error: { code: "provider_update_failed", message: "Não foi possível confirmar a nova cobrança. Atualize sua assinatura antes de tentar novamente." } }, 502, origin);
      }
      const result = await admin.rpc("backend_billing_offer_change_commit", { target_operation_id: operation.operation_id, target_token: operation.lease_token });
      if (result.error) {
        await finish(!(await reconcile()));
        return reply({ error: { code: "billing_change_failed", message: "Não foi possível confirmar a troca. Atualize sua assinatura antes de tentar novamente." } }, 409, origin);
      }
      await finish(false);
      return reply({ data: result.data }, 200, origin);
    } catch {
      try { await finish(!(await reconcile())); } catch { /* The scheduled recovery retains the reservation. */ }
      return reply({ error: { code: "billing_change_failed", message: "Não foi possível confirmar a troca agora. Consulte sua assinatura antes de tentar novamente." } }, 503, origin);
    }
  }

  if ((json as { action?: string }).action === "billing_status") {
    const parsed = BillingStatusBody.safeParse(json);
    if (!parsed.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
    const bearer = request.headers.get("authorization") || "";
    if (!bearer.toLowerCase().startsWith("bearer ")) return reply({ error: { code: "unauthorized" } }, 401, origin);
    const { data: authData, error: authError } = await admin.auth.getUser(bearer.slice(7));
    if (authError || !authData.user) return reply({ error: { code: "unauthorized" } }, 401, origin);
    const { data: profile } = await admin.from("profiles").select("role,active,barbershop_id").eq("id", authData.user.id).maybeSingle();
    if (!profile?.active || profile.role !== "owner" || profile.barbershop_id !== parsed.data.barbershop_id) {
      return reply({ error: { code: "forbidden" } }, 403, origin);
    }
    const { data: signup, error: statusError } = await admin.rpc("backend_billing_status", { target_barbershop_id: parsed.data.barbershop_id, target_product_code: "menu" });
    if (statusError) return reply({ error: { code: "billing_status_unavailable", message: "Não foi possível consultar sua assinatura agora. Tente novamente." } }, 503, origin);
    if (!signup) return reply({ data: null }, 200, origin);
    let checkoutUrl = "";
    if (signup.payment_method === "card" && signup.status === "payment_pending" && signup.provider_subscription_id) {
      const sandbox = url === "https://fuesdztsvrkkgnbqhcxi.supabase.co";
      const token = Deno.env.get(sandbox ? "MP_MENU_SANDBOX_ACCESS_TOKEN" : "MERCADO_PAGO_ACCESS_TOKEN") || "";
      if (token) {
        try {
          const response = await fetch(`https://api.mercadopago.com/preapproval/${encodeURIComponent(signup.provider_subscription_id)}`, {headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
          const subscription = await response.json().catch(() => ({}));
          if (response.ok && String(subscription.id) === String(signup.provider_subscription_id)
            && subscription.external_reference === `signup:${signup.id}` && subscription.status === "pending") checkoutUrl = safeCheckoutUrl(subscription.init_point);
        } catch { /* Status remains available even while the provider is unreachable. */ }
      }
    }
    const boundary = signup.access_until || signup.trial_ends_at;
    const remainingMs = new Date(boundary).getTime() - Date.now();
    return reply({ data: {
      checkout_url: checkoutUrl || null,
      plan_id: signup.saas_plan_id, plan_name: signup.plan_name_snapshot, monthly_cents: signup.base_monthly_cents, annual_cents: signup.plan_annual_cents,
      offer: signup.offer_code || "encomendas", cycle: signup.cycle, payment_method: signup.payment_method, total_cents: signup.total_cents,
      effective_offer: signup.effective_offer_code,
      trial_full_access: signup.effective_offer_code === "encomendas" && Date.parse(signup.trial_ends_at) > Date.now(),
      status: signup.status, trial_ends_at: signup.trial_ends_at, access_until: signup.access_until,
      boundary, days_remaining: Math.max(0, Math.ceil(remainingMs / 86_400_000)),
      payment_requested: Boolean(signup.payment_requested_at), subscription_created: Boolean(signup.provider_subscription_id),
      pix: signup.pix_payload?.qr_code ? { qr_code: String(signup.pix_payload.qr_code), expires_at: String(signup.pix_payload.expires_at || "") } : null,
    } }, 200, origin);
  }

  if ((json as { action?: string }).action === "choose_payment") {
    const parsed = ChoosePaymentBody.safeParse(json);
    if (!parsed.success) return reply({ error: { code: "invalid_input", fields: parsed.error.flatten().fieldErrors } }, 422, origin);
    const bearer = request.headers.get("authorization") || "";
    if (!bearer.toLowerCase().startsWith("bearer ")) return reply({ error: { code: "unauthorized" } }, 401, origin);
    const { data: authData, error: authError } = await admin.auth.getUser(bearer.slice(7));
    if (authError || !authData.user) return reply({ error: { code: "unauthorized" } }, 401, origin);
    const input = parsed.data;
    const { data: profile } = await admin.from("profiles").select("role,active,barbershop_id").eq("id", authData.user.id).maybeSingle();
    if (!profile?.active || profile.role !== "owner" || profile.barbershop_id !== input.barbershop_id) {
      return reply({ error: { code: "forbidden" } }, 403, origin);
    }
    if (input.payment_method === "card" && !input.recurring_authorized) {
      return reply({ error: { code: "recurring_authorization_required", message: "Autorize a cobrança recorrente para continuar com cartão." } }, 422, origin);
    }
    const { data: signup, error: lookupError } = await admin.rpc("backend_billing_choose_payment_lookup", { target_barbershop_id: input.barbershop_id });
    if (lookupError) return reply({ error: { code: "billing_status_unavailable" } }, 503, origin);
    if (!signup) return reply({ error: { code: "billing_signup_not_found" } }, 404, origin);
    if ((signup.provider_subscription_id && signup.status !== "cancelled") ||
        (signup.status === "payment_pending" && signup.provider_payment_id)) {
      return reply({ error: { code: "billing_already_configured", message: "Já existe uma assinatura ou pagamento em andamento. Consulte seu status antes de iniciar outro." } }, 409, origin);
    }
    const sandbox = url === "https://fuesdztsvrkkgnbqhcxi.supabase.co";
    const chosen = quote(input.cycle, "menu", signup.offer_code || "encomendas", signupPricing(signup)), accessToken = Deno.env.get(sandbox ? "MP_MENU_SANDBOX_ACCESS_TOKEN" : "MERCADO_PAGO_ACCESS_TOKEN") || "";
    const planId = ""; // Hosted pending subscriptions carry their own server-defined recurrence.
    if (input.payment_method === "card" && (!accessToken || (sandbox && !Deno.env.get("MP_MENU_SANDBOX_WEBHOOK_SECRET")))) {
      return reply({ error: { code: "billing_not_configured", message: "O pagamento por cartão ainda não está disponível. Escolha Pix ou tente novamente mais tarde." } }, 503, origin);
    }
    const claim = await admin.rpc("backend_billing_payment_choice_claim", { target_signup_id: signup.id, expected_updated_at: signup.updated_at });
    if (claim.error || !claim.data?.token) return reply({ error: { code: "billing_busy", message: claim.error?.code === "40001" ? "A mensalidade foi atualizada. Confira sua assinatura antes de configurar o pagamento." : "Uma configuração de pagamento está em andamento. Atualize a assinatura ou procure o suporte." } }, 409, origin);
    const selectionToken = claim.data.token;
    let releaseChoice = input.payment_method !== "card";
    try {
    let checkoutUrl = "", providerId = "";
    if (input.payment_method === "card") {
      const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://ogritech.com.br";
      const response = await fetch("https://api.mercadopago.com/preapproval", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({
        ...menuCheckoutPayload(signup, input.cycle, appUrl, url),
        ...(sandbox ? { notification_url: `${url}/functions/v1/menu-sandbox-webhook` } : {}),
      }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status >= 400 && response.status < 500 && !result.id) releaseChoice = true;
      if (!response.ok || !safeCheckoutUrl(result.init_point) || !result.id) {
        console.error("choose_payment.mercado_pago", { status: response.status, signup_id: signup.id });
        return reply({ error: { code: "provider_unavailable", message: "Não foi possível abrir o pagamento por cartão agora." } }, 502, origin);
      }
      checkoutUrl = safeCheckoutUrl(result.init_point); providerId = result.id;
    }
    const { error: signupUpdateError } = await admin.rpc("backend_billing_choose_payment_update", { target_signup_id: signup.id, payload: {
      selection_token: selectionToken, cycle: input.cycle, payment_method: input.payment_method, base_monthly_cents: chosen.base_monthly_cents,
      cycle_months: chosen.months, discount_bps: chosen.discount_bps, total_cents: chosen.total_cents,
      provider_plan_id: planId || "", provider_subscription_id: providerId || "",
      status: input.payment_method === "card" ? "payment_pending" : (Date.parse(signup.access_until || signup.trial_ends_at) <= Date.now() ? "past_due" : "trial_active"),
      recurring_authorized: input.payment_method === "card",
    } });
    if (signupUpdateError) return reply({ error: { code: "billing_update_failed" } }, 500, origin);
    releaseChoice = true;
    const { data: customer } = await admin.from("billing_customers").update({ payment_method: input.payment_method === "card" ? "credit_card" : "pix", provider_subscription_id: providerId || null }).eq("saas_client_id", signup.saas_client_id).select("id").single();
    const { data: menuProduct } = await admin.from("platform_products").select("id").eq("code", "menu").single();
    if (!customer || !menuProduct) return reply({ error: { code: "billing_update_failed" } }, 500, origin);
    const subscriptionUpdate = await admin.from("platform_subscriptions").update({ billing_cycle: input.cycle, base_amount: chosen.base_monthly_cents / 100, next_billing_on: (signup.access_until || signup.trial_ends_at).slice(0, 10) })
      .eq("billing_customer_id", customer.id).eq("product_id", menuProduct.id);
    if (subscriptionUpdate.error) return reply({ error: { code: "billing_update_failed" } }, 500, origin);
    const audit = await admin.from("platform_billing_audit_log").insert({ actor_id: authData.user.id, action: "billing.payment_method_selected", entity_type: "billing_signup", entity_id: signup.id,
      details: { product: "menu", cycle: input.cycle, payment_method: input.payment_method, recurring_authorized: input.payment_method === "card" } });
    if (audit.error) return reply({ error: { code: "billing_update_failed" } }, 500, origin);
    return reply({ data: { cycle: input.cycle, payment_method: input.payment_method, total_cents: chosen.total_cents, checkout_url: checkoutUrl || null, trial_ends_at: signup.trial_ends_at } }, 200, origin);
    } catch {
      return reply({ error: { code: "provider_unavailable", message: "Não foi possível confirmar a configuração do pagamento. Atualize o status antes de tentar novamente; se persistir, fale com o suporte." } }, 502, origin);
    } finally {
      // Ambiguous card-creation outcomes stay reserved for reconciliation; no waiver can race them.
      if (releaseChoice) {
        try {
          const released = await admin.rpc("backend_billing_payment_choice_release", { target_signup_id: signup.id, target_token: selectionToken });
          if (released.error) console.error("choose_payment.reservation_cleanup_failed", { signup_id: signup.id });
        } catch { console.error("choose_payment.reservation_cleanup_failed", { signup_id: signup.id }); }
      }
    }
  }

  if ((json as { action?: string }).action === "trial_readiness") {
    const product = z.enum(["agenda", "menu"]).safeParse((json as { product?: unknown }).product);
    if (!product.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
    const selectedOffer = z.enum(["cardapio", "encomendas"]).safeParse((json as { offer?: unknown }).offer || "encomendas");
    if (!selectedOffer.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
    const termsVersion = Deno.env.get("BILLING_TERMS_VERSION") || "";
    const termsHash = Deno.env.get("BILLING_TERMS_SHA256") || "";
    const signupAccess = await admin.rpc("backend_billing_store_ready");
    if (signupAccess.error || signupAccess.data !== true) {
      console.error("trial_readiness.billing_signups", { code: signupAccess.error?.code, message: signupAccess.error?.message });
      return reply({ error: { code: "signup_store_unavailable" } }, 503, origin);
    }
    const { data: catalog } = await admin.from("saas_plans").select("id,platform_products!inner(code)").eq("platform_products.code", product.data).eq("code", MENU_OFFERS[selectedOffer.data].planCode).eq("active", true).maybeSingle();
    if (!catalog) return reply({ error: { code: "product_catalog_unavailable" } }, 503, origin);
    if (!termsVersion || !/^[0-9a-f]{64}$/.test(termsHash)) return reply({ error: { code: "terms_not_configured" } }, 503, origin);
    return reply({ data: { ready: true, product: product.data, offer: selectedOffer.data } }, 200, origin);
  }

  if ((json as { action?: string }).action === "start_trial") {
    const parsed = StartBody.safeParse(json);
    if (!parsed.success) return reply({ error: { code: "invalid_input", fields: parsed.error.flatten().fieldErrors } }, 422, origin);
    if (parsed.data.product !== "menu") return reply({ error: { code: "product_retired", message: "Escolha Ogritech Cardápio ou Ogritech Encomendas." } }, 410, origin);
    const input = parsed.data, taxDocument = validCnpj(input.tax_document) || validCpf(input.tax_document), phone = normalizePhone(input.phone);
    if (input.offer === "cardapio" && !input.publish_whatsapp) return reply({ error: { code: "public_whatsapp_required", message: "Autorize o WhatsApp público para receber as seleções do Cardápio." } }, 422, origin);
    if (!taxDocument || !/^\d{10,11}$/.test(phone) || (input.publish_whatsapp && phone.startsWith("0"))) return reply({ error: { code: "invalid_company_data", message: "Confira o CPF ou CNPJ e o telefone." } }, 422, origin);
    const responsibleDocument = taxDocument.length === 11 ? taxDocument : validCpf(input.responsible_tax_document);
    if (!responsibleDocument) return reply({ error: { code: "invalid_responsible_document", message: "Informe um CPF válido do responsável pelo estabelecimento." } }, 422, origin);
    const identity = { tax_document: taxDocument, responsible_tax_document: responsibleDocument, phone, email: input.email, business_name: clean(input.business_name) };
    const limit = await trialRateLimit(admin, "signup", request, identity);
    if (!limit.available) return reply({ error: { code: "trial_protection_unavailable", message: "Não foi possível validar o cadastro agora. Tente novamente em instantes." } }, 503, origin);
    if (!limit.allowed) {
      const response = reply({ error: { code: "rate_limited", message: "Muitas tentativas de cadastro. Aguarde antes de tentar novamente.", retry_after_seconds: limit.retry } }, 429, origin);
      response.headers.set("Retry-After", String(limit.retry)); return response;
    }
    if (input.payment_method === "card" && !input.recurring_authorized) return reply({ error: { code: "recurring_authorization_required" } }, 422, origin);
    if (input.product === "menu" && (!["monthly", "annual"].includes(input.cycle) || input.payment_method !== "pix")) return reply({ error: { code: "invalid_menu_offer" } }, 422, origin);
    if (taxDocument.length === 11 && input.service_invoice_preference === "not_informed") input.service_invoice_preference = "not_requested";
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
    const providerPlanId = input.payment_method === "card" ? Deno.env.get(`MP_PLAN_${input.cycle.toUpperCase()}_ID`) || "" : "";
    if ((input.product === "agenda" && !accessToken) || (input.payment_method === "card" && !providerPlanId)) return reply({ error: { code: "billing_not_configured", message: "A contratação está temporariamente indisponível." } }, 503, origin);
    const termsVersion = Deno.env.get("BILLING_TERMS_VERSION") || "2.0-2026-09-06";
    const termsHash = Deno.env.get("BILLING_TERMS_SHA256") || "";
    if (input.terms_version !== termsVersion || !/^[0-9a-f]{64}$/.test(termsHash)) return reply({ error: { code: "terms_not_configured" } }, 503, origin);
    const ip = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    if (!(await verifyTurnstile(input.turnstile_token, ip))) return reply({ error: { code: "challenge_failed" } }, 403, origin);
    const { data: eligibility, error: eligibilityError } = await admin.rpc("backend_menu_trial_evaluate", { payload: identity });
    if (eligibilityError || !eligibility) return reply({ error: { code: "trial_protection_unavailable", message: "Não foi possível conferir seu cadastro. Tente novamente." } }, 503, origin);
    if (eligibility.decision === "used") return reply({ error: { code: "trial_already_used", message: "Este documento já utilizou o teste gratuito." } }, 409, origin);
    if (eligibility.decision === "review") return trialReviewResponse(eligibility, origin);
    if (eligibility.decision !== "allow") return reply({ error: { code: "trial_protection_unavailable" } }, 503, origin);
    // Archived customers still own their Auth account and reserved email address.
    // Check before consuming a phone proof or creating a signup/business.
    const { data: existingClient, error: emailLookupError } = await admin.from("saas_clients").select("id")
      .ilike("owner_email", input.email.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
    if (emailLookupError) return reply({ error: { code: "email_check_unavailable", message: "Não foi possível conferir o e-mail agora. Tente novamente em instantes." } }, 503, origin);
    if (existingClient) return reply({ error: { code: "email_already_registered", message: "Este e-mail já tem uma conta na Ogritech. Acesse essa conta ou use outro e-mail para um novo cadastro." } }, 409, origin);
    const phoneConfig = phoneVerificationConfiguration();
    if (phoneConfig.enabled && !phoneConfig.ready) return reply({ error: { code: "phone_verification_unavailable" } }, 503, origin);
    if (phoneConfig.enabled && !/^[a-f0-9-]{72}$/.test(input.phone_verification_token)) return reply({ error: { code: "phone_verification_required", message: "Confirme seu telefone pelo código enviado por SMS." } }, 422, origin);
    if (!["monthly", "annual"].includes(input.cycle)) return reply({ error: { code: "invalid_cycle" } }, 422, origin);
    const selectedPlan = await findMenuPlan(admin, input.offer, input.plan_id);
    if (!selectedPlan) return reply({ error: { code: "plan_unavailable", message: "Este plano não está disponível para contratação. Atualize a página." } }, 409, origin);
    const cycle = quote(input.cycle, input.product, input.offer, planPricing(selectedPlan));
    if (input.expected_total_cents !== undefined && input.expected_total_cents !== cycle.total_cents) return reply({ error: { code: "price_changed", message: "O valor do plano mudou. Atualize a página antes de confirmar." } }, 409, origin);
    const token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await sha256(token);
    const trialEndsAt = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const { data: signupId, error: signupError } = await admin.rpc("backend_billing_signup_create", { payload: {
      product_code: input.product, offer_code: input.offer, plan_id: selectedPlan.id, tax_document: taxDocument, responsible_tax_document: responsibleDocument, business_name: clean(input.business_name), responsible_name: clean(input.responsible_name),
      phone_verification_required: phoneConfig.enabled, phone_proof_hash: phoneConfig.enabled ? await sha256(input.phone_verification_token) : null,
      email: input.email, phone, segment: clean(input.segment), cycle: input.cycle, payment_method: input.payment_method,
      base_monthly_cents: cycle.base_monthly_cents, cycle_months: cycle.months, discount_bps: cycle.discount_bps, total_cents: cycle.total_cents,
      terms_version: termsVersion, management_token_hash: tokenHash, trial_ends_at: trialEndsAt,
    } });
    if (signupError?.code === "23505") return reply({ error: { code: "trial_already_used", message: "Este documento já utilizou o teste gratuito." } }, 409, origin);
    if (signupError?.message?.includes("phone_verification_required")) return reply({ error: { code: "phone_verification_required", message: "A confirmação do telefone expirou ou já foi usada. Solicite um novo código." } }, 422, origin);
    if (signupError?.message?.includes("trial_review_required")) {
      const { data: review, error } = await admin.rpc("backend_menu_trial_evaluate", { payload: identity });
      return error || !review ? reply({ error: { code: "trial_protection_unavailable" } }, 503, origin) : trialReviewResponse(review, origin);
    }
    if (signupError || !signupId) {
      if (signupError?.code === "40001") return reply({ error: { code: "price_changed", message: "O valor do plano mudou. Atualize a página antes de confirmar." } }, 409, origin);
      console.error("start_trial.billing_signup", { code: signupError?.code, message: signupError?.message });
      return reply({ error: { code: "signup_failed" } }, 500, origin);
    }
    let whatsappShareId: string | null = null;
    const rollback = async () => { await admin.rpc("backend_billing_signup_delete", { target_signup_id: signupId }); };
    try {
      const { data: shop, error: shopError } = await admin.from("barbershops").insert({ name: clean(input.business_name), slug: `unidade-${crypto.randomUUID()}`, segment: clean(input.segment), active: true }).select("id").single();
      if (shopError) throw shopError;
      const productName = input.product === "menu" ? selectedPlan.name : "Agenda";
      const { data: client, error: clientError } = await admin.from("saas_clients").insert({ name: clean(input.business_name), segment: clean(input.segment), contact_name: clean(input.responsible_name), owner_email: input.email, phone, origin: `Contratação self-service — ${productName}`, plan: productName, monthly_fee: cycle.base_monthly_cents / 100, status: "Ativo", invite_status: "Pendente", barbershop_id: shop.id, notes: input.service_invoice_preference === "requested" ? "Nota de serviço: solicitada pelo cliente. Emissão sujeita às obrigações fiscais aplicáveis." : input.service_invoice_preference === "not_requested" ? "Nota de serviço: cliente não solicitou no cadastro. Não constitui dispensa de emissão obrigatória." : "Nota de serviço: preferência não informada." }).select("id").single();
      if (clientError) {
        await admin.from("barbershops").delete().eq("id", shop.id);
        if (clientError.code === "23505" && clientError.message?.includes("saas_clients_owner_email_key")) {
          await rollback();
          return reply({ error: { code: "email_already_registered", message: "Este e-mail já tem uma conta na Ogritech. Acesse essa conta ou use outro e-mail para um novo cadastro." } }, 409, origin);
        }
        throw clientError;
      }
      await admin.rpc("backend_billing_signup_link", { target_signup_id: signupId, target_barbershop_id: shop.id, target_saas_client_id: client.id });
      await admin.rpc("backend_billing_accept_terms", { payload: { signup_id: signupId, terms_version: termsVersion, terms_sha256: termsHash, recurring_authorized: input.payment_method === "card", ip_address: ip || "", user_agent: (request.headers.get("user-agent") || "").slice(0, 500) } });
      const invitation = await admin.auth.admin.inviteUserByEmail(input.email, { data: { full_name: clean(input.responsible_name), product: input.product }, redirectTo: firstAccessUrl("/update-password.html", input.product) });
      if (invitation.error) throw invitation.error;
      const profile = await admin.from("profiles").insert({ id: invitation.data.user.id, barbershop_id: shop.id, full_name: clean(input.responsible_name), role: "owner", active: true });
      if (profile.error) throw profile.error;
      if (input.product === "menu") {
        const { data: product } = await admin.from("platform_products").select("id").eq("code", "menu").single();
        const plan = selectedPlan;
        const { data: customer, error: customerError } = await admin.from("billing_customers").insert({ saas_client_id: client.id, billing_email: input.email, tax_document: taxDocument, payment_method: "pix" }).select("id").single();
        if (customerError || !product || !plan || !customer) throw customerError || new Error("Catálogo comercial do Cardápio indisponível");
        const subscription = await admin.from("platform_subscriptions").insert({ billing_customer_id: customer.id, product_id: product.id, plan_id: plan.id, status: "trial", billing_cycle: input.cycle, base_amount: cycle.base_monthly_cents / 100, starts_on: new Date().toISOString().slice(0,10), next_billing_on: trialEndsAt.slice(0,10), current_period_start: new Date().toISOString(), current_period_end: trialEndsAt });
        if (subscription.error) throw subscription.error;
      }
      if (input.publish_whatsapp) {
        const { data: share, error: shareError } = await admin.from("business_whatsapp_shares")
          .insert({ barbershop_id: shop.id, phone: "55" + phone }).select("share_id").single();
        if (shareError) throw shareError;
        whatsappShareId = share.share_id;
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
    return reply({ data: { signup_id: signupId, whatsapp_share_id: whatsappShareId, product: input.product, offer: input.offer, management_token: token, trial_ends_at: trialEndsAt, login_url: firstAccessUrl(`/login/?produto=${input.product}`, "1"), checkout_url: checkoutUrl || null, pix, billing_configured: input.payment_method === "pix" || Boolean(providerId), quote: cycle } }, 201, origin);
  }

  const parsed = ManageBody.safeParse(json);
  if (!parsed.success) return reply({ error: { code: "invalid_input" } }, 422, origin);
  const token = request.headers.get("x-management-token") || "";
  if (token.length < 60) return reply({ error: { code: "unauthorized" } }, 401, origin);
  const tokenHash = await sha256(token);
  const { data: signup } = await admin.from("backend_billing_signups").select("id,product_code,business_name,email,cycle,payment_method,total_cents,status,trial_ends_at,access_until,provider_subscription_id,provider_payment_id").eq("management_token_hash", tokenHash).maybeSingle();
  if (!signup) return reply({ error: { code: "not_found" } }, 404, origin);
  if (parsed.data.action === "status") return reply({ data: signup }, 200, origin);
  if (!["cancelled"].includes(signup.status)) {
    const sandbox = signup.product_code === "menu" && url === "https://fuesdztsvrkkgnbqhcxi.supabase.co";
    const mpToken = Deno.env.get(sandbox ? "MP_MENU_SANDBOX_ACCESS_TOKEN" : "MERCADO_PAGO_ACCESS_TOKEN") || "";
    if (!mpToken && (signup.provider_subscription_id || signup.provider_payment_id)) return reply({ error: { code: "billing_not_configured" } }, 503, origin);
    if (mpToken && signup.provider_subscription_id) {
      const endpoint = `https://api.mercadopago.com/preapproval/${encodeURIComponent(signup.provider_subscription_id)}`;
      const cancelled = await fetch(endpoint, { method: "PUT", headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
      const confirmed = await fetch(endpoint, { headers: { Authorization: `Bearer ${mpToken}` } });
      const subscription = await confirmed.json().catch(() => ({}));
      if (!confirmed.ok || subscription.status !== "cancelled") {
        console.error("cancel.provider", { status: cancelled.status, signup_id: signup.id });
        return reply({ error: { code: "provider_cancellation_failed", provider_status: cancelled.status } }, 502, origin);
      }
    }
    // An approved installment remains paid when future recurrence is cancelled.
    if (mpToken && signup.provider_payment_id && !signup.provider_subscription_id && !["active", "cancel_at_period_end"].includes(signup.status)) {
      const cancelled = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(signup.provider_payment_id)}`, { method: "PUT", headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
      if (!cancelled.ok) return reply({ error: { code: "provider_cancellation_failed" } }, 502, origin);
    }
    const accessUntil = signup.access_until || signup.trial_ends_at;
    const nextStatus = ["active", "cancel_at_period_end"].includes(signup.status) && new Date(accessUntil) > new Date() ? "cancel_at_period_end" : "cancelled";
    const persisted = await admin.from("backend_billing_signups").update({ status: nextStatus, cancelled_at: new Date().toISOString(), cancel_reason: parsed.data.reason || null, access_until: accessUntil }).eq("id", signup.id);
    if (persisted.error) return reply({ error: { code: "cancellation_persistence_failed" } }, 500, origin);
    const queued = await admin.rpc("backend_billing_enqueue_once", { target_signup_id: signup.id, target_event_type: "cancellation_requested", target_payload: { access_until: accessUntil } });
    if (queued.error) return reply({ error: { code: "cancellation_notification_failed" } }, 500, origin);
    return reply({ data: { status: nextStatus, access_until: accessUntil } }, 200, origin);
  }
  return reply({ data: { status: signup.status, access_until: signup.access_until || signup.trial_ends_at } }, 200, origin);
});
