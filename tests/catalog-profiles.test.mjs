import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const context={Intl};
for(const file of ['catalog-profiles.js','product-offers.js'])runInNewContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),context);
const profiles=context.OgritechCatalogProfiles,offers=context.OgritechOffers;
test('legacy food models retain their terminology and general business defaults to catalog',()=>{
 for(const template_code of ['pizzeria','snack-bar','restaurant','confectionery'])assert.equal(profiles.resolve({template_code}).code,'food');
 assert.equal(profiles.resolve({segment:'Confeitaria, bolos e doces'}).noun,'cardápio');
 assert.equal(profiles.resolve({segment:'Artesanato e personalizados'}).code,'crafts');
 assert.equal(profiles.resolve({segment:'Produtos em geral'}).code,'products');
 assert.equal(profiles.resolve({segment:'Outro negócio'}).noun,'catálogo');
 assert.equal(profiles.resolve({template_code:'crafts',segment:'Restaurante'}).code,'crafts');
 assert.equal(profiles.offerName(offers.offers.cardapio,profiles.profiles.food),'Ogritech Cardápio Essencial');
 assert.equal(profiles.offerName(offers.offers.cardapio,profiles.profiles.crafts),'Ogritech Catálogo Essencial');
 assert.equal(profiles.offerName(offers.forPlan({code:'foundation',name:'Encomendas'}),profiles.profiles.food),'Ogritech Encomendas');
});
test('profile changes never change the two commercial price definitions',()=>{
 for(const profile_code of ['food','crafts','products']){
  const selected=offers.forPlan({code:'catalogo-essencial',menu_offer_code:'cardapio',monthly_fee:9.90,annual_fee:99,profile_code});
  assert.equal(selected.orders,false);assert.equal(selected.monthlyCents,990);assert.equal(selected.annualCents,9900);
 }
 assert.equal(offers.offers.encomendas.monthlyCents,2990);assert.equal(offers.offers.encomendas.annualCents,29900);
});
test('unknown plan does not default to full access and old/custom contract prices remain distinct',()=>{
 assert.equal(offers.forPlan({code:'missing'}).orders,false);assert.equal(offers.forPlan(null).code,'unavailable');
 const legacy=offers.forPlan({code:'foundation',name:'Encomendas',monthly_fee:49.90,annual_fee:499});
 assert.equal(legacy.monthlyCents,4990);assert.equal(legacy.annualCents,49900);
 const custom=offers.forPlan({code:'personalizado',menu_offer_code:'cardapio',name:'Meu plano',monthly_fee:29.90,annual_fee:250});
 assert.equal(custom.orders,false);assert.equal(custom.monthlyCents,2990);assert.equal(custom.annualCents,25000);
});
