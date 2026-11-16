/* Server-backed inbox. Start only after the administrator's session is validated. */
(() => {
  const $ = id => document.getElementById(id);
  const routes = { users: "#users", businesses: "#businesses", support: "#support" };
  let started = false, busy = false, timer, items = [], unread = 0, latestId = null, nextBefore = null;
  let generation = 0;
  let pendingRead;
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    return node;
  };

  function drainRead() {
    if (!started || busy || pendingRead === undefined) return;
    const id = pendingRead;
    pendingRead = undefined;
    void markRead(id);
  }

  function render() {
    const badge = $("adminNotificationsBadge");
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.hidden = unread === 0;
    $("adminNotificationsOpen").setAttribute("aria-label", `Notificações: ${unread} não lida${unread === 1 ? "" : "s"}`);
    $("adminNotificationsReadAll").disabled = !unread || busy;
    $("adminNotificationsMore").hidden = !nextBefore;
    const list = $("adminNotificationsList");
    const focusedId = document.activeElement?.dataset.notificationId;
    const focusedAction = document.activeElement?.dataset.notificationAction;
    list.replaceChildren(...items.map(item => {
      const row = element("li");
      row.dataset.unread = String(!item.read_at);
      const link = element("a", item.title);
      link.href = routes[item.destination] || "#overview";
      link.dataset.notificationId = item.id;
      link.dataset.notificationAction = "open";
      const time = element("time", new Date(item.created_at).toLocaleString("pt-BR"));
      time.dateTime = item.created_at;
      row.append(link, element("p", item.body), time);
      if (!item.read_at) {
        const button = element("button", "Marcar como lida");
        button.type = "button";
        button.className = "outline-cyan-button";
        button.dataset.notificationId = item.id;
        button.dataset.notificationAction = "read";
        button.disabled = busy;
        row.append(button);
      }
      return row;
    }));
    if (focusedId) {
      const controls = [...list.querySelectorAll("[data-notification-id]")];
      (controls.find(node => node.dataset.notificationId === focusedId && node.dataset.notificationAction === focusedAction)
        || controls.find(node => node.dataset.notificationId === focusedId))?.focus({ preventScroll: true });
    }
  }

  async function refresh(older = false) {
    if (!started || busy || (older && !nextBefore)) return;
    busy = true;
    const current = generation;
    $("adminNotificationsRefresh").disabled = true;
    $("adminNotificationsMore").disabled = true;
    $("adminNotificationsReadAll").disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc("platform_notification_inbox", {
        page_size: 30, before_id: older ? nextBefore : null
      });
      if (current !== generation) return;
      if (error || !Array.isArray(data?.items)) throw new Error("inbox unavailable");
      const byId = new Map(items.map(item => [item.id, item]));
      const hasNew = data.items.some(item => !byId.has(item.id));
      for (const item of data.items) byId.set(item.id, item);
      items = [...byId.values()].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1);
      unread = data.unread_count;
      latestId = data.latest_id;
      if (older || hasNew || items.length <= 30) nextBefore = data.next_before_id;
      $("adminNotificationsMessage").textContent = items.length ? "" : "Nenhuma notificação por enquanto.";
      if (unread) $("adminNotificationsAnnouncement").textContent = `Você tem ${unread} ${unread === 1 ? "notificação não lida" : "notificações não lidas"}. Abra o sino para conferir.`;
      else if (!unread) $("adminNotificationsAnnouncement").textContent = "";
    } catch {
      if (current !== generation) return;
      $("adminNotificationsMessage").textContent = "Não foi possível atualizar as notificações. Tente novamente.";
      $("adminNotificationsAnnouncement").textContent = "Notificações temporariamente indisponíveis. Abra o sino para tentar novamente.";
    } finally {
      if (current === generation) {
        busy = false;
        $("adminNotificationsRefresh").disabled = false;
        $("adminNotificationsMore").disabled = false;
        render();
        drainRead();
      }
    }
  }

  async function markRead(id = null) {
    if (!started || !latestId) return;
    if (busy) { pendingRead = id; return; }
    const current = generation;
    let saved = false;
    busy = true;
    render();
    $("adminNotificationsRefresh").disabled = true;
    $("adminNotificationsMore").disabled = true;
    try {
      const { error } = await supabaseClient.rpc("platform_mark_notifications_read", {
        through_id: latestId, notification_id: id
      });
      if (current !== generation) return;
      if (error) throw error;
      for (const item of items) if (!id || item.id === id) item.read_at = new Date().toISOString();
      $("adminNotificationsMessage").textContent = "";
      saved = true;
    } catch {
      if (current === generation) $("adminNotificationsMessage").textContent = "Não foi possível marcar como lida. Tente novamente.";
    } finally {
      if (current === generation) {
        busy = false;
        $("adminNotificationsRefresh").disabled = false;
        $("adminNotificationsMore").disabled = false;
        render();
      }
    }
    if (saved && current === generation) await refresh();
    else if (current === generation) drainRead();
  }

  function stop() {
    started = false; busy = false; generation++;
    clearInterval(timer);
    items = []; unread = 0; latestId = null; nextBefore = null;
    pendingRead = undefined;
    $("adminNotificationsDialog").close();
    $("adminNotificationsOpen").disabled = true;
    $("adminNotificationsAnnouncement").textContent = "";
    render();
  }

  function initialize() {
    if (started) return;
    started = true;
    $("adminNotificationsOpen").disabled = false;
    void refresh();
    timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
  }

  $("adminNotificationsOpen").addEventListener("click", () => { $("adminNotificationsDialog").showModal(); void refresh(); });
  $("adminNotificationsClose").addEventListener("click", () => $("adminNotificationsDialog").close());
  $("adminNotificationsRefresh").addEventListener("click", () => { void refresh(); });
  $("adminNotificationsMore").addEventListener("click", () => { void refresh(true); });
  $("adminNotificationsReadAll").addEventListener("click", () => { void markRead(); });
  $("adminNotificationsList").addEventListener("click", event => {
    const control = event.target.closest("[data-notification-id]");
    if (!control || control.disabled) return;
    if (control.dataset.notificationAction === "open") {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      $("adminNotificationsDialog").close();
    }
    void markRead(control.dataset.notificationId);
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refresh(); });
  window.addEventListener("online", () => { void refresh(); });
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  window.OgritechAdminNotifications = { initialize, refresh: () => refresh(), stop };
})();
