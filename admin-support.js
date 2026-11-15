/* Callback data is protected by platform-administrator RLS. Loading never contacts a customer. */
(() => {
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true; $("refreshHumanSupport").disabled = true;
    $("humanSupportMessage").textContent = "Carregando solicitações...";
    try {
      const { data, error } = await supabaseClient.from("platform_callback_requests")
        .select("id,phone,email,contact_channel,status,created_at,barbershops(name)")
        .in("status", ["new", "queued", "failed"]).order("created_at", { ascending: false }).limit(100);
      if (error || !Array.isArray(data)) throw new Error("Não foi possível carregar os atendimentos. Tente atualizar a lista.");
      $("humanSupportList").innerHTML = data.map(request => {
        const phone = String(request.phone || "").replace(/\D/g, "");
        const destination = request.contact_channel === "E-mail" ? String(request.email || "") : phone;
        const href = request.contact_channel === "E-mail" ? `mailto:${encodeURIComponent(destination)}`
          : request.contact_channel === "WhatsApp" ? `https://wa.me/${phone.startsWith("55") && phone.length > 11 ? phone : "55" + phone}`
          : `tel:+${phone.startsWith("55") && phone.length > 11 ? phone : "55" + phone}`;
        return `<article class="trial-review-card"><h3>${escape(request.barbershops?.name || "Visitante / lead")}</h3><p>${escape(new Date(request.created_at).toLocaleString("pt-BR"))} · ${escape(request.contact_channel)}</p><p>${escape(destination)}</p><div class="admin-row-actions"><a class="outline-cyan-button" href="${escape(href)}"${request.contact_channel === "WhatsApp" ? ' target="_blank" rel="noopener noreferrer"' : ""}>Abrir contato autorizado</a><button type="button" data-support-complete="${escape(request.id)}">Marcar como atendido</button></div></article>`;
      }).join("");
      $("humanSupportMessage").textContent = data.length ? `${data.length} solicitação(ões) aguardando retorno. Mostrando até 100 registros recentes.` : "Nenhuma solicitação aguardando retorno.";
    } catch (error) { $("humanSupportMessage").textContent = error.message; }
    finally { loading = false; $("refreshHumanSupport").disabled = false; }
  }
  $("refreshHumanSupport").addEventListener("click", load);
  $("humanSupportList").addEventListener("click", async event => {
    const button = event.target.closest("[data-support-complete]");
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      const { error } = await supabaseClient.from("platform_callback_requests").update({ status: "contacted", updated_at: new Date().toISOString() }).eq("id", button.dataset.supportComplete);
      if (error) throw error;
      await load();
    } catch { $("humanSupportMessage").textContent = "Não foi possível registrar o atendimento. Tente novamente."; button.disabled = false; }
  });
  window.loadOgritechHumanSupport = load;
})();
