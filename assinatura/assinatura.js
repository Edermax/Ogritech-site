(() => {
    const $ = (id) => document.getElementById(id);
    const environmentUrl = (path) => window.ogritechEnvironmentUrl?.(path) || path;
    let barbershopId = "";
    let pollTimer = null;
    let pollAttempts = 0;

    function message(text, error = false) {
        $("billingMessage").textContent = text;
        $("billingMessage").classList.toggle("error", error);
    }
    function formatDate(value) {
        return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value)) : "";
    }
    async function invoke(body) {
        const { data, error } = await supabaseClient.functions.invoke("ogritech-billing", { body });
        if (error || data?.error) throw new Error(data?.error?.message || "Não foi possível consultar sua assinatura.");
        return data?.data ?? null;
    }
    function render(state) {
        $("billingForm").classList.add("hidden");
        $("backToMenu").classList.add("hidden");
        $("pixPanel").classList.add("hidden");
        $("pixCode").value = "";
        if (!state) {
            $("billingStatus").textContent = "Sem contratação";
            $("billingSummary").textContent = "Este negócio ainda não tem uma assinatura do Cardápio.";
            $("billingDeadline").textContent = "Não encontramos um teste do Cardápio para este negócio.";
            $("billingForm").classList.add("hidden");
            return;
        }
        const status = {
            trial_active: "Teste gratuito", payment_pending: "Aguardando pagamento", active: "Assinatura ativa",
            past_due: "Pagamento pendente", cancel_at_period_end: "Cancelamento agendado", cancelled: "Encerrada"
        }[state.status] || "Em análise";
        $("billingStatus").textContent = status;
        $("billingStatus").className = `status-pill ${state.status === "active" ? "success" : ["past_due", "cancelled"].includes(state.status) ? "danger" : ""}`;
        $("billingCycle").value = state.cycle === "annual" ? "annual" : "monthly";
        $("paymentMethod").value = state.payment_method === "card" ? "card" : "pix";
        $("recurringLabel").classList.toggle("hidden", $("paymentMethod").value !== "card");
        const deadline = state.access_until || state.trial_ends_at;
        const canChoosePayment = ["trial_active", "past_due"].includes(state.status)
            || (state.status === "payment_pending" && !state.subscription_created && !state.payment_requested);
        $("billingForm").classList.toggle("hidden", !canChoosePayment);
        if (state.status === "active") {
            $("billingSummary").textContent = "Seu pagamento foi confirmado e o Cardápio está disponível.";
            $("billingDeadline").textContent = `Acesso ativo até ${formatDate(deadline)}.`;
            if (new Date(deadline) > new Date()) $("backToMenu").classList.remove("hidden");
        } else if (state.status === "cancel_at_period_end") {
            $("billingSummary").textContent = "A renovação foi cancelada. Você pode usar o Cardápio até o fim do período pago.";
            $("billingDeadline").textContent = `Acesso preservado até ${formatDate(deadline)}.`;
            if (new Date(deadline) > new Date()) $("backToMenu").classList.remove("hidden");
        } else if (state.status === "trial_active") {
            $("billingSummary").textContent = `Seu período gratuito continua por ${state.days_remaining} dia${state.days_remaining === 1 ? "" : "s"}.`;
            $("billingDeadline").textContent = `O teste termina em ${formatDate(state.trial_ends_at)}.`;
            if (new Date(deadline) > new Date()) $("backToMenu").classList.remove("hidden");
        } else if (state.status === "payment_pending") {
            $("billingSummary").textContent = "Aguardamos a confirmação do Mercado Pago.";
            $("billingDeadline").textContent = `Acesso previsto até ${formatDate(deadline)}.`;
        } else if (state.status === "cancelled") {
            $("billingSummary").textContent = "Sua assinatura foi encerrada. Fale com o suporte se deseja retomar o Cardápio.";
            $("billingDeadline").textContent = `O acesso foi encerrado em ${formatDate(deadline)}.`;
        } else {
            $("billingSummary").textContent = "O período gratuito terminou. Regularize para reabrir o Cardápio automaticamente.";
            $("billingDeadline").textContent = `O acesso operacional foi encerrado em ${formatDate(deadline)}.`;
        }
        const hasPix = ["trial_active", "payment_pending", "past_due"].includes(state.status) && Boolean(state.pix?.qr_code);
        $("pixPanel").classList.toggle("hidden", !hasPix);
        if (hasPix) {
            $("pixCode").value = state.pix.qr_code;
            $("pixExpiration").textContent = state.pix.expires_at ? `Este código vence em ${formatDate(state.pix.expires_at)}.` : "";
        }
    }
    async function load() {
        try {
            clearTimeout(pollTimer);
            const state = await invoke({ action: "billing_status", product: "menu", barbershop_id: barbershopId });
            render(state);
            if (new URLSearchParams(location.search).get("pagamento") === "retorno" && state?.status === "payment_pending") {
                if (pollAttempts++ < 12) {
                    message("Aguardando a confirmação do Mercado Pago. Esta página será atualizada automaticamente.");
                    pollTimer = setTimeout(load, 5000);
                } else message("A confirmação ainda não chegou. Consulte novamente mais tarde ou fale com o suporte; não é necessário refazer o pagamento.");
            } else if (state?.status === "active") message("Pagamento confirmado. Seu acesso foi liberado.");
        } catch (error) { $("billingForm").classList.add("hidden"); message(error.message, true); }
    }
    $("paymentMethod").addEventListener("change", () => {
        const card = $("paymentMethod").value === "card";
        $("recurringLabel").classList.toggle("hidden", !card);
        if (!card) $("recurringAuthorization").checked = false;
    });
    $("billingForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const card = $("paymentMethod").value === "card";
        if (card && !$("recurringAuthorization").checked) return message("Autorize a cobrança recorrente para continuar com cartão.", true);
        $("paymentButton").disabled = true; message("Salvando sua escolha…");
        try {
            const result = await invoke({ action: "choose_payment", product: "menu", barbershop_id: barbershopId,
                cycle: $("billingCycle").value, payment_method: $("paymentMethod").value,
                recurring_authorized: $("recurringAuthorization").checked });
            if (result?.checkout_url) { location.assign(result.checkout_url); return; }
            message("Forma de pagamento definida. O Pix aparecerá aqui até 48 horas antes do vencimento.");
            await load();
        } catch (error) { message(error.message, true); }
        finally { $("paymentButton").disabled = false; }
    });
    $("copyPixButton").addEventListener("click", async () => {
        await navigator.clipboard.writeText($("pixCode").value);
        message("Código Pix copiado.");
    });
    $("logoutButton").addEventListener("click", async () => { await supabaseClient.auth.signOut(); location.replace(environmentUrl("login/")); });

    (async () => {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return location.replace(environmentUrl("login/?destino=assinatura"));
        const { data: profile } = await supabaseClient.from("profiles").select("barbershop_id,role,active").eq("id", session.user.id).maybeSingle();
        if (!profile?.active || profile.role !== "owner" || !profile.barbershop_id) return location.replace(environmentUrl("painel/"));
        barbershopId = profile.barbershop_id;
        document.documentElement.style.visibility = "visible";
        await load();
    })().catch(() => { document.documentElement.style.visibility = "visible"; message("Não foi possível abrir sua assinatura. Tente novamente.", true); });
})();
