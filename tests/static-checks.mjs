import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const names = await readdir(root);
const jsFiles = names.filter((name) => extname(name) === ".js");
const nestedJsFiles = ["agendar/agendar.js"];
for (const name of [...jsFiles, ...nestedJsFiles]) {
  const result = spawnSync(process.execPath, ["--check", join(fileURLToPath(root), name)], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${name}: ${result.stderr}`);
}
const htmlFiles = [...names.filter((name) => extname(name) === ".html"), "agendar/index.html"];
for (const name of htmlFiles) {
  const pageUrl = new URL(name, root);
  const html = await readFile(pageUrl, "utf8");
  if (!/^<!doctype html>/i.test(html.trimStart())) throw new Error(`${name}: DOCTYPE ausente`);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(https?:|#|mailto:)/.test(target) || target.includes("?") || target.startsWith("data:")) continue;
    const targetUrl = target.startsWith("/") ? new URL(target.slice(1), root) : new URL(target, pageUrl);
    try { await stat(targetUrl); } catch { throw new Error(`${name}: referência ausente: ${target}`); }
  }
}

const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
if (manifest.display !== "standalone" || !manifest.start_url || !manifest.icons?.length) {
  throw new Error("Manifesto PWA incompleto");
}
for (const page of ["index.html", "login.html"]) {
  const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
  if (!html.includes('rel="manifest"') || !/src="pwa\.js(?:\?[^\"]*)?"/.test(html)) {
    throw new Error(`${page}: integração PWA ausente`);
  }
}
const pwaScript = await readFile(new URL("../pwa.js", import.meta.url), "utf8");
if (!pwaScript.includes('document.body.classList.contains("login-page")')) {
  throw new Error("O botão de instalação deve ficar restrito à página de login");
}
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");
if (!serviceWorker.includes('addEventListener("fetch"') || !serviceWorker.includes('addEventListener("install"')) {
  throw new Error("Service worker incompleto");
}
const migrations = await readdir(new URL("../supabase/migrations/", import.meta.url));
if (migrations.length < 9) throw new Error("Conjunto de migrations incompleto");
console.log(`OK: ${jsFiles.length + nestedJsFiles.length} scripts, ${htmlFiles.length} páginas e ${migrations.length} migrations.`);
