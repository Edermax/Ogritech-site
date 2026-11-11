/* OGRITECH - DEFINIÇÃO DE NOVA SENHA */

const updatePasswordForm = document.getElementById("updatePasswordForm");
const confirmAccessButton = document.getElementById("confirmAccessButton");
const accessLinkMessage = document.getElementById("accessLinkMessage");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const updatePasswordMessage = document.getElementById("updatePasswordMessage");
const invalidRecoveryMessage = document.getElementById("invalidRecoveryMessage");
const updateButton = updatePasswordForm.querySelector('button[type="submit"]');
const backToLoginLink = document.getElementById("backToLoginLink");
const passwordToggleButtons = updatePasswordForm.querySelectorAll("[data-password-target]");
const loginUrl = window.ogritechEnvironmentUrl("login/");
const passwordRequirements = "Use pelo menos 8 caracteres, com uma letra maiúscula, uma minúscula, um número e um símbolo como !, @ ou #.";
const passwordSymbols = "!@#$%^&*()_+-=[]{};'\":\\|<>?,./`~";

backToLoginLink.href = loginUrl;


passwordToggleButtons.forEach((toggleButton) => {
    toggleButton.addEventListener("click", () => {
        const passwordInput = document.getElementById(toggleButton.dataset.passwordTarget);
        const isVisible = passwordInput.type === "text";
        passwordInput.type = isVisible ? "password" : "text";
        toggleButton.setAttribute("aria-pressed", String(!isVisible));
        toggleButton.setAttribute("aria-label", isVisible ? "Mostrar senha" : "Ocultar senha");
        toggleButton.title = isVisible ? "Mostrar senha" : "Ocultar senha";
        toggleButton.classList.toggle("is-visible", !isVisible);
        passwordInput.focus();
    });
});

const recoveryUrl = new URL(window.location.href);
const recoveryHash = new URLSearchParams(recoveryUrl.hash.replace(/^#/, ""));
const callbackType = recoveryUrl.searchParams.get("type") || recoveryHash.get("type");
const tokenHash = recoveryHash.get("token_hash") || recoveryUrl.searchParams.get("token_hash");
let recoveryInitialized = false;
let recoveryAccessToken = null;

function clearCallbackUrl() {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.hash = "";
    for (const key of ["code", "token_hash", "type", "error", "error_code", "error_description"]) cleanUrl.searchParams.delete(key);
    window.history.replaceState({}, document.title, cleanUrl);
}

function invalidLink() {
    confirmAccessButton.classList.add("hidden");
    updatePasswordForm.classList.add("hidden");
    accessLinkMessage.textContent = "Este link é inválido, expirou ou já foi utilizado. Abra o e-mail mais recente ou solicite um novo link na página de login.";
    accessLinkMessage.className = "login-message error";
    clearCallbackUrl();
}

function showRecoveryForm(session) {
    if (!session || recoveryInitialized) return;
    recoveryInitialized = true;
    invalidRecoveryMessage.classList.add("hidden");
    confirmAccessButton.classList.add("hidden");
    accessLinkMessage.textContent = "Link validado. Escolha sua senha abaixo.";
    updatePasswordForm.classList.remove("hidden");
    updatePasswordMessage.textContent = passwordRequirements;
    clearCallbackUrl();
}

async function initializeRecovery() {
    if (recoveryUrl.searchParams.has("error") || recoveryHash.has("error")) return invalidLink();
    if (tokenHash && ["invite", "recovery"].includes(callbackType)) {
        // Only a human click consumes the one-time link; mail scanners may prefetch the page.
        accessLinkMessage.textContent = "Clique em continuar para validar seu link. Nenhum código é necessário.";
        confirmAccessButton.classList.remove("hidden");
        confirmAccessButton.addEventListener("click", async () => {
            confirmAccessButton.disabled = true;
            accessLinkMessage.textContent = "Validando seu link...";
            try {
                const { data, error } = await supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type: callbackType });
                if (error || !data.session) return invalidLink();
                showRecoveryForm(data.session);
            } catch { invalidLink(); }
        }, { once: true });
        return;
    }
    try {
        const accessToken = recoveryHash.get("access_token");
        const refreshToken = recoveryHash.get("refresh_token");
        if (accessToken && ["invite", "recovery"].includes(callbackType)) {
            if (refreshToken) {
                const { data, error } = await supabaseClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                if (!error && data.session) return showRecoveryForm(data.session);
            } else {
                const { data, error } = await supabaseClient.auth.getUser(accessToken);
                if (!error && data.user) { recoveryAccessToken = accessToken; return showRecoveryForm({ user: data.user }); }
            }
        }
        const code = recoveryUrl.searchParams.get("code");
        if (code) {
            const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
            if (!error && data.session) return showRecoveryForm(data.session);
        }
    } catch { /* Invalid or disconnected callback: show an actionable link error. */ }
    invalidLink();
}

updatePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const newPassword = newPasswordInput.value;
    const confirmation = confirmPasswordInput.value;

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) ||
        !/[0-9]/.test(newPassword) || !Array.from(newPassword).some((character) => passwordSymbols.includes(character))) {
        updatePasswordMessage.textContent = passwordRequirements;
        updatePasswordMessage.className = "login-message error";
        newPasswordInput.focus();
        return;
    }

    if (newPassword !== confirmation) {
        updatePasswordMessage.textContent = "As senhas não coincidem.";
        updatePasswordMessage.className = "login-message error";
        return;
    }

    updateButton.disabled = true;
    if (!recoveryInitialized) { updateButton.disabled = false; return invalidLink(); }
    updatePasswordMessage.textContent = "Salvando nova senha...";
    updatePasswordMessage.className = "login-message";

    let updateError = null;

    try {
        if (recoveryAccessToken) {
            const response = await fetch(`${window.OGRITECH_SUPABASE_URL}/auth/v1/user`, {
                method: "PUT",
                headers: {
                    apikey: window.OGRITECH_SUPABASE_PUBLISHABLE_KEY,
                    Authorization: `Bearer ${recoveryAccessToken}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ password: newPassword })
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                updateError = { code: body.error_code, status: response.status };
            }
        } else {
            const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
            updateError = error;
        }
    } catch (error) {
        updateError = error;
    }

    if (updateError) {
        if (updateError.code === "weak_password") {
            updatePasswordMessage.textContent = `Escolha uma senha mais forte. ${passwordRequirements}`;
        } else if (updateError.code === "same_password") {
            updatePasswordMessage.textContent = "Escolha uma senha diferente da atual.";
        } else if (updateError.status === 401 || ["session_not_found", "session_expired"].includes(updateError.code)) {
            return invalidLink();
        } else {
            updatePasswordMessage.textContent = "Não foi possível salvar a senha agora. Confira a senha e tente novamente nesta página.";
        }
        updatePasswordMessage.className = "login-message error";
        updateButton.disabled = false;
        return;
    }

    if (recoveryAccessToken) {
        await fetch(`${window.OGRITECH_SUPABASE_URL}/auth/v1/logout?scope=global`, {
            method: "POST",
            headers: {
                apikey: window.OGRITECH_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${recoveryAccessToken}`
            }
        });
        recoveryAccessToken = null;
        const cleanUrl = new URL(window.location.href);
        cleanUrl.hash = "";
        window.history.replaceState({}, document.title, cleanUrl);
    } else {
        await supabaseClient.auth.signOut();
    }
    sessionStorage.removeItem("ogritechRecoveryEmail");
    updatePasswordMessage.textContent =
        "Senha atualizada. Redirecionando para o login...";
    updatePasswordMessage.className = "login-message success";
    updatePasswordForm.reset();
    updateButton.disabled = true;
    window.setTimeout(() => window.location.replace(loginUrl), 2000);
});

initializeRecovery();
