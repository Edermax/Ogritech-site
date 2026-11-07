(async () => {
    const status = document.getElementById("whatsappStatus");
    const id = new URLSearchParams(location.search).get("unidade");
    try {
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id || "")) {
            status.textContent = "Confira o link recebido.";
            return;
        }
        const { data, error } = await supabaseClient.rpc("resolve_business_whatsapp", { target_share_id: id });
        if (error) throw error;
        if (!/^https:\/\/wa\.me\/55[1-9][0-9]{9,10}\?text=/.test(data || "")) {
            status.textContent = "O WhatsApp desta unidade está indisponível.";
            return;
        }
        const link = document.getElementById("whatsappContinue");
        link.href = data;
        link.hidden = false;
        location.replace(data);
    } catch {
        status.textContent = "Não foi possível abrir o WhatsApp. Tente novamente.";
    }
})();
