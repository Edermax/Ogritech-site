/* OGRITECH - SESSÃO E PERMISSÕES COM SUPABASE */

const ROLE_LABELS = {
    owner: "Proprietário",
    admin: "Administrador",
    employee: "Funcionário",
    client: "Cliente"
};

const SESSION_KEYS = [
    "japaAuth", "japaRole", "japaUserName", "japaUserRole",
    "japaUserEmail", "japaUserId", "japaBarbershopId", "japaDemo", "japaDemoSegment"
];

document.documentElement.style.visibility = "hidden";
const environmentUrl = (path) => window.ogritechEnvironmentUrl?.(path) || path;

function clearLocalSession() {
    SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
}

function waitForDocument() {
    if (document.readyState !== "loading") return Promise.resolve();
    return new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
}

async function showAuthenticationError(message) {
    await waitForDocument();
    document.documentElement.style.visibility = "visible";
    const existingMessage = document.getElementById("authenticationError");
    if (existingMessage) {
        existingMessage.textContent = message;
        return;
    }
    const errorMessage = document.createElement("div");
    errorMessage.id = "authenticationError";
    errorMessage.setAttribute("role", "alert");
    errorMessage.textContent = message;
    errorMessage.style.cssText = "position:fixed;inset:16px 16px auto;z-index:2147483646;padding:14px 18px;border:1px solid #ef4444;border-radius:10px;background:#1f1111;color:#fecaca;font:600 14px/1.4 system-ui,sans-serif;text-align:center";
    document.body.appendChild(errorMessage);
}

function saveVerifiedSession(user, profile) {
    sessionStorage.removeItem("japaDemo");
    sessionStorage.removeItem("japaDemoSegment");
    sessionStorage.setItem("japaAuth", "true");
    sessionStorage.setItem("japaRole", profile.role);
    sessionStorage.setItem("japaUserName", profile.full_name);
    sessionStorage.setItem("japaUserRole", ROLE_LABELS[profile.role] || "Usuário");
    sessionStorage.setItem("japaUserEmail", user.email || "");
    sessionStorage.setItem("japaUserId", user.id);
    sessionStorage.setItem("japaBarbershopId", profile.barbershop_id);
}

function renderUser(profile) {
    const nameElement = document.getElementById("loggedUserName");
    const roleElement = document.getElementById("loggedUserRole");
    const avatar = document.querySelector(".avatar");

    if (nameElement) nameElement.textContent = profile.full_name;
    if (roleElement) roleElement.textContent = ROLE_LABELS[profile.role] || "Usuário";

    if (avatar) {
        avatar.textContent = profile.full_name
            .split(" ")
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    }

    if (profile.role === "employee") {
        document
            .querySelectorAll('[data-section="financeiro"], [data-section="configuracoes"]')
            .forEach((item) => item.classList.add("hidden"));

        const eyebrow = document.querySelector(".topbar .eyebrow");
        if (eyebrow) eyebrow.textContent = "PAINEL DO FUNCIONÁRIO";

        document
            .querySelectorAll("#quickAddProfessional, #quickFinancial, [data-owner-only], [data-manager-only]")
            .forEach((button) => button.classList.add("hidden"));
    }
}

async function initializeAuthenticatedPage() {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

    if (sessionError) {
        await showAuthenticationError("Não foi possível validar sua sessão. Atualize a página para tentar novamente.");
        return;
    }

    if (!session) {
        const hadLegacyDemo = sessionStorage.getItem("japaDemo") === "true";
        clearLocalSession();
        window.location.replace(environmentUrl(hadLegacyDemo ? "criar-cardapio/" : "login/"));
        return;
    }

    const { data: isPlatformAdmin, error: platformAdminError } = await supabaseClient.rpc("is_platform_admin");
    if (platformAdminError) {
        console.error("Falha ao validar acesso administrativo:", platformAdminError);
        await showAuthenticationError("Não foi possível validar seu acesso administrativo. Atualize a página para tentar novamente.");
        return;
    }
    if (isPlatformAdmin && !location.pathname.endsWith("admin.html")) {
        if (sessionStorage.getItem("ogritechMasterMode") === "true" && sessionStorage.getItem("ogritechMasterBusinessId")) {
            await waitForDocument();
            renderUser({ role: "owner", full_name: "Master Ogritech", barbershop_id: sessionStorage.getItem("ogritechMasterBusinessId") });
            document.documentElement.style.visibility = "visible";
            document.getElementById("logoutButton")?.addEventListener("click", async () => {
                const loginUrl = environmentUrl("login/");
                await supabaseClient.auth.signOut();
                sessionStorage.clear();
                window.location.replace(loginUrl);
            });
            return;
        }
        window.location.replace(environmentUrl("admin.html")); return;
    }

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("barbershop_id, full_name, role, active")
        .eq("id", session.user.id)
        .single();

    if (error || !profile?.active) {
        await supabaseClient.auth.signOut();
        clearLocalSession();
        window.location.replace(environmentUrl("login/"));
        return;
    }

    if (!profile.barbershop_id || !["owner", "admin", "employee", "client"].includes(profile.role)) {
        await supabaseClient.auth.signOut();
        clearLocalSession();
        window.location.replace(environmentUrl("login/"));
        return;
    }

    // Ao chegar pelo login, estes dados já foram gravados antes da navegação.
    // Em uma abertura direta (nova aba, restauração do navegador etc.), o
    // Supabase pode ter sessão persistida enquanto o sessionStorage está vazio.
    // Só esse segundo caso precisa recarregar, pois script.js lê o contexto do
    // estabelecimento durante sua própria avaliação.
    const operationalSessionKey = `${session.user.id}:${profile.role}:${profile.barbershop_id}`;
    const hasCurrentOperationalContext =
        sessionStorage.getItem("japaAuth") === "true" &&
        sessionStorage.getItem("japaUserId") === session.user.id &&
        sessionStorage.getItem("japaRole") === profile.role &&
        sessionStorage.getItem("japaBarbershopId") === profile.barbershop_id &&
        sessionStorage.getItem("ogritechOperationalSession") === operationalSessionKey;

    saveVerifiedSession(session.user, profile);
    sessionStorage.setItem("ogritechOperationalSession", operationalSessionKey);

    if (profile.role === "owner" && location.pathname.includes("/painel")) {
        const { data: billingResult } = await supabaseClient.functions.invoke("ogritech-billing", {
            body: { action: "billing_status", product: "menu", barbershop_id: profile.barbershop_id }
        });
        const billing = billingResult?.data;
        const boundaryExpired = billing?.boundary && new Date(billing.boundary) <= new Date();
        if (["past_due", "cancelled"].includes(billing?.status) || (billing?.status === "payment_pending" && boundaryExpired)) {
            window.location.replace(environmentUrl("assinatura/"));
            return;
        }
    }

    if (profile.role === "client") {
        window.location.replace(environmentUrl("cliente.html"));
        return;
    }

    if (!hasCurrentOperationalContext) {
        window.location.reload();
        return;
    }

    await waitForDocument();
    renderUser(profile);
    document.documentElement.style.visibility = "visible";

    const logoutButton = document.getElementById("logoutButton");
    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            await supabaseClient.auth.signOut();
            clearLocalSession();
            window.location.replace(environmentUrl("login/"));
        });
    }
}

initializeAuthenticatedPage().catch((error) => {
    console.error("Falha ao inicializar sessão:", error);
    showAuthenticationError("Não foi possível carregar sua sessão. Atualize a página para tentar novamente.");
});
