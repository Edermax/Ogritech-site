/* Merchant payment receipts and explicit, audited decision reviews. */
(() => {
  const $ = id => document.getElementById(id);
  let current = null, busy = false, receiptId = null, returnFocus = null;
  const paymentDialog = $("menuPaymentDialog"), reviewDialog = $("menuDecisionDialog");
  if (!paymentDialog || !reviewDialog) return;
  const code = order => order.order_number ? `#${order.order_number}` : `#${order.public_reference}`;
  function setBusy(value) {
    busy = value;
    [paymentDialog,reviewDialog].forEach(dialog => dialog.querySelectorAll("button,input,select,textarea").forEach(element => { element.disabled = value; }));
  }
  async function invoke(body) {
    const result = await supabaseClient.functions.invoke("menu-order-receipts", { body });
    let payload = result.data;
    if (result.error?.context instanceof Response) payload = await result.error.context.json().catch(() => null);
    if (result.error || payload?.error) throw new Error(payload?.error?.message || "Não foi possível confirmar a operação. Atualize os pedidos antes de tentar novamente.");
    return payload.data;
  }
  function body(action) { return { action, barbershop_id: current.businessId, order_id: current.order.id }; }
  function announce(text, error = false) {
    for (const id of ["menuOperationMessage","menuWorkspaceMessage"]) {
      const message = $(id); if (message) { message.textContent = text; message.classList.toggle("error",error); }
    }
  }
  async function discard() {
    if (!receiptId || !current) return;
    const id = receiptId; receiptId = null;
    try { await invoke({ ...body("cancel_upload"), receipt_id: id }); } catch { /* The scheduled worker removes unlinked, expired uploads. */ }
  }
  function openPayment(order, businessId, onSaved) {
    if (busy) return;
    current = { order,businessId,onSaved }; receiptId = null; returnFocus = document.activeElement;
    $("menuPaymentForm").reset(); $("menuPaymentMessage").textContent = "";
    $("menuPaymentOrder").textContent = `${code(order)} · ${order.customer_name} · ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(order.total_amount)}`;
    paymentDialog.showModal(); $("menuPaymentSave").focus();
  }
  function openReview(order, businessId, onSaved) {
    if (busy) return;
    current = { order,businessId,onSaved }; returnFocus = document.activeElement;
    $("menuDecisionForm").reset(); $("menuDecisionMessage").textContent = "";
    $("menuDecisionOrder").textContent = `${code(order)} · ${order.customer_name}`;
    $("menuDecisionValue").value = order.status === "confirmed" ? "rejected" : "confirmed";
    $("menuDecisionPaidHint").hidden = order.payment_status !== "paid";
    reviewDialog.showModal(); $("menuDecisionValue").focus();
  }
  for (const dialog of [paymentDialog,reviewDialog]) {
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
    dialog.addEventListener("close", () => { if (dialog === paymentDialog) void discard(); returnFocus?.focus(); });
  }
  $("menuPaymentCancel").addEventListener("click", () => { if (!busy) paymentDialog.close(); });
  $("menuDecisionCancel").addEventListener("click", () => { if (!busy) reviewDialog.close(); });
  $("menuPaymentForm").addEventListener("submit", async event => {
    event.preventDefault(); if (busy || !current || !event.currentTarget.reportValidity()) return;
    const file = $("menuPaymentReceipt").files[0], message = $("menuPaymentMessage");
    if (file && (!file.size || file.size > 5242880 || !["image/jpeg","image/png","application/pdf"].includes(file.type))) {
      message.textContent = "Escolha um JPG, PNG ou PDF de até 5 MB."; return;
    }
    setBusy(true); message.textContent = file ? "Enviando comprovante..." : "Registrando pagamento...";
    try {
      if (file && !receiptId) {
        const signed = await invoke({ ...body("upload_url"), file_name:file.name, content_type:file.type, file_size:file.size });
        receiptId = signed.receipt_id;
        const upload = await supabaseClient.storage.from("menu-payment-receipts").uploadToSignedUrl(signed.path,signed.token,file,{contentType:file.type,upsert:false});
        if (upload.error) { await discard(); throw new Error("Não foi possível enviar o comprovante. Confira a conexão e tente novamente."); }
      }
      message.textContent = "Confirmando recebimento...";
      await invoke({ ...body("confirm_payment"), expected_updated_at:current.order.updated_at, ...(receiptId ? {receipt_id:receiptId} : {}) });
      receiptId = null; paymentDialog.close(); announce("Pagamento marcado como recebido.");
      await current.onSaved?.();
    } catch (error) { message.textContent = error.message; }
    finally { setBusy(false); }
  });
  $("menuPaymentReceipt").addEventListener("change", () => { void discard(); });
  $("menuDecisionForm").addEventListener("submit", async event => {
    event.preventDefault(); if (busy || !current || !event.currentTarget.reportValidity()) return;
    setBusy(true); $("menuDecisionMessage").textContent = "Salvando nova decisão...";
    try {
      const result = await supabaseClient.rpc("review_menu_order_decision", { target_barbershop_id:current.businessId,
        target_order_id:current.order.id, decision:$("menuDecisionValue").value, expected_updated_at:current.order.updated_at,reason:$("menuDecisionReason").value.trim() });
      if (result.error) throw new Error(result.error.code === "40001" ? "O pedido mudou em outra tela. Atualize os pedidos antes de rever a decisão." : "Não foi possível rever a decisão. Atualize os pedidos e tente novamente.");
      reviewDialog.close(); announce("Decisão do pedido atualizada. O cliente verá a nova situação no acompanhamento.");
      await current.onSaved?.();
    } catch (error) { $("menuDecisionMessage").textContent = error.message; }
    finally { setBusy(false); }
  });
  async function viewReceipt(order, businessId) {
    const popup = window.open("about:blank","_blank");
    if (popup) { popup.opener = null; popup.document.title = "Comprovante"; popup.document.body.textContent = "Carregando comprovante..."; }
    try {
      const result = await invoke({ action:"download",barbershop_id:businessId,order_id:order.id });
      const url = new URL(result.url), backend = new URL(window.OGRITECH_SUPABASE_URL);
      if (url.origin !== backend.origin || !url.pathname.startsWith("/storage/v1/object/sign/menu-payment-receipts/")) throw new Error("Endereço do comprovante inválido.");
      if (popup) popup.location.replace(url.href);
      else {
        const message = $("menuOperationMessage"); message.textContent = "";
        const link = document.createElement("a"); link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.textContent = "Abrir comprovante (link válido por 5 minutos)"; message.append(link);
      }
    } catch (error) { popup?.close(); announce(error.message,true); }
  }
  window.OgritechOrderActions = { openPayment,openReview,viewReceipt };
})();
