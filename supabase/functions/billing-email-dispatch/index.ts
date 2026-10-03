import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";
import { renderBillingEmail } from "../_shared/billing-email-template.ts";

function key() { if (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } }
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("BILLING_CRON_SECRET") || "";
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return new Response("unauthorized", { status: 401 });
  const url = Deno.env.get("SUPABASE_URL") || "", serviceKey = key(), resend = Deno.env.get("RESEND_API_KEY") || "";
  if (!url || !serviceKey) return new Response("not configured", { status: 503 });
  if (!resend) return Response.json({ data: { skipped: "email_provider_not_configured" } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error } = await admin.from("backend_billing_outbox").select("id,signup_id,event_type,payload,attempts").is("processed_at", null).lte("available_at", new Date().toISOString()).order("created_at").limit(20);
  if (error) return new Response("queue failed", { status: 500 });
  let sent = 0;
  for (const job of jobs || []) {
    const { data: signup } = await admin.from("backend_billing_signups").select("business_name,responsible_name,email,cycle,total_cents,trial_ends_at,access_until,product_code").eq("id", job.signup_id).maybeSingle();
    if (!signup) { await admin.from("backend_billing_outbox").update({ processed_at: new Date().toISOString(), last_error: "signup_not_found" }).eq("id", job.id); continue; }
    const email = renderBillingEmail(job.event_type, job.payload || {}, signup);
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json", "Idempotency-Key": job.id }, body: JSON.stringify({ from: "Ogritech <contato@ogritech.com.br>", to: [signup.email], reply_to: "suporte@ogritech.com.br", subject: email.subject, html: email.html, text: email.text }) });
    if (response.ok) { sent++; await admin.from("backend_billing_outbox").update({ processed_at: new Date().toISOString(), attempts: job.attempts + 1, last_error: null, payload: { delivered: true } }).eq("id", job.id); }
    else await admin.from("backend_billing_outbox").update({ attempts: job.attempts + 1, available_at: new Date(Date.now() + Math.min(3600, 2 ** job.attempts * 60) * 1000).toISOString(), last_error: `resend_${response.status}` }).eq("id", job.id);
  }
  return Response.json({ data: { processed: jobs?.length || 0, sent } });
});
