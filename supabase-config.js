/* Configuração pública do Supabase para o navegador. */
const OGRITECH_ENVIRONMENTS = Object.freeze({
    local: Object.freeze({
        url: "http://127.0.0.1:54321",
        publishableKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
    }),
    staging: Object.freeze({
        url: "https://fuesdztsvrkkgnbqhcxi.supabase.co",
        publishableKey: "sb_publishable_CxrxTe7nMD4MBxMcZwQmxA_HHzDpYHv"
    }),
    production: Object.freeze({
        url: "https://mvzcoaiiwytycdqcvydf.supabase.co",
        publishableKey: "sb_publishable_Mv7A4NxC6zr1s7Ob1ROEUw_Au212ibY"
    })
});

const OGRITECH_ENV_STORAGE_KEY = "ogritechEnvironment";
const OGRITECH_VALID_ENVIRONMENTS = new Set(Object.keys(OGRITECH_ENVIRONMENTS));
const IS_LOCAL_HOST = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const REQUESTED_OGRITECH_ENV = new URLSearchParams(window.location.search).get("env");

let storedOgritechEnvironment = null;
try {
    if (OGRITECH_VALID_ENVIRONMENTS.has(REQUESTED_OGRITECH_ENV)) {
        sessionStorage.setItem(OGRITECH_ENV_STORAGE_KEY, REQUESTED_OGRITECH_ENV);
        storedOgritechEnvironment = REQUESTED_OGRITECH_ENV;
    } else {
        const storedValue = sessionStorage.getItem(OGRITECH_ENV_STORAGE_KEY);
        if (OGRITECH_VALID_ENVIRONMENTS.has(storedValue)) storedOgritechEnvironment = storedValue;
    }
} catch {
    // Alguns modos de privacidade bloqueiam sessionStorage; a seleção atual ainda funciona.
}

const OGRITECH_ENV = OGRITECH_VALID_ENVIRONMENTS.has(REQUESTED_OGRITECH_ENV)
    ? REQUESTED_OGRITECH_ENV
    : (storedOgritechEnvironment || (IS_LOCAL_HOST ? "local" : "production"));
const OGRITECH_SUPABASE = OGRITECH_ENVIRONMENTS[OGRITECH_ENV];

window.OGRITECH_ENV = OGRITECH_ENV;
window.OGRITECH_SUPABASE_URL = OGRITECH_SUPABASE.url;
window.OGRITECH_SUPABASE_PUBLISHABLE_KEY = OGRITECH_SUPABASE.publishableKey;
window.ogritechEnvironmentUrl = (path) => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const target = new URL(normalizedPath, new URL("/", window.location.href));
    if (OGRITECH_ENV !== "production") target.searchParams.set("env", OGRITECH_ENV);
    return target.href;
};

const supabaseClient = window.supabase.createClient(
    OGRITECH_SUPABASE.url,
    OGRITECH_SUPABASE.publishableKey
);

if (OGRITECH_ENV === "staging") {
    const showStagingBadge = () => {
        if (document.getElementById("ogritechStagingBadge")) return;
        const badge = document.createElement("div");
        badge.id = "ogritechStagingBadge";
        const isPrivatePilot = new URLSearchParams(window.location.search).get("pilot") === "private";
        badge.textContent = isPrivatePilot ? "STAGING — PILOTO PRIVADO" : "STAGING — DADOS DE TESTE";
        badge.setAttribute("role", "status");
        badge.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:8px 12px;border-radius:999px;background:#b45309;color:#fff;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 4px 16px #0005;pointer-events:none";
        document.body.appendChild(badge);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showStagingBadge, { once: true });
    else showStagingBadge();
}
