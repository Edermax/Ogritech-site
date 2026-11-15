/* Administrative bookkeeping only. A generated Pix is not a payment confirmation. */
(() => {
  const $ = id => document.getElementById(id);
  const money = cents => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const date = value => new Date(value).toLocaleDateString("pt-BR");
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let finance, selectedId, requestId, prepared, onChanged, epoch = 0, busy = false;
  const message = text => { $("subscriptionAdjustmentMessage").textContent = text; };
  const selectedPayment = () => (finance?.payments || []).find(payment => `${payment.source}:${payment.id}` === $("subscriptionRefundPayment").value);
  function updateAmount() {
    const payment = selectedPayment();
    $("subscriptionRefundAmount").value = payment ? (Math.min(payment.available_cents, finance.monthly_cents || payment.available_cents) / 100).toFixed(2) : "";
    $("subscriptionRefundAmount").max = payment ? (payment.available_cents / 100).toFixed(2) : "0";
    requestId = crypto.randomUUID();
  }
  function showPrepared(transfer) {
    if (transfer.status !== "prepared" || transfer.payment_valid === false) {
      prepared = null; $("subscriptionRefundForm").hidden = true; $("subscriptionRefundPrepared").hidden = true;
      message("Esta preparação não está disponível: foi concluída, cancelada ou o pagamento original foi estornado. Confira a conciliação antes de pagar."); return;
    }
    prepared = transfer;
    $("subscriptionRefundForm").hidden = true; $("subscriptionWaiverForm").hidden = true;
    $("subscriptionRefundPrepared").hidden = false;
    $("subscriptionRefundFinishForm").reset();
    $("subscriptionRefundPreparedSummary").textContent = `Devolução pendente de ${money(transfer.amount_cents)} para ${transfer.receiver_name}. Gerar ou copiar o código não confirma o pagamento.`;
    $("subscriptionRefundCode").value = OgritechPixCode.build(transfer);
    message("Confira os dados no seu banco e registre a devolução somente após realizar o Pix.");
  }
  function renderHistory() {
    const transfers = finance?.transfers || [], waivers = finance?.waivers || [];
    $("subscriptionAdjustmentHistory").innerHTML = `<h3>Histórico desta assinatura</h3>${transfers.map(transfer => `<article><strong>${money(transfer.amount_cents)} · ${escape({prepared:"Devolução pendente",completed:"Devolução realizada",cancelled:"Preparação cancelada"}[transfer.status] || transfer.status)}</strong><p>${escape(date(transfer.created_at))} · ${escape(transfer.receiver_name)}</p>${transfer.status === "prepared" ? `<button type="button" class="outline-cyan-button" data-resume-refund="${escape(transfer.id)}">Continuar devolução</button>` : ""}</article>`).join("")}${waivers.map(waiver => `<article><strong>Abono · ${escape(waiver.competence.slice(0,7))} · ${money(waiver.amount_cents)}</strong>${waiver.note ? `<p>${escape(waiver.note)}</p>` : ""}</article>`).join("")}${!transfers.length && !waivers.length ? "<p>Nenhum ajuste registrado.</p>" : ""}`;
  }
  async function refresh() {
    const { data, error } = await supabaseClient.rpc("platform_subscription_finance", { target_subscription_id: selectedId });
    if (error || !data) throw new Error(error?.message || "Não foi possível carregar os dados da mensalidade.");
    finance = data; renderHistory(); return data;
  }
  async function open(id, action, business, receiver, changed) {
    if (busy) return;
    const current = ++epoch; selectedId = id; onChanged = changed; prepared = null; finance = null; requestId = crypto.randomUUID();
    $("subscriptionAdjustmentTitle").textContent = action === "waive" ? "Abonar mensalidade" : "Devolver mensalidade";
    $("subscriptionAdjustmentBusiness").textContent = business;
    for (const name of ["subscriptionWaiverForm", "subscriptionRefundForm", "subscriptionRefundPrepared"]) $(name).hidden = true;
    $("subscriptionAdjustmentHistory").replaceChildren();
    $("subscriptionRefundForm").reset(); $("subscriptionWaiverForm").reset();
    $("subscriptionRefundName").value = receiver;
    openAdminModal("subscriptionAdjustmentModal"); message("Carregando mensalidades e ajustes...");
    try {
      const { data, error } = await supabaseClient.rpc("platform_subscription_finance", { target_subscription_id: id });
      if (current !== epoch || $("subscriptionAdjustmentModal").classList.contains("hidden")) return;
      if (error || !data) throw new Error(error?.message || "Não foi possível carregar as mensalidades. Feche e tente novamente.");
      finance = data; renderHistory(); message("");
      if (action === "waive") {
        $("subscriptionWaiverForm").hidden = false; $("subscriptionWaiverMonth").value = data.next_competence;
        $("subscriptionWaiverSummary").textContent = `Abonar ${money(data.waiver_amount_cents ?? data.monthly_cents)} desta competência. A próxima cobrança ficará prevista para ${date(data.period_end)}. O preço das outras mensalidades será mantido.`;
        $("subscriptionWaiverSubmit").disabled = !data.waiver_allowed;
        if (!data.waiver_allowed) message(data.waiver_block_reason || "Esta assinatura não está disponível para abono. O cartão automático não é alterado.");
      } else {
        const available = data.payments.filter(payment => payment.available_cents > 0);
        $("subscriptionRefundPayment").innerHTML = available.map(payment => `<option value="${escape(payment.source+":"+payment.id)}">${escape(payment.label)} · ${payment.paid_at ? escape(date(payment.paid_at)) : "Data não informada"} · disponível ${money(payment.available_cents)}</option>`).join("");
        $("subscriptionRefundForm").hidden = !available.length;
        if (available.length) updateAmount(); else message("Não há mensalidade paga com saldo disponível para nova devolução. Consulte as devoluções pendentes abaixo.");
      }
    } catch (error) { if (current === epoch) message(error.message); }
  }
  async function mutate(button, operation) {
    if (busy) return; busy = true; button.disabled = true;
    try { await operation(); }
    catch (error) { message(error?.message || "Não foi possível concluir o registro. Seus dados foram mantidos."); }
    finally { busy = false; button.disabled = false; }
  }
  $("subscriptionRefundPayment").addEventListener("change", updateAmount);
  $("subscriptionRefundForm").addEventListener("submit", event => {
    event.preventDefault(); const payment = selectedPayment(); if (!payment) return;
    const numeric = Number($("subscriptionRefundAmount").value), cents = Math.round(numeric * 100);
    if (!Number.isFinite(numeric) || cents <= 0 || cents > payment.available_cents) return message("Confira o valor disponível desta mensalidade.");
    mutate($("subscriptionRefundPrepare"), async () => {
      const kind = $("subscriptionRefundKeyType").value;
      let key = $("subscriptionRefundKey").value.trim();
      if (["cpf", "cnpj"].includes(kind)) key = key.replace(/\D/g, "");
      if (kind === "phone") key = "+" + key.replace(/\D/g, "");
      const payload = { request_id: requestId, source: payment.source, payment_id: payment.id, amount_cents: cents, key_type: kind, key, receiver_name: $("subscriptionRefundName").value.trim(), receiver_city: $("subscriptionRefundCity").value.trim(), reason: $("subscriptionRefundReason").value.trim() };
      // Validate BR Code compatibility before reserving the refund in the database.
      OgritechPixCode.build({ ...payload, reference: requestId.replace(/-/g, "").slice(0,25) });
      message("Preparando devolução...");
      const { data, error } = await supabaseClient.rpc("platform_prepare_subscription_refund", { target_subscription_id: selectedId, payload });
      if (error || !data) throw new Error(error?.message || "Não foi possível preparar a devolução. Tente novamente com os mesmos dados.");
      showPrepared(data); await refresh(); await onChanged?.();
    });
  });
  $("subscriptionRefundCopy").addEventListener("click", async () => {
    if (!prepared || busy) return;
    const transferId = prepared.id, subscriptionId = selectedId, currentEpoch = epoch;
    $("subscriptionRefundCopy").disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc("platform_subscription_finance", { target_subscription_id: subscriptionId });
      if (currentEpoch !== epoch || prepared?.id !== transferId || $("subscriptionAdjustmentModal").classList.contains("hidden")) return;
      if (error || !data) throw new Error("Não foi possível conferir a devolução. Atualize os dados antes de copiar e pagar.");
      const current = data.transfers.find(item => item.id === transferId);
      if (!current || current.status !== "prepared" || current.payment_valid === false) {
        $("subscriptionRefundPrepared").hidden = true; prepared = null; message("Esta devolução não está mais disponível. Confira se o pagamento original foi estornado antes de fazer outro Pix."); return;
      }
      $("subscriptionRefundCode").value = OgritechPixCode.build(current);
      try { await navigator.clipboard.writeText($("subscriptionRefundCode").value); message("Código Pix copiado. O pagamento deve ser realizado no banco."); }
      catch { $("subscriptionRefundCode").focus(); $("subscriptionRefundCode").select(); message("Selecione e copie o código manualmente."); }
    } catch (error) { if (currentEpoch === epoch) message(error.message); }
    finally { $("subscriptionRefundCopy").disabled = false; }
  });
  $("subscriptionRefundFinishForm").addEventListener("submit", event => {
    event.preventDefault(); if (!prepared || !$("subscriptionRefundPaid").checked) return;
    mutate($("subscriptionRefundComplete"), async () => {
      const { error } = await supabaseClient.rpc("platform_finish_subscription_refund", { target_transfer_id: prepared.id, complete: true, supplied_bank_reference: $("subscriptionRefundBankReference").value.trim() });
      if (error) throw error;
      $("subscriptionRefundPrepared").hidden = true; message("Devolução registrada como realizada. O histórico financeiro foi atualizado.");
      await refresh(); await onChanged?.();
    });
  });
  $("subscriptionRefundCancel").addEventListener("click", () => {
    if (!prepared || !confirm("Cancelar o registro pendente? Um código Pix já copiado pode continuar válido no banco. Não o utilize após cancelar esta preparação.")) return;
    mutate($("subscriptionRefundCancel"), async () => {
      const { error } = await supabaseClient.rpc("platform_finish_subscription_refund", { target_transfer_id: prepared.id, complete: false });
      if (error) throw error;
      $("subscriptionRefundPrepared").hidden = true; message("Preparação cancelada. Nenhuma devolução foi registrada como paga."); await refresh(); await onChanged?.();
    });
  });
  $("subscriptionWaiverForm").addEventListener("submit", event => {
    event.preventDefault(); if (!finance?.waiver_allowed) return;
    mutate($("subscriptionWaiverSubmit"), async () => {
      const { error } = await supabaseClient.rpc("platform_waive_subscription_month", { target_subscription_id: selectedId, competence: $("subscriptionWaiverMonth").value, note: $("subscriptionWaiverNote").value.trim(), expected_amount_cents: finance.waiver_amount_cents ?? finance.monthly_cents });
      if (error) throw error;
      $("subscriptionWaiverForm").hidden = true; message("Mensalidade abonada. A competência, o prazo de acesso e a próxima cobrança foram atualizados."); await refresh(); await onChanged?.();
    });
  });
  $("subscriptionAdjustmentHistory").addEventListener("click", event => {
    const button = event.target.closest("[data-resume-refund]"); if (button && !busy) {
      const transfer = finance?.transfers.find(item => item.id === button.dataset.resumeRefund && item.status === "prepared");
      if (transfer) showPrepared(transfer);
    }
  });
  window.OgritechSubscriptionAdjustments = Object.freeze({ open });
})();
