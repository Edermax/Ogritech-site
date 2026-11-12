/* In-app updates. Reads existing tenant-scoped orders; never changes an order. */
(() => {
    "use strict";
    const byId = id => document.getElementById(id);
    const button = byId("panelNotificationButton"), dialog = byId("panelNotificationDialog");
    if (!button || !dialog) return;
    const badge = byId("panelNotificationBadge"), status = byId("panelNotificationStatus");
    const refreshButton = byId("panelNotificationRefresh"), readAll = byId("panelNotificationReadAll");
    const states = { received: "Recebido", confirmed: "Confirmado", preparing: "Em preparo", ready: "Pronto para retirada", out_for_delivery: "Saiu para entrega", completed: "Concluído", rejected: "Recusado", cancelled: "Cancelado" };
    let context = null, orders = [], notices = [], reports = [], receipts = new Set(), storageKey = "";
    let generation = 0, timer = null, busy = false, updatedAt = 0, noticesAt = 0, orderError = false, noticesError = false, reportsError = false;
    const node = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
    const dateLabel = value => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
    const items = () => [...orders, ...reports, ...notices];
    function requestDeadline() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        return { signal: controller.signal, clear: () => clearTimeout(timeout) };
    }
    function saveRead() {
        if (!storageKey) return;
        try { localStorage.setItem(storageKey, JSON.stringify([...receipts].slice(-500))); } catch { /* Memory-only reading still works when storage is unavailable. */ }
    }
    function markRead(id) { receipts.delete(id); receipts.add(id); saveRead(); render(); }
    function renderList(id, entries, emptyText) {
        const list = byId(id); list.replaceChildren();
        if (!entries.length) { list.append(node("p", emptyText, "panel-notification-empty")); return; }
        for (const item of entries) {
            const row = node("button", "", "panel-notification-item" + (receipts.has(item.id) ? "" : " is-unread"));
            row.type = "button";
            row.append(node("strong", item.title), node("span", item.body), node("small", `${receipts.has(item.id) ? "Lida" : "Não lida"} · ${item.kind === "order" ? "Enviado em " : ""}${dateLabel(item.date)}`));
            row.addEventListener("click", () => { markRead(item.id); if (item.kind === "order") void openOrders(); if (item.kind === "report") { close(); void window.OgritechSalesReports?.open(item.reportId, context.businessId); } });
            list.append(row);
        }
    }
    function render() {
        const unread = items().filter(item => !receipts.has(item.id)).length;
        badge.textContent = unread > 99 ? "99+" : String(unread); badge.hidden = unread === 0;
        button.setAttribute("aria-label", unread ? `Abrir notificações: ${unread} não lidas` : "Abrir notificações");
        readAll.disabled = unread === 0;
        renderList("panelNotificationOrders", orders, orderError ? "Pedidos indisponíveis. Use Atualizar para tentar novamente." : updatedAt ? "Nenhum pedido recente para mostrar." : "Carregando pedidos...");
        renderList("panelNotificationNotices", notices, noticesError ? "Não foi possível consultar os comunicados. Tente atualizar." : "Nenhum comunicado da Ogritech no momento.");
        const reportSection = byId("panelNotificationReportsSection");
        if (reportSection) reportSection.hidden = !context?.canViewReports;
        if (byId("panelNotificationReports")) renderList("panelNotificationReports", reports, reportsError ? "Não foi possível consultar os relatórios. Use Atualizar para tentar novamente." : "Os resumos semanais e mensais aparecerão aqui após o encerramento de cada período.");
        if (byId("panelSalesReportList")) renderList("panelSalesReportList", context?.canViewReports ? reports : [], context?.canViewReports ? (reportsError ? "Não foi possível consultar os relatórios. Use Atualizar relatórios para tentar novamente." : "Os relatórios aparecerão aqui após o encerramento de cada semana ou mês.") : "Os relatórios estão disponíveis somente para a gestão do negócio.");
        status.textContent = orderError ? "Não foi possível atualizar os pedidos. As últimas informações foram preservadas. Tente atualizar."
            : updatedAt ? "Pedidos e comunicados recentes. Toque em um pedido para abrir o atendimento." : "Carregando atualizações...";
    }
    function setOrders(data, options = {}) {
        if (!context || options.businessId !== context.businessId) return;
        if (options.error) { orderError = true; render(); return; }
        if (!Array.isArray(data)) return;
        orders = data.filter(order => !order.is_test && typeof order.id === "string" && states[order.status] && Number.isFinite(Date.parse(order.created_at))).slice(0, 30).map(order => ({
            id: `order:${order.id}:${order.status}`, kind: "order", date: order.created_at,
            title: `Pedido #${order.order_number || String(order.public_reference || order.id).replace(/[^a-z0-9-]/gi, "").slice(0, 16)} · ${String(order.customer_name || "Cliente").slice(0,150)}`,
            body: `Telefone: ${String(order.customer_phone || "Não informado").slice(0,24)} · Valor: ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(order.total_amount || 0))} · ${states[order.status]}${order.fulfillment_type === "delivery" ? " · Entrega" : order.fulfillment_type === "pickup" ? " · Retirada" : ""}`
        }));
        updatedAt = Date.now(); orderError = false; render();
    }
    async function loadNotices(version) {
        if (version !== generation) return;
        noticesAt = Date.now();
        const deadline = requestDeadline();
        try {
            const response = await fetch("/platform-notices.json", { cache: "no-cache", signal: deadline.signal });
            if (!response.ok) throw new Error("notices_unavailable");
            const data = await response.json();
            if (!Array.isArray(data.notices)) throw new Error("invalid_notices");
            if (version !== generation) return;
            const now = Date.now();
            notices = data.notices.slice(0, 50).filter(item => item && typeof item.id === "string" && /^[a-z0-9_-]{1,80}$/i.test(item.id)
                && typeof item.title === "string" && item.title.length <= 160 && typeof item.body === "string" && item.body.length <= 2000
                && Number.isFinite(Date.parse(item.published_at)) && Date.parse(item.published_at) <= now
                && (!item.expires_at || Number.isFinite(Date.parse(item.expires_at)) && Date.parse(item.expires_at) > now))
                .map(item => ({ id: `notice:${item.id}:${item.published_at}`, kind: "notice", title: item.title, body: item.body, date: item.published_at }))
                .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
            noticesError = false;
        } catch { if (version === generation) noticesError = true; }
        finally { deadline.clear(); }
        if (version === generation) render();
    }
    async function loadReports(version) {
        if (!context?.canViewReports || !window.OgritechSalesReports) return;
        try {
            const data = await window.OgritechSalesReports.list(context.businessId);
            if (version !== generation) return;
            reports = data; reportsError = false;
        } catch { if (version === generation) reportsError = true; }
        if (version === generation) render();
    }
    async function refresh({ force = true } = {}) {
        if (!context || busy || document.visibilityState === "hidden" || !force && Date.now() - updatedAt < 25000) return;
        const version = generation, businessId = context.businessId;
        busy = true; refreshButton.disabled = true;
        const deadline = requestDeadline();
        try {
            const query = () => supabaseClient.from("menu_orders").select("id,public_reference,order_number,customer_name,customer_phone,total_amount,status,fulfillment_type,created_at,is_test")
                .eq("barbershop_id", businessId).eq("is_test", false).order("created_at", { ascending: false }).limit(30).abortSignal(deadline.signal);
            const { data, error } = await (typeof readPanelData === "function" ? readPanelData(query) : query());
            if (version === generation) setOrders(data, { businessId, error });
        } catch { if (version === generation) { orderError = true; render(); } }
        finally { deadline.clear(); if (version === generation) { busy = false; refreshButton.disabled = false; } }
    }
    function close() { if (dialog.open) dialog.close(); button.setAttribute("aria-expanded", "false"); }
    async function openOrders() {
        close();
        if (typeof showSection === "function") showSection("cardapio", { reload: false });
        document.querySelectorAll(".menu-item").forEach(link => link.classList.toggle("active", link.dataset.section === "cardapio"));
        await window.loadMenuAdmin?.();
        window.dispatchEvent(new CustomEvent("ogritech:menu-order-notification-opened"));
        window.scrollTo({ top: 0, behavior: "instant" });
    }
    function stop() {
        generation++; clearTimeout(timer); context = null; busy = false; orders = []; notices = []; reports = []; window.OgritechSalesReports?.stop(); receipts.clear(); updatedAt = 0; noticesAt = 0; storageKey = "";
        button.disabled = true; close(); render();
    }
    function start(next) {
        if (!next?.businessId) return;
        if (context?.businessId === next.businessId && context?.userId === next.userId && context?.environment === next.environment && context?.canViewReports === next.canViewReports) return;
        stop(); context = { ...next }; orderError = false; noticesError = false; reportsError = false;
        storageKey = next.userId ? `ogritech:notification-read:v1:${next.environment}:${next.businessId}:${next.userId}` : "";
        try { const saved = JSON.parse(localStorage.getItem(storageKey) || "[]"); if (Array.isArray(saved)) receipts = new Set(saved.filter(id => typeof id === "string" && id.length <= 200).slice(-500)); } catch { receipts = new Set(); }
        button.disabled = false; render(); void loadNotices(generation); void loadReports(generation);
        const version = generation;
        const poll = async () => {
            if (version !== generation) return;
            await refresh({ force: false });
            if (version !== generation) return;
            if (document.visibilityState !== "hidden" && Date.now() - noticesAt > 300000) { void loadNotices(version); void loadReports(version); }
            timer = setTimeout(poll, orderError ? 60000 : 30000);
        };
        timer = setTimeout(poll, 300);
    }
    button.addEventListener("click", () => {
        if (!dialog.open) dialog.showModal(); button.setAttribute("aria-expanded", "true");
        void refresh({ force: false });
    });
    byId("panelNotificationClose").addEventListener("click", close);
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("close", () => { button.setAttribute("aria-expanded", "false"); if (!button.disabled) button.focus(); });
    dialog.addEventListener("click", event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } });
    refreshButton.addEventListener("click", () => { void refresh(); void loadNotices(generation); void loadReports(generation); });
    readAll.addEventListener("click", () => { items().forEach(item => { receipts.delete(item.id); receipts.add(item.id); }); saveRead(); render(); });
    byId("panelNotificationHelp").addEventListener("click", () => { close(); document.getElementById("panelAssistantOpen")?.click(); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refresh({ force: false }); });
    window.addEventListener("focus", () => { void refresh({ force: false }); });
    window.addEventListener("storage", event => { if (storageKey && event.key === storageKey) { try { const value = JSON.parse(event.newValue || "[]"); if (Array.isArray(value)) receipts = new Set(value.filter(id => typeof id === "string").slice(-500)); } catch { return; } render(); } });
    window.OgritechPanelNotifications = { start, stop, refresh, setOrders, refreshReports: () => loadReports(generation) };
})();
