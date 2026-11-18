import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {installCatalogFixture} from '../tests/fixtures/catalog-business.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const origin='https://delivery.ogritech.invalid',out=resolve(root,'outputs/delivery-regions');
await mkdir(out,{recursive:true});
const plans=[{id:'essential',code:'catalogo-essencial',name:'Catálogo Essencial',offer_code:'cardapio',monthly_fee:9.9,annual_fee:99},{id:'complete',code:'catalogo-completo',name:'Catálogo Completo',offer_code:'encomendas',monthly_fee:29.9,annual_fee:299}];
const savedZones=[{code:'centro',name:'Centro — Cidade de teste',fee:5.5,minimum_order:0,active:true},{code:'sao-jose',name:'São José',fee:12.25,minimum_order:40,active:true},{code:'vizinhanca',name:'Vizinhança',fee:0,minimum_order:0,active:true}];
const checks=[],pageErrors=[],externalRequests=[];
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});

async function scene({width=390,theme='light',zones=savedZones,published=true,delivery=true,minimum=20,offer='encomendas',trial=false,role='owner'}={}){
 const context=await browser.newContext({viewport:{width,height:940},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(installCatalogFixture,{profile:'food',offer,trial,quote:false,plans,origin});
 await context.addInitScript(({zones,published,delivery,minimum,role})=>{
  window.currentRole=role;
  window.__deliveryState={zones,published,accepts_delivery:delivery,accepts_pickup:true,minimum_order:minimum};
  window.__deliveryWrites=[];
  const originalFrom=window.supabaseClient.from.bind(window.supabaseClient),originalRpc=window.supabaseClient.rpc.bind(window.supabaseClient);
  window.supabaseClient.from=table=>{
   if(table!=='online_menus')return originalFrom(table);
   const q={select(){return q;},eq(){return q;},maybeSingle(){return q;},then(done,fail){return Promise.resolve(originalFrom(table)).then(result=>({data:{...result.data,...window.__deliveryState,menu_delivery_zones:structuredClone(window.__deliveryState.zones)}})).then(done,fail);}};return q;
  };
  window.supabaseClient.rpc=async(name,args)=>{
   if(!['save_published_menu_settings','save_menu_onboarding_settings','save_menu_delivery_zones'].includes(name))return originalRpc(name,args);
   window.__deliveryWrites.push({name,args:structuredClone(args)});
   if(window.__deliveryRejectSave)return{error:{code:'NETWORK',message:'Falha de rede de teste'}};
   if(args.settings)Object.assign(window.__deliveryState,args.settings);
   if(args.zones)window.__deliveryState.zones=args.zones.map(zone=>({...zone,active:true}));
   return{data:{saved:true}};
  };
 },{zones,published,delivery,minimum,role});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin){externalRequests.push(url.origin);return route.fulfill({body:''});}
  const file=resolve(root,decodeURIComponent(url.pathname).replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep))return route.fulfill({status:403});
  try{
   let body=await readFile(file);const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';
   if(contentType==='text/html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>/src="(?:\/)?(?:catalog-profiles|commercial-admin|product-offers|panel-navigation|panel-theme)\.js/.test(tag)?tag:''));
   return route.fulfill({body,contentType});
  }catch{return route.fulfill({status:404});}
 });
 const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
 await page.goto(origin+'/painel/',{waitUntil:'networkidle'});
 await page.evaluate(async theme=>{
  document.documentElement.dataset.panelTheme=theme;
  document.documentElement.style.visibility='visible';document.getElementById('content').hidden=false;document.getElementById('panelLoadState').hidden=true;
  document.querySelectorAll('.view-section').forEach(node=>node.classList.add('hidden'));document.getElementById('menuView').classList.remove('hidden');
  await window.loadMenuAdmin();window.OgritechMenuWorkspace.select('settings');
 },theme);
 return{page,context};
}
const rows=page=>page.locator('.menu-delivery-zone-row');
async function savePublished(page){
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#menuSettingsForm').evaluate(form=>form.requestSubmit());
 await page.waitForFunction(()=>document.getElementById('menuMessage').textContent.includes('Configurações atualizadas'));
}
try{
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  const {page,context}=await scene({width,theme});
  assert.equal(await rows(page).count(),3);
  assert.deepEqual(await rows(page).locator('[data-zone-code]').evaluateAll(nodes=>nodes.map(node=>node.value)),savedZones.map(zone=>zone.code));
  assert.deepEqual(await rows(page).locator('[data-zone-fee]').evaluateAll(nodes=>nodes.map(node=>Number(node.value))),[5.5,12.25,0]);
  assert.match(await page.locator('#menuDeliveryPreviewTotal').textContent(),/55,50/);
  await page.locator('#menuDeliveryZoneSearch').fill('sao');
  assert.equal(await page.locator('.menu-delivery-zone-row:visible').count(),1);
  assert.equal(await page.evaluate(()=>OgritechMenuWorkspace.state().dirtySettings),false);
  await page.locator('#menuDeliveryZoneSearch').fill('');
  await page.locator('#menuDeliveryPreviewRegion').selectOption('sao-jose');
  await page.locator('#menuDeliveryPreviewSubtotal').fill('35,00');
  assert.match(await page.locator('#menuDeliveryPreviewTotal').textContent(),/47,25/);
  assert.match(await page.locator('#menuDeliveryPreviewNotice').textContent(),/faltam.*5,00/);
  await page.locator('#menuDeliveryPreviewSubtotal').fill('1.234,56');
  assert.match(await page.locator('#menuDeliveryPreviewTotal').textContent(),/1.246,81/);
  await page.locator('#menuDeliveryPreviewSubtotal').fill('abc');
  assert.match(await page.locator('#menuDeliveryPreviewNotice').textContent(),/valor de produtos válido/);
  assert.equal(await page.locator('#menuSettingsForm').evaluate(form=>form.checkValidity()),true);
  await page.locator('#menuDeliveryPreviewSubtotal').fill('35,00');
  assert.equal(await page.evaluate(()=>OgritechMenuWorkspace.state().dirtySettings),false);
  await page.locator('#menuDeliveryPreviewRegion').selectOption('vizinhanca');
  assert.equal(await page.locator('#menuDeliveryPreviewFee').textContent(),'Grátis');
  assert.match(await page.locator('#menuDeliveryPreviewTotal').textContent(),/35,00/);
  await rows(page).first().locator(':scope > summary').click();
  await rows(page).first().locator('[data-zone-fee]').fill('6.75');
  assert.equal(await page.evaluate(()=>OgritechMenuWorkspace.state().dirtySettings),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('#menuDeliveryZoneFields').screenshot({path:resolve(out,`regions-${theme}-${width}.png`)});
  await savePublished(page);
  const writes=await page.evaluate(()=>__deliveryWrites);
  assert.equal(writes.length,1);assert.equal(writes[0].name,'save_published_menu_settings');
  assert.equal(writes[0].args.zones[0].fee,6.75);assert.deepEqual(writes[0].args.zones.map(zone=>zone.code),savedZones.map(zone=>zone.code));
  assert.deepEqual(writes[0].args.zones.slice(1),savedZones.slice(1).map(({active,...zone})=>zone));
  assert.equal(await page.evaluate(()=>__deliveryState.published),true);
  assert.equal(await page.evaluate(()=>OgritechMenuWorkspace.state().workspace),'settings');
  checks.push(`existing regions preserved, search, simulation and published save ${theme} ${width}px`);await context.close();
 }
 {
  const {page,context}=await scene({zones:[],published:false,delivery:false,minimum:0});
  await page.locator('#menuAcceptsDelivery').check();
  await page.locator('#menuAddDeliveryZone').click();
  const row=rows(page).first();assert.equal(await row.locator('[data-zone-fee]').inputValue(),'');
  await row.locator('[data-zone-name]').fill('Região nova');await row.locator('[data-zone-fee]').fill('8.25');
  await row.locator('[data-zone-fee-mode]').selectOption('free');assert.equal(await row.locator('[data-zone-fee]').inputValue(),'0');
  await row.locator('[data-zone-fee-mode]').selectOption('paid');assert.equal(await row.locator('[data-zone-fee]').inputValue(),'8.25');
  await row.locator('[data-zone-fee-mode]').selectOption('free');
  await page.locator('#menuSettingsForm').evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>__deliveryWrites.length===2&&document.getElementById('menuMessage').textContent.includes('Configuração salva'));
  const writes=await page.evaluate(()=>__deliveryWrites);assert.equal(writes[1].name,'save_menu_delivery_zones');assert.equal(writes[1].args.zones[0].fee,0);assert.equal(writes[1].args.zones[0].name,'Região nova');
  checks.push('future establishment: blank fee, explicit free delivery and saved setup');await context.close();
 }
 {
  const {page,context}=await scene();await rows(page).nth(1).locator(':scope > summary').click();
  await rows(page).first().locator(':scope > summary').click();
  await rows(page).first().locator('[data-zone-fee]').fill('-1');
  await page.locator('#menuSettingsForm').evaluate(form=>form.requestSubmit());
  assert.equal(await page.evaluate(()=>__deliveryWrites.length),0);
  assert.equal(await rows(page).first().getAttribute('open'),'');
  await rows(page).first().locator('[data-zone-fee]').fill('5.5');
  await rows(page).nth(1).locator('[data-zone-name]').fill('Centro — Cidade de teste');
  await page.locator('#menuSettingsForm').evaluate(form=>form.requestSubmit());
  assert.match(await page.locator('#menuMessage').textContent(),/mesmo nome/);assert.equal(await page.evaluate(()=>__deliveryWrites.length),0);
  await rows(page).nth(1).locator('[data-zone-name]').fill('São José');
  await rows(page).nth(1).locator('[data-zone-minimum]').fill('30');
  await page.locator('#menuDeliveryPreviewRegion').selectOption('sao-jose');await page.locator('#menuDeliveryPreviewSubtotal').fill('25');
  assert.match(await page.locator('#menuDeliveryPreviewNotice').textContent(),/faltam.*5,00/);
  await page.locator('#menuMinimum').fill('40');assert.match(await page.locator('#menuDeliveryPreviewNotice').textContent(),/faltam.*15,00/);
  await page.evaluate(()=>{window.__deliveryRejectSave=true;});page.once('dialog',dialog=>dialog.accept());await page.locator('#menuSettingsForm').evaluate(form=>form.requestSubmit());
  await page.waitForFunction(()=>document.getElementById('menuMessage').classList.contains('error')||!OgritechMenuWorkspace.state().busy);
  assert.equal(await page.evaluate(()=>__deliveryState.zones[1].minimum_order),40);
  assert.equal(await rows(page).nth(1).locator('[data-zone-minimum]').inputValue(),'30');
  checks.push('duplicate names rejected; minimum is not a fee; failed save preserves stored values and editing');await context.close();
 }
 {
  const zones=Array.from({length:50},(_,index)=>({code:`regiao-${index}`,name:`Região ${index+1}`,fee:1.25+index,minimum_order:0,active:true}));
  const {page,context}=await scene({zones});assert.equal(await rows(page).count(),50);assert.equal(await page.locator('#menuAddDeliveryZone').isDisabled(),true);
  await page.locator('#menuDeliveryZoneSearch').fill('Região 50');assert.equal(await page.locator('.menu-delivery-zone-row:visible').count(),1);
  await rows(page).last().locator(':scope > summary').click();await rows(page).last().locator('[data-remove-zone]').click();
  assert.equal(await rows(page).count(),49);assert.equal(await page.locator('#menuAddDeliveryZone').isEnabled(),true);assert.equal(await page.evaluate(()=>__deliveryWrites.length),0);
  await page.locator('#menuAcceptsDelivery').uncheck();await savePublished(page);
  const write=await page.evaluate(()=>__deliveryWrites.at(-1));assert.equal(write.args.settings.accepts_delivery,false);assert.deepEqual(write.args.zones,[]);assert.equal(write.args.settings.accepts_pickup,true);
  checks.push('fifty existing regions, filtered editing, removal and pickup-only saving');await context.close();
 }
 for(const trial of [false,true]){
  const {page,context}=await scene({offer:'cardapio',trial});assert.equal(await page.locator('#menuDeliveryZoneFields').isVisible(),trial);checks.push(`existing entitlement preserved, Complete trial=${trial}`);await context.close();
 }
 {
  const {page,context}=await scene({role:'employee'});assert.equal(await page.locator('#menuSettingsForm').isVisible(),false);assert.equal(await page.evaluate(()=>__deliveryWrites.length),0);checks.push('employee has no delivery-settings editor');await context.close();
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);
 await writeFile(resolve(out,'results.json'),JSON.stringify({passed:true,checks,pageErrors,externalRequests,productionWrites:0},null,2));
 console.log(JSON.stringify({passed:true,checks:checks.length,pageErrors,externalRequests,productionWrites:0}));
}catch(error){await writeFile(resolve(out,'failure.json'),JSON.stringify({error:error.stack,checks,pageErrors,externalRequests},null,2));throw error;}finally{await browser.close();}
