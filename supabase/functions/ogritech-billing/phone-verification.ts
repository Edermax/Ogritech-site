// Disabled by default. Credentials stay in Edge secrets; no SMS is sent during signup
// unless the operator explicitly enables the complete, CAPTCHA-protected integration.
export function phoneVerificationConfiguration() {
  const enabled = Deno.env.get("TRIAL_PHONE_VERIFICATION_ENABLED") === "true";
  const account = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const service = Deno.env.get("TWILIO_VERIFY_SERVICE_SID") || "";
  const ready = /^AC[a-fA-F0-9]{32}$/.test(account) && Boolean(token) && /^VA[a-fA-F0-9]{32}$/.test(service)
    && Boolean(Deno.env.get("TURNSTILE_SECRET_KEY")) && Boolean(Deno.env.get("TURNSTILE_SITE_KEY"));
  return { enabled, ready, account, token, service };
}
async function providerRequest(path: string, body: URLSearchParams) {
  const config = phoneVerificationConfiguration();
  if (!config.enabled || !config.ready) throw new Error("phone_verification_unavailable");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${config.service}/${path}`, {
    method: "POST", headers: { Authorization: `Basic ${btoa(`${config.account}:${config.token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded" }, body,
    signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (!response.ok) throw new Error("phone_provider_unavailable");
  return response.json();
}
export async function sendPhoneCode(phone: string): Promise<string> {
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(phone)) throw new Error("invalid_mobile_phone");
  const result = await providerRequest("Verifications", new URLSearchParams({ To: `+55${phone}`, Channel: "sms", Locale: "pt-BR" }));
  if (!/^VE[a-fA-F0-9]{32}$/.test(result.sid) || result.status !== "pending") throw new Error("phone_provider_unavailable");
  return result.sid;
}
export async function checkPhoneCode(providerId: string, code: string): Promise<boolean> {
  if (!/^VE[a-fA-F0-9]{32}$/.test(providerId) || !/^[0-9]{6}$/.test(code)) return false;
  const result = await providerRequest("VerificationCheck", new URLSearchParams({ VerificationSid: providerId, Code: code }));
  return result.status === "approved" && result.sid === providerId;
}
