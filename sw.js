const CACHE_NAME = "ogritech-shell-v12";
const APP_SHELL = [
  "./", "./login/", "./painel/", "./login.html", "./cliente.html", "./style.css",
  "./auth.js", "./script.js", "./commercial-admin.js", "./cliente.js", "./login.js", "./business-config.js",
  "./supabase-config.js", "./pwa.js", "./pwa.css", "./manifest.webmanifest",
  "./ogritech-brand-symbol.png", "./ogritech-favicon.ico",
  "./home.css", "./home.js", "./commercial-public.css",
  "./agendar/", "./agendar/agendar.css", "./agendar/agendar-enhancements.css", "./agendar/agendar.js",
  "./pagina/", "./pagina/pagina.js", "./cardapio/", "./cardapio/cardapio.js",
  "./proposta/", "./proposta/proposta.js", "./pedido/", "./pedido/pedido.js",
  "./ogritech-header-logo.png", "./instagram.png", "./linkedin.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => {
      const url = new URL(event.request.url);
      const exact = await caches.match(event.request);
      if (exact) return exact;
      if (url.pathname.startsWith("/agendar/")) return caches.match("./agendar/");
      if (url.pathname.startsWith("/painel/")) return caches.match("./painel/");
      if (url.pathname.startsWith("/login/")) return caches.match("./login/");
      return caches.match("./");
    }));
    return;
  }

  const destination = event.request.destination;
  const needsFreshCode = ["script", "style", "document"].includes(destination);

  if (needsFreshCode) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
