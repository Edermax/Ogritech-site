import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../diniz-doces/index.html", import.meta.url), "utf8");

test("link curto da Diniz direciona somente para a prévia autorizada em staging", () => {
  assert.match(html, /url=\/cardapio\/\?empresa=diniz-doces-previa-7d1&amp;env=staging/);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /env=production/);
});

test("identidade visual da Diniz usa ativos próprios sem afetar outros cardápios", async () => {
  const menuSource = await readFile(new URL("../cardapio/cardapio.js", import.meta.url), "utf8");
  const menuHtml = await readFile(new URL("../cardapio/index.html", import.meta.url), "utf8");
  const panelSource = await readFile(new URL("../script.js", import.meta.url), "utf8");
  for (const file of [
    "logo.jpg",
    "bolo-redondo.png",
    "brigadeiros.png",
    "bolo-redondo-rosa.jpg",
    "bolo-chocolate-morango.jpg",
    "bolo-chocolate-granulado.jpg",
    "bolo-retangular-caramelo.jpg",
    "doces-sortidos.jpg",
    "bolo-de-corte.jpg",
    "pao-de-mel.jpg",
    "pirulito.jpg",
  ]) {
    await access(new URL(`../assets/diniz-doces/${file}`, import.meta.url));
  }
  assert.match(menuSource, /slug === "diniz-doces-previa-7d1"/);
  assert.match(menuSource, /Imagem ilustrativa/);
  assert.match(menuSource, /match: \/bolo de corte\/, src: "bolo-de-corte\.jpg"/);
  assert.match(menuSource, /match: \/bolo de corte\.\*ninho com nutella\/, src: "bolo-chocolate-granulado\.jpg"/);
  assert.match(menuSource, /match: \/pao de mel\/, src: "pao-de-mel\.jpg"/);
  assert.match(menuSource, /match: \/pirulito\/, src: "pirulito\.jpg"/);
  assert.match(menuSource, /piloto privado\\s\*\$\/i/);
  assert.match(menuSource, /bolo-redondo\.png/);
  assert.match(menuSource, /bolo-retangular-caramelo\.jpg/);
  assert.match(menuSource, /brigadeiros\.png/);
  assert.match(menuHtml, /id="menuBrandLogo"/);
  assert.match(panelSource, /assets\/diniz-doces\/logo\.jpg/);
});
