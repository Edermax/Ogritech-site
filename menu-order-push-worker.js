const ORDER_PUSH_CACHE = "ogritech-order-push-context-v1";
const ORDER_PUSH_CONTEXT = new URL("/__ogritech_order_push_context", self.location.origin).href;

self.addEventListener("message", event => {
  if (event.data?.type !== "menu-order-push-context") return;
  const environment = event.data.environment;
  if (!["local", "staging", "production"].includes(environment) || typeof event.data.enabled !== "boolean") return;
  event.waitUntil(caches.open(ORDER_PUSH_CACHE).then(cache => cache.put(ORDER_PUSH_CONTEXT,
    Response.json({ enabled: event.data.enabled, environment })))
    .then(() => event.ports[0]?.postMessage({ ok: true }))
    .catch(() => event.ports[0]?.postMessage({ ok: false })));
});

self.addEventListener("push", event => {
  event.waitUntil((async () => {
    const response = await caches.match(ORDER_PUSH_CONTEXT);
    const context = response ? await response.json() : null;
    if (!context?.enabled) return;
    await self.registration.showNotification("Novo pedido no seu cardápio", {
      body: "Abra o painel Ogritech para conferir e atender o pedido.",
      icon: "/ogritech-app-192.png", badge: "/ogritech-brand-symbol.png",
      tag: "ogritech-new-menu-order", data: { environment: context.environment }
    });
  })());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const environment = event.notification.data?.environment;
    const target = new URL("/painel/", self.location.origin);
    target.searchParams.set("env", ["local", "staging", "production"].includes(environment) ? environment : "production");
    target.searchParams.set("notificacoes", "pedidos");
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const panel = clients.find(client => {
      const url = new URL(client.url);
      return url.origin === target.origin && url.pathname.startsWith("/painel/") && url.searchParams.get("env") === target.searchParams.get("env");
    });
    if (panel) { await panel.focus(); panel.postMessage({ type: "menu-order-notification-opened" }); }
    else await self.clients.openWindow(target.href);
  })());
});
