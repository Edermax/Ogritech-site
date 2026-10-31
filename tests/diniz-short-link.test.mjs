import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const html = await readFile(new URL("../diniz-doces/index.html", import.meta.url), "utf8");

test("link curto da Diniz direciona para produção mesmo após visita à homologação", async () => {
  const redirect = html.match(/content="0;url=([^"]+)"/)[1].replaceAll("&amp;", "&");
  const destination = new URL(redirect, "https://ogritech.com.br");
  assert.equal(destination.pathname, "/cardapio/");
  assert.equal(destination.searchParams.get("empresa"), "diniz-doces");
  assert.equal(destination.searchParams.get("env"), "production");
  assert.match(html, /href="\/cardapio\/\?empresa=diniz-doces&amp;env=production"/);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /env=staging/);

  const stored = new Map([["ogritechEnvironment", "staging"]]);
  const window = { location: destination, supabase: { createClient: () => ({}) } };
  const configuration = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
  runInNewContext(configuration, {
    window, URL, URLSearchParams,
    sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) }
  });
  assert.equal(window.OGRITECH_ENV, "production");
  assert.equal(window.OGRITECH_SUPABASE_URL, "https://mvzcoaiiwytycdqcvydf.supabase.co");
  assert.equal(stored.get("ogritechEnvironment"), "production");
});

test("identificação Diniz aceita somente os slugs exatos de produção e homologação", async () => {
  const menuSource = await readFile(new URL("../cardapio/cardapio.js", import.meta.url), "utf8");
  const predicate = menuSource.match(/const isDinizMenu = ([^;]+);/)[1];
  for (const [slug, expected] of [["diniz-doces", true], ["diniz-doces-previa-7d1", true], ["outra-loja", false], ["diniz-doces-outra", false], ["Diniz-doces", false], ["", false]]) {
    assert.equal(runInNewContext(predicate, { slug }), expected, slug);
  }
});

test("cálculo de entrega Diniz mantém validação estrita e isola outros estabelecimentos", async () => {
  const source = await readFile(new URL("../supabase/functions/cep-lookup/index.ts", import.meta.url), "utf8");
  const aliases = source.match(/const DINIZ_SLUGS = [^;]+;/)[0];
  const gate = source.match(/if \((DINIZ_SLUGS\.has\([^\n]+)\) \{/)[1];
  for (const [target_slug, expected] of [["diniz-doces", true], ["diniz-doces-previa-7d1", true], ["outra-loja", false], ["diniz-doces-outra", false], ["", false], [undefined, false]]) {
    const result = runInNewContext(`${aliases}\nBoolean(${gate})`, { parsed: { data: { target_slug, address: "Rua Exemplo, 12" } } });
    assert.equal(result, expected, target_slug);
  }
  assert.equal(runInNewContext(`${aliases}\nBoolean(${gate})`, { parsed: { data: { target_slug: "diniz-doces" } } }), false);
  assert.match(source, /target_slug: z\.string\(\)\.regex\(\/\^\[a-z0-9\]\[a-z0-9-\]\{2,62\}\$\/\)\.optional\(\)/);
  assert.match(source, /\}\)\.strict\(\)/);
  assert.match(source, /outside_service_city/);
  assert.match(source, /address_number_required/);
  assert.match(source, /billingDistance > 50/);
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
