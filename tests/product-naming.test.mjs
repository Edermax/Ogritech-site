import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const officialProducts = ["Ogritech Cardápio", "Ogritech Encomendas"];

test("frontend apresenta as duas ofertas atuais", async () => {
  const [home, contact, panel, offers] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("contato/index.html", root), "utf8"),
    readFile(new URL("painel/index.html", root), "utf8"),
    readFile(new URL("product-offers.js", root), "utf8")
  ]);

  for (const product of officialProducts) {
    assert.ok(home.includes(product), `${product} deve aparecer na página inicial`);
    assert.ok(contact.includes(product), `${product} deve aparecer no formulário de contato`);
    assert.match(panel, /src="\/product-offers\.js/);
    assert.ok(offers.includes(product), `${product} deve estar no catálogo usado pelo painel`);
  }
});

test("documentação mantém uma fonte de verdade para os nomes oficiais", async () => {
  const catalog = await readFile(new URL("docs/CATALOGO_OFICIAL_SOLUCOES.md", root), "utf8");
  for (const product of officialProducts) {
    assert.ok(catalog.includes(`**${product}**`), `${product} deve estar registrado no catálogo`);
  }
});

