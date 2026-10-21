import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../menu-pricing.js', import.meta.url), 'utf8'), context);
const {unitPrice} = context.OgritechMenuPricing;
test('included options and repeated extras match server pricing regardless of selection order', () => {
  const groups = [{free_selections:2,options:[{id:'b',price_delta:5},{id:'a',price_delta:2}]}];
  assert.equal(unitPrice(10,[{menu_option_id:'b',quantity:2},{menu_option_id:'a',quantity:1}],groups),15);
  assert.equal(unitPrice(10,[{menu_option_id:'a',quantity:1},{menu_option_id:'b',quantity:2}],groups),15);
  assert.equal(unitPrice(10,[{menu_option_id:'b',quantity:3}],groups),15);
});
test('included allowance is isolated by group and monetary totals are rounded', () => {
  assert.equal(unitPrice(10,[{menu_option_id:'a',quantity:3},{menu_option_id:'b',quantity:1}],
    [{free_selections:1,options:[{id:'a',price_delta:.1}]},{free_selections:1,options:[{id:'b',price_delta:5}]}]),10.2);
});
