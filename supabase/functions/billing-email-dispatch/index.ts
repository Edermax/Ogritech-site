import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

function key() { if (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { return ""; } }
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
  const cronSecret = Deno.env.get("BILLING_CRON_SECRET") || "";
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) return new Response("unauthorized", { status: 401 });
  const url = Deno.env.get("SUPABASE_URL") || "", serviceKey = key(), resend = Deno.env.get("RESEND_API_KEY") || "";
  if (!url || !serviceKey || !resend) return new Response("not configured", { status: 503 });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error } = await admin.schema("private").from("billing_outbox").select("id,signup_id,event_type,payload,attempts").is("processed_at", null).lte("available_at", new Date().toISOString()).order("created_at").limit(20);
  if (error) return new Response("queue failed", { status: 500 });
  let sent = 0;
  for (const job of jobs || []) {
    const { data: signup } = await admin.schema("private").from("billing_signups").select("business_name,responsible_name,email,cycle,total_cents,trial_ends_at,access_until").eq("id", job.signup_id).maybeSingle();
    if (!signup) { await admin.schema("private").from("billing_outbox").update({ processed_at: new Date().toISOString(), last_error: "signup_not_found" }).eq("id", job.id); continue; }
    const trial = new Date(signup.trial_ends_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const payment = job.event_type.startsWith("payment_approved"), pix = job.event_type.startsWith("pix_requested");
    const cancellation = job.event_type.startsWith("cancellation"), suspended = job.event_type === "access_suspended";
    const manageToken = String(job.payload?.management_token || ""), manageUrl = manageToken ? `https://ogritech.com.br/contratar/#manage=${encodeURIComponent(manageToken)}` : "https://ogritech.com.br/contratar/";
    const subject = payment ? "Pagamento confirmado — Ogritech Agenda" : pix ? "Seu Pix de renovação — Ogritech Agenda" : cancellation ? "Cancelamento confirmado — Ogritech Agenda" : suspended ? "Acesso suspenso — Ogritech Agenda" : "Seu teste gratuito do Ogritech Agenda começou";
    const greeting = `<p>Olá, ${escapeHtml(signup.responsible_name)}.</p>`;
    const html = payment
      ? `${greeting}<p>Confirmamos o pagamento de <strong>${money(signup.total_cents)}</strong> para ${escapeHtml(signup.business_name)}.</p><p>Seu acesso está ativo até ${new Date(signup.access_until).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>`
      : pix ? `${greeting}<p>Seu período está perto do fim. Pague <strong>${money(signup.total_cents)}</strong> pelo Pix abaixo para renovar.</p><p style="word-break:break-all">${escapeHtml(job.payload?.qr_code)}</p>`
      : cancellation ? `${greeting}<p>A renovação foi cancelada. Seu acesso permanece disponível até ${new Date(signup.access_until || signup.trial_ends_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>`
      : suspended ? `${greeting}<p>O período contratado terminou sem confirmação de pagamento. O acesso foi suspenso e será liberado automaticamente após a aprovação.</p>`
      : `${greeting}<p>Seu teste gratuito do <strong>Ogritech Agenda</strong> para ${escapeHtml(signup.business_name)} começou.</p><p>O teste termina em ${trial}. O valor do período escolhido será ${money(signup.total_cents)}.</p><p><a href="${manageUrl}">Gerenciar contratação</a></p>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json", "Idempotency-Key": job.id }, body: JSON.stringify({ from: "Ogritech <contato@ogritech.com.br>", to: [signup.email], reply_to: "suporte@ogritech.com.br", subject, html: `${html}<p><a href="https://ogritech.com.br/termos.html">Termos aceitos</a> · <a href="https://ogritech.com.br/login/">Acessar Ogritech</a></p>` }) });
    if (response.ok) { sent++; await admin.schema("private").from("billing_outbox").update({ processed_at: new Date().toISOString(), attempts: job.attempts + 1, last_error: null, payload: { delivered: true } }).eq("id", job.id); }
    else await admin.schema("private").from("billing_outbox").update({ attempts: job.attempts + 1, available_at: new Date(Date.now() + Math.min(3600, 2 ** job.attempts * 60) * 1000).toISOString(), last_error: `resend_${response.status}` }).eq("id", job.id);
  }
  return Response.json({ data: { processed: jobs?.length || 0, sent } });
});
