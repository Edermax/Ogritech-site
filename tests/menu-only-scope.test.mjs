import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('rotas encerradas não carregam interfaces operacionais ou formulários antigos',async()=>{
 for(const path of ['agenda-online/index.html','contratar/index.html','agendar/index.html','pagina/index.html','proposta/index.html','cliente.html']){
  const page=await read(path);assert.match(page,/noindex,nofollow/);assert.match(page,/http-equiv="refresh" content="0;url=\//);assert.doesNotMatch(page,/<script|<form/);
 }
});
test('contato, assistente, sitemap e navegação comercial oferecem somente Cardápio',async()=>{
 for(const path of ['index.html','contato/index.html','assistant-widget.js','sitemap.xml'])assert.doesNotMatch(await read(path),/Ogritech Agenda|Ogritech Páginas|Ogritech Orçamentos|agenda-online/);
 const panel=await read('painel/index.html');assert.doesNotMatch(panel,/data-section="(?:agenda|landing|orcamentos|financeiro|profissionais|servicos)"/);
 assert.match(await read('subscription-admin.js'),/filter\(\(product\) => product.code === "menu"\)/);
});
test('retirada no servidor preserva registros e mantém endpoints do Cardápio fora da revogação',async()=>{
 const sql=await read('scripts/sql/retire-non-menu-products.sql');assert.match(sql,/set active=false/);assert.match(sql,/revoke execute/);assert.doesNotMatch(sql,/delete from|drop table|truncate|public_menu|public_create_menu_order|public_get_menu_order/i);
});
