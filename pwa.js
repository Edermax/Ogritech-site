(() => {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("PWA indisponível:", error)));
  }

  let installButton = document.getElementById("panelInstallApp");
  let help = document.getElementById("panelInstallHelp");

  if (!installButton) {
    if (!document.body.classList.contains("login-page")) return;

    const styles = document.createElement("link");
    styles.rel = "stylesheet";
    styles.href = "pwa.css?v=20261109.2";
    document.head.appendChild(styles);

    installButton = document.createElement("button");
    installButton.type = "button";
    installButton.hidden = true;
    installButton.className = "pwa-install-button";
    installButton.setAttribute("aria-label", "Instalar Ogritech neste dispositivo");
    installButton.setAttribute("aria-haspopup", "dialog");
    installButton.innerHTML = '<img src="ogritech-app-192.png" alt="" width="52" height="52">';

    help = document.createElement("dialog");
    help.className = "panel-install-help";
    help.setAttribute("aria-labelledby", "loginInstallTitle");
    help.innerHTML = `
      <h2 id="loginInstallTitle">Instalar Ogritech</h2>
      <p>Se você já instalou o app, abra o ícone Ogritech na tela inicial ou na lista de aplicativos.</p>
      <p>Para instalar no celular, procure “Adicionar à tela inicial” no menu do navegador. No iPhone ou iPad, use o menu Compartilhar do Safari.</p>
      <p>No computador, procure “Instalar” no menu do Chrome ou Edge. No Safari do Mac, use Arquivo → Adicionar ao Dock.</p>
      <form method="dialog"><button class="table-button edit panel-install-button" type="submit">Fechar</button></form>
    `;
    document.body.append(installButton, help);
  }

  const standalone = window.matchMedia("(display-mode: standalone)");
  let installEvent;
  let installed = false;
  const updateButton = () => {
    installButton.hidden = installed || standalone.matches || navigator.standalone === true;
  };
  updateButton();
  standalone.addEventListener("change", updateButton);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event;
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    installEvent = null;
    help.close();
    updateButton();
  });
  installButton.addEventListener("click", async () => {
    if (!installEvent) {
      help.showModal();
      return;
    }
    const prompt = installEvent;
    installEvent = null;
    installButton.disabled = true;
    try {
      const { outcome } = await prompt.prompt();
      if (outcome === "accepted") {
        installed = true;
        updateButton();
      }
    } catch {
      if (!installed) help.showModal();
    } finally {
      installButton.disabled = false;
    }
  });
})();
