/* OGRITECH - AUTENTICAÇÃO COM SUPABASE */

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginMessage = document.getElementById("loginMessage");
const submitButton = loginForm.querySelector('button[type="submit"]');
const forgotPasswordButton = document.getElementById("forgotPasswordButton");
const togglePasswordButton = document.getElementById("togglePasswordButton");

const loginParameters = new URLSearchParams(window.location.search);
if (loginParameters.get("reset_demo") === "1") {
    [
        "japaAuth", "japaRole", "japaUserName", "japaUserRole",
        "japaUserEmail", "japaUserId", "japaBarbershopId", "japaDemo",
        "japaDemoSegment", "ogritechOperationalSession"
    ].forEach((key) => sessionStorage.removeItem(key));
    loginParameters.delete("reset_demo");
    const cleanLoginUrl = new URL(window.location.href);
    cleanLoginUrl.search = loginParameters.toString();
    window.history.replaceState({}, document.title, cleanLoginUrl);
}

togglePasswordButton.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    togglePasswordButton.setAttribute("aria-pressed", String(!isVisible));
    togglePasswordButton.setAttribute("aria-label", isVisible ? "Mostrar senha" : "Ocultar senha");
    togglePasswordButton.title = isVisible ? "Mostrar senha" : "Ocultar senha";
    togglePasswordButton.classList.toggle("is-visible", !isVisible);
    passwordInput.focus();
});

const ROLE_LABELS = {
    owner: "Proprietário",
    admin: "Administrador",
    employee: "Funcionário",
    client: "Cliente"
};

function saveLocalSession(user, profile) {
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

async function destinationFor(role) {
    const { data: isPlatformAdmin } = await supabaseClient.rpc("is_platform_admin");
    if (isPlatformAdmin) return window.ogritechEnvironmentUrl("admin.html");
    return window.ogritechEnvironmentUrl(role === "client" ? "cliente.html" : "painel/");
}

async function restoreExistingSession() {
    if (sessionStorage.getItem("japaDemo") === "true") {
        const role = sessionStorage.getItem("japaRole");
        window.location.replace(window.ogritechEnvironmentUrl(role === "client" ? "cliente.html" : "painel/"));
        return;
    }
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return;

    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("barbershop_id, full_name, role, active")
        .eq("id", session.user.id)
        .single();

    if (error || !profile?.active) return;

    saveLocalSession(session.user, profile);
    window.location.replace(await destinationFor(profile.role));
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    loginMessage.textContent = "Entrando...";
    loginMessage.className = "login-message";

    const { data, error: loginError } = await supabaseClient.auth
        .signInWithPassword({
            email: emailInput.value.trim().toLowerCase(),
            password: passwordInput.value
        });

    if (loginError || !data.user) {
        loginMessage.textContent = "E-mail ou senha incorretos.";
        loginMessage.className = "login-message error";
        submitButton.disabled = false;
        return;
    }

    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("barbershop_id, full_name, role, active")
        .eq("id", data.user.id)
        .single();

    if (profileError || !profile) {
        await supabaseClient.auth.signOut();
        loginMessage.textContent = "Usuário sem perfil cadastrado.";
        loginMessage.className = "login-message error";
        submitButton.disabled = false;
        return;
    }

    if (!profile.active) {
        await supabaseClient.auth.signOut();
        loginMessage.textContent = "Este usuário está desativado.";
        loginMessage.className = "login-message error";
        submitButton.disabled = false;
        return;
    }

    saveLocalSession(data.user, profile);
    loginMessage.textContent = "Login realizado com sucesso.";
    loginMessage.className = "login-message success";
    window.location.replace(await destinationFor(profile.role));
});

forgotPasswordButton.addEventListener("click", async () => {
    const email = emailInput.value.trim().toLowerCase();

    if (!email) {
        loginMessage.textContent = "Informe seu e-mail para recuperar a senha.";
        loginMessage.className = "login-message error";
        emailInput.focus();
        return;
    }

    forgotPasswordButton.disabled = true;
    loginMessage.textContent = "Enviando código de recuperação...";
    loginMessage.className = "login-message";

    const redirectTo = window.ogritechEnvironmentUrl("update-password.html");

    const { error } = await supabaseClient.auth.resetPasswordForEmail(
        email,
        { redirectTo }
    );

    if (error) {
        loginMessage.textContent =
            "Não foi possível enviar agora. Aguarde um minuto e tente novamente.";
        loginMessage.className = "login-message error";
        forgotPasswordButton.disabled = false;
        return;
    }

    sessionStorage.setItem("ogritechRecoveryEmail", email);
    loginMessage.textContent =
        "Enviamos um código de recuperação para seu e-mail. Verifique também o spam.";
    loginMessage.className = "login-message success";
    forgotPasswordButton.disabled = false;
});

restoreExistingSession();
