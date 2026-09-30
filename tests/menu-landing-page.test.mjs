import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [page, styles, home, sitemap] = await Promise.all([
  readFile(new URL("../cardapio-digital/index.html", import.meta.url), "utf8"),
  readFile(new URL("../cardapio-digital/cardapio-digital.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../sitemap.xml", import.meta.url), "utf8")
]);

test("landing dedicada apresenta oferta, recursos, preço e CTA para o teste", () => {
  assert.match(page, /Seu cardápio aberto/);
  assert.match(page, /id="recursos"/);
  assert.match(page, /id="como-funciona"/);
  assert.match(page, /id="preco"/);
  assert.match(page, /R\$ 49,90/);
  assert.match(page, /14 dias grátis/i);
  assert.ok((page.match(/href="\.\.\/criar-cardapio\/"/g) || []).length >= 4);
});

test("landing é indexável, canônica e responsiva", () => {
  assert.match(page, /rel="canonical" href="https:\/\/ogritech\.com\.br\/cardapio-digital\/"/);
  assert.match(page, /name="robots" content="index,follow/);
  assert.match(styles, /@media\(max-width:620px\)/);
});

test("landing reutiliza o sistema visual institucional da Ogritech", () => {
  assert.match(styles, /--ink:#080a0b/);
  assert.match(styles, /--cyan:#08b9d3/);
  assert.match(styles, /--max:1240px/);
  assert.match(styles, /font-family:Arial,Helvetica,sans-serif/);
  assert.match(page, /responsive-headings\.css/);
  assert.match(styles, /\.button\{[^}]*border-radius:4px/);
});

test("landing impede estouro horizontal e adapta o hero no mobile", () => {
  assert.match(styles, /body\{[^}]*overflow-x:hidden/);
  assert.match(styles, /@media\(max-width:620px\)[\s\S]*\.hero h1 em\{[^}]*white-space:normal/);
  assert.match(styles, /@media\(max-width:620px\)[\s\S]*\.feature-grid\{grid-template-columns:1fr\}/);
  assert.match(styles, /@media\(max-width:620px\)[\s\S]*\.proof-strip div\{[^}]*flex-wrap:wrap/);
});

test("landing segue as regras anteriores de títulos, numerais e moeda", () => {
  assert.match(page, /responsive-headings\.css/);
  assert.doesNotMatch(page, /<article><span>0[1-9]<\/span>/);
  assert.doesNotMatch(page, /<li><span>[1-9]<\/span>/);
  assert.match(page, /R\$ 65,00/);
  assert.match(page, /R\$ 45,00/);
  assert.match(page, /R\$ 49,90<\/strong><span>por mês<\/span>/);
});

test("demonstração oferece confeitaria, pizzaria e marmitaria em carrossel acessível", () => {
  assert.match(page, /data-showcase/);
  assert.match(page, /2 de 3: pizzaria/);
  assert.match(page, /3 de 3: marmitaria/);
  assert.match(page, /data-showcase-next/);
  assert.match(page, /cardapio-pizzaria\.png/);
  assert.match(page, /cardapio-marmita\.png/);
  assert.match(styles, /touch-action:pan-y/);
  assert.match(styles, /\.hero-copy,\.product-stage\{min-width:0;width:100%\}/);
  assert.match(styles, /@media\(max-width:900px\)\{\.hero\{grid-template-columns:minmax\(0,1fr\)\}\}/);
});

test("home encaminha a oferta do Cardápio para a landing dedicada", () => {
  assert.match(home, /href="\/cardapio-digital\/"[\s\S]*Ogritech Cardápio/);
  assert.match(sitemap, /https:\/\/ogritech\.com\.br\/cardapio-digital\//);
});
