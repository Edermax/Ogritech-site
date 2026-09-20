(() => {
    const byId = (id) => document.getElementById(id);
    const formatMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const notify = (element, message, error = false) => {
        if (!element) return;
        element.textContent = message;
        element.classList.toggle("error", error);
    };
    const friendlyError = (error) => error?.message || "Não foi possível concluir a operação.";
    let landingRecord = null;
    let menuRecord = null;
    let menuTemplates = [];
    let menuOnboarding = null;
    const menuStepLabels = { segment: "Modelo do segmento", identity: "Identidade visual", catalog: "Catálogo com preço", fulfillment: "Entrega ou retirada", payments: "Formas de pagamento", hours: "Horários", test_order: "Pedido de teste", review: "Revisão final" };
    const menuPaymentLabels = { pix: "Pix", cash: "Dinheiro", credit_card: "Crédito", debit_card: "Débito" };
    const menuOrderStatusLabels = { received: "Recebido", confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado", rejected: "Recusado" };
    const menuWeekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    let menuBusy = false;
    let menuMetricsBusy = false;
    let menuAssistantBusy = false;
    let menuDataReady = false;
    let menuSettingsDirty = false;
    let menuLoadVersion = 0;
    const menuWorkspaceGroups = {
        operation: ["menuPilotMetricsPanel", "menuOrdersPanel"],
        settings: ["menuOnboardingPanel", "menuAssistantSettingsPanel", "menuSettingsPanel"],
        catalog: ["menuTemplatePanel", "menuCatalogWorkspace"]
    };

    function selectMenuWorkspace(workspace) {
        const selected = menuWorkspaceGroups[workspace] ? workspace : "operation";
        document.querySelectorAll("[data-menu-workspace]").forEach((button) => {
            const active = button.dataset.menuWorkspace === selected;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
        });
        Object.entries(menuWorkspaceGroups).forEach(([group, ids]) => ids.forEach((id) => byId(id)?.classList.toggle("menu-workspace-hidden", group !== selected)));
    }

    function setupMenuWorkspace() {
        document.querySelectorAll("[data-menu-workspace]").forEach((button) => button.addEventListener("click", () => {
            selectMenuWorkspace(button.dataset.menuWorkspace);
            byId("menuWorkspaceTabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }));
        byId("menuAssistantSettingsPanel")?.querySelectorAll("details").forEach((details) => { details.open = false; });
        selectMenuWorkspace("operation");
    }

    function prioritizeMenuOperations() {
        const tabs = byId("menuWorkspaceTabs");
        const health = byId("menuPilotMetricsPanel");
        const orders = byId("menuOrdersPanel");
        if (!tabs || !health || !orders || typeof tabs.after !== "function" || typeof health.after !== "function") return;
        tabs.after(health);
        health.after(orders);
    }

    prioritizeMenuOperations();
    setupMenuWorkspace();

    function updateMenuControls() {
        const unavailable = menuBusy || !menuDataReady;
        const editable = !unavailable && !menuRecord?.published;
        for (const id of ["menuSettingsForm", "menuItemForm", "menuTemplateForm"]) {
            byId(id)?.querySelectorAll("input,select,textarea,button").forEach((input) => { input.disabled = !editable || (id !== "menuSettingsForm" && menuSettingsDirty); });
            byId(id)?.setAttribute("aria-busy", String(menuBusy));
        }
        byId("menuOnboardingPanel")?.setAttribute("aria-busy", String(menuBusy));
        byId("menuTestOrderButton").disabled = unavailable || menuSettingsDirty || !menuRecord || menuRecord.published || !["test_order", "review", "ready"].includes(menuOnboarding?.next_step);
        byId("menuReviewButton").disabled = unavailable || menuSettingsDirty || !menuOnboarding?.checks?.test_order || Boolean(menuOnboarding?.checks?.review) || Boolean(menuRecord?.published);
        byId("menuPublicationButton").textContent = menuRecord?.published ? "Despublicar cardápio" : "Publicar cardápio";
        byId("menuPublicationButton").disabled = unavailable || menuSettingsDirty || (!menuRecord?.published && menuOnboarding?.next_step !== "ready");
        byId("menuReloadButton").disabled = menuBusy;
        byId("menuOrdersReload").disabled = unavailable;
        byId("menuPilotMetricsReload").disabled = menuMetricsBusy;
        byId("menuAssistantSettingsForm")?.querySelectorAll("input,button").forEach((input) => { input.disabled = menuAssistantBusy; });
        byId("menuOrdersList")?.querySelectorAll("[data-order]").forEach((button) => { button.disabled = unavailable; });
        const published = Boolean(menuRecord?.published);
        byId("menuTestOrderButton")?.classList.toggle("hidden", published);
        byId("menuReviewButton")?.classList.toggle("hidden", published);
        byId("menuPublishedSetupNotice")?.classList.toggle("hidden", !published);
        byId("menuSettingsLockNotice")?.classList.toggle("hidden", !published);
        byId("menuCatalogLockNotice")?.classList.toggle("hidden", !published);
        byId("menuSettingsForm")?.classList.toggle("hidden", published);
        byId("menuItemForm")?.classList.toggle("hidden", published);
        if (byId("menuReviewDetails")) byId("menuReviewDetails").open = !published;
    }

    const menuError = (error) => {
        if (error?.code === "42501") return "Você precisa de acesso de gestor e do Ogritech Cardápio ativo para concluir esta ação.";
        if (error?.code === "23505") return "Este endereço público já está em uso. Escolha outro e salve novamente.";
        if (error?.code === "PGRST116") return "O pedido não foi encontrado ou já mudou de situação. Atualize a lista e tente novamente.";
        if (["22023", "23514"].includes(error?.code)) return error.message || "Confira os campos e as etapas pendentes.";
        return "Não foi possível concluir a operação. Confira sua conexão e tente novamente. Sua configuração salva foi preservada.";
    };

    async function runMenuAction(messageId, pendingMessage, operation, successMessage) {
        if (menuBusy || !menuDataReady) return;
        menuBusy = true;
        updateMenuControls();
        notify(byId(messageId), pendingMessage);
        try {
            const result = await operation();
            if (result?.error) throw result.error;
            menuSettingsDirty = false;
            const refreshed = await loadMenuAdmin();
            const message = typeof successMessage === "function" ? successMessage(result?.data) : successMessage;
            notify(byId(messageId), refreshed ? message : `${message} Use “Atualizar etapas” para conferir o estado salvo.`, !refreshed);
        } catch (error) {
            notify(byId(messageId), menuError(error), true);
        } finally {
            menuBusy = false;
            updateMenuControls();
        }
    }

    function renderMenuReview(menu, categories) {
        if (!menu) {
            byId("menuReviewSummary").innerHTML = "<p>Escolha um modelo para começar. As etapas salvas aparecem aqui quando você voltar.</p>";
            return;
        }
        const availableItems = categories.filter((category) => category.active).flatMap((category) => (category.menu_items || []).filter((item) => item.active && item.available && item.menu_item_prices?.some((price) => price.active)));
        const prices = availableItems.flatMap((item) => item.menu_item_prices.filter((price) => price.active).map((price) => Number(price.promotional_price ?? price.price)));
        const template = menuTemplates.find((entry) => entry.code === menu.template_code);
        const zones = (menu.menu_delivery_zones || []).filter((zone) => zone.active);
        const rows = [
            ["Nome e endereço", `${menu.title} · /cardapio/?empresa=${menu.slug}`],
            ["Modelo", template?.name || "Ainda não selecionado"],
            ["Catálogo disponível", `${availableItems.length} produto(s)${prices.length ? ` · preços de ${formatMoney.format(Math.min(...prices))} a ${formatMoney.format(Math.max(...prices))}` : " · adicione um item com preço"}`],
            ["Recebimento", [menu.accepts_pickup ? "Retirada" : "", menu.accepts_delivery ? "Entrega" : ""].filter(Boolean).join(" e ") || "A configurar"],
            ["Pedido mínimo", formatMoney.format(Number(menu.minimum_order || 0))],
            ["Regiões de entrega", menu.accepts_delivery ? zones.map((zone) => `${zone.name}: taxa ${formatMoney.format(Number(zone.fee))}, mínimo ${formatMoney.format(Math.max(Number(menu.minimum_order || 0), Number(zone.minimum_order || 0)))}`).join("; ") || "Nenhuma região ativa" : "Entrega desativada"],
            ["Pagamento combinado com o cliente", (menu.accepted_payment_methods || []).map((method) => menuPaymentLabels[method] || method).join(", ")],
            ["Horário informado", `${(menu.weekly_hours?.weekdays || []).map((day) => menuWeekdayLabels[Number(day)]).join(", ")} · ${menu.weekly_hours?.opens_at || "—"} às ${menu.weekly_hours?.closes_at || "—"}`],
            ["Cores", `${menu.visual_identity?.primary_color || "—"} e ${menu.visual_identity?.accent_color || "—"}`]
        ];
        byId("menuReviewSummary").innerHTML = `<dl>${rows.map(([label, value]) => `<dt><strong>${escapeHtml(label)}</strong></dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
    }

    async function loadLandingAdmin() {
        if (!BARBERSHOP_ID || IS_DEMO) return;
        const [{ data: page, error }, { data: leads }] = await Promise.all([
            supabaseClient.from("landing_pages").select("*").eq("barbershop_id", BARBERSHOP_ID).maybeSingle(),
            supabaseClient.from("landing_page_leads").select("id,name,email,phone,message,status,created_at").eq("barbershop_id", BARBERSHOP_ID).order("created_at", { ascending: false }).limit(100)
        ]);
        if (error) return notify(byId("landingMessage"), friendlyError(error), true);
        landingRecord = page;
        byId("landingTitle").value = page?.title || businessConfig.name;
        byId("landingSlug").value = page?.slug || "";
        byId("landingSubtitle").value = page?.subtitle || "";
        byId("landingWhatsapp").value = page?.whatsapp_phone || "";
        byId("landingEmail").value = page?.contact_email || "";
        byId("landingPublished").checked = Boolean(page?.published);
        const link = byId("landingPublicLink");
        if (page?.published) {
            link.href = ogritechEnvironmentUrl(`/pagina/?empresa=${encodeURIComponent(page.slug)}`);
            link.classList.remove("hidden");
        } else link.classList.add("hidden");
        byId("landingLeadsList").innerHTML = (leads || []).map((lead) => `<article><header><div><strong>${escapeHtml(lead.name)}</strong><p>${escapeHtml(lead.email || lead.phone)}</p></div><span class="commercial-badge">${escapeHtml(lead.status)}</span></header><p>${escapeHtml(lead.message || "Sem mensagem")}</p><small>${new Date(lead.created_at).toLocaleString("pt-BR")}</small></article>`).join("") || "<p class='section-description'>Nenhum lead recebido.</p>";
    }

    byId("landingSettingsForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const published = byId("landingPublished").checked;
        const payload = {
            barbershop_id: BARBERSHOP_ID,
            slug: byId("landingSlug").value.trim().toLowerCase(),
            title: byId("landingTitle").value.trim(),
            subtitle: byId("landingSubtitle").value.trim(),
            whatsapp_phone: byId("landingWhatsapp").value.trim() || null,
            contact_email: byId("landingEmail").value.trim() || null,
            published,
            published_at: published ? (landingRecord?.published_at || new Date().toISOString()) : null
        };
        notify(byId("landingMessage"), "Salvando...");
        const { error } = await supabaseClient.from("landing_pages").upsert(payload, { onConflict: "barbershop_id" });
        notify(byId("landingMessage"), error ? friendlyError(error) : "Página salva.", Boolean(error));
        if (!error) loadLandingAdmin();
    });

    async function loadQuotesAdmin() {
        if (!BARBERSHOP_ID || IS_DEMO) return;
        const { data, error } = await supabaseClient.from("quote_requests")
            .select("id,public_reference,client_name,client_email,client_phone,service_interest,briefing,status,created_at,quote_proposals(id,status,total_amount,version)")
            .eq("barbershop_id", BARBERSHOP_ID).order("created_at", { ascending: false }).limit(100);
        const list = byId("quoteRequestsList");
        if (error) return list.innerHTML = `<p>${escapeHtml(friendlyError(error))}</p>`;
        list.innerHTML = (data || []).map((request) => {
            const proposal = [...(request.quote_proposals || [])].sort((a,b) => b.version-a.version)[0];
            return `<article><header><div><strong>${escapeHtml(request.client_name)} · ${escapeHtml(request.service_interest)}</strong><p>${escapeHtml(request.client_email || request.client_phone)}</p></div><span class="commercial-badge">${escapeHtml(proposal?.status || request.status)}</span></header><p>${escapeHtml(Object.values(request.briefing || {}).join(" · ") || "Briefing sem detalhes adicionais")}</p><div class="commercial-actions">${proposal ? `<span>${formatMoney.format(Number(proposal.total_amount))}</span>` : `<button class="table-button edit" data-create-proposal="${request.id}" data-client="${escapeHtml(request.client_name)}">Criar proposta</button>`}</div></article>`;
        }).join("") || "<p class='section-description'>Nenhuma solicitação recebida.</p>";
        list.querySelectorAll("[data-create-proposal]").forEach((button) => button.addEventListener("click", () => {
            byId("quoteRequestId").value = button.dataset.createProposal;
            byId("quoteComposerTitle").textContent = `Proposta para ${button.dataset.client}`;
            byId("proposalTitle").value = `Proposta comercial — ${button.dataset.client}`;
            byId("quoteComposer").classList.remove("hidden");
            byId("quoteComposer").scrollIntoView({ behavior: "smooth" });
        }));
    }

    byId("quoteProposalForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const requestId = byId("quoteRequestId").value;
        notify(byId("proposalMessage"), "Criando proposta...");
        const { data: versions } = await supabaseClient.from("quote_proposals").select("version").eq("quote_request_id", requestId).order("version", { ascending: false }).limit(1);
        const { data: proposal, error } = await supabaseClient.from("quote_proposals").insert({
            barbershop_id: BARBERSHOP_ID, quote_request_id: requestId,
            version: (versions?.[0]?.version || 0) + 1, title: byId("proposalTitle").value.trim(),
            scope: byId("proposalScope").value.trim(), valid_until: byId("proposalValidUntil").value || null
        }).select("id").single();
        if (error) return notify(byId("proposalMessage"), friendlyError(error), true);
        const { error: itemError } = await supabaseClient.from("quote_proposal_items").insert({
            barbershop_id: BARBERSHOP_ID, proposal_id: proposal.id,
            description: byId("proposalItemDescription").value.trim(), quantity: 1,
            unit_price: Number(byId("proposalItemPrice").value)
        });
        if (itemError) {
            await supabaseClient.from("quote_proposals").delete().eq("id", proposal.id);
            return notify(byId("proposalMessage"), friendlyError(itemError), true);
        }
        const { data: sent, error: sendError } = await supabaseClient.rpc("send_quote_proposal", { target_proposal_id: proposal.id });
        if (sendError) return notify(byId("proposalMessage"), friendlyError(sendError), true);
        const url = ogritechEnvironmentUrl(`/proposta/?referencia=${encodeURIComponent(sent.reference)}&token=${encodeURIComponent(sent.token)}`);
        notify(byId("proposalMessage"), "Proposta criada. Copie o link abaixo:");
        const anchor = document.createElement("a"); anchor.href = url; anchor.target = "_blank"; anchor.rel = "noopener"; anchor.textContent = url; byId("proposalMessage").append(" ", anchor);
        loadQuotesAdmin();
    });

    async function loadMenuAssistantAdmin() {
        if (!BARBERSHOP_ID || IS_DEMO || !menuRecord) return;
        const { data, error } = await supabaseClient.rpc("menu_assistant_admin_settings", { target_barbershop_id: BARBERSHOP_ID });
        if (error) return notify(byId("menuAssistantSettingsMessage"), menuError(error), true);
        byId("menuAssistantEnabled").checked = Boolean(data.enabled);
        byId("menuAssistantMonthlyLimit").value = data.monthly_interaction_limit ?? 1000;
        byId("menuAssistantSessionLimit").value = data.per_session_hourly_limit ?? 20;
        byId("menuAssistantUsage").textContent = `Uso neste mês: ${Number(data.month_interactions || 0)} interações · custo estimado ${formatMoney.format(Number(data.month_estimated_cost_micros || 0) / 1000000)}. Nesta fase determinística, o custo por interação é R$ 0,00.`;
    }

    function renderMenuPilotMetrics(metrics, error) {
        const message = byId("menuPilotMetricsMessage");
        if (error || !metrics) {
            notify(message, `${menuError(error)} Os pedidos continuam disponíveis normalmente.`, true);
            return;
        }
        const orders = Number(metrics.orders_count || 0);
        const consumers = Number(metrics.consumers_count || 0);
        byId("menuMetricOrders").textContent = `${orders} de ${Number(metrics.limits?.maximum_orders || 100)}`;
        byId("menuMetricConsumers").textContent = `${consumers} de ${Number(metrics.limits?.maximum_consumers || 25)}`;
        byId("menuMetricDuplicates").textContent = String(Number(metrics.possible_duplicate_groups || 0));
        byId("menuMetricPrices").textContent = String(Number(metrics.price_divergences || 0));
        byId("menuMetricOrdersLimit").textContent = `${Number(metrics.orders_usage_percent || 0).toLocaleString("pt-BR")} % do limite do piloto`;
        byId("menuMetricConsumersLimit").textContent = `${Number(metrics.consumers_usage_percent || 0).toLocaleString("pt-BR")} % do limite do piloto`;
        const operational = [];
        operational.push(`${Number(metrics.status_counts?.received || 0)} recebidos`);
        operational.push(`${Number(metrics.status_counts?.confirmed || 0)} confirmados`);
        operational.push(`${Number(metrics.status_counts?.completed || 0)} concluídos`);
        operational.push(`${Number(metrics.payment_pending || 0)} com pagamento pendente`);
        operational.push(`${Number(metrics.received_over_24h || 0)} recebidos há mais de 24 horas`);
        byId("menuMetricOperational").textContent = operational.join(" · ");
        const warnings = [];
        if (metrics.approaching_order_limit || metrics.approaching_consumer_limit) warnings.push("O piloto está próximo de um limite operacional.");
        if (metrics.order_limit_reached || metrics.consumer_limit_reached) warnings.push("Um limite do piloto foi atingido; interrompa novas entradas e acione o suporte.");
        if (Number(metrics.possible_duplicate_groups || 0)) warnings.push("Confira as possíveis duplicidades antes de confirmar pedidos.");
        if (Number(metrics.price_divergences || 0)) warnings.push("Há divergência de preço; pause o piloto e acione o suporte.");
        if (Number(metrics.missing_consent || 0)) warnings.push("Há pedido sem registro de consentimento; pause o piloto e acione o suporte.");
        notify(message, warnings.join(" ") || "Indicadores atualizados. Nenhuma condição de interrupção foi detectada.", warnings.length > 0);
    }

    async function loadMenuPilotMetrics() {
        if (!BARBERSHOP_ID || IS_DEMO || menuMetricsBusy) return;
        menuMetricsBusy = true;
        updateMenuControls();
        notify(byId("menuPilotMetricsMessage"), "Atualizando indicadores...");
        try {
            const { data, error } = await supabaseClient.rpc("menu_pilot_metrics", {
                target_barbershop_id: BARBERSHOP_ID,
                target_started_at: null,
                target_ends_at: null,
                target_max_consumers: 25,
                target_max_orders: 100
            });
            renderMenuPilotMetrics(data, error);
        } catch (error) {
            renderMenuPilotMetrics(null, error);
        } finally {
            menuMetricsBusy = false;
            updateMenuControls();
        }
    }

    byId("menuAiCostForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        const number = (id) => Math.max(0, Number(byId(id)?.value || 0));
        const interactions = Math.floor(number("menuAiCostInteractions"));
        const usd = interactions * ((number("menuAiCostInputTokens") * number("menuAiCostInputPrice") + number("menuAiCostOutputTokens") * number("menuAiCostOutputPrice")) / 1000000);
        const brl = usd * number("menuAiCostExchange") * (1 + number("menuAiCostMargin") / 100);
        const perInteraction = interactions ? brl / interactions : 0;
        byId("menuAiCostResult").textContent = `Cenário estimado: ${formatMoney.format(brl)} por mês · ${formatMoney.format(perInteraction)} por interação. Premissas manuais; nenhuma chamada externa foi realizada.`;
    });

    async function loadMenuAdmin() {
        if (!BARBERSHOP_ID || IS_DEMO) return false;
        const loadVersion = ++menuLoadVersion;
        menuDataReady = false;
        updateMenuControls();
        try {
            const [{ data: menu, error }, { data: orders, error: ordersError }, { data: templates, error: templateError }, { data: onboarding, error: onboardingError }] = await Promise.all([
                supabaseClient.from("online_menus").select("*,menu_delivery_zones(code,name,fee,minimum_order,active),menu_categories(id,name,active,sort_order,menu_items(id,name,active,available,menu_item_prices(id,label,price,promotional_price,active)))").eq("barbershop_id", BARBERSHOP_ID).maybeSingle(),
                supabaseClient.from("menu_orders").select("id,public_reference,customer_name,fulfillment_type,status,total_amount,created_at,is_test").eq("barbershop_id", BARBERSHOP_ID).order("created_at", { ascending: false }).limit(100),
                supabaseClient.from("menu_catalog_templates").select("code,name,description,segment,definition").eq("active", true).order("name"),
                supabaseClient.rpc("menu_onboarding_status", { target_barbershop_id: BARBERSHOP_ID })
            ]);
            if (loadVersion !== menuLoadVersion) return false;
            if (error || templateError || onboardingError) throw error || templateError || onboardingError;
            menuTemplates = templates || [];
            menuOnboarding = onboarding;
            menuRecord = menu;
            menuDataReady = true;
            menuSettingsDirty = false;
            byId("menuTemplateCode").innerHTML = '<option value="">Selecione</option>' + menuTemplates.map((template) => `<option value="${escapeHtml(template.code)}">${escapeHtml(template.name)}</option>`).join("");
            byId("menuTemplatePanel")?.classList.toggle("hidden", Boolean(menu?.template_code));
            byId("menuTitle").value = menu?.title || businessConfig.name;
            byId("menuSlug").value = menu?.slug || "";
            byId("menuDescription").value = menu?.description || "";
            byId("menuMinimum").value = menu?.minimum_order || 0;
            byId("menuDeliveryFee").value = menu?.delivery_fee || 0;
            byId("menuAcceptsDelivery").checked = Boolean(menu?.accepts_delivery);
            byId("menuAcceptsPickup").checked = menu?.accepts_pickup !== false;
            byId("menuPrimaryColor").value = menu?.visual_identity?.primary_color || "#111827";
            byId("menuAccentColor").value = menu?.visual_identity?.accent_color || "#f59e0b";
            document.querySelectorAll(".menu-payment").forEach((input) => { input.checked = (menu?.accepted_payment_methods || ["pix", "cash"]).includes(input.value); });
            const hours = menu?.weekly_hours || { weekdays: [1, 2, 3, 4, 5, 6], opens_at: "10:00", closes_at: "22:00" };
            byId("menuOpensAt").value = hours.opens_at || "10:00";
            byId("menuClosesAt").value = hours.closes_at || "22:00";
            document.querySelectorAll(".menu-weekday").forEach((input) => { input.checked = (hours.weekdays || []).map(Number).includes(Number(input.value)); });
            const zone = (menu?.menu_delivery_zones || []).find((entry) => entry.active) || {};
            byId("menuZoneCode").value = zone.code || "";
            byId("menuZoneCode").readOnly = Boolean(zone.code);
            byId("menuZoneName").value = zone.name || "";
            byId("menuZoneFee").value = zone.fee ?? menu?.delivery_fee ?? 0;
            byId("menuZoneMinimum").value = zone.minimum_order ?? menu?.minimum_order ?? 0;
            byId("menuDeliveryZoneFields").classList.toggle("hidden", !menu?.accepts_delivery);
            const checks = onboarding?.checks || {};
            const progress = `${onboarding?.completed_count || 0} de ${onboarding?.total_count || 8} etapas concluídas`;
            byId("menuOnboardingProgress").textContent = progress;
            byId("menuOnboardingBar").value = onboarding?.completed_count || 0;
            byId("menuOnboardingBar").max = onboarding?.total_count || 8;
            byId("menuOnboardingBar").setAttribute("aria-valuetext", progress);
            byId("menuOnboardingChecklist").innerHTML = Object.entries(menuStepLabels).map(([code, label]) => `<li${onboarding?.next_step === code ? ' aria-current="step"' : ""}><span aria-hidden="true">${checks[code] ? "✓" : "○"}</span> ${escapeHtml(label)} — ${checks[code] ? "concluído" : "pendente"}</li>`).join("");
            byId("menuNextStep").textContent = menu?.published ? "Seu cardápio está publicado. Para alterar a configuração ou o catálogo, despublique e revise novamente." : onboarding?.next_step === "ready" ? "Revisão concluída. Você decide quando publicar seu cardápio." : `Próxima etapa: ${menuStepLabels[onboarding?.next_step] || menuStepLabels.segment}. Salve a configuração para retomar de onde parou.`;
            const link = byId("menuPublicLink");
            const operationLink = byId("menuOperationPublicLink");
            const operationStatus = byId("menuOperationStatus");
            if (menu?.published) {
                link.href = ogritechEnvironmentUrl(`/cardapio/?empresa=${encodeURIComponent(menu.slug)}`);
                link.classList.remove("hidden");
                operationLink.href = link.href;
                operationLink.classList.remove("hidden");
            } else link.classList.add("hidden");
            if (!menu?.published) operationLink.classList.add("hidden");
            operationStatus.textContent = menu?.published ? "Cardápio publicado" : "Cardápio não publicado";
            operationStatus.setAttribute("data-state", menu?.published ? "published" : "draft");
            const categories = [...(menu?.menu_categories || [])].sort((a, b) => a.sort_order - b.sort_order);
            renderMenuReview(menu, categories);
            byId("menuCatalogList").innerHTML = categories.map((category) => `<article><strong>${escapeHtml(category.name)}${category.active ? "" : " · categoria inativa"}</strong>${(category.menu_items || []).map((item) => `<p>${escapeHtml(item.name)}${item.active && item.available ? "" : " · indisponível"} — ${(item.menu_item_prices || []).filter((price) => price.active).map((price) => formatMoney.format(Number(price.promotional_price ?? price.price))).join(" / ") || "Sem preço ativo"}</p>`).join("")}</article>`).join("") || "<p class='section-description'>Nenhum item cadastrado.</p>";
            byId("menuOrdersList").innerHTML = ordersError ? `<p role="status">${escapeHtml(menuError(ordersError))} Use “Atualizar etapas” para recarregar os pedidos.</p>` : (orders || []).map((order) => {
                const status = order.status === "pending" ? "received" : order.status;
                const action = status === "received" ? { next: "confirmed", label: "Confirmar" } : status === "confirmed" ? { next: "completed", label: "Concluir" } : null;
                return `<article><header><div><strong>#${escapeHtml(order.public_reference)} · ${escapeHtml(order.customer_name)}</strong><p>${formatMoney.format(Number(order.total_amount))}${order.is_test ? " · Pedido de teste, sem cobrança real" : ""}</p></div><span class="commercial-badge">${order.is_test ? "Teste concluído" : escapeHtml(menuOrderStatusLabels[status] || "Em processamento")}</span></header>${!order.is_test && action ? `<div class="commercial-actions"><button type="button" class="table-button edit" data-order-status="${action.next}" data-order="${order.id}">${action.label}</button></div>` : ""}</article>`;
            }).join("") || "<p class='section-description'>Nenhum pedido recebido.</p>";
            byId("menuOrdersList").querySelectorAll("[data-order]").forEach((button) => button.addEventListener("click", () => {
                const completing = button.dataset.orderStatus === "completed";
                const timestamp = completing ? "completed_at" : "confirmed_at";
                return runMenuAction("menuOperationMessage", completing ? "Concluindo pedido..." : "Confirmando pedido...", () => supabaseClient.from("menu_orders").update({ status: button.dataset.orderStatus, [timestamp]: new Date().toISOString() }).eq("id", button.dataset.order).eq("barbershop_id", BARBERSHOP_ID).select("id,status").single(), completing ? "Pedido concluído." : "Pedido confirmado. Quando estiver pronto, use “Concluir”.");
            }));
            loadMenuAssistantAdmin().catch(() => notify(byId("menuAssistantSettingsMessage"), "O assistente está temporariamente indisponível; o restante do Cardápio continua funcionando.", true));
            loadMenuPilotMetrics().catch((metricsError) => renderMenuPilotMetrics(null, metricsError));
            return true;
        } catch (error) {
            if (loadVersion === menuLoadVersion) {
                menuDataReady = false;
                notify(byId("menuOnboardingMessage"), `${menuError(error)} Use “Atualizar etapas” para tentar novamente.`, true);
            }
            return false;
        } finally {
            if (loadVersion === menuLoadVersion) updateMenuControls();
        }
    }

    byId("menuSettingsForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (menuRecord?.published) return;
        const acceptsDelivery=byId("menuAcceptsDelivery").checked;
        const settings={slug:byId("menuSlug").value.trim().toLowerCase(),title:byId("menuTitle").value.trim(),description:byId("menuDescription").value.trim(),minimum_order:Number(byId("menuMinimum").value||0),delivery_fee:Number(byId("menuDeliveryFee").value||0),accepts_delivery:acceptsDelivery,accepts_pickup:byId("menuAcceptsPickup").checked,visual_identity:{primary_color:byId("menuPrimaryColor").value,accent_color:byId("menuAccentColor").value},payment_methods:[...document.querySelectorAll(".menu-payment:checked")].map((input)=>input.value),weekdays:[...document.querySelectorAll(".menu-weekday:checked")].map((input)=>Number(input.value)),opens_at:byId("menuOpensAt").value,closes_at:byId("menuClosesAt").value,delivery_zone:acceptsDelivery?{code:byId("menuZoneCode").value.trim().toLowerCase(),name:byId("menuZoneName").value.trim(),fee:Number(byId("menuZoneFee").value||0),minimum_order:Number(byId("menuZoneMinimum").value||0)}:null};
        if (!settings.accepts_pickup && !acceptsDelivery) return notify(byId("menuMessage"), "Ative a retirada, a entrega ou as duas opções.", true);
        if (!settings.payment_methods.length) return notify(byId("menuMessage"), "Selecione ao menos uma forma de pagamento.", true);
        if (!settings.weekdays.length || !settings.opens_at || settings.opens_at >= settings.closes_at) return notify(byId("menuMessage"), "Escolha os dias e um horário de encerramento posterior à abertura, no mesmo dia.", true);
        if (acceptsDelivery && (!settings.delivery_zone.code || !settings.delivery_zone.name)) return notify(byId("menuMessage"), "Preencha o código e o nome da região de entrega.", true);
        await runMenuAction("menuMessage", "Salvando configuração...", () => supabaseClient.rpc("save_menu_onboarding_settings", { target_barbershop_id: BARBERSHOP_ID, settings }), "Configuração salva. Confira as etapas e faça o pedido de teste quando estiver pronto.");
    });

    byId("menuAssistantSettingsForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (menuAssistantBusy) return;
        const monthly = Number(byId("menuAssistantMonthlyLimit").value), session = Number(byId("menuAssistantSessionLimit").value);
        if (!Number.isInteger(monthly) || monthly < 0 || monthly > 100000 || !Number.isInteger(session) || session < 1 || session > 100) return notify(byId("menuAssistantSettingsMessage"), "Use limites inteiros dentro das faixas informadas.", true);
        menuAssistantBusy = true;
        updateMenuControls();
        notify(byId("menuAssistantSettingsMessage"), "Salvando assistente...");
        try {
            const { error } = await supabaseClient.rpc("save_menu_assistant_settings", { target_barbershop_id: BARBERSHOP_ID, target_enabled: byId("menuAssistantEnabled").checked, target_monthly_limit: monthly, target_session_limit: session });
            if (error) return notify(byId("menuAssistantSettingsMessage"), menuError(error), true);
            await loadMenuAssistantAdmin();
            notify(byId("menuAssistantSettingsMessage"), byId("menuAssistantEnabled").checked ? "Assistente ativado. Ele continuará sem modelo externo até nova autorização." : "Assistente desativado no cardápio público.");
        } catch (error) {
            notify(byId("menuAssistantSettingsMessage"), menuError(error), true);
        } finally {
            menuAssistantBusy = false;
            updateMenuControls();
        }
    });

    byId("menuSettingsForm")?.addEventListener("input", () => {
        menuSettingsDirty = true;
        byId("menuNextStep").textContent = "Há alterações ainda não salvas. Salve a configuração antes de continuar com o catálogo, o teste e a revisão.";
        updateMenuControls();
    });
    byId("menuAcceptsDelivery")?.addEventListener("change", () => byId("menuDeliveryZoneFields").classList.toggle("hidden", !byId("menuAcceptsDelivery").checked));
    byId("menuReloadButton")?.addEventListener("click", async () => {
        if (menuBusy) return;
        if (menuSettingsDirty) return notify(byId("menuOnboardingMessage"), "Salve suas alterações antes de atualizar as etapas.", true);
        notify(byId("menuOnboardingMessage"), "Atualizando etapas...");
        if (await loadMenuAdmin()) notify(byId("menuOnboardingMessage"), "Etapas atualizadas com a configuração salva.");
    });
    byId("menuOrdersReload")?.addEventListener("click", async () => {
        if (menuBusy || !menuDataReady) return;
        menuBusy = true;
        updateMenuControls();
        notify(byId("menuOperationMessage"), "Atualizando pedidos...");
        try {
            const refreshed = await loadMenuAdmin();
            notify(byId("menuOperationMessage"), refreshed ? "Pedidos atualizados." : "Não foi possível atualizar os pedidos. Tente novamente.", !refreshed);
        } finally {
            menuBusy = false;
            updateMenuControls();
        }
    });
    byId("menuPilotMetricsReload")?.addEventListener("click", loadMenuPilotMetrics);
    byId("menuTestOrderButton")?.addEventListener("click", () => {
        if (byId("menuTestOrderButton").disabled) return;
        return runMenuAction("menuOnboardingMessage", "Executando pedido de teste...", () => supabaseClient.rpc("run_menu_test_order", { target_barbershop_id: BARBERSHOP_ID }), (data) => `Pedido de teste aprovado: ${formatMoney.format(Number(data.total_amount))}. Sem cobrança real. Confira o resumo e confirme a revisão.`);
    });
    byId("menuReviewButton")?.addEventListener("click", () => {
        if (byId("menuReviewButton").disabled) return;
        return runMenuAction("menuOnboardingMessage", "Confirmando revisão...", () => supabaseClient.rpc("confirm_menu_review", { target_barbershop_id: BARBERSHOP_ID }), "Revisão confirmada. O cardápio está pronto para publicação.");
    });
    byId("menuPublicationButton")?.addEventListener("click", () => {
        if (byId("menuPublicationButton").disabled) return;
        const shouldPublish = !menuRecord?.published;
        return runMenuAction("menuOnboardingMessage", shouldPublish ? "Publicando cardápio..." : "Despublicando cardápio...", () => supabaseClient.rpc("set_menu_publication", { target_barbershop_id: BARBERSHOP_ID, should_publish: shouldPublish }), shouldPublish ? "Cardápio publicado. Seu link está disponível no painel." : "Cardápio despublicado. Você pode ajustar e publicar novamente após a revisão.");
    });

    byId("menuTemplateForm")?.addEventListener("submit",async(event)=>{
        event.preventDefault();
        if (menuRecord?.published || menuSettingsDirty) return;
        return runMenuAction("menuTemplateMessage", "Criando estrutura...", () => supabaseClient.rpc("apply_menu_catalog_template", {
            target_barbershop_id:BARBERSHOP_ID,
            target_template_code:byId("menuTemplateCode").value,
            target_slug:byId("menuTemplateSlug").value.trim().toLowerCase()
        }), "Estrutura criada. Personalize a configuração e adicione seus produtos para continuar.");
    });

    byId("menuItemForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!menuRecord) return notify(byId("menuItemMessage"), "Escolha um modelo de cardápio antes de adicionar itens.", true);
        if (menuRecord.published || menuSettingsDirty) return;
        await runMenuAction("menuItemMessage", "Adicionando item...", async () => {
            const categoryName = byId("menuCategoryName").value.trim();
            const found = await supabaseClient.from("menu_categories").select("id").eq("menu_id", menuRecord.id).eq("name", categoryName).maybeSingle();
            if (found.error) throw found.error;
            let category = found.data;
            if (!category) {
                const created = await supabaseClient.from("menu_categories").insert({ barbershop_id: BARBERSHOP_ID, menu_id: menuRecord.id, name: categoryName }).select("id").single();
                if (created.error) throw created.error;
                category = created.data;
            }
            const createdItem = await supabaseClient.from("menu_items").insert({ barbershop_id: BARBERSHOP_ID, category_id: category.id, name: byId("menuItemName").value.trim(), item_type: byId("menuItemType").value }).select("id").single();
            if (createdItem.error) throw createdItem.error;
            const price = await supabaseClient.from("menu_item_prices").insert({ barbershop_id: BARBERSHOP_ID, menu_item_id: createdItem.data.id, label: byId("menuPriceLabel").value.trim() || "Padrão", price: Number(byId("menuItemPrice").value) });
            if (price.error) {
                await supabaseClient.from("menu_items").delete().eq("id", createdItem.data.id);
                throw price.error;
            }
            event.target.reset();
            byId("menuPriceLabel").value = "Padrão";
            return price;
        }, "Item adicionado. Confira o catálogo e as etapas pendentes.");
    });

    window.loadLandingAdmin = loadLandingAdmin;
    window.loadQuotesAdmin = loadQuotesAdmin;
    window.loadMenuAdmin = loadMenuAdmin;
})();
