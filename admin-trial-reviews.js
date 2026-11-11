(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const states = { pending: "Aguardando revisão", approved: "Liberado por 48 horas", rejected: "Não liberado", consumed: "Teste iniciado" };
  const reasons = { phone_used: "Telefone já utilizado", email_used: "E-mail já utilizado", responsible_used: "Responsável já utilizou teste", business_used: "Nome de estabelecimento já utilizado" };
  let loading = false, reviews = [], returnFocus;
  async function load() {
    if (loading) return; loading = true; $("refreshTrialReviews").disabled = true;
    $("trialReviewsMessage").textContent = "Carregando solicitações...";
    try {
      const { data, error } = await supabaseClient.rpc("platform_menu_trial_reviews");
      if (error || !Array.isArray(data)) throw new Error("Não foi possível carregar as revisões. Tente atualizar a lista.");
      reviews = data;
      $("trialReviewsList").innerHTML = data.map(review => `<article class="trial-review-card"><h3>${escape(review.business_name)}</h3><p>${escape(review.contact_email)}</p><p>Documento final ${escape(review.document_last_four)} · Telefone final ${escape(review.phone_last_four)}</p><p>${(review.reasons || []).map(reason => escape(reasons[reason] || "Dados já utilizados")).join(" · ")}</p><p><strong>${escape(states[review.status] || review.status)}</strong></p>${review.approved_until && review.status === "approved" ? `<p>Válido até ${escape(new Date(review.approved_until).toLocaleString("pt-BR"))}</p>` : ""}${review.decision_note ? `<p>Registro: ${escape(review.decision_note)}</p>` : ""}${review.status !== "consumed" ? `<button type="button" data-review-id="${escape(review.id)}">Revisar solicitação</button>` : ""}</article>`).join("");
      $("trialReviewsMessage").textContent = data.length ? `${data.length} solicitação(ões). Confira os dados antes de liberar uma exceção.` : "Nenhuma solicitação aguardando revisão.";
    } catch (error) { $("trialReviewsMessage").textContent = error.message; }
    finally { loading = false; $("refreshTrialReviews").disabled = false; }
  }
  $("refreshTrialReviews").addEventListener("click", load);
  $("trialReviewsList").addEventListener("click", event => {
    const button = event.target.closest("[data-review-id]"); if (!button) return;
    const review = reviews.find(item => item.id === button.dataset.reviewId); if (!review) return;
    returnFocus = button; $("trialReviewForm").reset(); $("trialReviewId").value = review.id;
    $("trialReviewBusiness").textContent = review.business_name; $("trialDecisionMessage").textContent = "";
    $("trialReviewDialog").showModal(); $("trialReviewDecision").focus();
  });
  $("closeTrialReview").addEventListener("click", () => $("trialReviewDialog").close());
  $("trialReviewDialog").addEventListener("close", () => returnFocus?.focus());
  $("trialReviewForm").addEventListener("submit", async event => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    $("saveTrialReview").disabled = true; $("trialDecisionMessage").textContent = "Salvando decisão...";
    try {
      const { error } = await supabaseClient.rpc("platform_decide_menu_trial_review", { target_review_id: $("trialReviewId").value,
        decision: $("trialReviewDecision").value, reason: $("trialReviewReason").value.trim() });
      if (error) throw new Error("Não foi possível salvar a decisão. Atualize a lista e tente novamente.");
      $("trialReviewDialog").close(); await load();
    } catch (error) { $("trialDecisionMessage").textContent = error.message; }
    finally { $("saveTrialReview").disabled = false; }
  });
  window.loadOgritechTrialReviews = load;
})();
