(() => {
    const byId = (id) => document.getElementById(id);
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
        if (error?.code === "23505") return "O Cardápio já está contratado.";
        return error?.message?.includes("Plano") || error?.message?.includes("Assinatura") || error?.message?.includes("Módulo") ? error.message : "Não foi possível concluir a operação. Tente novamente ou fale com a Ogritech.";
    }
    function activeSubscription(code) { return (center?.subscriptions || []).find((item) => item.product_code === code && !(item.cancel_at_period_end && item.current_period_end && new Date(item.current_period_end) <= new Date())); }
    function render() {
        const list = byId("subscriptionList");
        if (!list || !center) return;
        list.innerHTML = (center.products || []).filter((product) => product.code === "menu").map((product) => {
            const subscription = activeSubscription(product.code);
            const plans = product.plans || [];
            const currentPlan = subscription ? plans.find(plan => plan.id === subscription.plan_id) : null;
            const offer = currentPlan ? OgritechOffers.forPlan(currentPlan) : null;
            const annual = subscription?.billing_cycle === "annual";
            const currentName = offer?.name || subscription?.plan_name || "Plano não identificado";
            const currentPrice = offer ? `${OgritechOffers.format(annual ? offer.annualCents : offer.monthlyCents)} por ${annual ? "ano" : "mês"}` : "Confira os dados da assinatura com o suporte.";
            const description = selected => selected.orders ? "Catálogo completo, entrega, retirada e acompanhamento dos pedidos no painel." : "Catálogo com preços, pesos e opções. O cliente escolhe os produtos e continua o atendimento no WhatsApp.";
            const alternatives = subscription ? plans.filter(plan => plan.id !== subscription.plan_id) : plans;
            const canChange = subscription && offer && !subscription.cancel_at_period_end;
            const planOptions = alternatives.length ? `<section class="subscription-options" aria-label="Outros planos"><h3>${subscription ? "Quer mudar de plano?" : "Conheça os planos"}</h3><p class="section-description">${subscription ? "Veja as outras opções para o seu negócio." : "Escolha um plano para começar."}</p><div class="subscription-options-grid">${alternatives.map(plan => {
                const alternative = OgritechOffers.forPlan(plan);
                return `<article class="subscription-option" data-alternative-plan="${safe(alternative.code)}"><h4>${safe(alternative.name)}</h4><p class="subscription-option-price">${OgritechOffers.format(alternative.monthlyCents)} por mês <span>ou ${OgritechOffers.format(alternative.annualCents)} por ano</span></p><p>${description(alternative)}</p>${subscription ? `<button class="table-button edit" type="button" data-subscription-action="change_plan" data-product="${safe(product.code)}" data-plan-id="${safe(plan.id)}"${canChange ? "" : " disabled"}>Mudar para ${safe(alternative.name)}</button>` : `<a class="gold-button" href="/criar-cardapio/?plano=${safe(alternative.code)}">Conhecer ${safe(alternative.name)}</a>`}</article>`;
            }).join("")}</div>${subscription ? `<p class="section-description">A troca preserva seu prazo de acesso e não gera outro teste de 14 dias. O novo preço vale na próxima cobrança, sem cobrança proporcional.</p>${subscription.cancel_at_period_end ? `<p class="section-description">Mantenha a assinatura para liberar a troca de plano.</p>` : ""}` : ""}</section>` : "";
            const statusNames = { trial: "Teste gratuito", active: "Ativa", grace_period: "Prazo de tolerância", past_due: "Pagamento pendente", suspended: "Suspensa" };
            const status = subscription ? (subscription.cancel_at_period_end ? "Cancelamento agendado" : statusNames[subscription.status] || "Em análise") : "Não contratada";
            const paymentControls = billingSelectionEnabled && product.code === "menu" && subscription && offer && ["trial", "grace_period", "past_due"].includes(subscription.status) ? `<fieldset class="billing-choice"><legend>Como deseja continuar após o teste?</legend><div class="billing-choice-grid"><label>Periodicidade<select data-billing-cycle><option value="monthly"${subscription.billing_cycle === "annual" ? "" : " selected"}>Mensal · ${OgritechOffers.format(offer.monthlyCents)}</option><option value="annual"${subscription.billing_cycle === "annual" ? " selected" : ""}>Anual · ${OgritechOffers.format(offer.annualCents)}</option></select></label><label>Forma de pagamento<select data-payment-method><option value="pix">Pix a cada vencimento</option><option value="card">Cartão com renovação automática</option></select></label></div><label class="settings-toggle billing-authorization" hidden><input type="checkbox" data-recurring-authorization><span>Autorizo a cobrança recorrente no cartão após os 14 dias gratuitos.</span></label><p class="section-description">Nada será cobrado hoje. No Pix, você receberá o código antes do vencimento. Seus dados do cardápio não serão apagados se decidir não continuar.</p></fieldset>` : "";
            const modules = subscription && (product.modules || []).length ? `<fieldset><legend>Módulos opcionais</legend>${product.modules.map((module) => { const enabled = (subscription.modules || []).some((item) => item.module_id === module.id && ["trial", "active"].includes(item.status)); return `<label class="settings-toggle"><input type="checkbox" data-module="${safe(module.id)}" data-product="${safe(product.code)}"${enabled ? " checked" : ""}${subscription.cancel_at_period_end ? " disabled" : ""}><span>${safe(module.name)}${module.description ? ` — ${safe(module.description)}` : ""}</span></label>`; }).join("")}</fieldset>` : "";
            let action = "";
            if (subscription?.cancel_at_period_end) action = `<button class="gold-button" type="button" data-subscription-action="reactivate" data-product="${safe(product.code)}">Manter assinatura</button>`;
            else if (subscription) action = `${paymentControls ? `<button class="gold-button" type="button" data-payment-action data-product="menu">Definir pagamento após o teste</button>` : ""}<button class="table-button danger" type="button" data-subscription-action="cancel" data-product="${safe(product.code)}">Cancelar renovação</button>`;
            const until = subscription?.current_period_end ? ` · acesso previsto até ${new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}` : "";
            return `<article class="subscription-current" data-current-plan="${safe(offer?.code || "")}"><header><div><p class="subscription-plan-label">${subscription ? "Seu plano atual" : "Nenhum plano contratado"}</p><h3>${subscription ? safe(currentName) : "Escolha como receber seus pedidos"}</h3></div><span class="commercial-badge">${status}${until}</span></header>${subscription ? `<p class="subscription-current-price">${safe(currentPrice)}</p><p class="subscription-period">Periodicidade: ${annual ? "anual" : "mensal"}</p>${offer ? `<p>${description(offer)}</p>` : ""}` : ""}${paymentControls}${offer?.orders ? modules : ""}<div class="commercial-actions">${action}</div>${planOptions}</article>`;
        }).join("") || "<p>Nenhum plano do Cardápio disponível.</p>";
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
        center = data; render(); message("Você controla sua assinatura sem atendimento obrigatório.");
    }
    async function updateSubscription(button) {
        if (busy) return;
        const action = button.dataset.subscriptionAction;
        const product = button.dataset.product;
        const plan = button.dataset.planId || null;
        if (action === "change_plan") {
            const target = center.products.find(item => item.code === product)?.plans.find(item => item.id === plan);
            if (!target || target.id === activeSubscription(product)?.plan_id) return;
            const selectedOffer = OgritechOffers.forPlan(target);
            if (!confirm(`Mudar para ${selectedOffer.name}? Seu prazo de acesso será preservado, sem novo teste gratuito. O novo preço vale na próxima cobrança.`)) return;
        }
        let reason = null;
        if (action === "cancel") {
            if (!confirm(`Cancelar a renovação de ${activeSubscription(product)?.product_name}? O acesso ao Cardápio será mantido até o fim do período pago.`)) return;
            reason = prompt("Motivo opcional do cancelamento (até 500 caracteres):") || "";
            if (reason.length > 500) return message("O motivo pode ter no máximo 500 caracteres.", true);
        }
        busy = true; byId("subscriptionCenter").querySelectorAll("button,input,select").forEach((control) => control.disabled = true);
        message("Processando sua solicitação...");
        if (action === "change_plan" && product === "menu") {
            const offer = OgritechOffers.forPlan(center.products.find(p => p.code === "menu")?.plans.find(p => p.id === plan));
            const { data, error } = await supabaseClient.functions.invoke("ogritech-billing", { body: { action: "change_offer", product: "menu", barbershop_id: BARBERSHOP_ID, offer: offer.code } });
            busy = false; byId("exportBusinessData").disabled = false;
            if (error || data?.error) { render(); return message(data?.error?.message || "Não foi possível alterar o plano.", true); }
            await load(); window.dispatchEvent(new Event("ogritech:offer-changed"));
            message("Plano alterado. O prazo de acesso foi preservado, sem novo teste gratuito. O novo preço vale na próxima cobrança.");
            return;
        }
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
        await load(); message("Recurso do Cardápio atualizado.");
    }
    async function choosePayment(button) {
        if (busy) return;
        const article = button.closest("article");
        const cycle = article.querySelector("[data-billing-cycle]").value;
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
