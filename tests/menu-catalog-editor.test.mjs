import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [editorMigration, orderingMigration, draftMigration, admin, panel, storefront] = await Promise.all([
  read("supabase/migrations/20260928145729_menu_self_service_catalog_editor.sql"),
  read("supabase/migrations/20260928150615_menu_catalog_order_and_delivery_zones.sql"),
  read("supabase/migrations/20260928153519_menu_catalog_draft_publication.sql"),
  read("commercial-admin.js"),
  read("painel/index.html"),
  read("cardapio/cardapio.js")
]);

test("editor persists a complete catalog item atomically", () => {
  assert.match(editorMigration, /create or replace function private\.save_menu_catalog_item\(target_barbershop_id uuid,payload jsonb\)/i);
  assert.match(editorMigration, /jsonb_array_elements\(payload->'prices'\)/i);
  assert.match(editorMigration, /jsonb_array_elements\(coalesce\(payload->'option_groups'/i);
  assert.match(editorMigration, /grant execute on function public\.save_menu_catalog_item\(uuid,jsonb\) to authenticated/i);
  assert.match(admin, /rpc\("save_menu_catalog_item"/);
  assert.match(panel, /id="menuItemDescription"/);
  assert.match(panel, /id="menuPriceRows"/);
  assert.match(panel, /id="menuOptionGroupRows"/);
});

test("published catalog changes stay in a private draft until atomic promotion", () => {
  assert.match(draftMigration, /create table private\.menu_catalog_drafts/i);
  assert.match(draftMigration, /revoke all on table private\.menu_catalog_drafts from public,anon,authenticated/i);
  assert.match(draftMigration, /for update/i);
  assert.match(draftMigration, /update public\.online_menus set published=false/i);
  assert.match(draftMigration, /update public\.online_menus set published=true,published_at=now\(\)/i);
  assert.match(draftMigration, /if not private\.menu_catalog_is_ready\(menu\.id\)/i);
  assert.match(admin, /rpc\("save_menu_catalog_draft"/);
  assert.match(admin, /rpc\("publish_menu_catalog_draft"/);
  assert.match(admin, /Clientes continuam vendo a versão anterior/);
});

test("product photos use a constrained tenant-scoped storage bucket", () => {
  assert.match(editorMigration, /values\('menu-images','menu-images',true,5242880,array\['image\/jpeg','image\/png','image\/webp'\]\)/i);
  assert.match(editorMigration, /\(\(storage\.foldername\(name\)\)\[1\]\)::uuid/i);
  assert.match(admin, /file\.size>5\*1024\*1024/);
  assert.match(admin, /\["image\/jpeg","image\/png","image\/webp"\]/);
  assert.match(admin, /upsert:false/);
});

test("catalog order and delivery zones are saved through transactional RPCs", () => {
  assert.match(orderingMigration, /create function\s+private\.reorder_menu_catalog/i);
  assert.match(orderingMigration, /create function\s+private\.save_menu_delivery_zones/i);
  assert.match(admin, /rpc\("reorder_menu_catalog"/);
  assert.match(admin, /rpc\("save_menu_delivery_zones"/);
});

test("publication readiness rejects available products without an active price", () => {
  assert.match(editorMigration, /create or replace function private\.menu_catalog_is_ready/i);
  assert.match(editorMigration, /not exists\(select 1 from public\.menu_item_prices p where p\.menu_item_id=i\.id and p\.active\)/i);
});

test("storefront tolerates a temporarily unavailable price and resets cart after checkout", () => {
  assert.match(storefront, /const initialPrice = first \?[\s\S]{0,300}: "Indisponível"/);
  assert.match(storefront, /cart\.clear\(\); updateCart\(\);/);
});
