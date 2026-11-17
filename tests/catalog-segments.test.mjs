import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=name=>readFile(new URL('../'+name,import.meta.url),'utf8');
const context={};vm.runInNewContext(await read('catalog-profiles.js'),context);
const api=context.OgritechCatalogProfiles;
test('all segments have stable unique ids and an explicit supported profile/template',()=>{
 assert.equal(api.segments.length,19);
 assert.equal(new Set(api.segments.map(entry=>entry.code)).size,19);
 for(const entry of api.segments){
  assert.match(entry.code,/^[a-z][a-z-]*$/);
  assert.equal(api.segment(entry.label).code,entry.code);
  assert.equal(api.resolve(entry.code).code,entry.profile);
  assert.ok(['pizzeria','snack-bar','restaurant','confectionery','crafts','products'].includes(entry.template));
 }
});
test('new classification recognizes legacy labels without replacing persisted values',()=>{
 assert.equal(api.segment('Confeitaria').code,'confectionery');
 assert.equal(api.segment('Artesanato e personalizados').code,'crafts');
 assert.equal(api.segment('Produtos em geral').code,'products');
 assert.equal(api.label('collectibles'),'Colecionáveis e hobbies');
 assert.equal(api.label('Atividade antiga personalizada'),'Atividade antiga personalizada');
 assert.equal(api.resolve({template_code:'confectionery',segment:'collectibles'}).code,'food');
});
test('terminology preserves order semantics and uses the correct grammatical gender',()=>{
 assert.equal(api.textFor('Ver cardápio público. Seu cardápio publicado.',api.profiles.products),'Ver vitrine pública. Sua vitrine publicada.');
 assert.equal(api.textFor('QR Code do cardápio. Buscar no cardápio.',api.profiles.crafts),'QR Code do catálogo. Buscar no catálogo.');
 for(const profile of Object.values(api.profiles))assert.equal(api.textFor('Adicionar ao pedido',profile),'Adicionar ao pedido');
});
test('the migration snapshot uses the same ids, labels, aliases and mapping as the UI',async()=>{
 const sql=await read('supabase/migrations/20261117201510_catalog_business_segments.sql');
 const snapshot=JSON.parse(sql.match(/jsonb_array_elements\('(\[.*?\])'::jsonb\)/)[1]);
 assert.deepEqual(snapshot,JSON.parse(JSON.stringify(api.segments)));
 assert.match(sql,/auth.uid\(\) is null or not public.is_business_manager/);
 assert.match(sql,/revoke all on function public.set_catalog_business_segment/);
 assert.doesNotMatch(sql,/update public\.platform_subscriptions|update private\.billing_signups|delete from/i);
});
test('marketing segment links preselect a known category without changing public routes',async()=>{
 const html=await read('index.html');
 const links=[...html.matchAll(/href="\/criar-cardapio\/\?segmento=([a-z-]+)"/g)].map(match=>match[1]);
 assert.equal(links.length,15);
 for(const code of links)assert.ok(api.segment(code));
 assert.match(html,/>Alimentação<\/button>/);assert.match(html,/>Artesanato<\/button>/);assert.match(html,/>Vestuário<\/button>/);
 assert.match(html,/ilustrativas/);
});
