import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('indexable commercial pages have unique menu-focused metadata and no retired offers',async()=>{
 const titles=new Set(),descriptions=new Set();
 for(const [file,path] of [['index.html','/'],['cardapio-digital/index.html','/cardapio-digital/'],['contato/index.html','/contato/']]){
  const page=await read(file);const title=page.match(/<title>([^<]+)<\/title>/)?.[1];const description=page.match(/name="description" content="([^"]+)"/)?.[1];
  assert.match(title,/cardápio digital/i);assert.ok(description);assert.ok(!titles.has(title));assert.ok(!descriptions.has(description));titles.add(title);descriptions.add(description);
  assert.equal((page.match(/name="description"/g)||[]).length,1);assert.ok(page.includes(`rel="canonical" href="https://ogritech.com.br${path}"`));assert.ok(page.includes(`property="og:url" content="https://ogritech.com.br${path}"`));
  assert.doesNotMatch(page,/barbearia|SaaS para|Ogritech Agenda|Ogritech Páginas|Ogritech Orçamentos|Reduzir faltas|Agilizar orçamentos/i);
 }
});
test('crawlable private and retired pages remain noindex and outside sitemap',async()=>{
 const sitemap=await read('sitemap.xml');const robots=await read('robots.txt');
 for(const file of ['admin.html','login.html','login/index.html','painel/index.html','cliente.html','agenda-online/index.html','agendar/index.html','pagina/index.html','proposta/index.html']){
  assert.match(await read(file),/name="robots" content="noindex/);assert.ok(!sitemap.includes(`<loc>https://ogritech.com.br/${file.replace(/index.html$/,'')}</loc>`));
 }
 assert.doesNotMatch(robots,/Disallow:\s*\/(?:admin|cliente)/);assert.match(sitemap,/https:\/\/ogritech.com.br\/criar-cardapio\//);
});
test('structured product data is valid, matches the visible price and has no fabricated ratings',async()=>{
 const html=await read('index.html');const json=JSON.parse(html.match(/<script type="application\/ld\+json">([^]*?)<\/script>/)[1]);
 const app=json['@graph'].find(x=>x['@type']==='SoftwareApplication');assert.equal(app.name,'Ogritech Cardápio');assert.equal(app.offers.price,'49.90');assert.match(html,/R\$ 49,90/);assert.equal(app.offers.priceCurrency,'BRL');assert.ok(!app.aggregateRating);assert.ok(!app.review);
});
