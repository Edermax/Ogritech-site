import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.3";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "https://ogritech.com.br,http://127.0.0.1:4173,http://localhost:4173")
  .split(",").map((value) => value.trim()).filter(Boolean);

function response(body: unknown, status: number, origin: string | null) {
  const allowedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Headers": "apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
    },
  });
}

function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || "";
  } catch {
    return "";
  }
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return response({ error: "Origem não autorizada" }, 403, origin);
  if (request.method === "OPTIONS") return response({}, 204, origin);
  if (request.method !== "POST") return response({ error: "Método não permitido" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = secretKey();
  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) return response({ error: "Serviço de e-mail não configurado" }, 503, origin);

  let requestId = "";
  try {
    const payload = await request.json();
    requestId = typeof payload?.request_id === "string" ? payload.request_id : "";
  } catch {
    return response({ error: "JSON inválido" }, 400, origin);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return response({ error: "Solicitação inválida" }, 400, origin);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: job, error: claimError } = await admin.rpc("platform_claim_assistant_email", { target_request_id: requestId });
  if (claimError) return response({ error: "Não foi possível preparar o e-mail" }, 500, origin);
  if (!job) return response({ ok: true, status: "already_processed" }, 200, origin);

  try {
    const delivery = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Ogritech <contato@ogritech.com.br>",
        to: [job.recipient_email],
        reply_to: "contato@ogritech.com.br",
        subject: "Seu contato com a Ogritech",
        html: "<p>Olá!</p><p>Você solicitou um contato da Ogritech sobre a <strong>Ogritech Agenda</strong>.</p><p>Responda a este e-mail e conte como podemos ajudar.</p><p>Equipe Ogritech</p>",
      }),
    });
    const deliveryResult = await delivery.json().catch(() => ({}));
    if (!delivery.ok) throw new Error(String(deliveryResult?.message || delivery.status));
    await admin.rpc("platform_complete_assistant_email", {
      target_outbox_id: job.outbox_id,
      delivered: true,
      supplied_provider_message_id: String(deliveryResult?.id || ""),
      supplied_error_code: null,
    });
    return response({ ok: true, status: "sent" }, 200, origin);
  } catch (error) {
    await admin.rpc("platform_complete_assistant_email", {
      target_outbox_id: job.outbox_id,
      delivered: false,
      supplied_provider_message_id: null,
      supplied_error_code: error instanceof Error ? error.message : "delivery_failed",
    });
    return response({ error: "O e-mail permaneceu na fila para nova tentativa" }, 502, origin);
  }
});
