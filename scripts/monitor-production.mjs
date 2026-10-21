import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const API_BASE = "https://api.supabase.com/v1";

export const DEFAULT_THRESHOLDS = Object.freeze({
  serverErrors: 1,
  rateLimited: 5,
  authFailures: 5,
  menuOrderFailures: 1,
  latencyP95Ms: 1500,
  minLatencySamples: 20,
  menuAvailabilityMs: 3000
});

export function evaluateMetrics(metrics, thresholds = DEFAULT_THRESHOLDS, availability, billingReadiness, menuBackend) {
  const failures = [];
  if (metrics.server_errors >= thresholds.serverErrors) {
    failures.push(`${metrics.server_errors} resposta(s) 5xx`);
  }
  if (metrics.rate_limited >= thresholds.rateLimited) {
    failures.push(`${metrics.rate_limited} resposta(s) 429`);
  }
  if (metrics.auth_failures >= thresholds.authFailures) {
    failures.push(`${metrics.auth_failures} falha(s) de autenticação`);
  }
  if (metrics.menu_order_failures >= thresholds.menuOrderFailures) {
    failures.push(`${metrics.menu_order_failures} falha(s) na criação de pedido do Cardápio`);
  }
  if (
    metrics.latency_samples >= thresholds.minLatencySamples &&
    metrics.latency_p95_ms > thresholds.latencyP95Ms
  ) {
    failures.push(`latência p95 de ${Math.round(metrics.latency_p95_ms)} ms`);
  }
  if (availability) {
    if (!availability.ok) failures.push(`Cardápio indisponível (${availability.code || `HTTP ${availability.status || "sem resposta"}`})`);
    else if (availability.latency_ms > thresholds.menuAvailabilityMs) {
      failures.push(`Cardápio respondeu em ${availability.latency_ms} ms`);
    }
  }
  if (billingReadiness && !billingReadiness.ok) failures.push(`Contratação do Cardápio indisponível (${billingReadiness.code || billingReadiness.status})`);
  if (menuBackend && !menuBackend.ok) failures.push(`Catálogo do Cardápio indisponível (${menuBackend.code || menuBackend.status || "sem resposta"})`);
  return failures;
}

// Only the public publishable key is accepted here. Administrative credentials
// belong exclusively to the telemetry request and must never reach public probes.
export async function checkMenuBackend(projectRef, publishableKey, menuUrl, fetchImpl = fetch) {
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("Projeto Supabase inválido");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey || "")) throw new Error("Chave pública do monitor não configurada");
  const target = new URL(menuUrl);
  if (target.protocol !== "https:") throw new Error("MENU_HEALTH_URL deve usar HTTPS");
  const slug = target.searchParams.get("empresa");
  if (!slug || !/^[a-z0-9-]{1,120}$/.test(slug)) throw new Error("MENU_HEALTH_URL precisa identificar o cardápio em empresa");
  const response = await fetchImpl(`https://${projectRef}.supabase.co/rest/v1/rpc/public_menu`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
    headers: { apikey: publishableKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ target_slug: slug })
  });
  const body = await response.json().catch(() => null);
  const valid = body?.menu?.slug === slug && typeof body.menu.title === "string" && Array.isArray(body.categories);
  return { ok: response.ok && valid, status: response.status,
    code: response.ok ? (valid ? null : "invalid_menu_response") : "public_menu_unavailable" };
}

// Probe failures remain visible even when another service or telemetry is down.
// Do not include exception messages: providers may embed credentials or bodies.
export async function collectReport({ telemetry, availability, billingReadiness, menuBackend, windowMinutes = 20 }) {
  const results = await Promise.allSettled([telemetry, availability, billingReadiness, menuBackend].map((probe) => Promise.resolve().then(probe)));
  const unavailable = { ok: false, status: null, code: "probe_failed" };
  const metrics = results[0].status === "fulfilled" ? results[0].value : null;
  const probes = results.slice(1).map((result) => result.status === "fulfilled" ? result.value : { ...unavailable });
  const failures = evaluateMetrics(metrics || {}, DEFAULT_THRESHOLDS, ...probes);
  if (!metrics) failures.unshift("Telemetria indisponível; recuperação não confirmada");
  return { checked_at: new Date().toISOString(), window_minutes: windowMinutes, metrics,
    availability: probes[0], billing_readiness: probes[1], menu_backend: probes[2], failures };
}

export async function checkMenuBillingReadiness(url, fetchImpl = fetch) {
  const target = new URL(url);
  if (target.protocol !== "https:") throw new Error("Billing readiness deve usar HTTPS");
  const response = await fetchImpl(target, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ action: "trial_readiness", product: "menu" }) });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok && body.data?.ready === true && body.data?.product === "menu", status: response.status,
    code: typeof body.error?.code === "string" ? body.error.code : null };
}

export function normalizeResult(payload) {
  if (payload?.error) throw new Error("Supabase Logs API retornou erro");
  const row = payload?.result?.[0];
  if (!row) throw new Error("Supabase Logs API não retornou métricas");
  const metrics = {};
  for (const key of [
    "edge_log_count",
    "auth_log_count",
    "server_errors",
    "rate_limited",
    "auth_failures",
    "menu_order_attempts",
    "menu_order_failures",
    "latency_p95_ms",
    "latency_samples"
  ]) {
    if (row[key] === undefined || row[key] === null || row[key] === "") throw new Error(`Métrica ausente: ${key}`);
    const value = Number(row[key]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Métrica inválida: ${key}`);
    metrics[key] = value;
  }
  return metrics;
}

export function buildQuery(windowMinutes = 20) {
  if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > 1440) throw new Error("Janela do monitor deve ser de 1 a 1440 minutos");
  return `select
    countIf(source in ('edge_logs', 'function_edge_logs')) as edge_log_count,
    countIf(source = 'auth_logs') as auth_log_count,
    countIf(source in ('edge_logs', 'function_edge_logs') and toInt32OrZero(log_attributes['response.status_code']) between 500 and 599) as server_errors,
    countIf(source in ('edge_logs', 'function_edge_logs') and toInt32OrZero(log_attributes['response.status_code']) = 429) as rate_limited,
    countIf(source = 'auth_logs' and (toInt32OrZero(log_attributes['response.status_code']) >= 400 or match(lower(event_message), 'invalid|failed|error|unauthorized'))) as auth_failures,
    countIf(source = 'edge_logs' and match(lower(concat(toString(log_attributes['request.path']), ' ', event_message)), 'public_create_menu_order(_v2)?')) as menu_order_attempts,
    countIf(source = 'edge_logs' and match(lower(concat(toString(log_attributes['request.path']), ' ', event_message)), 'public_create_menu_order(_v2)?') and toInt32OrZero(log_attributes['response.status_code']) >= 400) as menu_order_failures,
    ifNotFinite(quantileIf(0.95)(if(source = 'edge_logs', toFloat64OrZero(log_attributes['response.origin_time']), toFloat64OrZero(log_attributes['execution_time_ms'])), (source = 'edge_logs' and toFloat64OrZero(log_attributes['response.origin_time']) > 0) or (source = 'function_edge_logs' and toFloat64OrZero(log_attributes['execution_time_ms']) > 0)), 0) as latency_p95_ms,
    countIf((source = 'edge_logs' and toFloat64OrZero(log_attributes['response.origin_time']) > 0) or (source = 'function_edge_logs' and toFloat64OrZero(log_attributes['execution_time_ms']) > 0)) as latency_samples
  from logs
  where timestamp >= now() - interval ${windowMinutes} minute`;
}

export async function checkMenuAvailability(url, fetchImpl = fetch, timeoutMs = 5000) {
  if (!url) throw new Error("MENU_HEALTH_URL não configurada");
  const target = new URL(url);
  if (target.protocol !== "https:") throw new Error("MENU_HEALTH_URL deve usar HTTPS");
  const startedAt = Date.now();
  const response = await fetchImpl(target, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Accept: "text/html,application/json;q=0.9" }
  });
  const html = await response.text();
  const validShell = /\bid=["']catalog["']/.test(html) && /\bsrc=["'][^"']*cardapio\.js(?:[?][^"']*)?["']/.test(html);
  return {
    ok: response.ok && validShell,
    status: response.status,
    code: response.ok && !validShell ? "invalid_menu_page" : null,
    latency_ms: Date.now() - startedAt
  };
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const menuHealthUrl = process.env.MENU_HEALTH_URL;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN não configurado");
  if (!projectRef) throw new Error("SUPABASE_PROJECT_REF não configurado");
  if (!/^[a-z]{20}$/.test(projectRef)) throw new Error("SUPABASE_PROJECT_REF inválido");

  const end = new Date();
  const windowMinutes = Number(process.env.MONITOR_WINDOW_MINUTES || 20);
  const start = new Date(end.getTime() - windowMinutes * 60_000);
  const url = new URL(`${API_BASE}/projects/${projectRef}/analytics/endpoints/logs`);
  url.searchParams.set("iso_timestamp_start", start.toISOString());
  url.searchParams.set("iso_timestamp_end", end.toISOString());
  url.searchParams.set("sql", buildQuery(windowMinutes));

  const report = await collectReport({ windowMinutes,
    telemetry: async () => {
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
      if (!response.ok) throw new Error(`Supabase Logs API respondeu HTTP ${response.status}`);
      return normalizeResult(await response.json());
    },
    availability: () => checkMenuAvailability(menuHealthUrl),
    billingReadiness: () => checkMenuBillingReadiness(`https://${projectRef}.supabase.co/functions/v1/ogritech-billing`),
    menuBackend: () => checkMenuBackend(projectRef, process.env.MENU_HEALTH_PUBLISHABLE_KEY, menuHealthUrl)
  });
  const { failures } = report;
  console.log(JSON.stringify(report, null, 2));

  if (process.env.GITHUB_OUTPUT) {
    const fs = await import("node:fs/promises");
    await fs.appendFile(process.env.GITHUB_OUTPUT, `report=${JSON.stringify(report)}\n`);
  }
  if (failures.length) {
    console.error(`::error title=Alerta de produção Ogritech::${failures.join("; ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error("::error title=Falha no monitor de produção::Configuração ou execução inválida; recuperação não confirmada.");
    process.exitCode = 1;
  });
}
