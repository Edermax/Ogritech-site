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
  for (const file of ["logo.jpg", "bolo-redondo.png", "bolo-retangular.png", "brigadeiros.png"]) {
    await access(new URL(`../assets/diniz-doces/${file}`, import.meta.url));
  }
  assert.match(menuSource, /slug === "diniz-doces-previa-7d1"/);
  assert.match(menuSource, /Imagem ilustrativa/);
  assert.match(menuSource, /assets\/diniz-doces\/bolo-redondo\.png/);
  assert.match(menuSource, /assets\/diniz-doces\/bolo-retangular\.png/);
  assert.match(menuSource, /assets\/diniz-doces\/brigadeiros\.png/);
  assert.match(menuHtml, /id="menuBrandLogo"/);
  assert.match(panelSource, /assets\/diniz-doces\/logo\.jpg/);
});
