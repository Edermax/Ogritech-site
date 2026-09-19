/* =========================================================
   OGRITECH - PAINEL DA BARBEARIA
   ETAPA 5: Agenda integrada.

   Nesta etapa:
   - cliente cria um horário;
   - funcionário visualiza sua própria agenda;
   - proprietário visualiza todos os profissionais;
   - proprietário/funcionário alteram o status;
   - horários ocupados não podem ser duplicados.

   Contas reais usam Supabase; localStorage fica restrito às demonstrações.
   ========================================================= */

// =========================================================
// 1. CHAVES DE ARMAZENAMENTO
// =========================================================
const BARBERSHOP_ID = sessionStorage.getItem("japaBarbershopId");
const CLIENTS_STORAGE_KEY = `japaNaBarbaClients:${BARBERSHOP_ID}`;
const APPOINTMENTS_STORAGE_KEY = `japaNaBarbaAppointments:${BARBERSHOP_ID}`;
const SERVICES_STORAGE_KEY = `ogritechServices:${BARBERSHOP_ID}`;
const PROFESSIONALS_STORAGE_KEY = `ogritechProfessionals:${BARBERSHOP_ID}`;
const AVAILABILITY_STORAGE_KEY = `ogritechAvailability:${BARBERSHOP_ID}`;
const FINANCIAL_STORAGE_KEY = `ogritechFinancial:${BARBERSHOP_ID}`;
const SETTINGS_STORAGE_KEY = `ogritechSettings:${BARBERSHOP_ID}`;
const IS_DEMO = sessionStorage.getItem("japaDemo") === "true";
let appointmentsCache = [];
let clientsCache = [];
let remoteAppointmentIds = new Set();
let remoteClientIds = new Set();
let privacyRequestsCache = [];
let servicesCache = [];
let professionalsCache = [];
let employeeServicesCache = [];
let workingHoursCache = [];
let timeOffCache = [];
let appointmentNotificationsCache = [];
let availabilityDraftTimeOff = [];
let financialCache = [];
let businessSettingsCache = {};
let publicBookingSettingsCache = {};
let planCapacityCache = { plan: "Demonstração", max_users: 10, max_professionals: 10, max_services: null, active_users: 1, active_professionals: 0, active_services: 0 };

// =========================================================
// 2. SESSÃO ATUAL
// =========================================================
const currentRole = sessionStorage.getItem("japaRole") || "owner";
const currentUserName = sessionStorage.getItem("japaUserName") || "Administrador";
const businessConfig = window.getOgritechBusiness();
if (!IS_DEMO) {
    businessConfig.revenue = 0;
    businessConfig.ticket = 0;
}
const IS_MASTER_MODE = sessionStorage.getItem("ogritechMasterMode") === "true";
if (IS_MASTER_MODE && sessionStorage.getItem("ogritechMasterBusinessName")) {
    businessConfig.name = sessionStorage.getItem("ogritechMasterBusinessName");
}

// Neste protótipo o login do funcionário "Carlos"
// corresponde ao profissional Carlos.
const employeeProfessional =
    currentRole === "employee"
        ? currentUserName
        : null;

// =========================================================
// 3. ELEMENTOS GERAIS
// =========================================================
const pageTitle = document.getElementById("page-title");
const menuItems = document.querySelectorAll(".menu-item");
const PRODUCT_SECTION_CODES = { agenda: "agenda", landing: "pages", orcamentos: "quotes", cardapio: "menu" };

async function applyProductAccess() {
    if (IS_DEMO || !BARBERSHOP_ID) return;
    const { data, error } = await supabaseClient.rpc("business_product_catalog", { target_barbershop_id: BARBERSHOP_ID });
    if (error) throw error;
    const access = new Map((Array.isArray(data) ? data : []).map((item) => [item.code, Boolean(item.subscribed) && ["trial", "active", "grace_period"].includes(item.status)]));
    menuItems.forEach((item) => {
        const productCode = PRODUCT_SECTION_CODES[item.dataset.section];
        if (!productCode) return;
        const allowed = access.get(productCode) === true;
        item.dataset.productAllowed = String(allowed);
        item.classList.toggle("product-locked", !allowed);
        item.setAttribute("aria-disabled", String(!allowed));
        if (!allowed) item.title = "Solução não contratada para este negócio";
    });
}

const dashboardView = document.getElementById("dashboardView");
const clientsView = document.getElementById("clientsView");
const agendaView = document.getElementById("agendaView");
const servicesView = document.getElementById("servicesView");
const professionalsView = document.getElementById("professionalsView");
const financialView = document.getElementById("financialView");
const settingsView = document.getElementById("settingsView");
const landingView = document.getElementById("landingView");
const quotesView = document.getElementById("quotesView");
const menuView = document.getElementById("menuView");

const openAppointmentButton = document.getElementById("newAppointment");
const agendaNewAppointment = document.getElementById("agendaNewAppointment");

// Dashboard.
const todayAppointmentCount = document.getElementById("todayAppointmentCount");
const todayAppointmentSubtitle = document.getElementById("todayAppointmentSubtitle");
const dashboardAppointmentList = document.getElementById("dashboardAppointmentList");
const dashboardAppointmentEmpty = document.getElementById("dashboardAppointmentEmpty");
const viewAgenda = document.getElementById("viewAgenda");
const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// =========================================================
// 4. FUNÇÕES UTILITÁRIAS
// =========================================================
function createId() {
    if (window.crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(date) {
    if (!date) return "—";

    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year}`;
}

function todayISO() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function applyBusinessCustomization() {
    window.applyOgritechBusinessTheme(businessConfig);
    const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    const tenantLogo = document.getElementById("tenantLogo");
    const tenantIcon = document.getElementById("tenantIcon");
    document.title = `Ogritech | ${businessConfig.name}`;
    document.getElementById("tenantName").textContent = businessConfig.name;
    document.getElementById("businessPanelEyebrow").textContent = `${businessConfig.name.toUpperCase()} • PAINEL ADMINISTRATIVO`;
    document.getElementById("businessRevenue").textContent = currency.format(businessConfig.revenue);
    document.getElementById("businessTicket").textContent = currency.format(businessConfig.ticket);
    const ticketSubtitle = document.getElementById("businessTicketSubtitle");
    if (ticketSubtitle) ticketSubtitle.textContent = IS_DEMO ? "+5,4% este mês" : "Ainda sem operação";
    const backToShowcase = document.getElementById("backToShowcase");
    if (IS_MASTER_MODE && backToShowcase) {
        backToShowcase.href = "admin.html";
        backToShowcase.textContent = "← Voltar ao painel master";
        backToShowcase.classList.remove("hidden");
    } else if (IS_DEMO && backToShowcase) {
        backToShowcase.href = `demonstracoes.html?segmento=${encodeURIComponent(businessConfig.key)}`;
        backToShowcase.classList.remove("hidden");
    }

    if (businessConfig.key === "barbearia") {
        tenantLogo.classList.remove("hidden");
        tenantIcon.classList.add("hidden");
    } else {
        tenantLogo.classList.add("hidden");
        tenantIcon.textContent = businessConfig.icon;
        tenantIcon.style.color = businessConfig.color;
        tenantIcon.classList.remove("hidden");
    }

    const clientsMenu = document.querySelector('[data-section="clientes"]');
    if (clientsMenu) clientsMenu.innerHTML = `<span>♙</span>${escapeHtml(businessConfig.clientPlural)}`;

    document.getElementById("popularServices").innerHTML = businessConfig.services.map((service, index) =>
        `<div class="service"><i style="color:${businessConfig.color}">${escapeHtml(businessConfig.icon)}</i><div><strong>${escapeHtml(service[0])}</strong><span>${IS_DEMO ? 86 - index * 13 : 0} atendimentos</span></div><b>${currency.format(service[1])}</b></div>`
    ).join("");

    const serviceOptions = '<option value="">Selecione</option>' + businessConfig.services.map((service) =>
        `<option value="${escapeHtml(service[0])}">${escapeHtml(service[0])} — ${currency.format(service[1])}</option>`
    ).join("");
    const professionalOptions = businessConfig.professionals.map((name) =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join("");
    document.getElementById("appointmentService").innerHTML = serviceOptions;
    document.getElementById("appointmentProfessional").innerHTML = '<option value="">Selecione</option>' + professionalOptions;
    document.getElementById("agendaProfessionalFilter").innerHTML = '<option value="all">Todos</option>' + professionalOptions;
}

applyBusinessCustomization();

const STATUS_INFO = {
    requested: {
        label: "Solicitado",
        className: "pending"
    },
    confirmed: {
        label: "Confirmado",
        className: "confirmed"
    },
    completed: {
        label: "Concluído",
        className: "completed"
    },
    cancelled: {
        label: "Cancelado",
        className: "cancelled"
    },
    no_show: {
        label: "Não compareceu",
        className: "no-show"
    }
};

function statusInfo(status) {
    return STATUS_INFO[status] || STATUS_INFO.requested;
}

const STATUS_ACTION_LABELS = {
    confirmed: "Confirmar agendamento",
    completed: "Concluir atendimento",
    cancelled: "Cancelar agendamento",
    no_show: "Registrar ausência"
};

function formatDateTime(value) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function renderNotifications() {
    const list = document.getElementById("notificationList");
    const empty = document.getElementById("notificationEmpty");
    const badge = document.getElementById("notificationBadge");
    if (!list || !empty || !badge) return;
    const unread = appointmentNotificationsCache.filter((item) => item.status === "unread").length;
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.classList.toggle("hidden", unread === 0);
    list.innerHTML = appointmentNotificationsCache.map((item) => `
        <button class="notification-item ${item.status === "unread" ? "is-unread" : ""}" type="button" data-notification-id="${item.id}">
            <strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span><small>${formatDateTime(item.created_at)}</small>
        </button>`).join("");
    empty.classList.toggle("hidden", appointmentNotificationsCache.length > 0);
}

async function refreshNotifications() {
    if (IS_DEMO) { appointmentNotificationsCache = []; renderNotifications(); return; }
    const { data, error } = await supabaseClient.from("appointment_notifications")
        .select("id,title,body,status,created_at,appointment_id")
        .eq("barbershop_id", BARBERSHOP_ID).eq("audience", "business").eq("channel", "in_app")
        .order("created_at", { ascending: false }).limit(30);
    if (error) return reportDataError("carregar as notificações", error);
    appointmentNotificationsCache = data || [];
    renderNotifications();
}

const notificationButton = document.getElementById("notificationButton");
const notificationPopover = document.getElementById("notificationPopover");
notificationButton?.addEventListener("click", () => {
    const opening = notificationPopover.classList.contains("hidden");
    notificationPopover.classList.toggle("hidden", !opening);
    notificationButton.setAttribute("aria-expanded", String(opening));
});
document.getElementById("closeNotifications")?.addEventListener("click", () => {
    notificationPopover.classList.add("hidden");
    notificationButton.setAttribute("aria-expanded", "false");
});
document.getElementById("notificationList")?.addEventListener("click", async (event) => {
    const item = event.target.closest("[data-notification-id]");
    if (!item || IS_DEMO) return;
    const notification = appointmentNotificationsCache.find((entry) => entry.id === item.dataset.notificationId);
    if (!notification || notification.status !== "unread") return;
    const { error } = await supabaseClient.rpc("mark_appointment_notification_read", { target_notification_id: notification.id });
    if (error) return reportDataError("marcar a notificação como lida", error);
    notification.status = "read";
    renderNotifications();
});

// =========================================================
// 5. DADOS DA AGENDA (SUPABASE; LOCALSTORAGE SOMENTE NO DEMO)
// =========================================================
function getAppointments() {
    if (!IS_DEMO) return appointmentsCache;
    try {
        const appointments = JSON.parse(
            localStorage.getItem(APPOINTMENTS_STORAGE_KEY)
        );
        return Array.isArray(appointments)
            ? appointments.filter((item) =>
                item && typeof item === "object" &&
                typeof item.id === "string" &&
                typeof item.date === "string" &&
                typeof item.time === "string" &&
                typeof item.professional === "string"
            )
            : [];
    } catch (error) {
        console.error("Erro ao ler a agenda:", error);
        return [];
    }
}

async function saveAppointments(appointments) {
    if (IS_DEMO) {
        localStorage.setItem(APPOINTMENTS_STORAGE_KEY, JSON.stringify(appointments));
    } else {
        appointmentsCache = appointments;
        const rows = appointments.map((item) => ({
            id: item.id,
            barbershop_id: BARBERSHOP_ID,
            client_name: item.clientName,
            client_email: item.clientEmail || "",
            service: item.service,
            professional: item.professional,
            appointment_date: item.date,
            appointment_time: item.time,
            status: item.status,
            created_by: item.createdBy || currentRole,
            created_at: item.createdAt || new Date().toISOString(),
            updated_at: item.updatedAt || new Date().toISOString()
        }));
        const removedIds = [...remoteAppointmentIds].filter((id) => !appointments.some((item) => item.id === id));
        if (removedIds.length) {
            const { error } = await supabaseClient.from("business_appointments").delete().in("id", removedIds);
            if (error) { reportDataError("salvar os agendamentos", error); return false; }
        }
        if (rows.length) {
            const { error } = await supabaseClient.from("business_appointments").upsert(rows);
            if (error) { reportDataError("salvar os agendamentos", error); return false; }
        }
        remoteAppointmentIds = new Set(appointments.map((item) => item.id));
    }

    renderAgenda();
    renderDashboardAgenda();
    renderBusinessIndicators();
    return true;
}

function appointmentFromDatabase(row) {
    return { id: row.id, clientName: row.client_name, clientEmail: row.client_email, service: row.service,
        professional: row.professional, date: row.appointment_date, time: String(row.appointment_time).slice(0, 5),
        status: row.status, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

function reportDataError(action, error) {
    console.error(`Erro ao ${action}:`, error);
    if (document.getElementById("operationalDataError")) return;

    const message = document.createElement("div");
    message.id = "operationalDataError";
    message.setAttribute("role", "alert");
    message.textContent = /limite|plano/i.test(error?.message || "") ? error.message : `Não foi possível ${action}. Verifique a conexão e tente novamente.`;
    message.style.cssText = "position:fixed;left:50%;bottom:20px;z-index:10000;max-width:min(520px,calc(100vw - 32px));transform:translateX(-50%);padding:12px 16px;border:1px solid #ef4444;border-radius:10px;background:#1f1111;color:#fecaca;font:600 14px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px #0008";
    document.body.appendChild(message);
}

// Verifica conflito de horário para o mesmo profissional.
// Cancelados não bloqueiam o horário.
function isTimeOccupied(date, time, professional, ignoreId = null) {
    return getAppointments().some((appointment) => {
        return (
            appointment.id !== ignoreId &&
            appointment.date === date &&
            appointment.time === time &&
            appointment.professional === professional &&
            appointment.status !== "cancelled"
        );
    });
}

// Funcionário só pode enxergar seus próprios atendimentos.
function appointmentsAllowedForCurrentUser(appointments) {
    if (currentRole === "employee") {
        return appointments.filter(
            (appointment) =>
                appointment.professional === employeeProfessional
        );
    }

    return appointments;
}

// =========================================================
// 6. MODAL DE AGENDAMENTO ADMINISTRATIVO
// =========================================================
const appointmentModal = document.getElementById("appointmentModal");
const closeAppointmentButton = document.getElementById("closeModal");
const appointmentForm = document.getElementById("appointmentForm");

const appointmentClientName = document.getElementById("appointmentClientName");
const appointmentService = document.getElementById("appointmentService");
const appointmentProfessional = document.getElementById("appointmentProfessional");
const appointmentDate = document.getElementById("appointmentDate");
const appointmentTime = document.getElementById("appointmentTime");
const appointmentMessage = document.getElementById("appointmentMessage");

function openAppointmentModal() {
    appointmentForm.reset();
    appointmentMessage.textContent = "";
    appointmentMessage.className = "form-message";

    // Funcionário agenda apenas para si.
    if (currentRole === "employee") {
        appointmentProfessional.value = employeeProfessional;
        appointmentProfessional.disabled = true;
    } else {
        appointmentProfessional.disabled = false;
    }

    appointmentDate.min = todayISO();
    appointmentModal.classList.remove("hidden");
}

function closeAppointmentModal() {
    appointmentModal.classList.add("hidden");
    appointmentForm.reset();
    appointmentProfessional.disabled = false;
}

openAppointmentButton.addEventListener("click", openAppointmentModal);
agendaNewAppointment.addEventListener("click", openAppointmentModal);

closeAppointmentButton.addEventListener("click", closeAppointmentModal);

appointmentModal.addEventListener("click", (event) => {
    if (event.target === appointmentModal) {
        closeAppointmentModal();
    }
});

appointmentForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const professional =
        currentRole === "employee"
            ? employeeProfessional
            : appointmentProfessional.value;

    if (
        isTimeOccupied(
            appointmentDate.value,
            appointmentTime.value,
            professional
        )
    ) {
        appointmentMessage.textContent =
            "Este profissional já possui um atendimento nesse horário.";

        appointmentMessage.className =
            "form-message error";

        return;
    }

    const newAppointment = {
        id: createId(),
        clientName: appointmentClientName.value.trim(),
        clientEmail: "",
        service: appointmentService.value,
        professional,
        date: appointmentDate.value,
        time: appointmentTime.value,

        // Criado pela equipe já entra confirmado.
        status: "confirmed",

        createdBy: currentRole,
        createdAt: new Date().toISOString()
    };
    if (IS_DEMO) {
        if (!await saveAppointments([...getAppointments(), newAppointment])) return;
    } else {
        const service = servicesCache.find((item) => item.name === newAppointment.service);
        const employee = professionalsCache.find((item) => item.name === newAppointment.professional);
        if (!service || !employee) return reportDataError("criar o agendamento", new Error("Serviço ou profissional inválido"));
        const { data, error } = await supabaseClient.rpc("create_appointment", {
            target_barbershop_id: BARBERSHOP_ID, target_service_id: service.id, target_employee_id: employee.id,
            target_date: newAppointment.date, target_time: newAppointment.time,
            supplied_client_name: newAppointment.clientName, supplied_client_email: newAppointment.clientEmail
        });
        if (error) return reportDataError("criar o agendamento", error);
        const created = appointmentFromDatabase(data);
        const { data: confirmedData, error: confirmError } = await supabaseClient.rpc("transition_appointment_status", {
            target_appointment_id: created.id,
            target_status: "confirmed",
            expected_updated_at: created.updatedAt,
            operation_note: "Agendamento criado pela equipe"
        });
        if (confirmError) return reportDataError("confirmar o agendamento", confirmError);
        const confirmed = appointmentFromDatabase(confirmedData);
        appointmentsCache.push(confirmed); remoteAppointmentIds.add(confirmed.id);
        renderAgenda(); renderDashboardAgenda(); renderBusinessIndicators();
        await refreshNotifications();
    }

    closeAppointmentModal();

    showSection("agenda");

    const agendaMenuItem =
        document.querySelector('[data-section="agenda"]');

    menuItems.forEach((menu) =>
        menu.classList.remove("active")
    );

    agendaMenuItem.classList.add("active");
});

// =========================================================
// 7. NAVEGAÇÃO
// =========================================================
const titles = {
    dashboard: "Dashboard",
    clientes: "Clientes",
    agenda: "Agenda",
    servicos: "Serviços",
    profissionais: "Profissionais",
    financeiro: "Financeiro",
    configuracoes: "Configurações"
};

function hideAllViews() {
    dashboardView.classList.add("hidden");
    clientsView.classList.add("hidden");
    agendaView.classList.add("hidden");
    servicesView.classList.add("hidden");
    professionalsView.classList.add("hidden");
    financialView.classList.add("hidden");
    settingsView.classList.add("hidden");
    landingView.classList.add("hidden");
    quotesView.classList.add("hidden");
    menuView.classList.add("hidden");
}

function showSection(section) {
    hideAllViews();

    if (section === "clientes") {
        clientsView.classList.remove("hidden");
        openAppointmentButton.classList.add("hidden");
        renderClients();
    } else if (section === "agenda") {
        agendaView.classList.remove("hidden");
        openAppointmentButton.classList.remove("hidden");
        renderAgenda();
    } else if (section === "servicos") {
        servicesView.classList.remove("hidden");
        openAppointmentButton.classList.add("hidden");
        renderServices();
    } else if (section === "profissionais") {
        professionalsView.classList.remove("hidden");
        openAppointmentButton.classList.add("hidden");
        renderProfessionals();
    } else if (section === "financeiro") {
        financialView.classList.remove("hidden");
        openAppointmentButton.classList.add("hidden");
        renderFinancial();
    } else if (section === "configuracoes") {
        settingsView.classList.remove("hidden");
        openAppointmentButton.classList.add("hidden");
        renderSettings();
    } else if (section === "landing") {
        landingView.classList.remove("hidden"); openAppointmentButton.classList.add("hidden");
        window.loadLandingAdmin?.();
    } else if (section === "orcamentos") {
        quotesView.classList.remove("hidden"); openAppointmentButton.classList.add("hidden");
        window.loadQuotesAdmin?.();
    } else if (section === "cardapio") {
        menuView.classList.remove("hidden"); openAppointmentButton.classList.add("hidden");
        window.loadMenuAdmin?.();
    } else {
        dashboardView.classList.remove("hidden");
        openAppointmentButton.classList.remove("hidden");
        renderDashboardAgenda();
    }

    pageTitle.textContent =
        titles[section] || "Dashboard";
}

menuItems.forEach((item) => {
    item.addEventListener("click", (event) => {
        event.preventDefault();

        if (item.dataset.productAllowed === "false") {
            alert("Esta solução não está ativa para o negócio. Consulte os produtos contratados ou fale com a Ogritech.");
            return;
        }

        menuItems.forEach((menu) =>
            menu.classList.remove("active")
        );

        item.classList.add("active");
        showSection(item.dataset.section);
    });
});

viewAgenda.addEventListener("click", () => {
    const agendaItem =
        document.querySelector('[data-section="agenda"]');

    menuItems.forEach((menu) =>
        menu.classList.remove("active")
    );

    agendaItem.classList.add("active");
    showSection("agenda");
});

// =========================================================
// 8. DASHBOARD: AGENDA DE HOJE
// =========================================================
function renderDashboardAgenda() {
    const today = todayISO();

    let appointments =
        appointmentsAllowedForCurrentUser(
            getAppointments()
        )
        .filter((appointment) =>
            appointment.date === today &&
            appointment.status !== "cancelled"
        )
        .sort((a, b) =>
            a.time.localeCompare(b.time)
        );

    todayAppointmentCount.textContent =
        appointments.length;

    todayAppointmentSubtitle.textContent =
        currentRole === "employee"
            ? `Agenda de ${employeeProfessional}`
            : "Todos os profissionais";

    dashboardAppointmentList.innerHTML = "";

    if (appointments.length === 0) {
        dashboardAppointmentEmpty.classList.remove("hidden");
        return;
    }

    dashboardAppointmentEmpty.classList.add("hidden");

    appointments.slice(0, 5).forEach((appointment) => {
        const info = statusInfo(appointment.status);

        const item = document.createElement("div");
        item.className = "appointment";

        item.innerHTML = `
            <b class="time">${escapeHtml(appointment.time)}</b>

            <div class="appointment-info">
                <strong>${escapeHtml(appointment.clientName)}</strong>
                <span>
                    ${escapeHtml(appointment.service)}
                    •
                    ${escapeHtml(appointment.professional)}
                </span>
            </div>

            <em class="status ${info.className}">
                ${info.label}
            </em>
        `;

        dashboardAppointmentList.appendChild(item);
    });
}

// =========================================================
// 8.1. DASHBOARD: INDICADORES DE GESTÃO
// =========================================================
function serviceFinancials(serviceName) {
    const service = businessConfig.services.find((item) => item[0] === serviceName);
    const price = Number(service?.[1]) || 0;
    const cost = Number.isFinite(Number(service?.[3])) ? Number(service[3]) : price * 0.4;
    return { price, cost };
}

function completedAppointmentsForMonth(year, month) {
    return getAppointments().filter((appointment) => {
        const date = new Date(`${appointment.date}T12:00:00`);
        return appointment.status === "completed" && date.getFullYear() === year && date.getMonth() === month;
    });
}

function renderBusinessIndicators() {
    const globalMargin = document.getElementById("globalProfitMargin");
    if (!globalMargin) return;

    const now = new Date();
    const completed = getAppointments().filter((item) => item.status === "completed");
    let totalRevenue = 0;
    let totalCost = 0;
    const byCategory = new Map();

    completed.forEach((appointment) => {
        const { price, cost } = serviceFinancials(appointment.service);
        totalRevenue += price;
        totalCost += cost;
        const current = byCategory.get(appointment.service) || { revenue: 0, cost: 0 };
        current.revenue += price;
        current.cost += cost;
        byCategory.set(appointment.service, current);
    });

    globalMargin.textContent = totalRevenue ? `${Math.round(((totalRevenue - totalCost) / totalRevenue) * 100)}%` : "—";
    document.getElementById("globalProfitMarginSubtitle").textContent = totalRevenue ? `${moneyFormatter.format(totalRevenue - totalCost)} de lucro estimado` : "Sem atendimentos concluídos";
    document.getElementById("categoryMarginList").innerHTML = businessConfig.services.map((service) => {
        const values = byCategory.get(service[0]);
        const financials = values || serviceFinancials(service[0]);
        const revenue = values ? values.revenue : financials.price;
        const cost = values ? values.cost : financials.cost;
        const margin = revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0;
        return `<div class="metric-row"><span>${escapeHtml(service[0])}</span><strong>${margin}%<small>${values ? "realizado" : "estimativa"}</small></strong></div>`;
    }).join("");

    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 60);
    const appointments = getAppointments();
    const inactiveClients = getClients().map((client) => {
        const history = appointments.filter((item) => item.clientName.trim().toLowerCase() === String(client.name).trim().toLowerCase() && item.status !== "cancelled").sort((a, b) => b.date.localeCompare(a.date));
        return { client, lastDate: history[0]?.date || null };
    }).filter((item) => !item.lastDate || new Date(`${item.lastDate}T12:00:00`) < cutoff);

    document.getElementById("inactiveClientCount").textContent = inactiveClients.length;
    document.getElementById("inactiveClientList").innerHTML = inactiveClients.slice(0, 5).map(({ client, lastDate }) => `<div class="metric-row"><span>${escapeHtml(client.name)}</span><strong>${lastDate ? formatDate(lastDate) : "Nunca agendou"}<small>último agendamento</small></strong></div>`).join("");
    document.getElementById("inactiveClientEmpty").classList.toggle("hidden", inactiveClients.length > 0);

    const revenueOf = (items) => items.reduce((sum, item) => sum + serviceFinancials(item.service).price, 0);
    const currentRevenue = revenueOf(completedAppointmentsForMonth(now.getFullYear(), now.getMonth()));
    const previousRevenue = revenueOf(completedAppointmentsForMonth(now.getFullYear() - 1, now.getMonth()));
    const variation = previousRevenue ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;
    document.getElementById("currentYearLabel").textContent = String(now.getFullYear());
    document.getElementById("previousYearLabel").textContent = String(now.getFullYear() - 1);
    document.getElementById("currentYearRevenue").textContent = moneyFormatter.format(currentRevenue);
    document.getElementById("previousYearRevenue").textContent = moneyFormatter.format(previousRevenue);
    const comparison = document.getElementById("yearComparison");
    comparison.textContent = variation === null ? "—" : `${variation >= 0 ? "+" : ""}${variation.toFixed(1).replace(".", ",")}%`;
    comparison.classList.toggle("positive", variation !== null && variation >= 0);
    document.getElementById("yearComparisonSubtitle").textContent = previousRevenue ? "Variação do faturamento no período" : "Sem base no mesmo mês do ano passado";
}

function renderPrivacyRequests() {
    const list = document.getElementById("privacyRequestList");
    if (!list) return;
    const pending = privacyRequestsCache.filter((item) => !["completed", "rejected"].includes(item.status));
    document.getElementById("privacyRequestCount").textContent = pending.length;
    list.innerHTML = pending.slice(0, 5).map((item) => `<div class="metric-row"><span>${escapeHtml(item.requester_name)}<small>${escapeHtml(item.request_type)} · ${formatDate(String(item.created_at).slice(0, 10))}</small></span><strong><button class="table-button edit" data-complete-privacy="${item.id}">Concluir</button></strong></div>`).join("");
    document.getElementById("privacyRequestEmpty").classList.toggle("hidden", pending.length > 0);
}

document.getElementById("privacyRequestList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-complete-privacy]");
    if (!button || !confirm("Marcar esta solicitação como concluída? Confirme somente após atender o titular.")) return;
    const { error } = await supabaseClient.from("privacy_requests").update({ status: "completed" }).eq("id", button.dataset.completePrivacy);
    if (error) return reportDataError("atualizar a solicitação", error);
    const request = privacyRequestsCache.find((item) => item.id === button.dataset.completePrivacy);
    if (request) request.status = "completed";
    renderPrivacyRequests();
});

function navigateTo(section) {
    menuItems.forEach((menu) => menu.classList.toggle("active", menu.dataset.section === section));
    showSection(section);
}

// =========================================================
// 9. TELA AGENDA
// =========================================================
const agendaDateFilter = document.getElementById("agendaDateFilter");
const agendaProfessionalFilter = document.getElementById("agendaProfessionalFilter");
const agendaStatusFilter = document.getElementById("agendaStatusFilter");
const agendaList = document.getElementById("agendaList");
const agendaEmpty = document.getElementById("agendaEmpty");

// Começa mostrando o dia atual.
agendaDateFilter.value = todayISO();

if (currentRole === "employee") {
    agendaProfessionalFilter.value = employeeProfessional;
    agendaProfessionalFilter.disabled = true;
}

function renderAgenda() {
    if (!agendaList) return;

    let appointments =
        appointmentsAllowedForCurrentUser(
            getAppointments()
        );

    const selectedDate =
        agendaDateFilter.value;

    const selectedProfessional =
        agendaProfessionalFilter.value;

    const selectedStatus =
        agendaStatusFilter.value;

    if (selectedDate) {
        appointments = appointments.filter(
            (appointment) =>
                appointment.date === selectedDate
        );
    }

    if (
        currentRole !== "employee" &&
        selectedProfessional !== "all"
    ) {
        appointments = appointments.filter(
            (appointment) =>
                appointment.professional === selectedProfessional
        );
    }

    if (selectedStatus !== "all") {
        appointments = appointments.filter(
            (appointment) =>
                appointment.status === selectedStatus
        );
    }

    appointments.sort((a, b) => {
        return `${a.date}T${a.time}`
            .localeCompare(`${b.date}T${b.time}`);
    });

    agendaList.innerHTML = "";

    if (appointments.length === 0) {
        agendaEmpty.classList.remove("hidden");
        return;
    }

    agendaEmpty.classList.add("hidden");

    appointments.forEach((appointment) => {
        const info = statusInfo(appointment.status);

        const card = document.createElement("article");
        card.className = "agenda-card";

        // Botões dependem do status atual.
        const actions = [];

        if (appointment.status === "requested") {
            actions.push(
                `<button class="table-button edit" data-agenda-status="${appointment.id}" data-new-status="confirmed">Confirmar</button>`
            );
            actions.push(
                `<button class="table-button delete" data-agenda-status="${appointment.id}" data-new-status="cancelled">Cancelar</button>`
            );
        }

        if (appointment.status === "confirmed") {
            actions.push(
                `<button class="table-button success" data-agenda-status="${appointment.id}" data-new-status="completed">Concluir</button>`
            );

            actions.push(
                `<button class="table-button warning" data-agenda-status="${appointment.id}" data-new-status="no_show">Não compareceu</button>`
            );

            actions.push(
                `<button class="table-button delete" data-agenda-status="${appointment.id}" data-new-status="cancelled">Cancelar</button>`
            );
        }

        actions.push(`<button class="table-button" data-appointment-history="${appointment.id}">Histórico</button>`);

        card.innerHTML = `
            <div class="agenda-time-block">
                <strong>${escapeHtml(appointment.time)}</strong>
                <span>${formatDate(appointment.date)}</span>
            </div>

            <div class="agenda-client-block">
                <strong>${escapeHtml(appointment.clientName)}</strong>
                <span>
                    ${escapeHtml(appointment.service)}
                    •
                    ${escapeHtml(appointment.professional)}
                </span>
                <small>
                    Origem:
                    ${
                        appointment.createdBy === "client"
                            ? "Cliente"
                            : appointment.createdBy === "employee"
                                ? "Funcionário"
                                : "Proprietário"
                    }
                </small>
            </div>

            <div class="agenda-status-block">
                <span class="status ${info.className}">
                    ${info.label}
                </span>

                <div class="agenda-card-actions">
                    ${actions.join("")}
                </div>
            </div>
        `;

        agendaList.appendChild(card);
    });
}

agendaDateFilter.addEventListener("change", renderAgenda);
agendaProfessionalFilter.addEventListener("change", renderAgenda);
agendaStatusFilter.addEventListener("change", renderAgenda);

agendaList.addEventListener("click", async (event) => {
    const historyButton = event.target.closest("[data-appointment-history]");
    if (historyButton) {
        await openAppointmentHistory(historyButton.dataset.appointmentHistory);
        return;
    }
    const button =
        event.target.closest("[data-agenda-status]");

    if (!button) return;

    const appointmentId =
        button.dataset.agendaStatus;

    const newStatus =
        button.dataset.newStatus;

    const appointments =
        getAppointments();

    const index =
        appointments.findIndex(
            (appointment) =>
                appointment.id === appointmentId
        );

    if (index < 0) return;

    if (
        currentRole === "employee" &&
        appointments[index].professional !== employeeProfessional
    ) return;

    openStatusTransition(appointments[index], newStatus);
});

const statusTransitionModal = document.getElementById("statusTransitionModal");
const statusTransitionForm = document.getElementById("statusTransitionForm");

function openStatusTransition(appointment, newStatus) {
    document.getElementById("statusAppointmentId").value = appointment.id;
    document.getElementById("statusTargetValue").value = newStatus;
    document.getElementById("statusTransitionTitle").textContent = STATUS_ACTION_LABELS[newStatus] || "Atualizar atendimento";
    document.getElementById("statusTransitionDescription").textContent = `${appointment.clientName} • ${appointment.service} • ${formatDate(appointment.date)} às ${appointment.time}`;
    document.getElementById("statusTransitionNote").value = "";
    document.getElementById("statusTransitionMessage").textContent = "";
    statusTransitionModal.classList.remove("hidden");
}

function closeStatusTransition() { statusTransitionModal.classList.add("hidden"); }
document.getElementById("closeStatusTransition").addEventListener("click", closeStatusTransition);

statusTransitionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const appointmentId = document.getElementById("statusAppointmentId").value;
    const targetStatus = document.getElementById("statusTargetValue").value;
    const note = document.getElementById("statusTransitionNote").value.trim();
    const message = document.getElementById("statusTransitionMessage");
    const submit = document.getElementById("confirmStatusTransition");
    const appointment = getAppointments().find((item) => item.id === appointmentId);
    if (!appointment) return;

    submit.disabled = true;
    submit.textContent = "Processando...";
    if (IS_DEMO) {
        appointment.status = targetStatus;
        appointment.updatedAt = new Date().toISOString();
        await saveAppointments(getAppointments());
        closeStatusTransition();
    } else {
        const { data, error } = await supabaseClient.rpc("transition_appointment_status", {
            target_appointment_id: appointmentId,
            target_status: targetStatus,
            expected_updated_at: appointment.updatedAt,
            operation_note: note
        });
        if (error) {
            message.textContent = error.message || "Não foi possível atualizar o atendimento.";
            message.className = "form-message error";
            if (error.code === "40001") {
                await loadOperationalData();
                renderAgenda(); renderDashboardAgenda(); renderBusinessIndicators();
            }
        } else {
            const index = appointmentsCache.findIndex((item) => item.id === appointmentId);
            appointmentsCache[index] = appointmentFromDatabase(data);
            renderAgenda(); renderDashboardAgenda(); renderBusinessIndicators();
            await refreshNotifications();
            closeStatusTransition();
        }
    }
    submit.disabled = false;
    submit.textContent = "Confirmar alteração";
});

async function openAppointmentHistory(appointmentId) {
    const modal = document.getElementById("appointmentHistoryModal");
    const list = document.getElementById("appointmentHistoryList");
    list.innerHTML = '<p class="section-description">Carregando histórico...</p>';
    modal.classList.remove("hidden");
    if (IS_DEMO) { list.innerHTML = '<div class="empty-state"><strong>Histórico disponível em contas reais.</strong></div>'; return; }
    const { data, error } = await supabaseClient.from("appointment_status_events")
        .select("id,from_status,to_status,actor_role,source,note,created_at")
        .eq("appointment_id", appointmentId).order("created_at", { ascending: false });
    if (error) { list.innerHTML = `<p class="form-message error">${escapeHtml(error.message)}</p>`; return; }
    list.innerHTML = (data || []).map((item) => `
        <article class="history-item"><span class="history-marker"></span><div>
            <strong>${escapeHtml(statusInfo(item.to_status).label)}</strong>
            <span>${formatDateTime(item.created_at)} • ${escapeHtml(item.actor_role || (item.source === "public_booking" ? "Cliente" : "Sistema"))}</span>
            ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
        </div></article>`).join("") || '<div class="empty-state"><strong>Nenhum evento registrado.</strong></div>';
}

document.getElementById("closeAppointmentHistory").addEventListener("click", () => document.getElementById("appointmentHistoryModal").classList.add("hidden"));

// =========================================================
// 10. MÓDULO DE CLIENTES
// =========================================================
const clientCount = document.getElementById("clientCount");

const clientModal = document.getElementById("clientModal");
const closeClientModalButton = document.getElementById("closeClientModal");
const newClientButton = document.getElementById("newClientButton");
const quickAddClient = document.getElementById("quickAddClient");
const clientForm = document.getElementById("clientForm");
const clientSearch = document.getElementById("clientSearch");
const clientsTableBody = document.getElementById("clientsTableBody");
const emptyClients = document.getElementById("emptyClients");

const clientId = document.getElementById("clientId");
const clientName = document.getElementById("clientName");
const clientPhone = document.getElementById("clientPhone");
const clientEmail = document.getElementById("clientEmail");
const clientBirthday = document.getElementById("clientBirthday");
const clientNotes = document.getElementById("clientNotes");
const clientModalEyebrow = document.getElementById("clientModalEyebrow");
const clientModalTitle = document.getElementById("clientModalTitle");

function getClients() {
    if (!IS_DEMO) return clientsCache;
    const saved =
        localStorage.getItem(CLIENTS_STORAGE_KEY);

    if (!saved) {
        const starterClients = [
            {
                id: createId(),
                name: businessConfig.client,
                phone: "(16) 99911-2233",
                email: `cliente.${businessConfig.key}@demo.ogritech.com.br`,
                birthday: "1990-05-14",
                notes: `Cadastro demonstrativo de ${businessConfig.clientLabel.toLowerCase()}.`
            },
            {
                id: createId(),
                name: businessConfig.clientLabel === "Paciente" ? "Renata Alves" : "Marcos Oliveira",
                phone: "(16) 99844-5566",
                email: "marcos@email.com",
                birthday: "1987-09-21",
                notes: ""
            }
        ];

        localStorage.setItem(
            CLIENTS_STORAGE_KEY,
            JSON.stringify(starterClients)
        );

        return starterClients;
    }

    try {
        const clients = JSON.parse(saved);
        return Array.isArray(clients)
            ? clients.filter((item) => item && typeof item === "object" && typeof item.id === "string")
            : [];
    } catch (error) {
        console.error("Erro ao ler clientes:", error);
        return [];
    }
}

async function saveClients(clients) {
    if (IS_DEMO) {
        localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(clients));
    } else {
        clientsCache = clients;
        const rows = clients.map((client) => ({ id: client.id, barbershop_id: BARBERSHOP_ID,
            name: client.name, phone: client.phone || "", email: client.email || "",
            birthday: client.birthday || null, notes: client.notes || "" }));
        const removedIds = [...remoteClientIds].filter((id) => !clients.some((client) => client.id === id));
        if (removedIds.length) {
            const { error } = await supabaseClient.from("business_clients").delete().in("id", removedIds);
            if (error) { reportDataError("salvar os clientes", error); return false; }
        }
        if (rows.length) {
            const { error } = await supabaseClient.from("business_clients").upsert(rows);
            if (error) { reportDataError("salvar os clientes", error); return false; }
        }
        remoteClientIds = new Set(clients.map((client) => client.id));
    }

    updateClientCount();
    renderBusinessIndicators();
    return true;
}

function updateClientCount() {
    clientCount.textContent =
        getClients().length;
}

function renderClients() {
    const searchTerm =
        clientSearch.value.trim().toLowerCase();

    const clients =
        getClients().filter((client) => {
            return (
                String(client.name || "").toLowerCase().includes(searchTerm) ||
                String(client.phone || "").toLowerCase().includes(searchTerm) ||
                (client.email || "").toLowerCase().includes(searchTerm)
            );
        });

    clientsTableBody.innerHTML = "";

    if (clients.length === 0) {
        emptyClients.classList.remove("hidden");
        return;
    }

    emptyClients.classList.add("hidden");

    clients.forEach((client) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td><strong>${escapeHtml(client.name)}</strong></td>
            <td>${escapeHtml(client.phone)}</td>
            <td>${escapeHtml(client.email || "—")}</td>
            <td>${formatDate(client.birthday)}</td>
            <td>
                <div class="table-actions ${currentRole === "employee" ? "hidden" : ""}">
                    <button class="table-button edit" data-edit-client="${client.id}">Editar</button>
                    <button class="table-button delete" data-delete-client="${client.id}">Excluir</button>
                </div>
            </td>
        `;

        clientsTableBody.appendChild(row);
    });
}

function openNewClientModal() {
    clientForm.reset();
    clientId.value = "";
    clientModalEyebrow.textContent = "NOVO CLIENTE";
    clientModalTitle.textContent = "Cadastrar cliente";
    clientModal.classList.remove("hidden");
    clientName.focus();
}

function openEditClientModal(id) {
    const client =
        getClients().find(
            (item) => item.id === id
        );

    if (!client) return;

    clientId.value = client.id;
    clientName.value = client.name;
    clientPhone.value = client.phone;
    clientEmail.value = client.email;
    clientBirthday.value = client.birthday;
    clientNotes.value = client.notes;

    clientModalEyebrow.textContent =
        "EDITAR CLIENTE";

    clientModalTitle.textContent =
        "Atualizar cadastro";

    clientModal.classList.remove("hidden");
}

function closeClientModal() {
    clientModal.classList.add("hidden");
    clientForm.reset();
    clientId.value = "";
}

newClientButton.addEventListener(
    "click",
    openNewClientModal
);

quickAddClient.addEventListener("click", () => {
    const clientsMenuItem =
        document.querySelector('[data-section="clientes"]');

    menuItems.forEach((menu) =>
        menu.classList.remove("active")
    );

    clientsMenuItem.classList.add("active");
    showSection("clientes");
    openNewClientModal();
});

closeClientModalButton.addEventListener(
    "click",
    closeClientModal
);

clientModal.addEventListener("click", (event) => {
    if (event.target === clientModal) {
        closeClientModal();
    }
});

clientForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const clients = getClients();

    const clientData = {
        id: clientId.value || createId(),
        name: clientName.value.trim(),
        phone: clientPhone.value.trim(),
        email: clientEmail.value.trim(),
        birthday: clientBirthday.value,
        notes: clientNotes.value.trim()
    };

    const existingIndex =
        clients.findIndex(
            (client) =>
                client.id === clientData.id
        );

    if (existingIndex >= 0) {
        clients[existingIndex] = clientData;
    } else {
        clients.push(clientData);
    }

    if (!await saveClients(clients)) return;
    closeClientModal();
    renderClients();
});

clientSearch.addEventListener(
    "input",
    renderClients
);

clientsTableBody.addEventListener(
    "click",
    async (event) => {

        const editButton =
            event.target.closest(
                "[data-edit-client]"
            );

        const deleteButton =
            event.target.closest(
                "[data-delete-client]"
            );

        if (editButton) {
            openEditClientModal(
                editButton.dataset.editClient
            );
        }

        if (deleteButton) {
            const id =
                deleteButton.dataset.deleteClient;

            const client =
                getClients().find(
                    (item) =>
                        item.id === id
                );

            if (!client) return;

            const confirmed =
                confirm(
                    `Deseja realmente excluir ${client.name}?`
                );

            if (confirmed) {
                const updatedClients =
                    getClients().filter(
                        (item) =>
                            item.id !== id
                    );

                if (!await saveClients(updatedClients)) return;
                renderClients();
            }
        }
    }
);

// =========================================================
// 11. SERVIÇOS, EQUIPE, FINANCEIRO E CONFIGURAÇÕES
// =========================================================
function readDemoCollection(key, fallback) {
    try {
        const saved = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(saved)) return saved;
    } catch (error) { console.error("Dados demonstrativos inválidos:", error); }
    const initial = fallback();
    localStorage.setItem(key, JSON.stringify(initial));
    return initial;
}

function getServices() {
    if (!IS_DEMO) return servicesCache;
    return readDemoCollection(SERVICES_STORAGE_KEY, () => businessConfig.services.map((item) => ({
        id: createId(), name: item[0], price: Number(item[1]), description: item[2] || "",
        cost: Number(item[3]) || 0, category: item[4] || "Geral", duration_minutes: Number(item[5]) || 30
    })));
}

function getProfessionals() {
    if (!IS_DEMO) return professionalsCache;
    return readDemoCollection(PROFESSIONALS_STORAGE_KEY, () => businessConfig.professionals.map((name) => ({
        id: createId(), name, specialty: "Atendimento geral", commission_percentage: 0
    })));
}

function syncOperationalOptions() {
    const services = getServices();
    const professionals = getProfessionals();
    businessConfig.services = services.map((item) => [item.name, Number(item.price), item.description || "", Number(item.cost), item.category, Number(item.duration_minutes)]);
    businessConfig.professionals = professionals.map((item) => item.name);
    applyBusinessCustomization();
    renderBusinessIndicators();
    renderPlanCapacity();
}

function capacityText(current, maximum, label) {
    return maximum == null ? `${current} ${label} · sem limite no plano` : `${current} de ${maximum} ${label}`;
}

function renderPlanCapacity() {
    if (currentRole === "employee") {
        document.getElementById("servicesCapacity").textContent = "";
        document.getElementById("professionalsCapacity").textContent = "";
        return;
    }
    const services = getServices().length, professionals = getProfessionals().length;
    planCapacityCache.active_services = services;
    planCapacityCache.active_professionals = professionals;
    const serviceLimit = planCapacityCache.max_services;
    const professionalLimit = planCapacityCache.max_professionals;
    document.getElementById("servicesCapacity").textContent = `Plano ${planCapacityCache.plan}: ${capacityText(services, serviceLimit, "serviços ativos")}`;
    document.getElementById("professionalsCapacity").textContent = `Plano ${planCapacityCache.plan}: ${capacityText(professionals, professionalLimit, "profissionais ativos")}`;
    const serviceButton = document.getElementById("newServiceButton");
    const professionalButton = document.getElementById("newProfessionalButton");
    serviceButton.disabled = serviceLimit != null && services >= serviceLimit;
    professionalButton.disabled = professionalLimit != null && professionals >= professionalLimit;
    serviceButton.title = serviceButton.disabled ? "Limite do plano atingido" : "Adicionar tipo de serviço";
    professionalButton.title = professionalButton.disabled ? "Limite do plano atingido; editar nomes continua disponível" : "Adicionar profissional";
    document.getElementById("quickAddService").disabled = serviceButton.disabled;
    document.getElementById("quickAddProfessional").disabled = professionalButton.disabled;
}

async function persistService(item) {
    if (IS_DEMO) {
        const items = getServices();
        const index = items.findIndex((current) => current.id === item.id);
        if (index >= 0) items[index] = item; else items.push(item);
        localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(items));
        servicesCache = items;
    } else {
        const row = { barbershop_id: BARBERSHOP_ID, name: item.name, description: item.description, category: item.category,
            duration_minutes: item.duration_minutes, price: item.price, cost: item.cost, active: true };
        if (item.id) row.id = item.id;
        const { error } = await supabaseClient.from("services").upsert(row);
        if (error) return reportDataError("salvar o serviço", error);
        const saved = { ...row, id: item.id, cost: Number(item.cost), price: Number(item.price) };
        const index = servicesCache.findIndex((current) => current.id === saved.id);
        if (index >= 0) servicesCache[index] = saved; else servicesCache.push(saved);
    }
    syncOperationalOptions(); renderServices(); closeGenericModal("serviceModal");
}

async function persistProfessional(item) {
    if (IS_DEMO) {
        const items = getProfessionals();
        const index = items.findIndex((current) => current.id === item.id);
        if (index >= 0) items[index] = item; else items.push(item);
        localStorage.setItem(PROFESSIONALS_STORAGE_KEY, JSON.stringify(items));
        professionalsCache = items;
    } else {
        const row = { barbershop_id: BARBERSHOP_ID, name: item.name, specialty: item.specialty,
            commission_percentage: item.commission_percentage, active: true };
        if (item.id) row.id = item.id;
        const { data, error } = await supabaseClient.from("employees").upsert(row).select().single();
        if (error) return reportDataError("salvar o profissional", error);
        const index = professionalsCache.findIndex((current) => current.id === data.id);
        if (index >= 0) professionalsCache[index] = data; else professionalsCache.push(data);
    }
    syncOperationalOptions(); renderProfessionals(); closeGenericModal("professionalModal");
}

function renderServices() {
    document.getElementById("servicesTableBody").innerHTML = getServices().map((service) => `<tr><td><strong>${escapeHtml(service.name)}</strong><small class="table-subtitle">${escapeHtml(service.description || "Sem descrição")}</small></td><td>${escapeHtml(service.category || "Geral")}</td><td>${Number(service.duration_minutes) || 30} min</td><td>${moneyFormatter.format(service.price)}</td><td>${moneyFormatter.format(service.cost || 0)}</td><td><div class="table-actions"><button class="table-button edit" data-edit-service="${service.id}">Editar</button><button class="table-button delete" data-delete-service="${service.id}">Excluir</button></div></td></tr>`).join("");
}

function renderProfessionals() {
    document.getElementById("professionalsTableBody").innerHTML = getProfessionals().map((professional) => {
        const future = getAppointments().filter((item) => item.professional === professional.name && item.date >= todayISO() && !["cancelled", "completed"].includes(item.status)).length;
        return `<tr><td><strong>${escapeHtml(professional.name)}</strong></td><td>${escapeHtml(professional.specialty || "Atendimento geral")}</td><td>${Number(professional.commission_percentage || 0).toLocaleString("pt-BR")}%</td><td><button class="table-button edit" data-professional-agenda="${escapeHtml(professional.name)}">${future} próximos</button></td><td><div class="table-actions"><button class="table-button edit" data-professional-availability="${professional.id}">Disponibilidade</button><button class="table-button edit" data-edit-professional="${professional.id}">Editar</button><button class="table-button delete" data-delete-professional="${professional.id}">Excluir</button></div></td></tr>`;
    }).join("");
}

function closeGenericModal(id) { document.getElementById(id).classList.add("hidden"); }
function openServiceModal(service = {}) {
    document.getElementById("serviceForm").reset();
    document.getElementById("serviceId").value = service.id || "";
    document.getElementById("serviceName").value = service.name || "";
    document.getElementById("serviceCategory").value = service.category || "Geral";
    document.getElementById("serviceDuration").value = service.duration_minutes || 30;
    document.getElementById("servicePrice").value = service.price ?? "";
    document.getElementById("serviceCost").value = service.cost || 0;
    document.getElementById("serviceDescription").value = service.description || "";
    document.getElementById("serviceModalTitle").textContent = service.id ? "Editar serviço" : "Novo serviço";
    document.getElementById("serviceModal").classList.remove("hidden");
}
function openProfessionalModal(professional = {}) {
    document.getElementById("professionalForm").reset();
    document.getElementById("professionalId").value = professional.id || "";
    document.getElementById("professionalName").value = professional.name || "";
    document.getElementById("professionalSpecialty").value = professional.specialty || "";
    document.getElementById("professionalCommission").value = professional.commission_percentage || 0;
    document.getElementById("professionalModalTitle").textContent = professional.id ? "Editar profissional" : "Novo profissional";
    document.getElementById("professionalModal").classList.remove("hidden");
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function getDemoAvailability(employeeId) {
    try { return JSON.parse(localStorage.getItem(AVAILABILITY_STORAGE_KEY) || "{}")[employeeId] || null; }
    catch { return null; }
}

function availabilityFor(employeeId) {
    if (IS_DEMO) {
        const stored = getDemoAvailability(employeeId);
        if (stored) return stored;
    }
    const assignedIds = employeeServicesCache.filter((item) => item.employee_id === employeeId).map((item) => item.service_id);
    const hours = workingHoursCache.filter((item) => item.employee_id === employeeId);
    const timeOff = timeOffCache.filter((item) => item.employee_id === employeeId);
    return {
        serviceIds: assignedIds.length ? assignedIds : getServices().map((item) => item.id),
        hours,
        timeOff
    };
}

function renderTimeOffDraft() {
    const list = document.getElementById("timeOffList");
    if (!availabilityDraftTimeOff.length) {
        list.innerHTML = '<p class="time-off-empty">Nenhuma folga ou bloqueio cadastrado.</p>';
        return;
    }
    list.innerHTML = availabilityDraftTimeOff.map((item, index) => {
        const start = new Date(item.starts_at).toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short" });
        const end = new Date(item.ends_at).toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"short" });
        return `<div class="time-off-item"><div><strong>${start} até ${end}</strong><small>${escapeHtml(item.reason || "Sem motivo informado")}</small></div><button class="table-button delete" type="button" data-remove-time-off="${index}">Remover</button></div>`;
    }).join("");
}

function openAvailabilityModal(professional) {
    const availability = availabilityFor(professional.id);
    document.getElementById("availabilityEmployeeId").value = professional.id;
    document.getElementById("availabilityModalTitle").textContent = professional.name;
    document.getElementById("availabilityMessage").textContent = "";
    document.getElementById("availabilityServices").innerHTML = getServices().map((service) => `<label class="service-check"><input type="checkbox" value="${service.id}" ${availability.serviceIds.includes(service.id) ? "checked" : ""}><span>${escapeHtml(service.name)}</span></label>`).join("");
    document.getElementById("workingHoursList").innerHTML = WEEKDAYS.map((day, weekday) => {
        const ranges = availability.hours.filter((item) => Number(item.weekday) === weekday).sort((a,b) => String(a.start_time).localeCompare(String(b.start_time)));
        const active = ranges.length > 0 || (!availability.hours.length && weekday >= 1 && weekday <= 6);
        const first = ranges[0] || { start_time: businessSettingsCache.openTime || "09:00", end_time: businessSettingsCache.closeTime || "18:00" };
        const second = ranges[1] || { start_time:"", end_time:"" };
        return `<div class="working-hours-row ${active ? "is-active" : ""}" data-weekday="${weekday}"><label class="weekday-toggle"><input type="checkbox" ${active ? "checked" : ""}>${day}</label><input type="time" data-period="1-start" value="${String(first.start_time || "").slice(0,5)}" aria-label="Início do primeiro período de ${day}"><input type="time" data-period="1-end" value="${String(first.end_time || "").slice(0,5)}" aria-label="Fim do primeiro período de ${day}"><input type="time" data-period="2-start" value="${String(second.start_time || "").slice(0,5)}" aria-label="Início do segundo período de ${day}"><input type="time" data-period="2-end" value="${String(second.end_time || "").slice(0,5)}" aria-label="Fim do segundo período de ${day}"></div>`;
    }).join("");
    availabilityDraftTimeOff = availability.timeOff.map((item) => ({ starts_at:item.starts_at, ends_at:item.ends_at, reason:item.reason || "" }));
    renderTimeOffDraft();
    document.getElementById("availabilityModal").classList.remove("hidden");
}

function collectWorkingHours() {
    const result = [];
    document.querySelectorAll(".working-hours-row").forEach((row) => {
        if (!row.querySelector('.weekday-toggle input').checked) return;
        for (const period of ["1", "2"]) {
            const start = row.querySelector(`[data-period="${period}-start"]`).value;
            const end = row.querySelector(`[data-period="${period}-end"]`).value;
            if (!start && !end) continue;
            if (!start || !end || end <= start) throw new Error(`${WEEKDAYS[Number(row.dataset.weekday)]}: informe um período válido.`);
            result.push({ weekday:Number(row.dataset.weekday), start_time:start, end_time:end });
        }
    });
    if (!result.length) throw new Error("Defina ao menos um período de trabalho.");
    return result;
}

document.getElementById("newServiceButton").addEventListener("click", () => openServiceModal());
document.getElementById("quickAddService").addEventListener("click", () => { navigateTo("servicos"); openServiceModal(); });
document.getElementById("newProfessionalButton").addEventListener("click", () => openProfessionalModal());
document.getElementById("quickAddProfessional").addEventListener("click", () => { navigateTo("profissionais"); openProfessionalModal(); });
document.getElementById("quickFinancial").addEventListener("click", () => navigateTo("financeiro"));
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeGenericModal(button.dataset.closeModal)));

document.getElementById("serviceForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await persistService({ id: document.getElementById("serviceId").value || createId(), name: document.getElementById("serviceName").value.trim(), category: document.getElementById("serviceCategory").value.trim(), duration_minutes: Number(document.getElementById("serviceDuration").value), price: Number(document.getElementById("servicePrice").value), cost: Number(document.getElementById("serviceCost").value), description: document.getElementById("serviceDescription").value.trim() });
});
document.getElementById("professionalForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    await persistProfessional({ id: document.getElementById("professionalId").value || createId(), name: document.getElementById("professionalName").value.trim(), specialty: document.getElementById("professionalSpecialty").value.trim(), commission_percentage: Number(document.getElementById("professionalCommission").value) });
});

document.getElementById("servicesTableBody").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-service]"); const remove = event.target.closest("[data-delete-service]");
    if (edit) openServiceModal(getServices().find((item) => item.id === edit.dataset.editService));
    if (remove && confirm("Excluir este serviço? Ele deixará de aparecer em novos agendamentos.")) {
        const id = remove.dataset.deleteService;
        if (IS_DEMO) localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(getServices().filter((item) => item.id !== id)));
        else { const { error } = await supabaseClient.from("services").update({ active: false }).eq("id", id); if (error) return reportDataError("excluir o serviço", error); servicesCache = servicesCache.filter((item) => item.id !== id); }
        syncOperationalOptions(); renderServices();
    }
});
document.getElementById("professionalsTableBody").addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-professional]"); const remove = event.target.closest("[data-delete-professional]"); const agenda = event.target.closest("[data-professional-agenda]"); const availability = event.target.closest("[data-professional-availability]");
    if (edit) openProfessionalModal(getProfessionals().find((item) => item.id === edit.dataset.editProfessional));
    if (availability) openAvailabilityModal(getProfessionals().find((item) => item.id === availability.dataset.professionalAvailability));
    if (agenda) { navigateTo("agenda"); agendaDateFilter.value = ""; agendaProfessionalFilter.value = agenda.dataset.professionalAgenda; renderAgenda(); }
    if (remove && confirm("Remover este profissional dos novos agendamentos?")) {
        const id = remove.dataset.deleteProfessional;
        if (IS_DEMO) localStorage.setItem(PROFESSIONALS_STORAGE_KEY, JSON.stringify(getProfessionals().filter((item) => item.id !== id)));
        else { const { error } = await supabaseClient.from("employees").update({ active: false }).eq("id", id); if (error) return reportDataError("remover o profissional", error); professionalsCache = professionalsCache.filter((item) => item.id !== id); }
        syncOperationalOptions(); renderProfessionals();
    }
});

document.getElementById("workingHoursList").addEventListener("change", (event) => {
    if (!event.target.matches('.weekday-toggle input')) return;
    event.target.closest('.working-hours-row').classList.toggle('is-active', event.target.checked);
});

document.getElementById("addTimeOffButton").addEventListener("click", () => {
    const start = document.getElementById("timeOffStart").value;
    const end = document.getElementById("timeOffEnd").value;
    const reason = document.getElementById("timeOffReason").value.trim();
    const message = document.getElementById("availabilityMessage");
    if (!start || !end || end <= start) {
        message.textContent = "Informe início e fim válidos para o bloqueio.";
        message.className = "form-message error";
        return;
    }
    availabilityDraftTimeOff.push({ starts_at:start, ends_at:end, reason });
    document.getElementById("timeOffStart").value = "";
    document.getElementById("timeOffEnd").value = "";
    document.getElementById("timeOffReason").value = "";
    message.textContent = "";
    renderTimeOffDraft();
});

document.getElementById("timeOffList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-time-off]");
    if (!button) return;
    availabilityDraftTimeOff.splice(Number(button.dataset.removeTimeOff), 1);
    renderTimeOffDraft();
});

document.getElementById("availabilityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const employeeId = document.getElementById("availabilityEmployeeId").value;
    const serviceIds = [...document.querySelectorAll('#availabilityServices input:checked')].map((input) => input.value);
    const message = document.getElementById("availabilityMessage");
    const saveButton = document.getElementById("saveAvailabilityButton");
    try {
        if (!serviceIds.length) throw new Error("Selecione ao menos um serviço atendido.");
        const hours = collectWorkingHours();
        saveButton.disabled = true;
        saveButton.textContent = "Salvando...";
        if (IS_DEMO) {
            let stored = {};
            try { stored = JSON.parse(localStorage.getItem(AVAILABILITY_STORAGE_KEY) || "{}"); } catch { stored = {}; }
            stored[employeeId] = { serviceIds, hours:hours.map((item) => ({ ...item, employee_id:employeeId })), timeOff:availabilityDraftTimeOff.map((item) => ({ ...item, employee_id:employeeId })) };
            localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(stored));
        } else {
            const { error } = await supabaseClient.rpc("save_staff_availability", {
                target_barbershop_id: BARBERSHOP_ID,
                target_employee_id: employeeId,
                target_service_ids: serviceIds,
                target_working_hours: hours,
                target_time_off: availabilityDraftTimeOff
            });
            if (error) throw error;
            employeeServicesCache = employeeServicesCache.filter((item) => item.employee_id !== employeeId).concat(serviceIds.map((service_id) => ({ barbershop_id:BARBERSHOP_ID, employee_id:employeeId, service_id })));
            workingHoursCache = workingHoursCache.filter((item) => item.employee_id !== employeeId).concat(hours.map((item) => ({ ...item, employee_id:employeeId })));
            timeOffCache = timeOffCache.filter((item) => item.employee_id !== employeeId).concat(availabilityDraftTimeOff.map((item) => ({ ...item, employee_id:employeeId })));
        }
        closeGenericModal("availabilityModal");
    } catch (error) {
        message.textContent = error.message || "Não foi possível salvar a disponibilidade.";
        message.className = "form-message error";
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = "Salvar disponibilidade";
    }
});

function getFinancialEntries() { return IS_DEMO ? readDemoCollection(FINANCIAL_STORAGE_KEY, () => []) : financialCache; }
function renderFinancial() {
    const start = document.getElementById("financeStart").value; const end = document.getElementById("financeEnd").value; const type = document.getElementById("financeTypeFilter").value;
    const entries = getFinancialEntries().filter((item) => (!start || item.occurred_on >= start) && (!end || item.occurred_on <= end) && (type === "all" || item.entry_type === type)).sort((a,b) => b.occurred_on.localeCompare(a.occurred_on));
    const income = entries.filter((item) => item.entry_type === "income").reduce((sum, item) => sum + Number(item.amount), 0); const expense = entries.filter((item) => item.entry_type === "expense").reduce((sum, item) => sum + Number(item.amount), 0);
    document.getElementById("financeIncome").textContent = moneyFormatter.format(income); document.getElementById("financeExpense").textContent = moneyFormatter.format(expense); document.getElementById("financeBalance").textContent = moneyFormatter.format(income - expense);
    document.getElementById("financialTableBody").innerHTML = entries.map((item) => `<tr><td>${formatDate(item.occurred_on)}</td><td><strong>${escapeHtml(item.description)}</strong></td><td>${escapeHtml(item.category)}</td><td><span class="status ${item.entry_type === "income" ? "completed" : "cancelled"}">${item.entry_type === "income" ? "Entrada" : "Saída"}</span></td><td>${moneyFormatter.format(item.amount)}</td><td><button class="table-button delete" data-delete-financial="${item.id}">Excluir</button></td></tr>`).join("");
    document.getElementById("financialEmpty").classList.toggle("hidden", entries.length > 0);
}
document.getElementById("newFinancialButton").addEventListener("click", () => { document.getElementById("financialForm").reset(); document.getElementById("financialDate").value = todayISO(); document.getElementById("financialModal").classList.remove("hidden"); });
["financeStart", "financeEnd", "financeTypeFilter"].forEach((id) => document.getElementById(id).addEventListener("change", renderFinancial));
document.getElementById("financialForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const item = { id: createId(), entry_type: document.getElementById("financialType").value, description: document.getElementById("financialDescription").value.trim(), category: document.getElementById("financialCategory").value.trim(), amount: Number(document.getElementById("financialAmount").value), occurred_on: document.getElementById("financialDate").value, payment_method: document.getElementById("financialPayment").value, status: "paid", notes: "" };
    if (IS_DEMO) localStorage.setItem(FINANCIAL_STORAGE_KEY, JSON.stringify([...getFinancialEntries(), item])); else { const { data, error } = await supabaseClient.from("financial_entries").insert({ ...item, barbershop_id: BARBERSHOP_ID }).select().single(); if (error) return reportDataError("salvar o lançamento", error); financialCache.push(data); }
    closeGenericModal("financialModal"); renderFinancial();
});
document.getElementById("financialTableBody").addEventListener("click", async (event) => { const button = event.target.closest("[data-delete-financial]"); if (!button || !confirm("Excluir este lançamento?")) return; const id = button.dataset.deleteFinancial; if (IS_DEMO) localStorage.setItem(FINANCIAL_STORAGE_KEY, JSON.stringify(getFinancialEntries().filter((item) => item.id !== id))); else { const { error } = await supabaseClient.from("financial_entries").delete().eq("id", id); if (error) return reportDataError("excluir o lançamento", error); financialCache = financialCache.filter((item) => item.id !== id); } renderFinancial(); });

function getSettings() { if (!IS_DEMO) return businessSettingsCache; try { return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)) || {}; } catch { return {}; } }
function updatePublicBookingLink() {
    const link = document.getElementById("publicBookingLink");
    const slug = document.getElementById("settingsPublicSlug").value.trim();
    const enabled = document.getElementById("settingsPublicBookingEnabled").checked;
    link.classList.toggle("hidden", !slug || !enabled);
    if (slug && enabled) link.href = window.ogritechEnvironmentUrl(`/agendar/?empresa=${encodeURIComponent(slug)}`);
}
function renderSettings() {
    const settings = getSettings();
    document.getElementById("settingsBusinessName").value = settings.name || businessConfig.name;
    document.getElementById("settingsSegment").value = settings.segment || businessConfig.segment;
    document.getElementById("settingsOpenTime").value = settings.openTime || "09:00";
    document.getElementById("settingsCloseTime").value = settings.closeTime || "18:00";
    document.getElementById("settingsSlotDuration").value = settings.slotDuration || "60";
    document.getElementById("settingsPublicSlug").value = publicBookingSettingsCache.slug || settings.publicSlug || "";
    document.getElementById("settingsPublicBookingEnabled").checked = Boolean(publicBookingSettingsCache.enabled ?? settings.publicBookingEnabled);
    updatePublicBookingLink();
}
document.getElementById("settingsPublicSlug").addEventListener("input", (event) => { event.target.value = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""); updatePublicBookingLink(); });
document.getElementById("settingsPublicBookingEnabled").addEventListener("change", updatePublicBookingLink);
document.getElementById("settingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const settings = { name: document.getElementById("settingsBusinessName").value.trim(), segment: document.getElementById("settingsSegment").value.trim(), openTime: document.getElementById("settingsOpenTime").value, closeTime: document.getElementById("settingsCloseTime").value, slotDuration: document.getElementById("settingsSlotDuration").value, publicSlug: document.getElementById("settingsPublicSlug").value.trim(), publicBookingEnabled: document.getElementById("settingsPublicBookingEnabled").checked };
    const message = document.getElementById("settingsMessage");
    if (settings.closeTime <= settings.openTime) { message.textContent = "O encerramento deve ser posterior ao início."; message.className = "form-message error"; return; }
    if (settings.publicBookingEnabled && !/^[a-z0-9][a-z0-9-]{2,47}$/.test(settings.publicSlug)) { message.textContent = "Defina um endereço público com 3 a 48 letras, números ou hífens."; message.className = "form-message error"; return; }
    if (IS_DEMO) localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    else {
        const { error } = await supabaseClient.from("business_settings").upsert({ barbershop_id: BARBERSHOP_ID, display_name: settings.name, segment: settings.segment, open_time: settings.openTime, close_time: settings.closeTime, slot_duration_minutes: Number(settings.slotDuration) });
        if (error) return reportDataError("salvar as configurações", error);
        if (settings.publicSlug) {
            const { data, error: publicError } = await supabaseClient.rpc("set_public_booking_settings", { target_barbershop_id:BARBERSHOP_ID, target_slug:settings.publicSlug, target_enabled:settings.publicBookingEnabled });
            if (publicError) { message.textContent = publicError.message || "Não foi possível configurar a agenda pública."; message.className = "form-message error"; return; }
            publicBookingSettingsCache = data || {};
        }
        businessSettingsCache = settings;
    }
    businessConfig.name = settings.name; businessConfig.segment = settings.segment; applyBusinessCustomization(); updatePublicBookingLink();
    message.textContent = "Configurações salvas."; message.className = "form-message success-message";
});

// =========================================================
// 12. INICIALIZAÇÃO
// =========================================================
function validUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || "");
}

async function importLocalDataOnce() {
    const migrationKey = `ogritechSupabaseMigration:${BARBERSHOP_ID}`;
    if (localStorage.getItem(migrationKey) || IS_DEMO || currentRole === "employee") return;

    try {
        const localAppointments = JSON.parse(localStorage.getItem(APPOINTMENTS_STORAGE_KEY) || "[]");
        const localClients = JSON.parse(localStorage.getItem(CLIENTS_STORAGE_KEY) || "[]");
        if (Array.isArray(localAppointments) && localAppointments.length) {
            const knownIds = new Set(appointmentsCache.map((item) => item.id));
            const imported = localAppointments.filter((item) => !knownIds.has(item.id))
                .map((item) => ({ ...item, id: validUuid(item.id) ? item.id : createId() }));
            if (imported.length && !await saveAppointments([...appointmentsCache, ...imported])) throw new Error("Falha ao importar agendamentos");
        }
        if (Array.isArray(localClients) && localClients.length) {
            const knownIds = new Set(clientsCache.map((item) => item.id));
            const imported = localClients.filter((item) => !knownIds.has(item.id))
                .map((item) => ({ ...item, id: validUuid(item.id) ? item.id : createId() }));
            if (imported.length && !await saveClients([...clientsCache, ...imported])) throw new Error("Falha ao importar clientes");
        }
        localStorage.setItem(migrationKey, new Date().toISOString());
        localStorage.removeItem(APPOINTMENTS_STORAGE_KEY);
        localStorage.removeItem(CLIENTS_STORAGE_KEY);
    } catch (error) {
        console.error("Erro ao importar dados locais:", error);
    }
}

async function loadOperationalData() {
    if (IS_DEMO) return;
    const historyStart = new Date(); historyStart.setFullYear(historyStart.getFullYear() - 1);
    const [appointmentsResult, clientsResult, privacyResult, servicesResult, employeesResult, financialResult, settingsResult, employeeServicesResult, workingHoursResult, timeOffResult, capacityResult] = await Promise.all([
        supabaseClient.from("business_appointments").select("id,client_name,client_email,service,professional,appointment_date,appointment_time,status,created_by,created_at,updated_at").eq("barbershop_id", BARBERSHOP_ID).gte("appointment_date", historyStart.toISOString().slice(0, 10)).order("appointment_date").limit(1000),
        supabaseClient.from("business_clients").select("id,name,phone,email,birthday,notes").eq("barbershop_id", BARBERSHOP_ID).order("name").limit(500),
        supabaseClient.from("privacy_requests").select("id,requester_name,request_type,status,created_at").eq("barbershop_id", BARBERSHOP_ID).order("created_at", { ascending: false }).limit(100),
        supabaseClient.rpc("list_services_catalog", { target_barbershop_id: BARBERSHOP_ID }),
        supabaseClient.from("employees").select("id,name,specialty,commission_percentage,active").eq("barbershop_id", BARBERSHOP_ID).eq("active", true).order("name"),
        supabaseClient.from("financial_entries").select("id,description,category,entry_type,amount,occurred_on").eq("barbershop_id", BARBERSHOP_ID).gte("occurred_on", historyStart.toISOString().slice(0, 10)).order("occurred_on", { ascending: false }).limit(1000),
        supabaseClient.from("business_settings").select("display_name,segment,open_time,close_time,slot_duration_minutes").eq("barbershop_id", BARBERSHOP_ID).maybeSingle(),
        supabaseClient.from("employee_services").select("employee_id,service_id").eq("barbershop_id", BARBERSHOP_ID),
        supabaseClient.from("employee_working_hours").select("id,employee_id,weekday,start_time,end_time").eq("barbershop_id", BARBERSHOP_ID).order("weekday").order("start_time"),
        supabaseClient.from("employee_time_off").select("id,employee_id,starts_at,ends_at,reason").eq("barbershop_id", BARBERSHOP_ID).gte("ends_at", new Date().toISOString().slice(0,16)).order("starts_at").limit(500),
        currentRole === "employee" ? Promise.resolve({ data: null, error: null }) : supabaseClient.rpc("business_plan_capacity", { target_barbershop_id: BARBERSHOP_ID })
    ]);
    if (appointmentsResult.error) throw appointmentsResult.error;
    if (clientsResult.error) throw clientsResult.error;
    if (privacyResult.error) throw privacyResult.error;
    if (servicesResult.error) throw servicesResult.error;
    if (employeesResult.error) throw employeesResult.error;
    if (financialResult.error) throw financialResult.error;
    if (settingsResult.error) throw settingsResult.error;
    if (employeeServicesResult.error) throw employeeServicesResult.error;
    if (workingHoursResult.error) throw workingHoursResult.error;
    if (timeOffResult.error) throw timeOffResult.error;
    if (capacityResult.error) throw capacityResult.error;
    appointmentsCache = (appointmentsResult.data || []).map(appointmentFromDatabase);
    clientsCache = (clientsResult.data || []).map((row) => ({ id: row.id, name: row.name, phone: row.phone,
        email: row.email, birthday: row.birthday || "", notes: row.notes || "" }));
    remoteAppointmentIds = new Set(appointmentsCache.map((item) => item.id));
    remoteClientIds = new Set(clientsCache.map((item) => item.id));
    privacyRequestsCache = privacyResult.data || [];
    servicesCache = servicesResult.data || [];
    professionalsCache = employeesResult.data || [];
    employeeServicesCache = employeeServicesResult.data || [];
    workingHoursCache = workingHoursResult.data || [];
    timeOffCache = timeOffResult.data || [];
    if (capacityResult.data) planCapacityCache = capacityResult.data;
    financialCache = financialResult.data || [];
    if (settingsResult.data) { businessSettingsCache = { name: settingsResult.data.display_name, segment: settingsResult.data.segment, openTime: String(settingsResult.data.open_time).slice(0,5), closeTime: String(settingsResult.data.close_time).slice(0,5), slotDuration: String(settingsResult.data.slot_duration_minutes) }; businessConfig.name = businessSettingsCache.name; businessConfig.segment = businessSettingsCache.segment; }
    if (servicesCache.length) businessConfig.services = servicesCache.map((service) => [service.name, Number(service.price), service.description || "", Number(service.cost), service.category, service.duration_minutes]);
    if (professionalsCache.length) businessConfig.professionals = professionalsCache.map((employee) => employee.name);
    const { data: publicBookingSettings } = await supabaseClient.rpc("get_public_booking_settings", { target_barbershop_id: BARBERSHOP_ID });
    if (publicBookingSettings) publicBookingSettingsCache = publicBookingSettings;
    applyBusinessCustomization();
    await importLocalDataOnce();
}

async function initializeOperationalDashboard() {
    const savedSettings = getSettings();
    if (savedSettings.name) businessConfig.name = savedSettings.name;
    if (savedSettings.segment) businessConfig.segment = savedSettings.segment;
    if (!BARBERSHOP_ID) return;
    await loadOperationalData();
    await applyProductAccess();
    await refreshNotifications();
    updateClientCount();
    renderClients();
    renderDashboardAgenda();
    renderBusinessIndicators();
    renderPrivacyRequests();
    renderAgenda();
    renderServices();
    renderProfessionals();
    renderPlanCapacity();
    renderFinancial();
}

initializeOperationalDashboard().catch((error) => reportDataError("carregar os dados", error));
