import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(fileURLToPath(new URL('../',import.meta.url))), origin='https://customization.ogritech.invalid';
const output=resolve(root,'outputs/menu-customization');await mkdir(output,{recursive:true});
const captureOnly=process.argv.includes('--capture-only');
const cake={id:'cake',name:'Bolo de corte — recheios tradicionais',description:'Escolha o tamanho, a massa e até dois recheios.',minimum_quantity:1,maximum_quantity:10,unit_label:'bolo',prices:[{id:'cake-small',label:'Redondo 1,5 kg',price:105},{id:'cake-large',label:'Redondo 2 kg',price:140}],option_groups:[{id:'dough',name:'Escolha a massa',selection_type:'single',minimum_selections:1,maximum_selections:1,free_selections:1,options:[{id:'chocolate',name:'Chocolate',price_delta:0,maximum_quantity:1},{id:'vanilla',name:'Baunilha',price_delta:0,maximum_quantity:1}]},{id:'filling',name:'Escolha até dois recheios tradicionais',selection_type:'multiple',minimum_selections:1,maximum_selections:2,free_selections:2,options:Array.from({length:18},(_,i)=>({id:`filling-${i}`,name:['Brigadeiro','Leite Ninho','Doce de leite','Prestígio'][i%4]+(i<4?'':` especial ${i+1}`),price_delta:0,maximum_quantity:1}))}]};
const extras={id:'extras',name:'Caixa personalizada',minimum_quantity:2,maximum_quantity:10,unit_label:'caixa',prices:[{id:'extras-price',label:'Caixa',price:20}],option_groups:[{id:'extras-group',name:'Adicionais',selection_type:'multiple',minimum_selections:0,maximum_selections:4,free_selections:1,options:[{id:'extra-a',name:'Doce tradicional',price_delta:2,maximum_quantity:3},{id:'extra-b',name:'Doce especial',price_delta:5,maximum_quantity:3},{id:'extra-c',name:'Decoração',price_delta:8,maximum_quantity:1}]}]};
const quote={...cake,id:'quote',name:'Bolo sob consulta',metadata:{order_mode:'quote'},prices:[{id:'quote-price',label:'Tamanho de referência',price:190}]};
const fixture={menu:{title:'Confeitaria de teste',offer_code:'encomendas',accepts_pickup:true,payment_methods:['pix'],visual_identity:{primary_color:'#080808',accent_color:'#d4af37'}},categories:[{id:'cakes',name:'Bolos personalizados',items:[cake,extras,quote]}],delivery_zones:[]};
const catalog=process.env.OGRITECH_MENU_CATALOG?JSON.parse((await readFile(process.env.OGRITECH_MENU_CATALOG,'utf8')).replace(/^\uFEFF/,'')):fixture;
const report={checks:[],errors:[],externalRequests:[]};
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'});
  await context.addInitScript(catalog=>{window.supabaseClient={rpc:async name=>{if(name==='public_menu')return{data:structuredClone(catalog)};if(name==='public_menu_assistant_status')return{data:{available:false}};throw Error('Unexpected call: '+name);}};},catalog);
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin){report.externalRequests.push(url.href);return route.abort();}
   const path=resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));
   if(!path.startsWith(root+sep))return route.fulfill({status:403});
   try{let body=await readFile(path);const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png','.ico':'image/x-icon'}[extname(path)]||'application/octet-stream';if(type==='text/html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>/https:|supabase-config/.test(tag)?'':tag));return route.fulfill({contentType:type,body});}catch{return route.fulfill({status:404});}
  });
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(origin+'/cardapio/?empresa='+(process.env.OGRITECH_MENU_CATALOG?'diniz-doces':'outra-confeitaria'),{waitUntil:'networkidle'});
  await page.locator('#content:not(.hidden)').waitFor();
  if(process.env.OGRITECH_MENU_CATALOG)await page.locator('.menu-item-image').first().evaluate(img=>img.decode());
  await page.screenshot({path:resolve(output,`${captureOnly?'before':'after'}-catalog-${width}.png`)});
  const item=catalog.categories.flatMap(c=>c.items).filter(i=>i.option_groups?.length).sort((a,b)=>Math.max(...b.option_groups.map(g=>g.options.length))-Math.max(...a.option_groups.map(g=>g.options.length)))[0];
  await page.locator(`[data-add-selected="${item.id}"]`).click();
  await page.locator('#configurator').screenshot({path:resolve(output,`${captureOnly?'before':'after'}-options-${width}.png`)});
  if(!captureOnly){
   assert.ok((await page.locator('#configuratorVariant').textContent()).includes('1'));
   await page.locator('#configuratorForm > button').click();
   assert.match(await page.locator('#configuratorMessage').textContent(),/Escolha/);
   const groups=page.locator('#configuratorGroups fieldset');
   const search=groups.nth(1).locator('[data-option-search]');
   await search.fill('nenhum-resultado-123');
   assert.equal(await groups.nth(1).locator('.configurator-option:visible').count(),0);
   assert.match(await groups.nth(1).locator('[data-search-status]').textContent(),/Nenhuma/);
   await search.fill(item.option_groups[1].options.at(-1).name);
   assert.ok(await groups.nth(1).locator('.configurator-option:visible').count()>0);
   await search.fill('');
   await groups.nth(0).locator('input[type=radio]').first().check();
   const fillings=groups.nth(1).locator('input[type=checkbox]');
   await fillings.nth(0).check();await fillings.nth(1).check();
   await search.fill('nenhum-resultado-123');
   assert.equal(await fillings.nth(0).isVisible(),true);
   assert.equal(await fillings.nth(1).isVisible(),true);
   await search.fill('');
   assert.equal(await fillings.nth(2).isDisabled(),true);
   assert.equal(await fillings.nth(0).isDisabled(),false);
   assert.match(await page.locator('#configuratorProgress').textContent(),/pronta/);
   await fillings.nth(0).uncheck();assert.equal(await fillings.nth(2).isDisabled(),false);await fillings.nth(2).check();
   await page.locator('#configurator').screenshot({path:resolve(output,`after-selected-${width}.png`)});
   const submit=await page.locator('#configuratorForm > button').boundingBox();assert.ok(submit.y>=0&&submit.y+submit.height<=900,'Add action remains visible');
   assert.equal(await page.locator('#configurator').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);
   await page.locator('#configuratorForm > button').click();
   assert.equal(await page.locator('#configurator').isVisible(),false);
   await page.click('#menuBagButton');assert.match(await page.locator('#cartItems').textContent(),new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   if(!process.env.OGRITECH_MENU_CATALOG){
    await page.click('#continueShoppingButton');await page.locator('[data-add-selected="extras"]').click();
    const quantities=page.locator('[data-option-quantity]');assert.equal(await quantities.first().isDisabled(),true);
    await page.locator('input[value="extra-a"]').check();await quantities.first().fill('4');
    assert.equal(await quantities.first().evaluate(el=>el.validity.valid),false);
    await page.locator('#configuratorForm > button').click();assert.equal(await page.locator('#configurator').isVisible(),true);
    await quantities.first().fill('2');
    assert.match(await page.locator('#configuratorTotal').textContent(),/44,00/);
    await page.locator('input[value="extra-b"]').check();await quantities.nth(1).fill('2');
    assert.match(await page.locator('#configuratorTotal').textContent(),/64,00/);
    assert.equal(await page.locator('input[value="extra-c"]').isDisabled(),true);
    await page.locator('input[value="extra-a"]').uncheck();assert.equal(await page.locator('input[value="extra-c"]').isDisabled(),false);
    await page.locator('#configuratorForm > button').click();await page.click('#menuBagButton');assert.match(await page.locator('#cartItems').textContent(),/Doce especial/);
    await page.click('#continueShoppingButton');await page.locator('[data-add-selected="quote"]').click();
    assert.equal(await page.locator('#configuratorTotalLabel').textContent(),'Valor de referência');
    await page.click('#closeConfigurator');
   }
  }
  report.checks.push(`${captureOnly?'capture':'limits, switching, sticky action, pricing and cart'} ${width}px`);await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
 await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
