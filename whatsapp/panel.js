(async () => {
    const panel = document.getElementById("whatsappSharePanel");
    if (IS_DEMO || !BARBERSHOP_ID || !["owner", "admin"].includes(currentRole)) return;
    const form = panel.querySelector("form");
    const phone = form.elements.whatsapp;
    const status = panel.querySelector("[role=status]");
    const preview = panel.querySelector("[data-share-preview]");
    const button = form.querySelector("button");
    panel.hidden = false;

    async function load() {
        const { data, error } = await supabaseClient.from("business_whatsapp_shares")
            .select("phone,share_id").eq("barbershop_id", BARBERSHOP_ID).maybeSingle();
        if (error) throw error;
        phone.value = data?.phone?.slice(2) || "";
        window.renderWhatsAppShare(preview, data?.phone ? data.share_id : null);
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const digits = phone.value.replace(/\D/g, "");
        if (phone.value.trim() && !/^[1-9][0-9]{9,10}$/.test(digits)) {
            status.textContent = "Informe o número brasileiro com DDD, sem o código +55.";
            return;
        }
        button.disabled = true;
        try {
            const { data, error } = await supabaseClient.rpc("save_business_whatsapp", {
                target_barbershop_id: BARBERSHOP_ID,
                target_phone: digits ? "55" + digits : null
            });
            if (error) throw error;
            window.renderWhatsAppShare(preview, digits ? data : null);
            status.textContent = digits ? "WhatsApp salvo. Seu link está disponível." : "Divulgação desativada.";
        } catch {
            status.textContent = "Não foi possível salvar. Tente novamente.";
        } finally {
            button.disabled = false;
        }
    });

    try {
        await load();
        button.disabled = false;
    } catch {
        status.textContent = "Não foi possível carregar a divulgação. Atualize a página para tentar novamente.";
    }
})();
