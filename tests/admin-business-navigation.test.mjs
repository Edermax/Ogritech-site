import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [html, script] = await Promise.all([
  readFile(new URL("admin.html", root), "utf8"),
  readFile(new URL("admin.js", root), "utf8")
]);

test("administração orienta o caminho para operar e exibe contatos do negócio", () => {
  assert.match(html, /vá a <a href="#businesses">Negócios<\/a> e escolha “Operar”/);
  assert.match(html, /<th>Contato<\/th>/);
  assert.match(script, /business\.phone \|\| "Telefone pendente"/);
  assert.match(script, /business\.owner_email \|\| "E-mail pendente"/);
});

test("cadastro existente aceita contato pendente sem relaxar novos cadastros", () => {
  assert.match(script, /businessEmail"\)\.required = !business/);
  assert.match(script, /if \(!id && !ownerEmail\)/);
  assert.match(script, /owner_email: ownerEmail \|\| null/);
});
