import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const pages = ["index.html", "agenda-online/index.html", "contato/index.html", "404.html", "cardapio-digital/index.html"];
const styles = await readFile(new URL("responsive-headings.css", root), "utf8");

test("todas as páginas com destaque tipográfico carregam a correção compartilhada atual", async () => {
  for (const path of pages) {
    const html = await readFile(new URL(path, root), "utf8");
    assert.match(html, /responsive-headings\.css\?v=20260930\.1/, path);
  }
});

test("destaques usam serifada sólida e métricas seguras no mobile", () => {
  assert.match(styles, /font-family: Georgia, "Times New Roman", Times, serif/);
  assert.match(styles, /font-size: 0\.84em/);
  assert.match(styles, /line-height: 1\.18/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /-webkit-text-stroke-width: 0 !important/);
  assert.match(styles, /letter-spacing: 0 !important/);
});
