import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const officialProducts = [
  "Ogritech Agenda",
  "Ogritech Páginas",
  "Ogritech Orçamentos",
  "Ogritech Cardápio"
];

test("frontend apresenta o catálogo oficial das quatro soluções", async () => {
  const [home, contact, panel] = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("contato/index.html", root), "utf8"),
    readFile(new URL("painel/index.html", root), "utf8")
  ]);

  for (const product of officialProducts) {
    assert.ok(home.includes(product), `${product} deve aparecer na página inicial`);
    assert.ok(contact.includes(product), `${product} deve aparecer no formulário de contato`);
    assert.ok(panel.includes(product), `${product} deve aparecer na navegação do painel`);
  }
});

test("documentação mantém uma fonte de verdade para os nomes oficiais", async () => {
  const catalog = await readFile(new URL("docs/CATALOGO_OFICIAL_SOLUCOES.md", root), "utf8");
  for (const product of officialProducts) {
    assert.ok(catalog.includes(`**${product}**`), `${product} deve estar registrado no catálogo`);
  }
});

