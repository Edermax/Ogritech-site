(() => {
    const byId = (id) => document.getElementById(id);
    const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const billingSelectionEnabled = true;
    let center = null;
    let busy = false;

    function safe(value) { return window.escapeHtml ? window.escapeHtml(value) : String(value ?? ""); }
    function message(text, error = false) {
        const target = byId("subscriptionMessage");
        if (!target) return;
        target.textContent = text;
        target.classList.toggle("error", error);
    }
    function friendly(error) {
        if (error?.code === "42501") return "Somente o proprietário pode administrar assinaturas e exportar os dados.";
        if (error?.code === "23505") return "Esta solução já está contratada.";
        return error?.message?.includes("Plano") || error?.message?.includes("Assinatura") || error?.message?.includes("Módulo") ? error.message : "Não foi possível concluir a operação. Tente novamente ou fale com a Ogritech.";
    }
    function activeSubscription(code) { return (center?.subscriptions || []).find((item) => item.product_code === code && !(item.cancel_at_period_end && item.current_period_end && new Date(item.current_period_end) <= new Date())); }
    function render() {
        const list = byId("subscriptionList");
        if (!list || !center) return;
        list.innerHTML = (center.products || []).map((product) => {
            const subscription = activeSubscription(product.code);
            const plans = product.plans || [];
            const selectedPlan = subscription?.plan_id || plans[0]?.id || "";
            const statusNames = { trial: "Teste gratuito", active: "Ativa", grace_period: "Prazo de tolerância", past_due: "Pagamento pendente", suspended: "Suspensa" };
            const status = subscription ? (subscription.cancel_at_period_end ? "Cancelamento agendado" : statusNames[subscription.status] || "Em análise") : "Não contratada";
            const planControls = plans.length ? `<label>Plano<select data-plan-for="${safe(product.code)}">${plans.map((plan) => `<option value="${safe(plan.id)}"${plan.id === selectedPlan ? " selected" : ""}>${safe(plan.name)} · ${money.format(Number(plan.monthly_fee))}/mês</option>`).join("")}</select></label>` : `<p>Nenhum plano disponível.</p>`;
            const paymentControls = billingSelectionEnabled && product.code === "menu" && subscription && ["trial", "grace_period", "past_due"].includes(subscription.status) ? `<fieldset class="billing-choice"><legend>Como deseja continuar após o teste?</legend><div class="billing-choice-grid"><label>Periodicidade<select data-billing-cycle><option value="monthly">Mensal · R$ 49,90</option><option value="annual">Anual · R$ 499,00</option></select></label><label>Forma de pagamento<select data-payment-method><option value="pix">Pix a cada vencimento</option><option value="card">Cartão com renovação automática</option></select></label></div><label class="settings-toggle billing-authorization" hidden><input type="checkbox" data-recurring-authorization><span>Autorizo a cobrança recorrente no cartão após os 14 dias gratuitos.</span></label><p class="section-description">Nada será cobrado hoje. No Pix, você receberá o código antes do vencimento. Seus dados do cardápio não serão apagados se decidir não continuar.</p></fieldset>` : "";
            const modules = subscription && (product.modules || []).length ? `<fieldset><legend>Módulos opcionais</legend>${product.modules.map((module) => { const enabled = (subscription.modules || []).some((item) => item.module_id === module.id && ["trial", "active"].includes(item.status)); return `<label class="settings-toggle"><input type="checkbox" data-module="${safe(module.id)}" data-product="${safe(product.code)}"${enabled ? " checked" : ""}${subscription.cancel_at_period_end ? " disabled" : ""}><span>${safe(module.name)}${module.description ? ` — ${safe(module.description)}` : ""}</span></label>`; }).join("")}</fieldset>` : "";
            let action = `<button class="gold-button" type="button" data-subscription-action="subscribe" data-product="${safe(product.code)}"${!plans.length ? " disabled" : ""}>Contratar solução</button>`;
            if (subscription?.cancel_at_period_end) action = `<button class="gold-button" type="button" data-subscription-action="reactivate" data-product="${safe(product.code)}">Manter assinatura</button>`;
            else if (paymentControls) action = `<button class="gold-button" type="button" data-payment-action data-product="menu">Definir pagamento após o teste</button>`;
            else if (subscription) action = `<button class="table-button edit" type="button" data-subscription-action="change_plan" data-product="${safe(product.code)}">Aplicar plano</button><button class="table-button danger" type="button" data-subscription-action="cancel" data-product="${safe(product.code)}">Cancelar renovação</button>`;
            const until = subscription?.current_period_end ? ` · acesso previsto até ${new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}` : "";
            return `<article><header><div><strong>${safe(product.name)}</strong><p>${safe(product.description)}</p></div><span class="commercial-badge">${status}${until}</span></header>${paymentControls || planControls}${modules}<div class="commercial-actions">${action}</div></article>`;
        }).join("") || "<p>Nenhuma solução disponível.</p>";
        list.querySelectorAll("[data-subscription-action]").forEach((button) => button.addEventListener("click", () => updateSubscription(button)));
        list.querySelectorAll("[data-module]").forEach((input) => input.addEventListener("change", () => updateModule(input)));
        list.querySelectorAll("[data-payment-method]").forEach((select) => select.addEventListener("change", () => {
            const authorization = select.closest(".billing-choice").querySelector(".billing-authorization");
            authorization.hidden = select.value !== "card";
            if (authorization.hidden) authorization.querySelector("input").checked = false;
        }));
        list.querySelectorAll("[data-payment-action]").forEach((button) => button.addEventListener("click", () => choosePayment(button)));
    }
    async function load() {
        if (!byId("subscriptionCenter") || IS_DEMO || !BARBERSHOP_ID || currentRole !== "owner") return;
        message("Carregando suas assinaturas...");
        const { data, error } = await supabaseClient.rpc("business_subscription_center", { target_barbershop_id: BARBERSHOP_ID });
        if (error) return message(friendly(error), true);
        center = data; render(); message("Você controla suas soluções sem atendimento obrigatório.");
    }
    async function updateSubscription(button) {
        if (busy) return;
        const action = button.dataset.subscriptionAction;
        const product = button.dataset.product;
        const plan = byId("subscriptionList").querySelector(`[data-plan-for="${CSS.escape(product)}"]`)?.value || null;
        let reason = null;
        if (action === "cancel") {
            if (!confirm(`Cancelar a renovação de ${activeSubscription(product)?.product_name}? As outras soluções continuarão ativas.`)) return;
            reason = prompt("Motivo opcional do cancelamento (até 500 caracteres):") || "";
            if (reason.length > 500) return message("O motivo pode ter no máximo 500 caracteres.", true);
        }
        busy = true; byId("subscriptionCenter").querySelectorAll("button,input,select").forEach((control) => control.disabled = true);
        message("Processando sua solicitação...");
        const { error } = await supabaseClient.rpc("self_service_product_subscription", { target_barbershop_id: BARBERSHOP_ID, target_product_code: product, target_action: action, target_plan_id: ["subscribe", "change_plan"].includes(action) ? plan : null, target_reason: reason });
        busy = false; byId("exportBusinessData").disabled = false;
        if (error) { render(); return message(friendly(error), true); }
        await load();
        message(action === "cancel" ? "Renovação cancelada. O acesso permanece até o fim do período informado e você pode reativar antes dessa data." : "Assinatura atualizada. Os acessos foram recalculados no servidor.");
        window.loadBusinessProducts?.();
    }
    async function updateModule(input) {
        if (busy) return;
        busy = true; message("Atualizando módulo...");
        const { error } = await supabaseClient.rpc("self_service_subscription_module", { target_barbershop_id: BARBERSHOP_ID, target_product_code: input.dataset.product, target_module_id: input.dataset.module, target_enabled: input.checked });
        busy = false;
        if (error) { input.checked = !input.checked; return message(friendly(error), true); }
        await load(); message("Módulo atualizado sem alterar as outras soluções.");
    }
    async function choosePayment(button) {
        if (busy) return;
        const article = button.closest("article"), cycle = article.querySelector("[data-billing-cycle]").value;
        const paymentMethod = article.querySelector("[data-payment-method]").value;
        const recurringAuthorized = article.querySelector("[data-recurring-authorization]").checked;
        if (paymentMethod === "card" && !recurringAuthorized) return message("Marque a autorização de cobrança recorrente para continuar com cartão.", true);
        busy = true; article.querySelectorAll("button,input,select").forEach((control) => control.disabled = true);
        message("Salvando sua escolha de pagamento...");
        const { data, error } = await supabaseClient.functions.invoke("ogritech-billing", { body: { action: "choose_payment", product: "menu", barbershop_id: BARBERSHOP_ID, cycle, payment_method: paymentMethod, recurring_authorized: recurringAuthorized } });
        busy = false;
        if (error || data?.error) { render(); return message(data?.error?.message || "Não foi possível salvar a forma de pagamento agora.", true); }
        if (data?.data?.checkout_url) { window.location.assign(data.data.checkout_url); return; }
        await load(); message("Forma de pagamento definida. Nada será cobrado antes do fim do teste.");
    }
    byId("exportBusinessData")?.addEventListener("click", async () => {
        if (busy) return;
        busy = true; byId("exportBusinessData").disabled = true; message("Preparando exportação...");
        const { data, error } = await supabaseClient.rpc("business_portability_export", { target_barbershop_id: BARBERSHOP_ID });
        busy = false; byId("exportBusinessData").disabled = false;
        if (error) return message(friendly(error), true);
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const link = document.createElement("a"); link.href = url; link.download = `ogritech-dados-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
        message("Exportação concluída. O arquivo foi gerado diretamente no seu navegador.");
    });
    const originalRenderSettings = window.renderSettings;
    window.renderSettings = function (...args) { const result = originalRenderSettings?.(...args); load(); return result; };
    window.loadSubscriptionCenter = load;
})();
