import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root=new URL("../",import.meta.url);

test("Cardápio oferece quatro templates e tipos universais sem publicação automática",async()=>{
  const [html,js,sql]=await Promise.all([
    readFile(new URL("painel/index.html",root),"utf8"),
    readFile(new URL("commercial-admin.js",root),"utf8"),
    readFile(new URL("supabase/migrations/20260908202555_menu_catalog_core.sql",root),"utf8")
  ]);
  assert.match(html,/Modelo inicial do catálogo/);
  assert.match(html,/value="fractional"/);
  assert.match(html,/value="preorder"/);
  assert.match(js,/apply_menu_catalog_template/);
  for(const code of ["pizzeria","snack-bar","restaurant","confectionery"]) assert.match(sql,new RegExp(`'${code}'`));
  for(const table of ["menu_option_groups","menu_options","menu_item_option_groups","menu_availability_rules"]) assert.match(sql,new RegExp(`create table public\\.${table}`));
  assert.match(sql,/published,published_at\)[\s\S]*?false,null/);
});
