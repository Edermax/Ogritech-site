import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { z } from "npm:zod@4.1.5";

const Env = z.object({ ALLOWED_ORIGINS: z.string().min(1), GEOAPIFY_API_KEY: z.string().min(20) }).parse(Deno.env.toObject());
const allowedOrigins = Env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
const Body = z.object({
  cep: z.string().regex(/^\d{8}$/),
  target_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/).optional(),
  address: z.string().trim().min(8).max(500).optional()
}).strict();
const ViaCepResponse = z.object({
  erro: z.boolean().optional(), cep: z.string().optional(), logradouro: z.string().max(300).default(""),
  complemento: z.string().max(300).default(""), bairro: z.string().max(200).default(""),
  localidade: z.string().max(200).default(""), uf: z.string().max(2).default("")
}).passthrough();
const GeocodeResponse = z.object({ results: z.array(z.object({ lat: z.number(), lon: z.number() }).passthrough()).min(1) }).passthrough();
const RoutingResponse = z.object({ features: z.array(z.object({ properties: z.object({ distance: z.number().positive(), time: z.number().nonnegative().optional() }).passthrough() }).passthrough()).min(1) }).passthrough();
const DINIZ_SLUG = "diniz-doces-previa-7d1";
const DINIZ_ORIGIN_ADDRESS = "Rua Judy Villar Benedine, 319, Parque dos Servidores, Ribeirão Preto, SP, Brasil";
let dinizOriginPromise: Promise<{ lat: number; lon: number }> | null = null;

const reply = (body: unknown, status: number, origin: string | null) => Response.json(body, { status, headers: {
  "Access-Control-Allow-Origin": origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info", "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Cache-Control": status === 200 ? "private, max-age=300" : "no-store", "X-Content-Type-Options": "nosniff", "Vary": "Origin"
} });
const fetchJson = async (url: URL, timeoutMs = 10000) => {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "Ogritech-Cardapio/1.0" } });
    if (!response.ok) throw new Error(`provider_status_${response.status}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
};
const geocode = async (address: string) => {
  const url = new URL("https://api.geoapify.com/v1/geocode/search");
  url.searchParams.set("text", address); url.searchParams.set("filter", "countrycode:br"); url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1"); url.searchParams.set("apiKey", Env.GEOAPIFY_API_KEY);
  const parsed = GeocodeResponse.safeParse(await fetchJson(url));
  if (!parsed.success) throw new Error("geocode_not_found");
  return { lat: parsed.data.results[0].lat, lon: parsed.data.results[0].lon };
};
const dinizOrigin = () => dinizOriginPromise ||= geocode(DINIZ_ORIGIN_ADDRESS).catch((error) => { dinizOriginPromise = null; throw error; });
const straightLineMeters = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const radians = (value: number) => value * Math.PI / 180, earthRadius = 6371000;
  const latitude = radians(b.lat - a.lat), longitude = radians(b.lon - a.lon);
  const haversine = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(longitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};
const routeFromDiniz = async (destination: { lat: number; lon: number }) => {
  const origin = await dinizOrigin(); const url = new URL("https://api.geoapify.com/v1/routing");
  if (straightLineMeters(origin, destination) < 100) return { distance: 0, time: 0 };
  url.searchParams.set("waypoints", `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}`);
  url.searchParams.set("mode", "drive"); url.searchParams.set("apiKey", Env.GEOAPIFY_API_KEY);
  const parsed = RoutingResponse.safeParse(await fetchJson(url));
  if (!parsed.success) throw new Error("route_not_found");
  return parsed.data.features[0].properties;
};

export default { fetch: withSupabase({ auth: "publishable" }, async (request) => {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return reply({ error: { code: "forbidden_origin" } }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: reply({}, 200, origin).headers });
  if (request.method !== "POST") return reply({ error: { code: "method_not_allowed" } }, 405, origin);
  if (Number(request.headers.get("content-length") || 0) > 2048) return reply({ error: { code: "payload_too_large" } }, 413, origin);
  let json: unknown; try { json = await request.json(); } catch { return reply({ error: { code: "invalid_json" } }, 400, origin); }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return reply({ error: { code: "invalid_input", fields: parsed.error.flatten().fieldErrors } }, 422, origin);
  try {
    const address = ViaCepResponse.safeParse(await fetchJson(new URL(`https://viacep.com.br/ws/${parsed.data.cep}/json/`), 5000));
    if (!address.success) return reply({ error: { code: "invalid_provider_response" } }, 502, origin);
    if (address.data.erro) return reply({ error: { code: "cep_not_found" } }, 404, origin);
    const data: Record<string, unknown> = { cep: address.data.cep || parsed.data.cep, logradouro: address.data.logradouro, complemento: address.data.complemento, bairro: address.data.bairro, localidade: address.data.localidade, uf: address.data.uf };
    if (parsed.data.target_slug === DINIZ_SLUG && parsed.data.address) {
      if (!/ribeir[aã]o preto/i.test(address.data.localidade)) return reply({ error: { code: "outside_service_city" } }, 422, origin);
      if (!/\d/.test(parsed.data.address)) return reply({ error: { code: "address_number_required" } }, 422, origin);
      const destination = await geocode(`${parsed.data.address}, CEP ${parsed.data.cep}, Brasil`);
      const route = await routeFromDiniz(destination); const distanceKm = route.distance / 1000;
      const billingDistance = Math.max(1, Math.ceil(distanceKm));
      if (billingDistance > 50) return reply({ error: { code: "outside_service_area" } }, 422, origin);
      data.delivery_quote = { zone_code: `diniz-auto-${billingDistance}km`, fee: Number((billingDistance * 1.25).toFixed(2)),
        distance_km: Number(distanceKm.toFixed(1)), billing_distance_km: billingDistance,
        duration_minutes: route.time == null ? null : Math.max(1, Math.round(route.time / 60)), provider: "geoapify" };
    }
    return reply({ data }, 200, origin);
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "AbortError";
    return reply({ error: { code: timeout ? "provider_timeout" : "provider_unavailable" } }, timeout ? 504 : 502, origin);
  }
}) };
