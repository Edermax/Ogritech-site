(() => {
  const cards = [...document.querySelectorAll("[data-order-notifications]")];
  if (!cards.length) return;
  let businessId = null, configuration = null, registration = null, subscription = null;
  let enabled = false, busy = false, initialized = null, stopped = false;
  const supported = window.isSecureContext && "Notification" in window && "PushManager" in window && "serviceWorker" in navigator;
  const installed = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  const environment = ["local", "staging", "production"].includes(window.OGRITECH_ENV) ? window.OGRITECH_ENV : "production";

  function render(message) {
    for (const card of cards) {
      const button = card.querySelector("[data-push-enable]");
      button.textContent = busy ? "Aguarde..." : enabled ? "Desativar neste dispositivo" : "Ativar neste dispositivo";
      button.disabled = busy || !configuration?.available || !supported || ios && !installed || !enabled && Notification.permission === "denied";
      button.setAttribute("aria-pressed", String(enabled));
      card.querySelector("[data-push-status]").textContent = message;
    }
  }

  async function api(action, endpoint) {
    const body = action === "config" ? { action } : { action, barbershop_id: businessId, endpoint };
    const { data, error } = await supabaseClient.functions.invoke("menu-order-notifications", { body });
    if (error || data?.error || !data?.data) throw new Error(data?.error?.code || "request_failed");
    return data.data;
  }

  async function workerContext(active) {
    if (!registration?.active) return;
    const channel = new MessageChannel();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error("worker_unavailable")); }, 5000);
      channel.port1.onmessage = event => {
        clearTimeout(timer); channel.port1.close();
        if (event.data?.ok) resolve(); else reject(new Error("worker_unavailable"));
      };
      registration.active.postMessage({ type: "menu-order-push-context", enabled: active, environment }, [channel.port2]);
    });
  }

  async function readyWorker() {
    const worker = await navigator.serviceWorker.register("/sw.js?v=20261114.1", { scope: "/", updateViaCache: "none" });
    await worker.update();
    const installing = worker.installing;
    if (installing) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { installing.removeEventListener("statechange", changed); reject(new Error("worker_unavailable")); }, 12000);
      const changed = () => {
        if (installing.state !== "activated" && installing.state !== "redundant") return;
        clearTimeout(timer); installing.removeEventListener("statechange", changed);
        if (installing.state === "activated") resolve(); else reject(new Error("worker_unavailable"));
      };
      installing.addEventListener("statechange", changed); changed();
    });
    if (!worker.active) throw new Error("worker_unavailable");
    return worker;
  }

  async function initialize(id) {
    if (businessId === id && initialized) return initialized;
    businessId = id;
    stopped = false;
    initialized = (async () => {
      if (ios && !installed) return render("No iPhone ou iPad, adicione a Ogritech à Tela de Início pelo Safari e abra pelo ícone para ativar os avisos.");
      if (!supported) return render("Este navegador não oferece notificações de pedidos. Você pode acompanhar os pedidos no painel.");
      if (Notification.permission === "denied") return render("As notificações estão bloqueadas. Libere a permissão nas configurações do navegador para ativar neste dispositivo.");
      render("Verificando as notificações deste dispositivo...");
      try {
        configuration = await api("config");
        if (!configuration.available) return render("As notificações ainda não estão disponíveis. Os pedidos continuam acessíveis no painel.");
        registration = await readyWorker();
        subscription = await registration.pushManager.getSubscription();
        enabled = subscription ? (await api("status", subscription.endpoint)).enabled === true : false;
        // Never retain a previous account's opt-in on a shared browser.
        await workerContext(enabled);
        if (subscription && !enabled) {
          await subscription.unsubscribe();
          subscription = null;
        }
        let preferred = false;
        try { preferred = Number(localStorage.getItem("ogritechOrderPushInterest")) > Date.now() - 86400000; } catch { /* Optional preference. */ }
        render(enabled ? "Ativadas neste dispositivo. Você receberá um aviso quando chegar um pedido." : preferred ? "Você escolheu receber avisos. Toque em Ativar neste dispositivo para confirmar a permissão." : "Receba um aviso quando chegar um pedido, mesmo com o painel fechado, nos dispositivos compatíveis.");
      } catch {
        configuration = null;
        render("Não foi possível verificar as notificações. Atualize a página para tentar novamente.");
      }
    })();
    return initialized;
  }

  async function disable() {
    // Server opt-out must succeed before presenting the device as disabled.
    if (subscription) await api("disable", subscription.endpoint);
    enabled = false;
    await workerContext(false);
    if (subscription) await subscription.unsubscribe();
    subscription = null;
  }

  async function toggle() {
    if (busy || !configuration?.available || !supported) return;
    // Request permission before any await, preserving Safari's user gesture.
    const permission = !enabled && Notification.permission === "default" ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    busy = true; render("Aguarde...");
    try {
      if (enabled) {
        await disable();
        render("Desativadas neste dispositivo. Os pedidos continuam acessíveis no painel.");
        return;
      }
      if (await permission !== "granted") {
        render(Notification.permission === "denied" ? "Permissão bloqueada. Você pode liberá-la nas configurações do navegador." : "A permissão não foi concedida. Você pode ativar os avisos quando quiser.");
        return;
      }
      if (stopped) return;
      const key = configuration.public_key;
      const bytes = Uint8Array.from(atob(key.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(key.length / 4) * 4, "=")), char => char.charCodeAt(0));
      const previousKey = subscription?.options?.applicationServerKey;
      if (subscription && (!previousKey || !bytes.every((value, index) => new Uint8Array(previousKey)[index] === value))) {
        await api("disable", subscription.endpoint);
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ||= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      if (stopped) throw new Error("signed_out");
      const activatingSubscription = subscription;
      await workerContext(true);
      await api("enable", subscription.endpoint);
      if (stopped) {
        await api("disable", activatingSubscription.endpoint);
        await activatingSubscription.unsubscribe();
        await disable();
        return;
      }
      enabled = true;
      try { localStorage.removeItem("ogritechOrderPushInterest"); } catch { /* Optional preference. */ }
      render("Ativadas neste dispositivo. Você receberá um aviso quando chegar um pedido.");
    } catch {
      if (!enabled && subscription) {
        try { await subscription.unsubscribe(); await workerContext(false); } catch { /* Retry on the next explicit action. */ }
        subscription = null;
      }
      render("Não foi possível concluir. Confira a conexão e tente novamente.");
    } finally {
      busy = false;
      render(cards[0].querySelector("[data-push-status]").textContent);
    }
  }

  async function disconnect() {
    stopped = true;
    try {
      registration ||= await navigator.serviceWorker.getRegistration("/");
      subscription ||= await registration?.pushManager.getSubscription();
    } catch { /* A missing registration already has no active delivery. */ }
    try { await workerContext(false); } catch { /* Subscription removal is the final local opt-out. */ }
    try { await subscription?.unsubscribe(); } catch { /* Expired subscriptions are deactivated by the dispatcher. */ }
    try {
      if (subscription) await Promise.race([api("disable", subscription.endpoint), new Promise(resolve => setTimeout(resolve, 2000))]);
    } catch { /* Local unsubscribe still prevents delivery after logout. */ }
    enabled = false; subscription = null;
  }
  for (const card of cards) card.querySelector("[data-push-enable]").addEventListener("click", toggle);
  navigator.serviceWorker?.addEventListener("message", event => {
    if (event.data?.type === "menu-order-notification-opened") window.dispatchEvent(new CustomEvent("ogritech:menu-order-notification-opened"));
  });
  window.OgritechOrderNotifications = { initialize, disconnect };
})();
