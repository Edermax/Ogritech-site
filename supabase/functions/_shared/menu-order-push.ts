// Empty Web Push messages carry no customer or order data. The service worker
// displays a generic visible notification (RFC 8030, RFC 8292).
export function validPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname;
    const trusted = host === "fcm.googleapis.com" || host === "web.push.apple.com"
      || host.endsWith(".push.services.mozilla.com") || host.endsWith(".notify.windows.com");
    return trusted && url.protocol === "https:" && !url.port && !url.username && !url.password
      && !url.hash && url.pathname.length > 1 && value.length <= 2048;
  } catch { return false; }
}

const encoded = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const encodedJson = (value: unknown) => encoded(new TextEncoder().encode(JSON.stringify(value)));

export async function sendOrderPush(
  endpoint: string, topic: string, publicKey: string, privateKey: CryptoKey, contact: string,
  fetchImpl: typeof fetch = fetch, now = Date.now()
): Promise<"sent" | "retry" | "expired" | "failed"> {
  if (!validPushEndpoint(endpoint) || !/^[a-f0-9]{32}$/.test(topic)) return "failed";
  const claims = encodedJson({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 3600, sub: contact });
  const unsigned = `${encodedJson({ typ: "JWT", alg: "ES256" })}.${claims}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, new TextEncoder().encode(unsigned));
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `vapid t=${unsigned}.${encoded(new Uint8Array(signature))}, k=${publicKey}`, TTL: "300", Urgency: "high", Topic: topic }
    });
    await response.body?.cancel();
    if (response.ok) return "sent";
    if (response.status === 404 || response.status === 410) return "expired";
    if (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403) return "retry";
    return "failed";
  } catch { return "retry"; }
}

export function secretMatches(expected: string, supplied: string): boolean {
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  return difference === 0;
}
