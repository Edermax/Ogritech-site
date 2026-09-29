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
    let menuCatalogCategories = [];
    let menuCatalogDraftDirty = false;
    let menuImageRemoveRequested = false;
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
        const settingsEditable = !unavailable && !menuRecord?.published;
        const catalogEditable = !unavailable && Boolean(menuRecord) && !menuSettingsDirty;
        for (const id of ["menuSettingsForm", "menuItemForm", "menuTemplateForm"]) {
            const editable = id === "menuItemForm" ? catalogEditable : settingsEditable;
            byId(id)?.querySelectorAll("input,select,textarea,button").forEach((input) => { input.disabled = !editable || (id !== "menuSettingsForm" && menuSettingsDirty); });
            byId(id)?.setAttribute("aria-busy", String(menuBusy));
        }
        byId("menuOnboardingPanel")?.setAttribute("aria-busy", String(menuBusy));
        byId("menuTestOrderButton").disabled = unavailable || menuSettingsDirty || !menuRecord || menuRecord.published || !["test_order", "review", "ready"].includes(menuOnboarding?.next_step);
        byId("menuReviewButton").disabled = unavailable || menuSettingsDirty || !menuOnboarding?.checks?.test_order || Boolean(menuOnboarding?.checks?.review) || Boolean(menuRecord?.published);
        byId("menuPublicationButton").textContent = menuRecord?.published && menuCatalogDraftDirty ? "Publicar alterações" : menuRecord?.published ? "Despublicar cardápio" : "Publicar cardápio";
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
        if (published && byId("menuCatalogLockNotice")) byId("menuCatalogLockNotice").textContent = menuCatalogDraftDirty ? "Há alterações em rascunho. Clientes continuam vendo a versão anterior até você usar “Publicar alterações”." : "Você pode editar produtos com segurança: as mudanças ficarão em rascunho e não interromperão os pedidos.";
        byId("menuSettingsForm")?.classList.toggle("hidden", published);
        byId("menuItemForm")?.classList.remove("hidden");
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

    const menuImagePathFromUrl = (url) => {
        const marker = "/storage/v1/object/public/menu-images/";
        const index = String(url || "").indexOf(marker);
        return index < 0 ? "" : decodeURIComponent(String(url).slice(index + marker.length));
    };

    function addMenuPriceRow(value = {}) {
        const row = document.createElement("div");
        row.className = "menu-editor-row menu-price-row";
        row.innerHTML = `<label>Variação<input data-price-label maxlength="80" value="${escapeHtml(value.label || "Padrão")}" required></label><label>Preço<input data-price-value type="number" min="0" step="0.01" value="${escapeHtml(value.price ?? "")}" required></label><label>Promocional<input data-price-promo type="number" min="0" step="0.01" value="${escapeHtml(value.promotional_price ?? "")}" placeholder="Opcional"></label><button class="table-button" data-remove-row type="button">Remover</button>`;
        byId("menuPriceRows").append(row);
    }

    function addMenuOptionRow(container, value = {}) {
        const row = document.createElement("div");
        row.className = "menu-editor-row menu-option-row";
        row.innerHTML = `<label>Opção<input data-option-name maxlength="120" value="${escapeHtml(value.name || "")}" required></label><label>Acréscimo<input data-option-price type="number" min="0" step="0.01" value="${escapeHtml(value.price_delta ?? 0)}" required></label><label>Máximo<input data-option-maximum type="number" min="1" max="100" step="1" value="${escapeHtml(value.maximum_quantity ?? 1)}" required></label><button class="table-button" data-remove-row type="button">Remover</button>`;
        container.append(row);
    }

    function addMenuOptionGroup(value = {}) {
        const group = document.createElement("section");
        group.className = "menu-option-group-editor";
        group.innerHTML = `<div class="form-row"><label>Nome do grupo<input data-group-name maxlength="100" value="${escapeHtml(value.name || "")}" required></label><label>Seleção<select data-group-type><option value="multiple">Múltipla</option><option value="single">Única</option><option value="removal">Remoção</option></select></label></div><div class="form-row"><label>Mínimo<input data-group-min type="number" min="0" max="50" value="${escapeHtml(value.minimum_selections ?? 0)}"></label><label>Máximo<input data-group-max type="number" min="1" max="50" value="${escapeHtml(value.maximum_selections ?? 1)}"></label><label>Grátis<input data-group-free type="number" min="0" max="50" value="${escapeHtml(value.free_selections ?? 0)}"></label></div><div class="menu-option-rows"></div><div class="commercial-actions"><button class="table-button edit" data-add-option type="button">+ Opção</button><button class="table-button" data-remove-group type="button">Remover grupo</button></div>`;
        group.querySelector("[data-group-type]").value = value.selection_type || "multiple";
        const options = group.querySelector(".menu-option-rows");
        (value.options?.length ? value.options : [{}]).forEach((option) => addMenuOptionRow(options, option));
        byId("menuOptionGroupRows").append(group);
    }

    function addMenuDeliveryZoneRow(value = {}) {
        const row=document.createElement("div"); row.className="menu-delivery-zone-row menu-option-group-editor";
        row.innerHTML=`<div class="form-row"><label>Código<input data-zone-code pattern="[a-z0-9](?:[a-z0-9]|_|-){1,31}" maxlength="32" value="${escapeHtml(value.code||"")}" placeholder="centro" required></label><label>Nome da região<input data-zone-name maxlength="120" value="${escapeHtml(value.name||"")}" placeholder="Centro" required></label></div><div class="form-row"><label>Taxa<input data-zone-fee type="number" min="0" step="0.01" value="${escapeHtml(value.fee??0)}" required></label><label>Pedido mínimo<input data-zone-minimum type="number" min="0" step="0.01" value="${escapeHtml(value.minimum_order??0)}" required></label></div><button class="table-button" data-remove-zone type="button">Remover região</button>`;
        byId("menuDeliveryZoneRows").append(row);
    }

    function setupMenuDeliveryZoneEditor() {
        const fieldset=byId("menuDeliveryZoneFields"); if(!fieldset || byId("menuDeliveryZoneRows") || typeof document.createElement!=="function") return;
        fieldset.innerHTML='<legend>Regiões de entrega</legend><p class="section-description">Cadastre todas as regiões atendidas. O pedido usará a taxa escolhida e o maior valor entre o mínimo geral e o mínimo da região.</p><div id="menuDeliveryZoneRows" class="menu-editor-rows"></div><button id="menuAddDeliveryZone" class="table-button edit" type="button">+ Adicionar região</button>';
        byId("menuAddDeliveryZone").addEventListener("click",()=>addMenuDeliveryZoneRow());
        byId("menuDeliveryZoneRows").addEventListener("click",(event)=>{ if(event.target.closest("[data-remove-zone]")) event.target.closest(".menu-delivery-zone-row").remove(); });
    }

    function resetMenuItemEditor() {
        byId("menuItemForm").reset();
        byId("menuItemId").value = ""; byId("menuCategoryId").value = ""; byId("menuItemImageUrl").value = ""; byId("menuItemImagePath").value = "";
        byId("menuItemUnit").value = "unidade"; byId("menuItemMinimum").value = "1"; byId("menuItemLeadTime").value = "0";
        byId("menuItemActive").checked = true; byId("menuItemAvailable").checked = true; menuImageRemoveRequested = false;
        byId("menuPriceRows").innerHTML = ""; byId("menuOptionGroupRows").innerHTML = ""; addMenuPriceRow();
        byId("menuItemImagePreview").classList.add("hidden"); byId("menuItemImagePreview").querySelector("img").removeAttribute("src");
        byId("menuItemSubmit").textContent = "Salvar produto"; byId("menuItemCancel").classList.add("hidden");
    }

    function editMenuCatalogItem(categoryId, itemId) {
        const category = menuCatalogCategories.find((entry) => entry.id === categoryId);
        const item = category?.menu_items?.find((entry) => entry.id === itemId);
        if (!item) return;
        resetMenuItemEditor();
        byId("menuItemId").value = item.id; byId("menuCategoryId").value = category.id; byId("menuCategoryName").value = category.name;
        byId("menuItemName").value = item.name; byId("menuItemDescription").value = item.description || ""; byId("menuItemType").value = item.item_type || "simple";
        byId("menuItemUnit").value = item.unit_label || "unidade"; byId("menuItemMinimum").value = item.minimum_quantity ?? 1; byId("menuItemMaximum").value = item.maximum_quantity ?? "";
        byId("menuItemLeadTime").value = item.lead_time_hours ?? 0; byId("menuItemActive").checked = item.active !== false; byId("menuItemAvailable").checked = item.available !== false;
        byId("menuItemImageUrl").value = item.image_url || ""; byId("menuItemImagePath").value = menuImagePathFromUrl(item.image_url);
        if (item.image_url) { byId("menuItemImagePreview").querySelector("img").src = item.image_url; byId("menuItemImagePreview").classList.remove("hidden"); }
        byId("menuPriceRows").innerHTML = ""; (item.menu_item_prices || []).forEach(addMenuPriceRow); if (!item.menu_item_prices?.length) addMenuPriceRow();
        byId("menuOptionGroupRows").innerHTML = "";
        (item.menu_item_option_groups || []).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map((link)=>link.menu_option_groups).filter(Boolean).forEach((group)=>addMenuOptionGroup({...group,options:(group.menu_options||[]).filter((option)=>option.available)}));
        byId("menuItemSubmit").textContent = "Atualizar produto"; byId("menuItemCancel").classList.remove("hidden");
        byId("menuItemForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const menuDraftPayload = () => ({ categories: menuCatalogCategories });

    async function savePublishedMenuDraft() {
        return supabaseClient.rpc("save_menu_catalog_draft", { target_barbershop_id: BARBERSHOP_ID, draft_payload: menuDraftPayload() });
    }

    async function moveMenuCatalogEntry(kind,id,direction) {
        if(kind==="category"){
            const index=menuCatalogCategories.findIndex((entry)=>entry.id===id), target=index+direction; if(index<0||target<0||target>=menuCatalogCategories.length)return;
            [menuCatalogCategories[index],menuCatalogCategories[target]]=[menuCatalogCategories[target],menuCatalogCategories[index]];
        } else {
            const category=menuCatalogCategories.find((entry)=>entry.menu_items?.some((item)=>item.id===id)); if(!category)return;
            const index=category.menu_items.findIndex((item)=>item.id===id),target=index+direction;if(target<0||target>=category.menu_items.length)return;
            [category.menu_items[index],category.menu_items[target]]=[category.menu_items[target],category.menu_items[index]];
        }
        const categoryIds=menuCatalogCategories.map((entry)=>entry.id),itemIds=menuCatalogCategories.flatMap((entry)=>entry.menu_items||[]).map((item)=>item.id);
        await runMenuAction("menuItemMessage","Salvando ordem...",()=>menuRecord?.published?savePublishedMenuDraft():supabaseClient.rpc("reorder_menu_catalog",{target_barbershop_id:BARBERSHOP_ID,category_ids:categoryIds,item_ids:itemIds}),menuRecord?.published?"Ordem salva no rascunho. Publique as alterações quando terminar.":"Ordem do catálogo atualizada.");
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
        byId("menuMetricOrders").textContent = `${orders} de ${Number(metrics.limits?.maximum_orders || 15)}`;
        byId("menuMetricConsumers").textContent = `${consumers} de ${Number(metrics.limits?.maximum_consumers || 7)}`;
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
                target_max_consumers: 7,
                target_max_orders: 15
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
                supabaseClient.from("online_menus").select("*,menu_delivery_zones(code,name,fee,minimum_order,active),menu_categories(id,name,description,active,sort_order,menu_items(id,name,description,image_url,item_type,unit_label,minimum_quantity,maximum_quantity,lead_time_hours,active,available,sort_order,menu_item_prices(id,label,price,promotional_price,active,sort_order),menu_item_option_groups(sort_order,menu_option_groups(id,name,selection_type,minimum_selections,maximum_selections,free_selections,active,menu_options(id,name,price_delta,maximum_quantity,available,sort_order)))))").eq("barbershop_id", BARBERSHOP_ID).maybeSingle(),
                supabaseClient.from("menu_orders").select("id,public_reference,customer_name,fulfillment_type,status,total_amount,created_at,is_test").eq("barbershop_id", BARBERSHOP_ID).order("created_at", { ascending: false }).limit(100),
                supabaseClient.from("menu_catalog_templates").select("code,name,description,segment,definition").eq("active", true).order("name"),
                supabaseClient.rpc("menu_onboarding_status", { target_barbershop_id: BARBERSHOP_ID })
            ]);
            if (loadVersion !== menuLoadVersion) return false;
            if (error || templateError || onboardingError) throw error || templateError || onboardingError;
            let draftStatus = null;
            if (menu?.published) {
                const draftResult = await supabaseClient.rpc("menu_catalog_draft_status", { target_barbershop_id: BARBERSHOP_ID });
                if (draftResult.error) throw draftResult.error;
                draftStatus = draftResult.data;
            }
            menuTemplates = templates || [];
            menuOnboarding = onboarding;
            menuRecord = menu;
            if (menu?.title && businessConfig.name === "Seu negócio") {
                businessConfig.name = menu.title;
                applyBusinessCustomization();
            }
            menuCatalogDraftDirty = Boolean(draftStatus?.exists);
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
            const zones = (menu?.menu_delivery_zones || []).filter((entry)=>entry.active);
            if(typeof document.createElement==="function"&&byId("menuDeliveryZoneRows")){ byId("menuDeliveryZoneRows").innerHTML=""; (zones.length?zones:[{fee:menu?.delivery_fee??0,minimum_order:menu?.minimum_order??0}]).forEach(addMenuDeliveryZoneRow); }
            else { const zone=zones[0]||{}; if(byId("menuZoneCode")){ byId("menuZoneCode").value=zone.code||""; byId("menuZoneName").value=zone.name||""; byId("menuZoneFee").value=zone.fee??menu?.delivery_fee??0; byId("menuZoneMinimum").value=zone.minimum_order??menu?.minimum_order??0; } }
            byId("menuDeliveryZoneFields").classList.toggle("hidden", !menu?.accepts_delivery);
            const checks = onboarding?.checks || {};
            const progress = `${onboarding?.completed_count || 0} de ${onboarding?.total_count || 8} etapas concluídas`;
            byId("menuOnboardingProgress").textContent = progress;
            byId("menuOnboardingBar").value = onboarding?.completed_count || 0;
            byId("menuOnboardingBar").max = onboarding?.total_count || 8;
            byId("menuOnboardingBar").setAttribute("aria-valuetext", progress);
            byId("menuOnboardingChecklist").innerHTML = Object.entries(menuStepLabels).map(([code, label]) => `<li${onboarding?.next_step === code ? ' aria-current="step"' : ""}><span aria-hidden="true">${checks[code] ? "✓" : "○"}</span> ${escapeHtml(label)} — ${checks[code] ? "concluído" : "pendente"}</li>`).join("");
            byId("menuNextStep").textContent = menu?.published ? (menuCatalogDraftDirty ? "O cardápio público continua ativo. Há alterações de catálogo em rascunho aguardando publicação." : "Seu cardápio está publicado. Você pode preparar alterações de catálogo em rascunho sem interromper os pedidos.") : onboarding?.next_step === "ready" ? "Revisão concluída. Você decide quando publicar seu cardápio." : `Próxima etapa: ${menuStepLabels[onboarding?.next_step] || menuStepLabels.segment}. Salve a configuração para retomar de onde parou.`;
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
            const categories = [...(draftStatus?.payload?.categories || menu?.menu_categories || [])].sort((a, b) => a.sort_order - b.sort_order);
            menuCatalogCategories = categories;
            byId("menuCategorySuggestions").innerHTML = categories.map((category) => `<option value="${escapeHtml(category.name)}"></option>`).join("");
            renderMenuReview(menu, categories);
            byId("menuCatalogList").innerHTML = categories.map((category) => `<article><header><strong>${escapeHtml(category.name)}${category.active ? "" : " · categoria inativa"}</strong><div class="commercial-actions"><small>${(category.menu_items || []).length} produto(s)</small><button class="table-button" type="button" data-move-category="${category.id}" data-direction="-1" aria-label="Mover categoria para cima">↑</button><button class="table-button" type="button" data-move-category="${category.id}" data-direction="1" aria-label="Mover categoria para baixo">↓</button></div></header>${(category.menu_items || []).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map((item) => `<div class="menu-catalog-editor-item">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : '<span class="menu-catalog-no-image" aria-hidden="true">Sem foto</span>'}<div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description || "Sem descrição")}</p><small>${item.active && item.available ? "Disponível" : "Indisponível"} · ${(item.menu_item_prices || []).filter((price) => price.active).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map((price) => `${escapeHtml(price.label)}: ${formatMoney.format(Number(price.promotional_price ?? price.price))}`).join(" · ") || "Sem preço ativo"}</small></div><div class="commercial-actions"><button class="table-button" type="button" data-move-menu-item="${item.id}" data-direction="-1" aria-label="Mover produto para cima">↑</button><button class="table-button" type="button" data-move-menu-item="${item.id}" data-direction="1" aria-label="Mover produto para baixo">↓</button><button class="table-button edit" type="button" data-edit-menu-item="${item.id}" data-category-id="${category.id}">Editar</button><button class="table-button" type="button" data-delete-menu-item="${item.id}" data-category-id="${category.id}">Excluir</button></div></div>`).join("") || '<p class="section-description">Categoria vazia.</p>'}</article>`).join("") || "<p class='section-description'>Nenhum item cadastrado.</p>";
            byId("menuCatalogList").querySelectorAll("[data-edit-menu-item]").forEach((button)=>button.addEventListener("click",()=>editMenuCatalogItem(button.dataset.categoryId,button.dataset.editMenuItem)));
            byId("menuCatalogList").querySelectorAll("[data-delete-menu-item]").forEach((button)=>button.addEventListener("click",async()=>{
                if (!confirm("Excluir este produto e seus preços e adicionais? Esta ação não pode ser desfeita.")) return;
                const category=menuCatalogCategories.find((entry)=>entry.id===button.dataset.categoryId), item=category?.menu_items?.find((entry)=>entry.id===button.dataset.deleteMenuItem);
                await runMenuAction("menuItemMessage","Excluindo produto...",async()=>{
                    if(menuRecord?.published){
                        category.menu_items=category.menu_items.filter((entry)=>entry.id!==button.dataset.deleteMenuItem);
                        menuCatalogCategories=menuCatalogCategories.filter((entry)=>entry.menu_items?.length);
                        return savePublishedMenuDraft();
                    }
                    const result=await supabaseClient.rpc("delete_menu_catalog_item",{target_barbershop_id:BARBERSHOP_ID,target_item_id:button.dataset.deleteMenuItem});
                    if(result.error) return result;
                    const path=menuImagePathFromUrl(item?.image_url); if(path) await supabaseClient.storage.from("menu-images").remove([path]);
                    return result;
                },menuRecord?.published?"Produto removido do rascunho. O catálogo público não mudou.":"Produto excluído.");
            }));
            byId("menuCatalogList").querySelectorAll("[data-move-category]").forEach((button)=>button.addEventListener("click",()=>moveMenuCatalogEntry("category",button.dataset.moveCategory,Number(button.dataset.direction))));
            byId("menuCatalogList").querySelectorAll("[data-move-menu-item]").forEach((button)=>button.addEventListener("click",()=>moveMenuCatalogEntry("item",button.dataset.moveMenuItem,Number(button.dataset.direction))));
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
            if (menu?.published) selectMenuWorkspace("operation");
            else if (!menu?.template_code || onboarding?.next_step === "catalog") selectMenuWorkspace("catalog");
            else selectMenuWorkspace("settings");
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
        const zones=typeof document.createElement==="function"&&byId("menuDeliveryZoneRows")?[...byId("menuDeliveryZoneRows").querySelectorAll(".menu-delivery-zone-row")].map((row)=>({code:row.querySelector("[data-zone-code]").value.trim().toLowerCase(),name:row.querySelector("[data-zone-name]").value.trim(),fee:Number(row.querySelector("[data-zone-fee]").value||0),minimum_order:Number(row.querySelector("[data-zone-minimum]").value||0)})):(byId("menuZoneCode")?[{code:byId("menuZoneCode").value.trim().toLowerCase(),name:byId("menuZoneName").value.trim(),fee:Number(byId("menuZoneFee").value||0),minimum_order:Number(byId("menuZoneMinimum").value||0)}]:[]);
        const firstZone=zones[0]||null;
        const settings={slug:byId("menuSlug").value.trim().toLowerCase(),title:byId("menuTitle").value.trim(),description:byId("menuDescription").value.trim(),minimum_order:Number(byId("menuMinimum").value||0),delivery_fee:Number(byId("menuDeliveryFee").value||0),accepts_delivery:acceptsDelivery,accepts_pickup:byId("menuAcceptsPickup").checked,visual_identity:{primary_color:byId("menuPrimaryColor").value,accent_color:byId("menuAccentColor").value},payment_methods:[...document.querySelectorAll(".menu-payment:checked")].map((input)=>input.value),weekdays:[...document.querySelectorAll(".menu-weekday:checked")].map((input)=>Number(input.value)),opens_at:byId("menuOpensAt").value,closes_at:byId("menuClosesAt").value,delivery_zone:acceptsDelivery?firstZone:null};
        if (!settings.accepts_pickup && !acceptsDelivery) return notify(byId("menuMessage"), "Ative a retirada, a entrega ou as duas opções.", true);
        if (!settings.payment_methods.length) return notify(byId("menuMessage"), "Selecione ao menos uma forma de pagamento.", true);
        if (!settings.weekdays.length || !settings.opens_at || settings.opens_at >= settings.closes_at) return notify(byId("menuMessage"), "Escolha os dias e um horário de encerramento posterior à abertura, no mesmo dia.", true);
        if (acceptsDelivery && (!zones.length || zones.some((zone)=>!zone.code||!zone.name))) return notify(byId("menuMessage"), "Cadastre ao menos uma região completa para entrega.", true);
        await runMenuAction("menuMessage", "Salvando configuração...", async()=>{ const saved=await supabaseClient.rpc("save_menu_onboarding_settings", { target_barbershop_id: BARBERSHOP_ID, settings }); if(saved.error)return saved; return supabaseClient.rpc("save_menu_delivery_zones",{target_barbershop_id:BARBERSHOP_ID,zones:acceptsDelivery?zones:[]}); }, "Configuração salva. Confira as etapas e faça o pedido de teste quando estiver pronto.");
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
        if (menuRecord?.published && menuCatalogDraftDirty) {
            return runMenuAction("menuOnboardingMessage", "Publicando alterações do catálogo...", () => supabaseClient.rpc("publish_menu_catalog_draft", { target_barbershop_id: BARBERSHOP_ID }), "Alterações publicadas de forma atômica. O cardápio permaneceu disponível durante a troca.");
        }
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

    byId("menuAddPrice")?.addEventListener("click",()=>addMenuPriceRow({label:"",price:""}));
    byId("menuAddOptionGroup")?.addEventListener("click",()=>addMenuOptionGroup());
    byId("menuItemCancel")?.addEventListener("click",resetMenuItemEditor);
    byId("menuPriceRows")?.addEventListener("click",(event)=>{ if(event.target.closest("[data-remove-row]") && byId("menuPriceRows").children.length>1) event.target.closest(".menu-editor-row").remove(); });
    byId("menuOptionGroupRows")?.addEventListener("click",(event)=>{
        const group=event.target.closest(".menu-option-group-editor"); if(!group) return;
        if(event.target.closest("[data-add-option]")) addMenuOptionRow(group.querySelector(".menu-option-rows"));
        if(event.target.closest("[data-remove-row]") && group.querySelectorAll(".menu-option-row").length>1) event.target.closest(".menu-option-row").remove();
        if(event.target.closest("[data-remove-group]")) group.remove();
    });
    byId("menuItemImage")?.addEventListener("change",()=>{
        const file=byId("menuItemImage").files?.[0]; if(!file) return;
        if(!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>5*1024*1024){ byId("menuItemImage").value=""; return notify(byId("menuItemMessage"),"Use uma imagem JPEG, PNG ou WebP de até 5 MB.",true); }
        const preview=byId("menuItemImagePreview"); preview.querySelector("img").src=URL.createObjectURL(file); preview.classList.remove("hidden"); menuImageRemoveRequested=false;
    });
    byId("menuItemImageRemove")?.addEventListener("click",()=>{
        byId("menuItemImage").value=""; byId("menuItemImageUrl").value=""; byId("menuItemImagePreview").classList.add("hidden"); menuImageRemoveRequested=true;
    });

    byId("menuItemForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!menuRecord) return notify(byId("menuItemMessage"), "Escolha um modelo de cardápio antes de adicionar itens.", true);
        if (menuSettingsDirty) return;
        await runMenuAction("menuItemMessage", byId("menuItemId").value ? "Atualizando produto..." : "Adicionando produto...", async () => {
            const previousPath=byId("menuItemImagePath").value, file=byId("menuItemImage").files?.[0]; let uploadedPath="", imageUrl=menuImageRemoveRequested?"":byId("menuItemImageUrl").value;
            if(file){
                const extension={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"}[file.type]; uploadedPath=`${BARBERSHOP_ID}/${crypto.randomUUID()}.${extension}`;
                const uploaded=await supabaseClient.storage.from("menu-images").upload(uploadedPath,file,{contentType:file.type,cacheControl:"31536000",upsert:false});
                if(uploaded.error) return uploaded;
                imageUrl=supabaseClient.storage.from("menu-images").getPublicUrl(uploadedPath).data.publicUrl;
            }
            const prices=[...byId("menuPriceRows").querySelectorAll(".menu-price-row")].map((row)=>({label:row.querySelector("[data-price-label]").value.trim(),price:Number(row.querySelector("[data-price-value]").value),promotional_price:row.querySelector("[data-price-promo]").value===""?null:Number(row.querySelector("[data-price-promo]").value)}));
            const optionGroups=[...byId("menuOptionGroupRows").querySelectorAll(".menu-option-group-editor")].map((group)=>({name:group.querySelector("[data-group-name]").value.trim(),selection_type:group.querySelector("[data-group-type]").value,minimum_selections:Number(group.querySelector("[data-group-min]").value||0),maximum_selections:Number(group.querySelector("[data-group-max]").value||1),free_selections:Number(group.querySelector("[data-group-free]").value||0),options:[...group.querySelectorAll(".menu-option-row")].map((row)=>({name:row.querySelector("[data-option-name]").value.trim(),price_delta:Number(row.querySelector("[data-option-price]").value||0),maximum_quantity:Number(row.querySelector("[data-option-maximum]").value||1)}))}));
            const payload={id:byId("menuItemId").value||null,category_id:byId("menuCategoryId").value||null,category_name:byId("menuCategoryName").value.trim(),name:byId("menuItemName").value.trim(),description:byId("menuItemDescription").value.trim(),image_url:imageUrl,item_type:byId("menuItemType").value,unit_label:byId("menuItemUnit").value.trim(),minimum_quantity:Number(byId("menuItemMinimum").value),maximum_quantity:byId("menuItemMaximum").value===""?null:Number(byId("menuItemMaximum").value),lead_time_hours:Number(byId("menuItemLeadTime").value||0),active:byId("menuItemActive").checked,available:byId("menuItemAvailable").checked,prices,option_groups:optionGroups};
            if(menuRecord.published){
                let category=menuCatalogCategories.find((entry)=>entry.id===payload.category_id) || menuCatalogCategories.find((entry)=>entry.name.toLowerCase()===payload.category_name.toLowerCase());
                if(!category){ category={id:crypto.randomUUID(),name:payload.category_name,active:true,sort_order:(menuCatalogCategories.length+1)*10,menu_items:[]}; menuCatalogCategories.push(category); }
                category.name=payload.category_name;
                const draftItem={id:payload.id||crypto.randomUUID(),name:payload.name,description:payload.description,image_url:payload.image_url,item_type:payload.item_type,unit_label:payload.unit_label,minimum_quantity:payload.minimum_quantity,maximum_quantity:payload.maximum_quantity,lead_time_hours:payload.lead_time_hours,active:payload.active,available:payload.available,sort_order:((category.menu_items||[]).length+1)*10,menu_item_prices:prices.map((price,index)=>({...price,active:true,sort_order:(index+1)*10})),menu_item_option_groups:optionGroups.map((group,index)=>({sort_order:(index+1)*10,menu_option_groups:{...group,active:true,menu_options:group.options.map((option,optionIndex)=>({...option,available:true,sort_order:(optionIndex+1)*10}))}}))};
                const priorCategory=menuCatalogCategories.find((entry)=>entry.menu_items?.some((item)=>item.id===draftItem.id));
                if(priorCategory) priorCategory.menu_items=priorCategory.menu_items.filter((item)=>item.id!==draftItem.id);
                category.menu_items=category.menu_items||[]; const existingIndex=category.menu_items.findIndex((item)=>item.id===draftItem.id);
                if(existingIndex>=0){ draftItem.sort_order=category.menu_items[existingIndex].sort_order; category.menu_items[existingIndex]=draftItem; } else category.menu_items.push(draftItem);
                menuCatalogCategories=menuCatalogCategories.filter((entry)=>entry.menu_items?.length);
                const result=await savePublishedMenuDraft();
                if(result.error){ if(uploadedPath) await supabaseClient.storage.from("menu-images").remove([uploadedPath]); return result; }
                resetMenuItemEditor(); return result;
            }
            const result=await supabaseClient.rpc("save_menu_catalog_item",{target_barbershop_id:BARBERSHOP_ID,payload});
            if(result.error){ if(uploadedPath) await supabaseClient.storage.from("menu-images").remove([uploadedPath]); return result; }
            if(previousPath && previousPath!==uploadedPath && (uploadedPath || menuImageRemoveRequested)) await supabaseClient.storage.from("menu-images").remove([previousPath]);
            resetMenuItemEditor(); return result;
        }, menuRecord.published?"Produto salvo no rascunho. O catálogo público não mudou; publique quando terminar.":"Produto salvo. Confira o catálogo e as etapas pendentes.");
    });

    setupMenuDeliveryZoneEditor();
    if (byId("menuPriceRows") && typeof document.createElement === "function") resetMenuItemEditor();

    window.loadLandingAdmin = loadLandingAdmin;
    window.loadQuotesAdmin = loadQuotesAdmin;
    window.loadMenuAdmin = loadMenuAdmin;
})();
