/* =========================================================
   OGRITECH - ÁREA DO CLIENTE DA BARBEARIA
   ETAPA 5: Agenda integrada.

   Contas reais compartilham a agenda via Supabase.
   localStorage é usado somente nos ambientes demonstrativos.
   ========================================================= */

// =========================================================
// 1. PROTEÇÃO DA PÁGINA
// =========================================================
document.documentElement.style.visibility = "hidden";

// =========================================================
// 2. SESSÃO DO CLIENTE
// =========================================================
let loggedClientName = "Cliente";
let loggedClientEmail = "";
let clientBarbershopId = "";
const businessConfig = window.getOgritechBusiness();
const isDemoClient = sessionStorage.getItem("japaDemo") === "true";
let clientAppointmentsCache = [];
let remoteClientAppointmentIds = new Set();

// =========================================================
// 3. ELEMENTOS
// =========================================================
const clientUserName =
    document.getElementById("clientUserName");

const clientLogout =
    document.getElementById("clientLogout");

const openClientAppointment =
    document.getElementById("openClientAppointment");

const closeClientAppointment =
    document.getElementById("closeClientAppointment");

const clientAppointmentModal =
    document.getElementById("clientAppointmentModal");

const clientAppointmentForm =
    document.getElementById("clientAppointmentForm");

const clientAppointmentsList =
    document.getElementById("clientAppointmentsList");

const clientAppointmentsEmpty =
    document.getElementById("clientAppointmentsEmpty");

const nextClientAppointment =
    document.getElementById("nextClientAppointment");

const clientService =
    document.getElementById("clientService");

const clientProfessional =
    document.getElementById("clientProfessional");

const clientDate =
    document.getElementById("clientDate");

const clientTime =
    document.getElementById("clientTime");

const privacyRequestModal = document.getElementById("privacyRequestModal");
const privacyRequestForm = document.getElementById("privacyRequestForm");
const privacyRequestMessage = document.getElementById("privacyRequestMessage");

// =========================================================
// 4. CONFIGURAÇÃO
// =========================================================
function appointmentsStorageKey() {
    return `japaNaBarbaAppointments:${clientBarbershopId}`;
}

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

// =========================================================
// 5. FUNÇÕES UTILITÁRIAS
// =========================================================
function createId() {
    if (window.crypto && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
    const today = new Date();
    const year = today.getFullYear();
    const month =
        String(today.getMonth() + 1).padStart(2, "0");
    const day =
        String(today.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function formatClientDate(date) {
    if (!date) return "";

    const [year, month, day] =
        date.split("-");

    return `${day}/${month}/${year}`;
}

function getAppointments() {
    if (!isDemoClient) return clientAppointmentsCache;
    try {
        const appointments = JSON.parse(
            localStorage.getItem(
                appointmentsStorageKey()
            )
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
    } catch {
        return [];
    }
}

async function saveAppointments(appointments) {
    if (isDemoClient) {
        localStorage.setItem(appointmentsStorageKey(), JSON.stringify(appointments));
        return true;
    }

    const newAppointments = appointments.filter((item) => !remoteClientAppointmentIds.has(item.id));
    const rows = newAppointments.map((item) => ({ id: item.id, barbershop_id: clientBarbershopId,
        client_name: item.clientName, client_email: item.clientEmail, service: item.service,
        professional: item.professional, appointment_date: item.date, appointment_time: item.time,
        status: item.status, created_by: item.createdBy || "client",
        created_at: item.createdAt || new Date().toISOString(), updated_at: item.updatedAt || new Date().toISOString() }));
    if (!rows.length) return true;
    const { error } = await supabaseClient.from("business_appointments").insert(rows);
    if (error) {
        console.error("Erro ao salvar agendamento:", error);
        alert(error.code === "23505" ? "Esse horário acabou de ser ocupado. Escolha outro horário." : "Não foi possível salvar o agendamento. Tente novamente.");
        return false;
    }
    clientAppointmentsCache = appointments;
    newAppointments.forEach((item) => remoteClientAppointmentIds.add(item.id));
    return true;
}

function appointmentFromDatabase(row) {
    return { id: row.id, clientName: row.client_name, clientEmail: row.client_email,
        service: row.service, professional: row.professional, date: row.appointment_date,
        time: String(row.appointment_time).slice(0, 5), status: row.status,
        createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at };
}

function myAppointments() {
    return getAppointments().filter(
        (appointment) =>
            appointment.clientEmail === loggedClientEmail
    );
}

// Horário cancelado volta a ficar livre.
function isTimeOccupied(date, time, professional) {
    return getAppointments().some(
        (appointment) =>
            appointment.date === date &&
            appointment.time === time &&
            appointment.professional === professional &&
            appointment.status !== "cancelled"
    );
}

// =========================================================
// 6. DADOS DO CLIENTE
// =========================================================
// =========================================================
// 7. RENDERIZAÇÃO DOS AGENDAMENTOS
// =========================================================
function renderClientAppointments() {
    const appointments =
        myAppointments()
            .sort((a, b) =>
                `${a.date}T${a.time}`
                    .localeCompare(
                        `${b.date}T${b.time}`
                    )
            );

    clientAppointmentsList.innerHTML = "";

    if (appointments.length === 0) {
        clientAppointmentsEmpty
            .classList.remove("hidden");

        nextClientAppointment.textContent =
            "Nenhum";

        return;
    }

    clientAppointmentsEmpty
        .classList.add("hidden");

    appointments.forEach((appointment) => {
        const info =
            STATUS_INFO[appointment.status] ||
            STATUS_INFO.requested;

        const item =
            document.createElement("article");

        item.className =
            "client-appointment-card";

        const canCancel =
            appointment.status === "requested" ||
            appointment.status === "confirmed";

        item.innerHTML = `
            <div>
                <span class="client-appointment-date">
                    ${escapeHtml(formatClientDate(appointment.date))}
                    •
                    ${escapeHtml(appointment.time)}
                </span>

                <strong>
                    ${escapeHtml(appointment.service)}
                </strong>

                <small>
                    Profissional: ${escapeHtml(appointment.professional)}
                </small>
            </div>

            <div class="client-appointment-actions">

                <span class="status ${info.className}">
                    ${info.label}
                </span>

                ${
                    canCancel
                        ? `
                            <button
                                type="button"
                                class="table-button delete"
                                data-cancel-appointment="${appointment.id}"
                            >
                                Cancelar
                            </button>
                        `
                        : ""
                }

            </div>
        `;

        clientAppointmentsList
            .appendChild(item);
    });

    // Próximo horário ativo.
    const nowKey = `${todayISO()}T${new Date().toTimeString().slice(0, 5)}`;
    const next =
        appointments.find(
            (appointment) =>
                appointment.status !== "cancelled" &&
                appointment.status !== "completed" &&
                `${appointment.date}T${appointment.time}` >= nowKey
        );

    nextClientAppointment.textContent =
        next
            ? `${formatClientDate(next.date)} às ${next.time}`
            : "Nenhum";
}

// =========================================================
// 8. MODAL
// =========================================================
function openClientAppointmentModal() {
        clientAppointmentForm.reset();
        clientDate.min = todayISO();

        if (!isDemoClient) {
            clientTime.innerHTML = '<option value="">Selecione serviço, profissional e data</option>';
            clientTime.disabled = true;
        }

        clientAppointmentModal
            .classList.remove("hidden");
}

openClientAppointment.addEventListener("click", openClientAppointmentModal);
document.getElementById("mobileOpenClientAppointment")?.addEventListener("click", openClientAppointmentModal);

closeClientAppointment.addEventListener(
    "click",
    () => {
        clientAppointmentModal
            .classList.add("hidden");
    }
);

clientAppointmentModal.addEventListener(
    "click",
    (event) => {
        if (event.target === clientAppointmentModal) {
            clientAppointmentModal
                .classList.add("hidden");
        }
    }
);

async function refreshAvailableSlots() {
    if (isDemoClient) return;
    const service = (window.__ogritechServices || []).find((item) => item.name === clientService.value);
    const employee = (window.__ogritechEmployees || []).find((item) => item.name === clientProfessional.value);
    if (!service || !employee || !clientDate.value) {
        clientTime.innerHTML = '<option value="">Selecione serviço, profissional e data</option>';
        clientTime.disabled = true;
        return;
    }
    clientTime.disabled = true;
    clientTime.innerHTML = '<option value="">Consultando horários...</option>';
    const { data, error } = await supabaseClient.rpc("list_available_slots", {
        target_barbershop_id: clientBarbershopId,
        target_service_id: service.id,
        target_employee_id: employee.id,
        target_date: clientDate.value
    });
    if (error) {
        console.error("Erro ao consultar disponibilidade:", error);
        clientTime.innerHTML = '<option value="">Não foi possível consultar agora</option>';
        return;
    }
    const slots = (data || []).map((item) => String(item.slot_time).slice(0, 5));
    clientTime.innerHTML = slots.length
        ? '<option value="">Selecione</option>' + slots.map((slot) => `<option value="${escapeHtml(slot)}">${escapeHtml(slot)}</option>`).join("")
        : '<option value="">Nenhum horário disponível</option>';
    clientTime.disabled = slots.length === 0;
}

[clientService, clientProfessional, clientDate].forEach((field) => field.addEventListener("change", refreshAvailableSlots));

document.getElementById("openPrivacyRequest").addEventListener("click", () => {
    privacyRequestForm.reset();
    privacyRequestMessage.textContent = "";
    privacyRequestModal.classList.remove("hidden");
});

document.getElementById("closePrivacyRequest").addEventListener("click", () => privacyRequestModal.classList.add("hidden"));
privacyRequestModal.addEventListener("click", (event) => {
    if (event.target === privacyRequestModal) privacyRequestModal.classList.add("hidden");
});

privacyRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isDemoClient) {
        privacyRequestMessage.textContent = "No ambiente demonstrativo, envie a solicitação para privacidade@ogritech.com.br.";
        privacyRequestMessage.className = "form-message error";
        return;
    }
    const button = document.getElementById("sendPrivacyRequest");
    button.disabled = true;
    privacyRequestMessage.textContent = "Registrando solicitação...";
    privacyRequestMessage.className = "form-message";
    const { error } = await supabaseClient.from("privacy_requests").insert({
        barbershop_id: clientBarbershopId,
        requester_name: loggedClientName,
        requester_email: loggedClientEmail,
        request_type: document.getElementById("privacyRequestType").value,
        details: document.getElementById("privacyRequestDetails").value.trim()
    });
    button.disabled = false;
    if (error) {
        console.error("Erro ao registrar solicitação de privacidade:", error);
        privacyRequestMessage.textContent = "Não foi possível registrar agora. Use privacidade@ogritech.com.br.";
        privacyRequestMessage.className = "form-message error";
        return;
    }
    privacyRequestMessage.textContent = "Solicitação recebida. Guarde esta confirmação para acompanhamento.";
    privacyRequestMessage.className = "form-message success";
    privacyRequestForm.reset();
});

async function registerPrivacyAcknowledgement() {
    if (isDemoClient) return;
    const { error } = await supabaseClient.from("privacy_acknowledgements").upsert({
        barbershop_id: clientBarbershopId,
        document_type: "privacy_notice",
        document_version: "1.0"
    }, { onConflict: "user_id,document_type,document_version", ignoreDuplicates: true });
    if (error) console.error("Erro ao registrar ciência do aviso de privacidade:", error);
}

// =========================================================
// 9. NOVO AGENDAMENTO
// =========================================================
clientAppointmentForm.addEventListener(
    "submit",
    async (event) => {
        event.preventDefault();

        if (
            isTimeOccupied(
                clientDate.value,
                clientTime.value,
                clientProfessional.value
            )
        ) {
            alert(
                "Esse horário já está ocupado para o profissional escolhido. Selecione outro horário."
            );

            return;
        }

        const newAppointment = {
            id: createId(),
            clientName: loggedClientName,
            clientEmail: loggedClientEmail,
            service: clientService.value,
            professional: clientProfessional.value,
            date: clientDate.value,
            time: clientTime.value,

            // Agendamento feito pelo cliente precisa
            // ser confirmado pela equipe.
            status: "requested",

            createdBy: "client",
            createdAt: new Date().toISOString()
        };
        if (isDemoClient) {
            if (!await saveAppointments([...getAppointments(), newAppointment])) return;
        } else {
            const service = (window.__ogritechServices || []).find((item) => item.name === newAppointment.service);
            const employee = (window.__ogritechEmployees || []).find((item) => item.name === newAppointment.professional);
            if (!service || !employee) return alert("Serviço ou profissional inválido. Atualize a página.");
            const { data, error } = await supabaseClient.rpc("create_appointment", {
                target_barbershop_id: clientBarbershopId, target_service_id: service.id, target_employee_id: employee.id,
                target_date: newAppointment.date, target_time: newAppointment.time,
                supplied_client_name: null, supplied_client_email: null
            });
            if (error) return alert(error.code === "23505" ? "Esse horário acabou de ser ocupado." : "Não foi possível agendar. Verifique o horário e tente novamente.");
            const created = appointmentFromDatabase(data); clientAppointmentsCache.push(created); remoteClientAppointmentIds.add(created.id);
        }
        await registerPrivacyAcknowledgement();

        clientAppointmentForm.reset();

        clientAppointmentModal
            .classList.add("hidden");

        renderClientAppointments();

        alert(
            "Agendamento solicitado. Aguarde a confirmação da barbearia."
        );
    }
);

// =========================================================
// 10. CANCELAMENTO PELO CLIENTE
// =========================================================
clientAppointmentsList.addEventListener(
    "click",
    async (event) => {
        const cancelButton =
            event.target.closest(
                "[data-cancel-appointment]"
            );

        if (!cancelButton) return;

        const confirmed =
            confirm(
                "Deseja cancelar este agendamento?"
            );

        if (!confirmed) return;

        const appointments =
            getAppointments();

        const index =
            appointments.findIndex(
                (appointment) =>
                    appointment.id ===
                    cancelButton.dataset.cancelAppointment
            );

        if (
            index < 0 ||
            appointments[index].clientEmail !== loggedClientEmail ||
            !["requested", "confirmed"].includes(appointments[index].status)
        ) return;

        // Em vez de apagar o registro, alteramos o status.
        // Isso preserva o histórico.
        const previousStatus = appointments[index].status;
        appointments[index].status = "cancelled";

        appointments[index].updatedAt =
            new Date().toISOString();

        if (isDemoClient) {
            if (!await saveAppointments(appointments)) return;
        } else {
            const { data: cancelled, error } = await supabaseClient.rpc("cancel_my_appointment", { appointment_id: appointments[index].id });
            if (error || !cancelled) {
                appointments[index].status = previousStatus;
                console.error("Erro ao cancelar agendamento:", error);
                alert("Não foi possível cancelar este agendamento.");
                return;
            }
            clientAppointmentsCache = appointments;
        }
        renderClientAppointments();
    }
);

// =========================================================
// 11. LOGOUT
// =========================================================
clientLogout.addEventListener(
    "click",
    async () => {
        await supabaseClient.auth.signOut();
        ["japaAuth", "japaRole", "japaUserName", "japaUserRole", "japaUserEmail", "japaUserId", "japaBarbershopId", "japaDemo", "japaDemoSegment"]
            .forEach((key) => sessionStorage.removeItem(key));
        window.location.replace("/login/");
    }
);

// =========================================================
// 12. INICIALIZAÇÃO
// =========================================================
function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[character]));
}

function applyClientBusinessCustomization() {
    window.applyOgritechBusinessTheme(businessConfig);
    const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    const logo = document.getElementById("clientBusinessLogo");
    const icon = document.getElementById("clientBusinessIcon");
    document.title = `${businessConfig.name} | Ogritech`;
    document.getElementById("clientBusinessName").textContent = businessConfig.name.toUpperCase();
    document.getElementById("clientAreaLabel").textContent = `Área de ${businessConfig.clientLabel.toLowerCase()}`;
    document.getElementById("clientHeroTitle").textContent = businessConfig.hero;
    document.getElementById("clientServiceCount").textContent = businessConfig.services.length;
    if (businessConfig.key === "barbearia") {
        logo.classList.remove("hidden");
        icon.classList.add("hidden");
    } else {
        logo.classList.add("hidden");
        icon.textContent = businessConfig.icon;
        icon.style.color = businessConfig.color;
        icon.classList.remove("hidden");
    }

    document.getElementById("clientServicesGrid").innerHTML = businessConfig.services.map((service) =>
        `<article class="client-service-card"><span class="large-service-icon" style="color:${businessConfig.color}">${escapeHtml(businessConfig.icon)}</span><h3>${escapeHtml(service[0])}</h3><p>${escapeHtml(service[2])}</p><strong>${currency.format(service[1])}</strong></article>`
    ).join("");

    clientService.innerHTML = '<option value="">Selecione</option>' + businessConfig.services.map((service) =>
        `<option value="${escapeHtml(service[0])}">${escapeHtml(service[0])} — ${currency.format(service[1])}</option>`
    ).join("");
    clientProfessional.innerHTML = '<option value="">Selecione</option>' + businessConfig.professionals.map((name) =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join("");
    if (isDemoClient) {
        clientTime.innerHTML = '<option value="">Selecione</option>' + ["09:00", "10:00", "11:00", "13:30", "15:00", "16:30", "18:00"]
            .map((slot) => `<option value="${slot}">${slot}</option>`).join("");
        clientTime.disabled = false;
    }
}

async function initializeClientPage() {
    if (
        sessionStorage.getItem("japaDemo") === "true" &&
        sessionStorage.getItem("japaRole") === "client" &&
        sessionStorage.getItem("japaBarbershopId") === `demo-${businessConfig.key}`
    ) {
        loggedClientName = sessionStorage.getItem("japaUserName") || "Cliente";
        loggedClientEmail = sessionStorage.getItem("japaUserEmail") || "";
        clientBarbershopId = `demo-${businessConfig.key}`;
        clientUserName.textContent = loggedClientName;
        clientDate.min = todayISO();
        applyClientBusinessCustomization();
        document.documentElement.style.visibility = "visible";
        renderClientAppointments();
        return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.replace("/login/");
        return;
    }

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("barbershop_id, full_name, role, active")
        .eq("id", session.user.id)
        .single();

    if (error || !profile?.active || profile.role !== "client" || !profile.barbershop_id) {
        if (profile?.role && profile.role !== "client") {
            window.location.replace("/painel/");
            return;
        }
        await supabaseClient.auth.signOut();
        window.location.replace("/login/");
        return;
    }

    loggedClientName = profile.full_name || "Cliente";
    loggedClientEmail = session.user.email || "";
    clientBarbershopId = profile.barbershop_id;
    const { data: appointments, error: appointmentsError } = await supabaseClient
        .from("business_appointments").select("id,client_name,client_email,service,professional,appointment_date,appointment_time,status,created_by,created_at,updated_at").eq("barbershop_id", clientBarbershopId).gte("appointment_date", todayISO()).order("appointment_date").limit(100);
    if (appointmentsError) throw appointmentsError;
    clientAppointmentsCache = (appointments || []).map(appointmentFromDatabase);
    remoteClientAppointmentIds = new Set(clientAppointmentsCache.map((item) => item.id));
    const [servicesResult, employeesResult] = await Promise.all([
        supabaseClient.rpc("list_services_catalog", { target_barbershop_id: clientBarbershopId }),
        supabaseClient.from("employees").select("id,name,specialty").eq("barbershop_id", clientBarbershopId).eq("active", true).order("name")
    ]);
    if (servicesResult.error) throw servicesResult.error;
    if (employeesResult.error) throw employeesResult.error;
    window.__ogritechServices = servicesResult.data || [];
    window.__ogritechEmployees = employeesResult.data || [];
    if (servicesResult.data?.length) businessConfig.services = servicesResult.data.map((service) => [service.name, Number(service.price), service.description || "", Number(service.cost), service.category, service.duration_minutes]);
    if (employeesResult.data?.length) businessConfig.professionals = employeesResult.data.map((employee) => employee.name);
    clientUserName.textContent = loggedClientName;
    clientDate.min = todayISO();
    applyClientBusinessCustomization();
    document.documentElement.style.visibility = "visible";
    renderClientAppointments();
}

initializeClientPage().catch(() => window.location.replace("/login/"));
