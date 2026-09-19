import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const config = await readFile(new URL("supabase-config.js", root), "utf8");
const stagingBlock = config.match(/staging:\s*Object\.freeze\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
const apiUrl = stagingBlock.match(/url:\s*"([^"]+)"/)?.[1];
const publishableKey = stagingBlock.match(/publishableKey:\s*"([^"]+)"/)?.[1];
const secretKey = process.env.OGRITECH_STAGING_SECRET_KEY;
assert.equal(apiUrl, "https://fuesdztsvrkkgnbqhcxi.supabase.co", "O bot só pode executar no staging conhecido");
assert.match(publishableKey ?? "", /^sb_publishable_/);
assert.match(secretKey ?? "", /^(?:sb_secret_|eyJ)/, "Defina OGRITECH_STAGING_SECRET_KEY somente no processo de teste para garantir a limpeza do usuário sintético");

const runId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const email = `agenda-auth-bot+${runId}@example.invalid`;
const password = `Ogritech!${randomBytes(24).toString("base64url")}`;
const headers = { apikey: publishableKey, "Content-Type": "application/json" };

async function auth(path, body, accessToken) {
  const response = await fetch(`${apiUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: { ...headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, payload };
}

async function deleteFixture(userId) {
  const response = await fetch(`${apiUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` }
  });
  const payload = await response.json().catch(() => null);
  assert.equal(response.ok, true, payload?.msg ?? payload?.message ?? "Falha ao remover usuário sintético do Auth");
}

let userId = "";
try {
  const signup = await auth("signup", { email, password, data: { test_fixture: "ogritech-agenda-auth-bot" } });
  assert.equal(signup.ok, true, signup.payload?.msg ?? signup.payload?.message ?? "Falha no cadastro sintético");
  userId = signup.payload?.user?.id ?? signup.payload?.id;
  assert.ok(userId, "Auth não retornou o identificador do usuário");
  assert.equal(signup.payload?.session ?? null, null, "Staging deveria exigir confirmação de e-mail");

  console.log(`AUTH_BOT_WAITING user_id=${userId} email=${email}`);

  let login;
  for (let attempt = 0; attempt < 45; attempt += 1) {
    login = await auth("token?grant_type=password", { email, password });
    if (login.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert.equal(login?.ok, true, login?.payload?.msg ?? login?.payload?.message ?? "Conta não foi confirmada a tempo");
  const token = login.payload.access_token;
  assert.ok(token, "JWT de sessão ausente");

  const rpc = await fetch(`${apiUrl}/rest/v1/rpc/list_services_catalog`, {
    method: "POST",
    headers: { ...headers, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ target_barbershop_id: "11111111-1111-4111-8111-111111111111" })
  });
  const services = await rpc.json().catch(() => null);
  assert.equal(rpc.ok, true, services?.message ?? "JWT não acessou a RPC protegida");
  assert.ok(Array.isArray(services) && services.length > 0, "Catálogo protegido não retornou a massa sintética");

  const logout = await auth("logout?scope=global", undefined, token);
  assert.equal(logout.ok, true, logout.payload?.message ?? "Falha ao encerrar sessões");

  console.log(JSON.stringify({
    environment: "staging",
    userId,
    email,
    checks: {
      publicSignup: "passed",
      emailConfirmationRequired: "passed",
      passwordLogin: "passed",
      jwtProtectedRpc: "passed",
      globalLogout: "passed"
    }
  }, null, 2));
} finally {
  if (userId) {
    await deleteFixture(userId);
    console.log(`AUTH_BOT_CLEANED user_id=${userId}`);
  }
}
