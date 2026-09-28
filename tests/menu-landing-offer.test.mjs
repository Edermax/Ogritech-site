import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("landing publica a oferta padronizada do Cardápio sem oferta Fundadores", async () => {
  const pages = await Promise.all([
    readFile(new URL("index.html", root), "utf8"),
    readFile(new URL("nova-home/index.html", root), "utf8")
  ]);

  for (const page of pages) {
    for (const marker of ["R$ 49,90", "14 dias grátis", "R$ 499", "R$ 99", "Sem comissão por pedido"]) {
      assert.match(page, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
    assert.doesNotMatch(page, /oferta\s+fundadores|plano\s+fundadores/i);
  }
});
