/* OGRITECH — ADMINISTRAÇÃO DA PLATAFORMA */
const SEGMENTS = {
    "Barbearia": { icon: "✂", color: "#f0d477" }, "Salão de beleza": { icon: "✦", color: "#d173df" },
    "Manicure": { icon: "◇", color: "#f18fb4" }, "Bronzeamento": { icon: "☀", color: "#f0ad4e" },
    "Professor de música": { icon: "♫", color: "#6ba8f7" }, "Personal training": { icon: "◆", color: "#65d39b" },
    "Outro": { icon: "●", color: "#8fa3aa" }
};
let businesses = [], plans = [], products = [], subscriptions = [], users = [], invoices = [], billingCustomers = [], payments = [], refunds = [], selectedBusinessId = null;
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const moneyPrecise = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const shortDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const $ = (id) => document.getElementById(id);
const environmentUrl = (path) => window.ogritechEnvironmentUrl?.(path) || path;
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

async function checkPlatformAdminWithRetry() {
    const delays = [0, 300, 900];
    let lastError = null;
    for (const delay of delays) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const result = await supabaseClient.rpc("is_platform_admin");
        if (!result.error) return result;
        lastError = result.error;
    }
    return { data: false, error: lastError };
}

async function validatePlatformAdmin() {
    sessionStorage.removeItem("ogritechMasterMode"); sessionStorage.removeItem("ogritechMasterBusinessId"); sessionStorage.removeItem("ogritechMasterBusinessName");
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) {
        console.error("Falha ao validar sessão administrativa:", sessionError);
        $("adminLoading").textContent = "Não foi possível validar sua sessão. Atualize a página para tentar novamente.";
        return false;
    }
    if (!session) { window.location.replace(environmentUrl("login/")); return false; }
    const { data: isAdmin, error } = await checkPlatformAdminWithRetry();
    if (error) {
        console.error("Falha ao validar privilégio administrativo:", error);
        $("adminLoading").textContent = "Não foi possível validar seu acesso administrativo. Atualize a página para tentar novamente.";
        return false;
    }
    if (!isAdmin) {
        await supabaseClient.auth.signOut();
        sessionStorage.clear();
        window.location.replace(environmentUrl("login/"));
        return false;
    }
    const { data: profile } = await supabaseClient.from("profiles").select("full_name, active").eq("id", session.user.id).single();
    if (!profile?.active) { await supabaseClient.auth.signOut(); window.location.replace(environmentUrl("login/")); return false; }
    $("platformOwnerName").textContent = profile.full_name;
    return true;
}

async function loadData() {
    const [businessResult, planResult, productResult, subscriptionResult, userResult, customerResult, invoiceResult, paymentResult, refundResult] = await Promise.all([
        supabaseClient.from("saas_clients").select("id,barbershop_id,name,segment,contact_name,owner_email,phone,plan,monthly_fee,origin,notes,status,invite_status,user_count,client_count,appointment_count,business_revenue,created_at").is("deleted_at", null).order("created_at", { ascending: true }).limit(500),
        supabaseClient.from("saas_plans").select("id,product_id,code,name,monthly_fee,description,features,featured,display_order,max_users,max_professionals,max_services").eq("active", true).order("display_order"),
        supabaseClient.from("platform_products").select("id,code,name,launch_state,display_order").eq("active",true).order("display_order"),
        supabaseClient.from("platform_subscriptions").select("id,billing_customer_id,product_id,plan_id,status,base_amount,current_period_end").order("created_at",{ascending:false}).limit(2000),
        supabaseClient.functions.invoke("platform-users", { body: { action: "list" } }),
        supabaseClient.from("billing_customers").select("id,saas_client_id,billing_email,payment_method,billing_day").limit(1000),
        supabaseClient.from("platform_invoices").select("id,invoice_number,billing_customer_id,status,issue_date,due_date,subtotal,discount_total,credit_total,total,paid_total,refunded_total,notes,created_at").order("created_at", { ascending: false }).limit(1000),
        supabaseClient.from("platform_payments").select("id,invoice_id,method,status,gross_amount,fee_amount,paid_at,created_at").order("created_at", { ascending: false }).limit(2000),
        supabaseClient.from("platform_refunds").select("id,payment_id,refund_type,status,amount,reason,created_at").limit(2000)
    ]);
    if (businessResult.error) throw businessResult.error;
    if (planResult.error) throw planResult.error;
    if (productResult.error) throw productResult.error;
    if (subscriptionResult.error) throw subscriptionResult.error;
    if (userResult.error || userResult.data?.error) throw userResult.error || new Error(userResult.data.error);
    const authUsersWithoutProfile = userResult.data?.auth_users_without_profile || [];
    if (authUsersWithoutProfile.length) {
        throw new Error(`${authUsersWithoutProfile.length} usuário(s) do Auth estão sem perfil. Não use convites diretos pelo painel Supabase; corrija o provisionamento antes de continuar.`);
    }
    if (customerResult.error) throw customerResult.error;
    if (invoiceResult.error) throw invoiceResult.error;
    if (paymentResult.error) throw paymentResult.error;
    if (refundResult.error) throw refundResult.error;
    businesses = businessResult.data || [];
    plans = planResult.data || [];
    products = productResult.data || [];
    subscriptions = subscriptionResult.data || [];
    users = (userResult.data?.users || []).filter((profile) => profile.id !== sessionStorage.getItem("japaUserId"));
    billingCustomers = customerResult.data || [];
    invoices = invoiceResult.data || [];
    payments = paymentResult.data || [];
    refunds = refundResult.data || [];
}

function renderSummary() {
    const active = businesses.filter((business) => business.status === "Ativo");
    $("businessCount").textContent = businesses.length;
    $("segmentCount").textContent = new Set(businesses.map((business) => business.segment)).size;
    $("activeCount").textContent = active.length;
    const realBusinesses = active.filter((business) => business.origin === "Cliente real");
    $("monthlyRevenue").textContent = money.format(realBusinesses.reduce((sum, business) => sum + Number(business.monthly_fee), 0));
}

function renderSegments() {
    $("segmentGrid").innerHTML = [...new Set(businesses.map((business) => business.segment))].map((segment) => {
        const meta = SEGMENTS[segment] || SEGMENTS.Outro;
        const count = businesses.filter((business) => business.segment === segment).length;
        return `<article class="segment-card" style="--segment-color:${meta.color}"><i>${meta.icon}</i><div><strong>${escapeHtml(segment)}</strong><span>${count} negócio${count === 1 ? "" : "s"}</span></div><b>${count}</b></article>`;
    }).join("");
}

function renderBusinesses() {
    const query = $("businessSearch").value.trim().toLocaleLowerCase("pt-BR"), segment = $("segmentFilter").value;
    const filtered = businesses.filter((business) => `${business.name} ${business.contact_name} ${business.owner_email || ""}`.toLocaleLowerCase("pt-BR").includes(query) && (segment === "all" || business.segment === segment));
    $("businessTableBody").innerHTML = filtered.map((business) => {
        const meta = SEGMENTS[business.segment] || SEGMENTS.Outro;
        return `<tr><td><button class="business-link" data-action="detail" data-id="${business.id}"><span style="--segment-color:${meta.color}">${meta.icon}</span><strong>${escapeHtml(business.name)}</strong></button></td>
        <td>${escapeHtml(business.segment)}</td><td>${escapeHtml(business.contact_name)}</td><td><strong>${escapeHtml(business.phone || "Telefone pendente")}</strong><br><small>${escapeHtml(business.owner_email || "E-mail pendente")}</small></td><td><span class="origin-badge">${escapeHtml(business.origin)}</span></td>
        <td><span class="plan-badge">${escapeHtml(business.plan)}</span></td><td>${money.format(business.monthly_fee)}</td><td><span class="${business.status === "Ativo" ? "active-badge" : "suspended-badge"}">${escapeHtml(business.status)}</span></td>
        <td><div class="admin-row-actions"><button data-action="operate" data-id="${business.id}">Operar</button><button data-action="edit" data-id="${business.id}">Editar</button><button class="danger" data-action="delete" data-id="${business.id}">Arquivar</button></div></td></tr>`;
    }).join("");
    $("businessEmpty").classList.toggle("hidden", filtered.length > 0);
    document.querySelector(".business-table-wrap").classList.toggle("hidden", filtered.length === 0);
}

function renderPlans() {
    $("plansGrid").innerHTML = plans.map((plan) => {
        const features = Array.isArray(plan.features) ? plan.features : [];
        const limit = (value) => value == null ? "Ilimitado" : Number(value).toLocaleString("pt-BR");
        return `<article class="plan-card ${plan.featured ? "featured" : ""}">${plan.featured ? '<span class="recommended-plan">MAIS ESCOLHIDO</span>' : ""}<p class="platform-kicker">${escapeHtml(plan.name)}</p><strong>${money.format(plan.monthly_fee)}<small>/mês</small></strong><p>${escapeHtml(plan.description)}</p><div class="plan-limits"><span>${limit(plan.max_users)} usuários</span><span>${limit(plan.max_professionals)} profissionais</span><span>${limit(plan.max_services)} serviços</span></div><ul>${features.map((feature) => `<li>✓ ${escapeHtml(feature)}</li>`).join("")}</ul><button type="button" class="outline-cyan-button full" data-edit-plan="${plan.id}">Editar regras</button></article>`;
    }).join("");
}

function optionalPositiveInteger(value) {
    if (String(value).trim() === "") return null;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : NaN;
}

function openPlanForm(plan) {
    $("planForm").reset(); $("planFormMessage").textContent = "";
    $("planId").value = plan.id; $("planName").value = plan.name;
    $("planPrice").value = Number(plan.monthly_fee).toFixed(2);
    $("planMaxUsers").value = plan.max_users ?? "";
    $("planMaxProfessionals").value = plan.max_professionals ?? "";
    $("planMaxServices").value = plan.max_services ?? "";
    $("planDescription").value = plan.description;
    $("planFeatures").value = (Array.isArray(plan.features) ? plan.features : []).join("\n");
    $("planFeatured").checked = Boolean(plan.featured);
    $("planModalTitle").textContent = `Editar plano ${plan.name}`;
    $("planModal").classList.remove("hidden");
}

async function savePlan(event) {
    event.preventDefault();
    const maxUsers = optionalPositiveInteger($("planMaxUsers").value);
    const maxProfessionals = optionalPositiveInteger($("planMaxProfessionals").value);
    const maxServices = optionalPositiveInteger($("planMaxServices").value);
    if ([maxUsers, maxProfessionals, maxServices].some(Number.isNaN)) {
        $("planFormMessage").textContent = "Use números inteiros maiores que zero ou deixe vazio para ilimitado.";
        $("planFormMessage").className = "form-message error"; return;
    }
    const payload = {
        monthly_fee: Number($("planPrice").value), description: $("planDescription").value.trim(),
        features: $("planFeatures").value.split("\n").map((item) => item.trim()).filter(Boolean),
        featured: $("planFeatured").checked, max_users: maxUsers,
        max_professionals: maxProfessionals, max_services: maxServices
    };
    $("savePlanButton").disabled = true; $("planFormMessage").textContent = "Salvando regras...";
    const { error } = await supabaseClient.from("saas_plans").update(payload).eq("id", $("planId").value);
    $("savePlanButton").disabled = false;
    if (error) { $("planFormMessage").textContent = error.message || "Não foi possível salvar o plano."; $("planFormMessage").className = "form-message error"; return; }
    await loadData(); populateSelectors(); refreshViews(); closeModals();
}

const billingStatusLabels = { draft: "Rascunho", open: "Em aberto", overdue: "Atrasada", paid: "Paga", void: "Cancelada", refunded: "Devolvida", partially_refunded: "Devolução parcial" };
function effectiveInvoiceStatus(invoice) {
    return invoice.status === "open" && invoice.due_date < new Date().toISOString().slice(0, 10) ? "overdue" : invoice.status;
}
function invoiceBusiness(invoice) {
    const customer = billingCustomers.find((item) => item.id === invoice.billing_customer_id);
    return businesses.find((item) => item.id === customer?.saas_client_id);
}
function renderBilling() {
    if (!$('billingTableBody')) return;
    const selectedStatus = $('billingStatusFilter').value;
    const filtered = invoices.filter((invoice) => selectedStatus === "all" || effectiveInvoiceStatus(invoice) === selectedStatus);
    const approvedPayments = payments.filter((payment) => ["approved", "partially_refunded", "refunded"].includes(payment.status));
    $('billingReceived').textContent = moneyPrecise.format(approvedPayments.reduce((sum, item) => sum + Number(item.gross_amount), 0));
    $('billingOpen').textContent = moneyPrecise.format(invoices.filter((item) => effectiveInvoiceStatus(item) === "open").reduce((sum, item) => sum + Number(item.total) - Number(item.paid_total), 0));
    $('billingOverdue').textContent = moneyPrecise.format(invoices.filter((item) => effectiveInvoiceStatus(item) === "overdue").reduce((sum, item) => sum + Number(item.total) - Number(item.paid_total), 0));
    $('billingBenefits').textContent = moneyPrecise.format(invoices.reduce((sum, item) => sum + Number(item.discount_total) + Number(item.credit_total), 0));
    $('billingRefunded').textContent = moneyPrecise.format(refunds.filter((item) => ["approved", "processed"].includes(item.status)).reduce((sum, item) => sum + Number(item.amount), 0));
    $('billingTableBody').innerHTML = filtered.map((invoice) => {
        const business = invoiceBusiness(invoice), status = effectiveInvoiceStatus(invoice);
        const invoicePayments = payments.filter((item) => item.invoice_id === invoice.id);
        const refundablePayment = invoicePayments.find((payment) => {
            const returned = refunds.filter((item) => item.payment_id === payment.id && ["approved", "processed"].includes(item.status)).reduce((sum, item) => sum + Number(item.amount), 0);
            return ["approved", "partially_refunded"].includes(payment.status) && returned < Number(payment.gross_amount);
        });
        const balance = Number(invoice.total) - Number(invoice.paid_total);
        return `<tr><td><strong>${escapeHtml(invoice.invoice_number)}</strong></td><td>${escapeHtml(business?.name || "Cliente removido")}</td><td>${shortDate.format(new Date(`${invoice.issue_date}T00:00:00Z`))}</td><td>${shortDate.format(new Date(`${invoice.due_date}T00:00:00Z`))}</td><td>${moneyPrecise.format(invoice.total)}</td><td>${moneyPrecise.format(invoice.paid_total)}</td><td><span class="billing-status ${status}">${escapeHtml(billingStatusLabels[status] || status)}</span></td><td><div class="admin-row-actions">${balance > 0 && !["void", "refunded"].includes(status) ? `<button data-billing-action="pay" data-id="${invoice.id}">Baixar</button>` : ""}${refundablePayment ? `<button data-billing-action="refund" data-id="${refundablePayment.id}">Devolver</button>` : ""}</div></td></tr>`;
    }).join("");
    $('billingEmpty').classList.toggle("hidden", filtered.length > 0);
    $('billingTableWrap').classList.toggle("hidden", filtered.length === 0);
}

const roleLabels = { owner: "Proprietário", admin: "Gestor", employee: "Funcionário", client: "Cliente final" };
function renderUsers() {
    if (!$("usersTableBody") || !$("userBusinessFilter")) return;
    const filter = $("userBusinessFilter").value;
    const filtered = users.filter((user) => filter === "all" || user.barbershop_id === filter);
    $("usersTableBody").innerHTML = filtered.map((user) => { const business = businesses.find((item) => item.barbershop_id === user.barbershop_id); return `<tr><td><strong>${escapeHtml(user.full_name)}</strong></td><td>${escapeHtml(user.email || "—")}</td><td>${escapeHtml(business?.name || "Sem vínculo")}</td><td><span class="plan-badge">${escapeHtml(roleLabels[user.role] || user.role)}</span></td><td><span class="${user.active ? "active-badge" : "suspended-badge"}">${user.active ? "Ativo" : "Inativo"}</span></td><td><div class="admin-row-actions"><button data-user-action="edit" data-id="${user.id}">Editar</button><button data-user-action="reset-password" data-id="${user.id}">Gerar senha temporária</button><button data-user-action="toggle" data-id="${user.id}">${user.active ? "Desativar" : "Ativar"}</button><button class="danger" data-user-action="delete" data-id="${user.id}">Arquivar</button></div></td></tr>`; }).join("");
    $("usersEmpty").classList.toggle("hidden", filtered.length > 0);
}

function subscriptionFor(business, product) {
    const customer = billingCustomers.find((item) => item.saas_client_id === business?.id);
    return subscriptions.find((item) => item.billing_customer_id === customer?.id && item.product_id === product.id && item.status !== "cancelled");
}
const productStatusLabels = { trial: "Teste", active: "Ativo", pending_activation: "Pendente", past_due: "Em atraso", grace_period: "Carência", suspended: "Suspenso", cancelled: "Cancelado" };
function renderProductAccess() {
    if (!$('productAccessTableBody')) return;
    const business = businesses.find((item) => item.id === $('productBusinessFilter').value) || businesses[0];
    $('productAccessTableBody').innerHTML = products.map((product) => {
        const subscription = subscriptionFor(business,product);
        const plan = plans.find((item) => item.id === subscription?.plan_id) || plans.find((item) => item.product_id === product.id);
        const status = subscription?.status || 'not_subscribed';
        const canActivate = business && plan && product.code !== 'agenda';
        const action = subscription
            ? `<button class="danger" data-product-action="cancel" data-product-code="${product.code}" data-plan-id="${plan?.id || ''}">Cancelar</button>`
            : canActivate ? `<button data-product-action="activate" data-product-code="${product.code}" data-plan-id="${plan.id}">Ativar</button>` : '<span>Gerido pelo fluxo Agenda</span>';
        return `<tr><td><strong>${escapeHtml(product.name)}</strong><br><small>${escapeHtml(product.launch_state)}</small></td><td>${escapeHtml(plan?.name || 'Plano não configurado')}</td><td>${subscription ? moneyPrecise.format(subscription.base_amount) : '—'}</td><td><span class="${subscription ? 'active-badge' : 'suspended-badge'}">${escapeHtml(productStatusLabels[status] || 'Não contratado')}</span></td><td><div class="admin-row-actions">${action}</div></td></tr>`;
    }).join('');
}

async function changeProductSubscription(button) {
    const business = businesses.find((item) => item.id === $('productBusinessFilter').value) || businesses[0];
    if (!business) return;
    const cancelling = button.dataset.productAction === 'cancel';
    if (cancelling && !confirm(`Cancelar somente ${button.dataset.productCode} para ${business.name}? As outras soluções permanecerão intactas.`)) return;
    button.disabled = true;
    const { error } = await supabaseClient.rpc('platform_set_product_subscription', {
        target_saas_client_id: business.id,
        target_product_code: button.dataset.productCode,
        target_plan_id: button.dataset.planId,
        target_status: cancelling ? 'cancelled' : 'active',
        target_base_amount: null
    });
    button.disabled = false;
    if (error) return alert(error.message || 'Não foi possível alterar o produto.');
    await loadData(); populateSelectors(); refreshViews();
}

function refreshViews() { renderSummary(); renderSegments(); renderBusinesses(); renderPlans(); renderProductAccess(); renderUsers(); renderBilling(); }
function populateSelectors() {
    $("businessSegment").innerHTML = Object.keys(SEGMENTS).map((segment) => `<option>${segment}</option>`).join("");
    $("segmentFilter").innerHTML = '<option value="all">Todos os segmentos</option>' + Object.keys(SEGMENTS).map((segment) => `<option>${segment}</option>`).join("");
    const agendaProduct = products.find((product) => product.code === 'agenda');
    $("businessPlan").innerHTML = plans.filter((plan) => plan.product_id === agendaProduct?.id).map((plan) => `<option value="${escapeHtml(plan.name)}" data-price="${plan.monthly_fee}">${escapeHtml(plan.name)}</option>`).join("");
    const businessOptions = businesses.filter((business) => business.barbershop_id).map((business) => `<option value="${business.barbershop_id}">${escapeHtml(business.name)}</option>`).join("");
    if ($("userBusiness")) $("userBusiness").innerHTML = businessOptions;
    if ($("userBusinessFilter")) $("userBusinessFilter").innerHTML = '<option value="all">Todos os negócios</option>' + businessOptions;
    if ($("invoiceBusiness")) $("invoiceBusiness").innerHTML = businesses.filter((business) => business.status !== "Arquivado").map((business) => `<option value="${business.id}">${escapeHtml(business.name)}</option>`).join("");
    if ($("productBusinessFilter")) $("productBusinessFilter").innerHTML = businesses.filter((business) => business.barbershop_id).map((business) => `<option value="${business.id}">${escapeHtml(business.name)}</option>`).join("");
}

function isoDateWithOffset(days) { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); }
function updateInvoicePreview() {
    const subtotal = Number($('invoiceQuantity').value || 0) * Number($('invoiceUnitAmount').value || 0);
    const total = Math.max(0, subtotal - Number($('invoiceDiscount').value || 0) - Number($('invoiceCredit').value || 0));
    $('invoicePreviewTotal').textContent = moneyPrecise.format(total);
}
function syncInvoiceBusiness() {
    const business = businesses.find((item) => item.id === $('invoiceBusiness').value);
    if (!business) return;
    if ($('invoiceItemType').value === 'subscription') {
        $('invoiceDescription').value = `Mensalidade ${business.plan}`;
        $('invoiceUnitAmount').value = Number(business.monthly_fee).toFixed(2);
    }
    updateInvoicePreview();
}
function openInvoiceForm(businessId = '') {
    $('invoiceForm').reset(); $('invoiceFormMessage').textContent = ''; $('invoiceDueDate').value = isoDateWithOffset(7); $('invoiceQuantity').value = '1'; $('invoiceDiscount').value = '0'; $('invoiceCredit').value = '0';
    if (businessId) $('invoiceBusiness').value = businessId;
    syncInvoiceBusiness(); $('invoiceModal').classList.remove('hidden');
}
async function saveInvoice(event) {
    event.preventDefault();
    const quantity = Number($('invoiceQuantity').value), unitAmount = Number($('invoiceUnitAmount').value), discount = Number($('invoiceDiscount').value || 0), credit = Number($('invoiceCredit').value || 0);
    if (discount + credit > quantity * unitAmount) { $('invoiceFormMessage').textContent = 'Desconto e crédito não podem superar o subtotal.'; $('invoiceFormMessage').className = 'form-message error'; return; }
    $('saveInvoiceButton').disabled = true; $('invoiceFormMessage').textContent = 'Gerando fatura...';
    const { error } = await supabaseClient.rpc('platform_create_invoice', { target_saas_client_id: $('invoiceBusiness').value, invoice_due_date: $('invoiceDueDate').value, invoice_items: [{ item_type: $('invoiceItemType').value, description: $('invoiceDescription').value.trim(), quantity, unit_amount: unitAmount }], invoice_discount: discount, invoice_credit: credit, invoice_notes: $('invoiceNotes').value.trim() });
    $('saveInvoiceButton').disabled = false;
    if (error) { $('invoiceFormMessage').textContent = error.message || 'Não foi possível gerar a fatura.'; $('invoiceFormMessage').className = 'form-message error'; return; }
    await loadData(); refreshViews(); closeModals(); document.querySelector('#billing').scrollIntoView({ behavior: 'smooth' });
}
function openPaymentForm(invoice) {
    const balance = Number(invoice.total) - Number(invoice.paid_total);
    $('paymentForm').reset(); $('paymentFormMessage').textContent = ''; $('paymentInvoiceId').value = invoice.id; $('paymentAmount').value = balance.toFixed(2); $('paymentFee').value = '0';
    $('paymentInvoiceMeta').textContent = `${invoice.invoice_number} • saldo ${moneyPrecise.format(balance)}`; $('paymentModal').classList.remove('hidden');
}
async function savePayment(event) {
    event.preventDefault(); $('savePaymentButton').disabled = true; $('paymentFormMessage').textContent = 'Registrando recebimento...';
    const { error } = await supabaseClient.rpc('platform_record_payment', { target_invoice_id: $('paymentInvoiceId').value, payment_method: $('paymentMethod').value, payment_amount: Number($('paymentAmount').value), payment_fee: Number($('paymentFee').value || 0), payment_provider: 'manual', external_id: $('paymentExternalId').value.trim() || null });
    $('savePaymentButton').disabled = false;
    if (error) { $('paymentFormMessage').textContent = error.message || 'Não foi possível registrar o pagamento.'; $('paymentFormMessage').className = 'form-message error'; return; }
    await loadData(); refreshViews(); closeModals();
}
function openRefundForm(payment) {
    const returned = refunds.filter((item) => item.payment_id === payment.id && ["approved", "processed"].includes(item.status)).reduce((sum, item) => sum + Number(item.amount), 0), available = Number(payment.gross_amount) - returned;
    $('refundForm').reset(); $('refundFormMessage').textContent = ''; $('refundPaymentId').value = payment.id; $('refundAmount').value = available.toFixed(2); $('refundAmount').max = available.toFixed(2); $('refundPaymentMeta').textContent = `Disponível para devolução: ${moneyPrecise.format(available)}`; $('refundModal').classList.remove('hidden');
}
async function saveRefund(event) {
    event.preventDefault(); $('saveRefundButton').disabled = true; $('refundFormMessage').textContent = 'Registrando devolução...';
    const { error } = await supabaseClient.rpc('platform_register_refund', { target_payment_id: $('refundPaymentId').value, refund_amount: Number($('refundAmount').value), refund_kind: $('refundType').value, refund_reason: $('refundReason').value.trim() });
    $('saveRefundButton').disabled = false;
    if (error) { $('refundFormMessage').textContent = error.message || 'Não foi possível registrar a devolução.'; $('refundFormMessage').className = 'form-message error'; return; }
    await loadData(); refreshViews(); closeModals();
}

function openBusinessForm(business = null) {
    $("businessForm").reset(); $("businessFormMessage").textContent = ""; $("businessId").value = business?.id || "";
    $("businessModalTitle").textContent = business ? "Editar negócio" : "Cadastrar novo negócio";
    $("businessEmail").required = !business;
    if (business) {
        $("businessName").value = business.name; $("businessSegment").value = business.segment; $("businessOwner").value = business.contact_name;
        $("businessEmail").value = business.owner_email || ""; $("businessPhone").value = business.phone || ""; $("businessPlan").value = business.plan;
        $("businessPrice").value = business.monthly_fee; $("businessOrigin").value = business.origin; $("businessNotes").value = business.notes || "";
    } else syncPlanPrice();
    $("businessModal").classList.remove("hidden");
}

function openBusinessDetail(business) {
    selectedBusinessId = business.id; $("detailBusinessName").textContent = business.name;
    $("detailBusinessMeta").textContent = `${business.segment} • ${business.plan} • ${business.status}`;
    $("detailStats").innerHTML = `<article><span>Usuários</span><strong>${business.user_count || 0}</strong></article><article><span>Clientes</span><strong>${business.client_count || 0}</strong></article><article><span>Agendamentos</span><strong>${business.appointment_count || 0}</strong></article><article><span>Faturamento</span><strong>${money.format(business.business_revenue || 0)}</strong></article>`;
    $("detailInformation").innerHTML = `<p><span>Responsável</span><strong>${escapeHtml(business.contact_name)}</strong></p><p><span>E-mail</span><strong>${escapeHtml(business.owner_email || "Não informado")}</strong></p><p><span>Telefone</span><strong>${escapeHtml(business.phone || "Não informado")}</strong></p><p><span>Convite</span><strong>${escapeHtml(business.invite_status || "Pendente")}</strong></p><p class="full-detail"><span>Observações</span><strong>${escapeHtml(business.notes || "Sem observações")}</strong></p>`;
    $("detailStatusButton").textContent = business.status === "Ativo" ? "Suspender" : "Reativar";
    $("businessDetailModal").classList.remove("hidden");
}

function closeModals() { document.querySelectorAll(".platform-modal").forEach((modal) => modal.classList.add("hidden")); }
function syncPlanPrice() { const option = $("businessPlan").selectedOptions[0]; if (option) $("businessPrice").value = option.dataset.price; }

async function saveBusiness(event) {
    event.preventDefault(); const id = $("businessId").value;
    const ownerEmail = $("businessEmail").value.trim().toLowerCase();
    if (!id && !ownerEmail) { $("businessFormMessage").textContent = "Informe o e-mail para convidar o responsável pelo novo negócio."; $("businessFormMessage").className = "form-message error"; return; }
    const payload = { name: $("businessName").value.trim(), segment: $("businessSegment").value, contact_name: $("businessOwner").value.trim(), owner_email: ownerEmail || null, phone: $("businessPhone").value.trim() || null, plan: $("businessPlan").value, monthly_fee: Number($("businessPrice").value), origin: $("businessOrigin").value, notes: $("businessNotes").value.trim() || null };
    if (!id) payload.invite_status = "Pendente";
    $("saveBusinessButton").disabled = true; $("businessFormMessage").textContent = "Salvando...";
    let error;
    if (id) {
        const current = businesses.find((item) => item.id === id);
        ({ error } = await supabaseClient.from("saas_clients").update(payload).eq("id", id));
        if (!error && current?.barbershop_id) ({ error } = await supabaseClient.from("barbershops").update({ name: payload.name }).eq("id", current.barbershop_id));
    } else {
        ({ error } = await supabaseClient.rpc("platform_create_business", { business_name: payload.name, business_segment: payload.segment, responsible_name: payload.contact_name, responsible_email: payload.owner_email, business_phone: payload.phone || "", plan_name: payload.plan, plan_price: payload.monthly_fee, business_origin: payload.origin, business_notes: payload.notes || "" }));
    }
    $("saveBusinessButton").disabled = false;
    if (error) { $("businessFormMessage").textContent = error.code === "23505" ? "Já existe um negócio com esse nome ou e-mail." : "Não foi possível salvar o negócio."; $("businessFormMessage").className = "form-message error"; return; }
    await loadData(); populateSelectors(); refreshViews(); closeModals();
}

async function toggleBusinessStatus(business) {
    const status = business.status === "Ativo" ? "Suspenso" : "Ativo";
    const { error } = await supabaseClient.from("saas_clients").update({ status }).eq("id", business.id);
    if (error) return alert("Não foi possível alterar o status.");
    await loadData(); refreshViews(); closeModals();
}

async function deleteBusiness(business) {
    if (!confirm(`Arquivar ${business.name}? Os acessos serão bloqueados e os dados ficarão preservados conforme a política de retenção.`)) return;
    let error;
    if (business.barbershop_id) {
        const result = await supabaseClient.functions.invoke("platform-users", { body: { action: "delete_business", barbershop_id: business.barbershop_id } });
        error = result.error || (result.data?.error ? new Error(result.data.error) : null);
    } else ({ error } = await supabaseClient.from("saas_clients").update({ status: "Arquivado", deleted_at: new Date().toISOString() }).eq("id", business.id));
    if (error) return alert("Não foi possível arquivar o negócio.");
    await loadData(); populateSelectors(); refreshViews();
}

function operateBusiness(business) {
    if (!business.barbershop_id) return alert("Este cadastro ainda não está vinculado a uma unidade operacional.");
    sessionStorage.setItem("ogritechMasterMode", "true");
    sessionStorage.setItem("ogritechMasterBusinessId", business.barbershop_id);
    sessionStorage.setItem("ogritechMasterBusinessName", business.name);
    sessionStorage.setItem("japaBarbershopId", business.barbershop_id);
    sessionStorage.setItem("japaRole", "owner");
    sessionStorage.setItem("japaUserRole", "Master Ogritech");
    window.location.assign(environmentUrl("painel/"));
}

function updateEmployeeFields() { document.querySelectorAll(".employee-field").forEach((field) => field.classList.toggle("hidden", $("userRole").value !== "employee")); }
function generateTemporaryPassword() { const bytes = crypto.getRandomValues(new Uint8Array(12)); return `Og!${Array.from(bytes, (value) => value.toString(36).padStart(2, "0")).join("")}aA7`; }
function openUserForm(businessId = "", user = null) { if (!$("userForm")) return alert("Atualize a página para carregar o módulo de usuários."); $("userForm").reset(); $("userFormMessage").textContent = ""; $("userId").value = user?.id || ""; $("userModalTitle").textContent = user ? "Editar usuário" : "Adicionar usuário"; $("saveUserButton").textContent = user ? "Salvar alterações" : "Enviar convite"; if (businessId) $("userBusiness").value = businessId; if (user) { $("userBusiness").value = user.barbershop_id; $("userRole").value = user.role; $("userName").value = user.full_name; $("userEmail").value = user.email; } updateEmployeeFields(); $("userModal").classList.remove("hidden"); }
async function saveUser(event) {
    event.preventDefault(); $("saveUserButton").disabled = true; $("userFormMessage").textContent = $("userId").value ? "Salvando alterações..." : "Enviando convite...";
    const { data, error } = await supabaseClient.functions.invoke("platform-users", { body: { action: $("userId").value ? "update" : "invite", user_id: $("userId").value || undefined, barbershop_id: $("userBusiness").value, role: $("userRole").value, full_name: $("userName").value.trim(), email: $("userEmail").value.trim().toLowerCase(), specialty: $("userSpecialty").value.trim(), commission: Number($("userCommission").value || 0) } });
    $("saveUserButton").disabled = false;
    if (error || data?.error) { $("userFormMessage").textContent = data?.error || "Não foi possível enviar o convite."; $("userFormMessage").className = "form-message error"; return; }
    await loadData(); populateSelectors(); refreshViews(); closeModals();
}

function bindEvents() {
    $("businessSearch").addEventListener("input", renderBusinesses); $("segmentFilter").addEventListener("change", renderBusinesses);
    $("newBusinessButton").addEventListener("click", () => openBusinessForm()); $("businessPlan").addEventListener("change", syncPlanPrice); $("businessForm").addEventListener("submit", saveBusiness);
    $("plansGrid").addEventListener("click", (event) => { const button = event.target.closest("[data-edit-plan]"); if (button) openPlanForm(plans.find((plan) => plan.id === button.dataset.editPlan)); });
    $("planForm").addEventListener("submit", savePlan);
    document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
    document.querySelectorAll(".platform-modal").forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) closeModals(); }));
    $("businessTableBody").addEventListener("click", (event) => { const button = event.target.closest("[data-action]"); if (!button) return; const business = businesses.find((item) => item.id === button.dataset.id); if (!business) return; if (button.dataset.action === "detail") openBusinessDetail(business); if (button.dataset.action === "operate") operateBusiness(business); if (button.dataset.action === "edit") openBusinessForm(business); if (button.dataset.action === "delete") deleteBusiness(business); });
    $("detailEditButton").addEventListener("click", () => { const business = businesses.find((item) => item.id === selectedBusinessId); closeModals(); openBusinessForm(business); });
    $("detailStatusButton").addEventListener("click", () => {
        const business = businesses.find((item) => item.id === selectedBusinessId);
        if (business) toggleBusinessStatus(business);
    });
    $("detailOperateButton")?.addEventListener("click", () => { const business = businesses.find((item) => item.id === selectedBusinessId); if (business) operateBusiness(business); });
    $("detailAddUserButton")?.addEventListener("click", () => { const business = businesses.find((item) => item.id === selectedBusinessId); closeModals(); openUserForm(business?.barbershop_id); });
    $("detailBillingButton")?.addEventListener("click", () => { closeModals(); openInvoiceForm(selectedBusinessId); });
    $("newInvoiceButton")?.addEventListener("click", () => openInvoiceForm());
    $("billingStatusFilter")?.addEventListener("change", renderBilling);
    $("productBusinessFilter")?.addEventListener("change", renderProductAccess);
    $("productAccessTableBody")?.addEventListener("click", (event) => { const button=event.target.closest('[data-product-action]'); if (button) changeProductSubscription(button); });
    $("invoiceBusiness")?.addEventListener("change", syncInvoiceBusiness);
    $("invoiceItemType")?.addEventListener("change", () => { if ($('invoiceItemType').value === 'subscription') syncInvoiceBusiness(); else { $('invoiceDescription').value = ''; $('invoiceUnitAmount').value = ''; updateInvoicePreview(); } });
    ["invoiceQuantity", "invoiceUnitAmount", "invoiceDiscount", "invoiceCredit"].forEach((id) => $(id)?.addEventListener("input", updateInvoicePreview));
    $("invoiceForm")?.addEventListener("submit", saveInvoice); $("paymentForm")?.addEventListener("submit", savePayment); $("refundForm")?.addEventListener("submit", saveRefund);
    $("billingTableBody")?.addEventListener("click", (event) => { const button = event.target.closest("[data-billing-action]"); if (!button) return; if (button.dataset.billingAction === "pay") { const invoice = invoices.find((item) => item.id === button.dataset.id); if (invoice) openPaymentForm(invoice); } else { const payment = payments.find((item) => item.id === button.dataset.id); if (payment) openRefundForm(payment); } });
    $("newUserButton")?.addEventListener("click", () => openUserForm()); $("userRole")?.addEventListener("change", updateEmployeeFields); $("userForm")?.addEventListener("submit", saveUser); $("userBusinessFilter")?.addEventListener("change", renderUsers);
    $("usersTableBody")?.addEventListener("click", async (event) => { const button = event.target.closest("[data-user-action]"); if (!button) return; const user = users.find((item) => item.id === button.dataset.id); if (!user) return; if (button.dataset.userAction === "edit") return openUserForm(user.barbershop_id, user); if (button.dataset.userAction === "reset-password") { if (!confirm(`Gerar uma nova senha temporária para ${user.full_name}? A senha atual deixará de funcionar.`)) return; const temporaryPassword = generateTemporaryPassword(); button.disabled = true; const result = await supabaseClient.functions.invoke("platform-users", { body: { action: "reset_password", user_id: user.id, temporary_password: temporaryPassword } }); button.disabled = false; if (result.error || result.data?.error) return alert(result.data?.error || "Não foi possível redefinir a senha."); prompt("Senha temporária gerada. Copie agora; ela não será exibida novamente:", temporaryPassword); return; } if (button.dataset.userAction === "toggle") { const result = await supabaseClient.functions.invoke("platform-users", { body: { action: "set_active", user_id: user.id, active: !user.active } }); if (result.error || result.data?.error) return alert("Não foi possível alterar o usuário."); } else if (button.dataset.userAction === "delete") { if (!confirm(`Arquivar o acesso de ${user.full_name}? O histórico será preservado.`)) return; const result = await supabaseClient.functions.invoke("platform-users", { body: { action: "delete", user_id: user.id } }); if (result.error || result.data?.error) return alert("Não foi possível arquivar o usuário."); } await loadData(); refreshViews(); });
    $("platformLogout").addEventListener("click", async () => { const loginUrl = environmentUrl("login/"); await supabaseClient.auth.signOut(); sessionStorage.clear(); window.location.replace(loginUrl); });
}

async function initializeDashboard() {
    try { if (!await validatePlatformAdmin()) return; await loadData(); populateSelectors(); refreshViews(); bindEvents(); $("adminLoading").classList.add("hidden"); }
    catch (error) { $("adminLoading").textContent = `Não foi possível carregar a administração da Ogritech. ${error?.message || "Tente atualizar a página."}`; console.error("Erro no painel Ogritech:", error); }
}
initializeDashboard();
