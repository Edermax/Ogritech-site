import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = (await readFile(new URL("../commercial-admin.js", import.meta.url), "utf8")).replaceAll("\r\n", "\n");
const start = source.indexOf('    byId("menuItemForm")?.addEventListener("submit", async (event) => {');
const end = source.indexOf("\n    setupMenuDeliveryZoneEditor();", start);
const submitSource = source.slice(start, end);

function editor({ categories, itemId, categoryId, categoryName }) {
  let submit, saved;
  const values = {
    menuItemId: itemId,
    menuCategoryId: categoryId,
    menuCategoryName: categoryName,
    menuItemName: "Nome atualizado",
    menuItemDescription: "Descrição atualizada",
    menuItemType: "simple",
    menuItemUnit: "unidade",
    menuItemMinimum: "1",
    menuItemMaximum: "",
    menuItemLeadTime: "0"
  };
  const fields = new Map();
  const byId = id => {
    if (!fields.has(id)) fields.set(id, {
      value: values[id] ?? "",
      checked: true,
      files: [],
      querySelectorAll: () => [],
      addEventListener: (event, handler) => { if (id === "menuItemForm" && event === "submit") submit = handler; }
    });
    return fields.get(id);
  };
  byId("menuPriceRows").querySelectorAll = () => [{ querySelector: selector => ({ value: ({ "[data-price-label]": "Padrão", "[data-price-value]": "19.90", "[data-price-promo]": "" })[selector] }) }];
  const context = {
    byId,
    menuRecord: { published: true },
    menuSettingsDirty: false,
    menuImageRemoveRequested: false,
    menuCatalogCategories: structuredClone(categories),
    crypto: { randomUUID: () => "new-id" },
    resetMenuItemEditor() {},
    runMenuAction: async (_messageId, _message, operation) => operation(),
    savePublishedMenuDraft: async () => { saved = structuredClone(context.menuCatalogCategories); return { data: {} }; }
  };
  vm.runInNewContext(submitSource, context);
  return {
    async save() { await submit({ preventDefault() {} }); return saved; }
  };
}

test("editing a published product preserves its position, sort order and siblings", async () => {
  const categories = [{ id: "main", name: "Principais", menu_items: [
    { id: "first", name: "Primeiro", sort_order: 10 },
    { id: "middle", name: "Segundo", sort_order: 30 },
    { id: "last", name: "Terceiro", sort_order: 70 }
  ] }];
  const saved = await editor({ categories, itemId: "middle", categoryId: "main", categoryName: "Principais" }).save();
  assert.deepEqual(saved[0].menu_items.map(item => item.id), ["first", "middle", "last"]);
  assert.equal(saved[0].menu_items[1].sort_order, 30);
  assert.equal(saved[0].menu_items[1].name, "Nome atualizado");
  assert.equal(saved[0].menu_items[1].menu_item_prices[0].price, 19.90);
  assert.deepEqual(saved[0].menu_items[0], categories[0].menu_items[0]);
  assert.deepEqual(saved[0].menu_items[2], categories[0].menu_items[2]);
});

test("moving a published product appends it after the destination order without duplication", async () => {
  const categories = [
    { id: "source", name: "Origem", menu_items: [{ id: "moving", name: "Mover", sort_order: 20 }] },
    { id: "target", name: "Destino", menu_items: [{ id: "existing", name: "Existente", sort_order: 90 }] }
  ];
  const saved = await editor({ categories, itemId: "moving", categoryId: "target", categoryName: "Destino" }).save();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "target");
  assert.deepEqual(saved[0].menu_items.map(item => item.id), ["existing", "moving"]);
  assert.equal(saved[0].menu_items[1].sort_order, 100);
  assert.deepEqual(saved[0].menu_items[0], categories[1].menu_items[0]);
});

test("editing a published quote product keeps its order mode and existing metadata in the draft", async () => {
  const metadata = { order_mode: "quote", configuration_required: true, requires_human_confirmation: true };
  const categories = [{ id: "cakes", name: "Bolos", menu_items: [{ id: "quote-cake", name: "Bolo personalizado", sort_order: 10, metadata }] }];
  const saved = await editor({ categories, itemId: "quote-cake", categoryId: "cakes", categoryName: "Bolos" }).save();
  assert.deepEqual(saved[0].menu_items[0].metadata, metadata);
  assert.equal(saved[0].menu_items[0].name, "Nome atualizado");
});
