window.renderMenuShare = (container, menuUrl) => {
    container.replaceChildren();
    if (!menuUrl) return;

    const url = new URL(menuUrl);
    const link = document.createElement("a");
    link.href = url.href;
    link.textContent = "Abrir cardápio público";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copiar link";
    copy.addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(url.href);
            copy.textContent = "Link copiado";
        } catch {
            copy.textContent = "Copie pelo link do cardápio";
        }
    });
    container.append(link, " ", copy);
    if (typeof window.qrcode !== "function") {
        container.append(" O QR Code está indisponível. Atualize a página para tentar novamente.");
        return;
    }
    const qr = window.qrcode(0, "M");
    qr.addData(url.href);
    qr.make();
    const canvas = document.createElement("canvas");
    const count = qr.getModuleCount();
    const scale = 16;
    const margin = 4;
    canvas.width = canvas.height = (count + margin * 2) * scale;
    canvas.style.display = "block";
    canvas.style.width = "min(100%, 240px)";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "QR Code do cardápio da unidade");
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000";
    for (let row = 0; row < count; row++) {
        for (let column = 0; column < count; column++) {
            if (qr.isDark(row, column)) context.fillRect((column + margin) * scale, (row + margin) * scale, scale, scale);
        }
    }
    const download = document.createElement("a");
    download.href = canvas.toDataURL("image/png");
    download.download = "ogritech-cardapio.png";
    download.textContent = "Baixar QR Code em PNG";
    container.append(canvas, download);
};
