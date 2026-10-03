type BillingSignup = {
  business_name: string;
  responsible_name: string;
  cycle: string;
  total_cents: number;
  trial_ends_at: string;
  access_until: string | null;
  product_code: string;
};

type BillingPayload = Record<string, unknown>;

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

export function renderBillingEmail(eventType: string, payload: BillingPayload, signup: BillingSignup) {
  const productName = signup.product_code === "menu" ? "Ogritech Cardápio" : "Ogritech Agenda";
  const greeting = `<p>Olá, ${escapeHtml(signup.responsible_name)}.</p>`;
  const manageToken = String(payload?.management_token || "");
  const manageUrl = manageToken
    ? `https://ogritech.com.br/contratar/#manage=${encodeURIComponent(manageToken)}`
    : "https://ogritech.com.br/contratar/";

  let subject: string;
  let html: string;

  if (eventType.startsWith("payment_approved")) {
    subject = `Pagamento confirmado — ${productName}`;
    html = `${greeting}<p>Confirmamos o pagamento de <strong>${money(signup.total_cents)}</strong> para ${escapeHtml(signup.business_name)}.</p><p>Seu acesso está ativo até ${dateTime(signup.access_until || signup.trial_ends_at)}.</p>`;
  } else if (eventType.startsWith("payment_rejected")) {
    subject = `Não foi possível confirmar seu pagamento — ${productName}`;
    html = `${greeting}<p>Não conseguimos confirmar o pagamento de <strong>${money(signup.total_cents)}</strong> para ${escapeHtml(signup.business_name)}.</p><p>Revise a forma de pagamento para evitar a suspensão do acesso.</p><p><a href="${manageUrl}">Revisar pagamento</a></p>`;
  } else if (eventType.startsWith("pix_requested")) {
    subject = `Seu Pix de renovação — ${productName}`;
    html = `${greeting}<p>Seu período está perto do fim. Pague <strong>${money(signup.total_cents)}</strong> pelo Pix abaixo para renovar.</p><p style="word-break:break-all">${escapeHtml(payload?.qr_code)}</p>`;
  } else if (eventType.startsWith("cancellation")) {
    subject = `Cancelamento confirmado — ${productName}`;
    html = `${greeting}<p>A renovação foi cancelada. Seu acesso permanece disponível até ${dateTime(signup.access_until || signup.trial_ends_at)}.</p>`;
  } else if (eventType === "access_suspended") {
    subject = `Acesso suspenso — ${productName}`;
    html = `${greeting}<p>O período contratado terminou sem confirmação de pagamento. O acesso foi suspenso e será liberado automaticamente após a aprovação.</p><p><a href="${manageUrl}">Regularizar pagamento</a></p>`;
  } else {
    subject = `Seu teste gratuito do ${productName} começou`;
    html = `${greeting}<p>Seu teste gratuito do <strong>${productName}</strong> para ${escapeHtml(signup.business_name)} começou.</p><p>O teste termina em ${dateTime(signup.trial_ends_at)}. O valor do período escolhido será ${money(signup.total_cents)}.</p><p><a href="${manageUrl}">Gerenciar contratação</a></p>`;
  }

  return {
    subject,
    html: `${html}<p><a href="https://ogritech.com.br/termos.html">Termos aceitos</a> · <a href="https://ogritech.com.br/login/">Acessar Ogritech</a></p>`,
  };
}
