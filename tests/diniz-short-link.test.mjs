import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../diniz-doces/index.html", import.meta.url), "utf8");

test("link curto da Diniz direciona somente para a prévia autorizada em staging", () => {
  assert.match(html, /url=\/cardapio\/\?empresa=diniz-doces-previa-7d1&amp;env=staging/);
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(html, /env=production/);
});
