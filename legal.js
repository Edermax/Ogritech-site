/* Retorno previsível sem depender do histórico do navegador. */
const legalBackLink = document.getElementById("legalBackLink");

if (legalBackLink) {
    const role = sessionStorage.getItem("japaRole");
    const destination = role === "client"
        ? "cliente.html"
        : ["owner", "admin", "employee"].includes(role)
            ? "/painel/"
            : "/login/";

    legalBackLink.href = destination;
    legalBackLink.textContent = role ? "← Voltar ao painel" : "← Voltar ao login";
}
