import { resolveMx, resolveTxt } from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";

const domain = "ogritech.com.br";
const routes = ["/", "/agenda-online/", "/contato/", "/login/", "/agendar/?empresa=ogritech-agenda-bot&env=staging", "/privacidade.html", "/termos.html", "/404.html"];

async function txt(name) {
  try { return (await resolveTxt(name)).map((parts) => parts.join("")); } catch { return []; }
}

async function inspectPage(path) {
  const startedAt = performance.now();
  const response = await fetch(new URL(path, `https://${domain}`), { redirect: "follow", headers: { "User-Agent": "Ogritech-Public-Audit/1.0" } });
  const body = await response.text();
  const title = body.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || null;
  const h1 = body.match(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
  return {
    path, status: response.status, ok: response.ok || (path === "/404.html" && response.status === 404),
    title, h1, langPtBr: /<html[^>]+lang="pt-BR"/i.test(body), viewport: /name="viewport"/i.test(body),
    hasMain: /<main(?:\s|>)/i.test(body), durationMs: Math.round(performance.now() - startedAt)
  };
}

const mx = await resolveMx(domain).catch(() => []);
const [rootTxt, dmarcTxt, dkimTxt] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`), txt(`zmail._domainkey.${domain}`)]);
const dns = {
  mx: mx.map((item) => item.exchange),
  zohoMx: mx.some((item) => /zoho/i.test(item.exchange)),
  spf: rootTxt.find((item) => item.startsWith("v=spf1")) || null,
  dmarc: dmarcTxt.find((item) => item.startsWith("v=DMARC1")) || null,
  dkimPublished: dkimTxt.some((item) => /v=DKIM1|p=/i.test(item)),
  mailboxExistence: "nao_verificavel_publicamente"
};
const pages = [];
for (const route of routes) pages.push(await inspectPage(route));
const homepage = await fetch(`https://${domain}/`, { headers: { "User-Agent": "Ogritech-Public-Audit/1.0" } });
const homepageBody = await homepage.text();
const headers = Object.fromEntries(["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"].map((name) => [name, homepage.headers.get(name)]));
const metaCsp = homepageBody.match(/<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]+)"/i)?.[1] || null;
const failures = [];
if (!dns.zohoMx) failures.push("MX do Zoho ausente");
if (!/include:zohomail\.com/.test(dns.spf || "")) failures.push("SPF do Zoho ausente");
if (!/^v=DMARC1/.test(dns.dmarc || "")) failures.push("DMARC ausente");
if (!dns.dkimPublished) failures.push("DKIM zmail ausente");
if (!pages.every((page) => page.ok && page.title && page.h1 && page.langPtBr && page.viewport && page.hasMain)) failures.push("Uma ou mais páginas falharam no contrato público/acessível");
if (!headers["content-security-policy"] && !metaCsp) failures.push("CSP ausente no cabeçalho e no HTML");
if (!headers["strict-transport-security"]) failures.push("HSTS ausente");
if (headers["x-content-type-options"]?.toLowerCase() !== "nosniff") failures.push("X-Content-Type-Options nosniff ausente");
if (!headers["x-frame-options"] && !headers["content-security-policy"]?.includes("frame-ancestors")) failures.push("Proteção HTTP contra enquadramento/clickjacking ausente");
if (!headers["referrer-policy"]) failures.push("Referrer-Policy ausente no cabeçalho HTTP");
if (!headers["permissions-policy"]) failures.push("Permissions-Policy ausente no cabeçalho HTTP");

const report = {
  checkedAt: new Date().toISOString(), domain, dns,
  securityHeaders: headers,
  cspDelivery: headers["content-security-policy"] ? "http_header" : "html_meta",
  securityWarnings: headers["content-security-policy"] ? [] : ["CSP entregue por meta; diretivas como frame-ancestors exigem cabeçalho HTTP"],
  failures, pages, verdict: failures.length ? "NAO_APROVADO" : "APROVADO"
};
const outputDir = new URL("../outputs/go-live/", import.meta.url);
await mkdir(outputDir, { recursive: true });
await writeFile(new URL("public-audit.json", outputDir), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
