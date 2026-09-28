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

export function evaluateMetrics(metrics, thresholds = DEFAULT_THRESHOLDS, availability) {
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
    if (!availability.ok) failures.push(`Cardápio indisponível (HTTP ${availability.status || "sem resposta"})`);
    else if (availability.latency_ms > thresholds.menuAvailabilityMs) {
      failures.push(`Cardápio respondeu em ${availability.latency_ms} ms`);
    }
  }
  return failures;
}

export function normalizeResult(payload) {
  if (payload?.error) throw new Error(`Supabase Logs API: ${payload.error}`);
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
    const value = Number(row[key] ?? 0);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Métrica inválida: ${key}`);
    metrics[key] = value;
  }
  return metrics;
}

export function buildQuery(windowMinutes = 20) {
  return `select
    countIf(source in ('edge_logs', 'function_edge_logs')) as edge_log_count,
    countIf(source = 'auth_logs') as auth_log_count,
    countIf(source in ('edge_logs', 'function_edge_logs') and toInt32OrZero(log_attributes['response.status_code']) between 500 and 599) as server_errors,
    countIf(source in ('edge_logs', 'function_edge_logs') and toInt32OrZero(log_attributes['response.status_code']) = 429) as rate_limited,
    countIf(source = 'auth_logs' and (toInt32OrZero(log_attributes['response.status_code']) >= 400 or match(lower(event_message), 'invalid|failed|error|unauthorized'))) as auth_failures,
    countIf(source = 'edge_logs' and match(lower(concat(toString(log_attributes['request.path']), ' ', event_message)), 'public_create_menu_order(_v2)?')) as menu_order_attempts,
    countIf(source = 'edge_logs' and match(lower(concat(toString(log_attributes['request.path']), ' ', event_message)), 'public_create_menu_order(_v2)?') and toInt32OrZero(log_attributes['response.status_code']) >= 400) as menu_order_failures,
    quantileIf(0.95)(if(source = 'edge_logs', toFloat64OrZero(log_attributes['response.origin_time']), toFloat64OrZero(log_attributes['execution_time_ms'])), (source = 'edge_logs' and toFloat64OrZero(log_attributes['response.origin_time']) > 0) or (source = 'function_edge_logs' and toFloat64OrZero(log_attributes['execution_time_ms']) > 0)) as latency_p95_ms,
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
  return {
    ok: response.ok,
    status: response.status,
    latency_ms: Date.now() - startedAt
  };
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const menuHealthUrl = process.env.MENU_HEALTH_URL;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN não configurado");
  if (!projectRef) throw new Error("SUPABASE_PROJECT_REF não configurado");

  const end = new Date();
  const windowMinutes = Number(process.env.MONITOR_WINDOW_MINUTES || 20);
  const start = new Date(end.getTime() - windowMinutes * 60_000);
  const url = new URL(`${API_BASE}/projects/${projectRef}/analytics/endpoints/logs`);
  url.searchParams.set("iso_timestamp_start", start.toISOString());
  url.searchParams.set("iso_timestamp_end", end.toISOString());
  url.searchParams.set("sql", buildQuery(windowMinutes));

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Supabase Logs API respondeu HTTP ${response.status}`);
  const metrics = normalizeResult(await response.json());
  const availability = await checkMenuAvailability(menuHealthUrl);
  const failures = evaluateMetrics(metrics, DEFAULT_THRESHOLDS, availability);
  const report = { checked_at: end.toISOString(), window_minutes: windowMinutes, metrics, availability, failures };
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

if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}`) {
  main().catch((error) => {
    console.error(`::error title=Falha no monitor de produção::${error.message}`);
    process.exitCode = 1;
  });
}
