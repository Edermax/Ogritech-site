import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [loginSource, authSource, clientSource, loginPage, canonicalLoginPage, panelPage, clientPage, serviceWorkerSource] = await Promise.all([
  readFile(new URL("../login.js", import.meta.url), "utf8"),
  readFile(new URL("../auth.js", import.meta.url), "utf8"),
  readFile(new URL("../cliente.js", import.meta.url), "utf8"),
  readFile(new URL("../login.html", import.meta.url), "utf8"),
  readFile(new URL("../login/index.html", import.meta.url), "utf8"),
  readFile(new URL("../painel/index.html", import.meta.url), "utf8"),
  readFile(new URL("../cliente.html", import.meta.url), "utf8"),
  readFile(new URL("../sw.js", import.meta.url), "utf8")
]);

test("login entrega ao painel um contexto operacional completo antes da navegação", () => {
  assert.match(loginSource, /ogritechOperationalSession/);
  assert.match(loginSource, /`\$\{user\.id\}:\$\{profile\.role\}:\$\{profile\.barbershop_id\}`/);
});

test("painel não recarrega quando veio de um login com contexto atual", () => {
  assert.match(authSource, /const hasCurrentOperationalContext\s*=/);
  assert.match(authSource, /if \(!hasCurrentOperationalContext\)\s*{\s*window\.location\.reload\(\)/);
  assert.doesNotMatch(authSource, /if \(sessionStorage\.getItem\("ogritechOperationalSession"\) !== operationalSessionKey\)/);
});

test("service worker invalida o shell antigo e não pré-carrega a rota legada de login", () => {
  assert.match(serviceWorkerSource, /ogritech-shell-v15/);
  assert.doesNotMatch(serviceWorkerSource, /"\.\/login\.html"/);
});

test("telas de autenticação e áreas protegidas começam ocultas até a decisão de sessão", () => {
  for (const page of [loginPage, canonicalLoginPage, panelPage, clientPage]) {
    assert.match(page, /<style>html\{visibility:hidden\}<\/style>/);
  }
  assert.match(loginSource, /if \(!session\)\s*{[\s\S]*document\.documentElement\.style\.visibility = "visible"/);
});

test("área do cliente usa destinos do ambiente e evita passagem intermediária pelo painel", () => {
  assert.doesNotMatch(clientSource, /window\.location\.replace\("\/(?:login|painel)\//);
  assert.match(clientSource, /isPlatformAdmin \? "admin\.html" : "painel\/"/);
  assert.match(clientSource, /"ogritechOperationalSession"/);
});
