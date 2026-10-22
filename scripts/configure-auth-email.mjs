import { readFile, writeFile } from "node:fs/promises";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw Error("Management token unavailable");
const refs = { staging: "fuesdztsvrkkgnbqhcxi", production: "mvzcoaiiwytycdqcvydf" };
const report = [];
for (const [environment, ref] of Object.entries(refs)) {
 const endpoint = `https://api.supabase.com/v1/projects/${ref}/config/auth`;
 const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
 const currentResponse = await fetch(endpoint, { headers });
 if (!currentResponse.ok) throw Error(`Auth read HTTP ${currentResponse.status}`);
 let config = await currentResponse.json();
 const patch = {};
 for (const type of ["invite", "recovery"]) {
  const url = new URL("https://ogritech.com.br/update-password.html");
  url.searchParams.set("type", type);
  if (environment === "staging") url.searchParams.set("env", "staging");
  patch[`mailer_subjects_${type}`] = type === "invite" ? "Crie sua senha do Cardápio Ogritech" : "Redefina sua senha Ogritech";
  patch[`mailer_templates_${type}_content`] = (await readFile(new URL(`../supabase/templates/${type}.html`, import.meta.url), "utf8")).replace("__ACCESS_URL__", url.href.replaceAll("&", "&amp;"));
 }
 // Keep existing destinations and SMTP credentials; add only this application's exact callback.
 const allowed = new Set(String(config.uri_allow_list || "").split(",").map(x=>x.trim()).filter(Boolean));
 allowed.add(environment === "staging" ? "https://ogritech.com.br/update-password.html?primeiro_acesso=menu&env=staging" : "https://ogritech.com.br/update-password.html?primeiro_acesso=menu");
 patch.uri_allow_list = [...allowed].join(",");
 if (process.env.APPLY_AUTH_EMAIL === "true") {
  const response = await fetch(endpoint, { method: "PATCH", headers, body: JSON.stringify(patch) });
  if (!response.ok) throw Error(`Auth update HTTP ${response.status}`);
  const verified = await fetch(endpoint, { headers });
  if (!verified.ok) throw Error(`Auth verification HTTP ${verified.status}`);
  config = await verified.json();
  for (const key of Object.keys(patch)) if (config[key] !== patch[key]) throw Error(`Auth verification mismatch: ${key}`);
 }
 report.push({ environment, applied: process.env.APPLY_AUTH_EMAIL === "true", smtpConfigured: Boolean(config.smtp_host), smtpHost: config.smtp_host || null, sender: config.smtp_admin_email || null, inviteLocalized: config.mailer_subjects_invite === patch.mailer_subjects_invite, recoveryLocalized: config.mailer_subjects_recovery === patch.mailer_subjects_recovery, callbackUsesTokenHash: String(config.mailer_templates_invite_content).includes("#token_hash="), otpExpirySeconds: config.mailer_otp_exp });
}
await writeFile("auth-email-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
