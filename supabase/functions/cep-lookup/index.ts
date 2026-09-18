import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { z } from "npm:zod@4.1.5";

const allowedOrigins = z.string().min(1).parse(Deno.env.get("ALLOWED_ORIGINS")).split(",").map((value) => value.trim()).filter(Boolean);
const Body = z.object({ cep: z.string().regex(/^\d{8}$/) }).strict();
const ViaCepResponse = z.object({
  erro: z.boolean().optional(),
  cep: z.string().optional(),
  logradouro: z.string().max(300).default(""),
  complemento: z.string().max(300).default(""),
  bairro: z.string().max(200).default(""),
  localidade: z.string().max(200).default(""),
  uf: z.string().max(2).default("")
}).passthrough();

const reply = (body: unknown, status: number, origin: string | null) => Response.json(body, {
  status,
  headers: {
    "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": status === 200 ? "public, max-age=86400" : "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin"
  }
});

export default { fetch: withSupabase({ auth: "publishable" }, async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return reply({ error: { code: "forbidden_origin" } }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: reply({}, 200, origin).headers });
  if (request.method !== "POST") return reply({ error: { code: "method_not_allowed" } }, 405, origin);
  if (Number(request.headers.get("content-length") || 0) > 256) return reply({ error: { code: "payload_too_large" } }, 413, origin);
  let json: unknown;
  try { json = await request.json(); } catch { return reply({ error: { code: "invalid_json" } }, 400, origin); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return reply({ error: { code: "invalid_input", fields: parsed.error.flatten().fieldErrors } }, 422, origin);
  try {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 5000);
    let response: Response;
    try { response = await fetch(`https://viacep.com.br/ws/${parsed.data.cep}/json/`, { signal: controller.signal }); }
    finally { clearTimeout(timeout); }
    if (!response.ok) return reply({ error: { code: "provider_unavailable" } }, 502, origin);
    const address = ViaCepResponse.safeParse(await response.json());
    if (!address.success) return reply({ error: { code: "invalid_provider_response" } }, 502, origin);
    if (address.data.erro) return reply({ error: { code: "cep_not_found" } }, 404, origin);
    return reply({ data: { cep: address.data.cep || parsed.data.cep, logradouro: address.data.logradouro, complemento: address.data.complemento, bairro: address.data.bairro, localidade: address.data.localidade, uf: address.data.uf } }, 200, origin);
  } catch (error) {
    return reply({ error: { code: error instanceof DOMException && error.name === "AbortError" ? "provider_timeout" : "provider_unavailable" } }, 502, origin);
  }
}) };
