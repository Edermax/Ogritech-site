import {installCatalogFixture} from '../tests/fixtures/catalog-business.mjs';
import {installStockFixture} from '../tests/fixtures/catalog-stock.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),origin='https://stock.ogritech.invalid',out=resolve(root,'outputs/catalog-review/stock-browser');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
const plans=[{id:'11111111-1111-4111-8111-111111111111',code:'catalogo-essencial',name:'Catálogo Essencial',offer_code:'cardapio',monthly_fee:9.90,annual_fee:99},{id:'22222222-2222-4222-8222-222222222222',code:'catalogo-completo',name:'Catálogo Completo',offer_code:'encomendas',monthly_fee:29.90,annual_fee:299}];
const checks=[],errors=[];
async function scene({width=390,offer='encomendas',trial=false,panel=true}={}){
 const context=await browser.newContext({viewport:{width,height:940},serviceWorkers:'block'});
 await context.addInitScript(installCatalogFixture,{profile:'products',offer,trial,plans,origin});
 await context.addInitScript(installStockFixture);
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.fulfill({body:''});
  const file=resolve(root,decodeURIComponent(url.pathname).replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))return route.fulfill({status:403});
  try{let body=await readFile(file);const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'}[extname(file)]||'application/octet-stream';
   if(type==='text/html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>panel?(/src="(?:\/)?(?:catalog-profiles|catalog-admin|catalog-inventory|commercial-admin|product-offers|menu-branding|menu-branding-admin|panel-navigation)\.js/.test(tag)?tag:''):(/src="[^\"]*(?:https:|supabase-config|pwa\.js|assistant-widget)/.test(tag)?'':tag)));
   return route.fulfill({contentType:type,body});
  }catch{return route.fulfill({status:404});}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+(panel?'/painel/':'/cardapio/?empresa=fixture'),{waitUntil:'networkidle'});
 if(panel)await page.evaluate(async()=>{document.documentElement.style.visibility='visible';document.getElementById('content').hidden=false;document.getElementById('panelLoadState').hidden=true;document.querySelectorAll('.view-section').forEach(el=>el.classList.add('hidden'));document.getElementById('menuView').classList.remove('hidden');await window.loadMenuAdmin();window.OgritechMenuWorkspace.select('catalog');});
 return{page,context};
}
try{
 for(const width of [390,1440]){
  const{page,context}=await scene({width});
  await page.click('[data-stock-item]');
  await page.fill('[data-stock-form] [name=quantity]','8');await page.fill('[data-stock-form] [name=reason]','Saldo inicial conferido');
  await page.click('[data-stock-form] button[type=submit]');await page.locator('[data-stock-status]').filter({hasText:'Movimentação salva'}).waitFor();
  assert.match(await page.locator('[data-stock-balance]').textContent(),/8 unidades/);
  await page.selectOption('[data-stock-form] [name=operation]','entry');await page.fill('[data-stock-form] [name=quantity]','3');await page.fill('[data-stock-form] [name=reason]','Reposição do fornecedor');
  await page.evaluate(()=>window.__stockLoseResponse=true);await page.click('[data-stock-form] button[type=submit]');await page.locator('[data-stock-status]').filter({hasText:'Não foi possível'}).waitFor();
  await page.click('[data-stock-form] button[type=submit]');await page.locator('[data-stock-status]').filter({hasText:'Movimentação salva'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__stock.quantity),11);assert.equal(await page.locator('.stock-movement').count(),2);
  const retries=await page.evaluate(()=>window.__calls.filter(c=>c.name==='catalog_stock_command'));assert.equal(retries.at(-1).args.request_id,retries.at(-2).args.request_id);
  await page.selectOption('[data-stock-form] [name=operation]','adjust');await page.fill('[data-stock-form] [name=quantity]','7');await page.fill('[data-stock-form] [name=reason]','Contagem física');
  await page.evaluate(()=>{window.__stock.version++;window.__stock.quantity=9;});await page.click('[data-stock-form] button[type=submit]');await page.locator('[data-stock-status]').filter({hasText:'O estoque mudou'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__stock.quantity),9);await page.click('[data-stock-refresh]');await page.locator('[data-stock-balance]').filter({hasText:'9 unidades'}).waitFor();
  assert.equal(await page.evaluate(()=>document.getElementById('catalogStockDialog').scrollWidth>document.getElementById('catalogStockDialog').clientWidth+1),false);
  await page.screenshot({path:resolve(out,`stock-${width}.png`)});checks.push(`opening, entry, lost response, stale balance and responsive dialog ${width}px`);await context.close();
 }
 for(const trial of [false,true]){
  const{page,context}=await scene({offer:'cardapio',trial});
  assert.equal(await page.locator('[data-stock-item]').count(),trial?1:0);
  if(!trial)assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.name==='catalog_inventory').length),0);
  checks.push(trial?'Complete trial access':'Essential has no stock RPC or controls');await context.close();
 }
 {
  const{page,context}=await scene();
  await page.evaluate(()=>window.__stockReadFailures=1);await page.click('[data-stock-item]');
  await page.locator('[data-stock-status]').filter({hasText:'Não foi possível'}).waitFor();
  assert.equal(await page.locator('[data-stock-retry]').count(),1,'failed inventory read must offer recovery');
  await page.click('[data-stock-retry]');await page.locator('[data-stock-form]').waitFor();
  await page.fill('[data-stock-form] [name=quantity]','4');await page.fill('[data-stock-form] [name=reason]','Saldo contado');await page.evaluate(()=>window.__stockReadFailuresAfterCommand=1);
  await page.click('[data-stock-form] button[type=submit]');
  await page.locator('[data-stock-status]').filter({hasText:'saldo atualizado'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__stock.quantity),4);
  await page.click('[data-stock-retry]');await page.locator('[data-stock-balance]').filter({hasText:'4 unidades'}).waitFor();
  assert.equal(await page.evaluate(()=>window.__stockMovements.length),1,'retrying a read never repeats the saved movement');
  await page.click('[data-stock-close]');await page.evaluate(async()=>{window.__stockReadFailures=1;await window.loadMenuAdmin();window.OgritechMenuWorkspace.select('catalog');});
  await page.click('[data-stock-summary-retry]');await page.locator('[data-stock-item]').waitFor();
  assert.equal(await page.evaluate(()=>window.__stockMovements.length),1);
  checks.push('read recovery before and after a successful stock mutation');await context.close();
 }
 {
  const{page,context}=await scene();
  await page.evaluate(()=>{window.__stockMovements=Array.from({length:55},(_,i)=>({id:55-i,item_name:'Cardápio de Memórias <img src=x onerror=alert(1)>',kind:'entry',delta:1,quantity_before:54-i,quantity_after:55-i,reason:'Motivo <script>não executar</script>',created_at:'2026-11-17T12:00:00Z'}));});
  await page.click('[data-stock-all]');await page.locator('.stock-movement').first().waitFor();
  assert.equal(await page.locator('.stock-movement').count(),50);await page.click('[data-stock-more]');
  await page.waitForFunction(()=>document.querySelectorAll('.stock-movement').length===55);
  assert.equal(await page.locator('[data-stock-more]').isVisible(),false);
  assert.equal(await page.locator('.stock-movement img,.stock-movement script').count(),0);
  assert.match(await page.locator('.stock-movement').first().textContent(),/Cardápio de Memórias/);
  await page.click('[data-stock-refresh]');await page.locator('[data-stock-more]').waitFor({state:'visible'});
  await page.evaluate(()=>{const rpc=window.supabaseClient.rpc;window.supabaseClient.rpc=(name,args)=>name==='catalog_inventory'&&args.before_id?new Promise(resolve=>window.__finishOldHistory=resolve):rpc(name,args);});
  await page.click('[data-stock-more]');await page.waitForFunction(()=>typeof window.__finishOldHistory==='function');
  await page.click('[data-stock-refresh]');await page.locator('.stock-movement').first().waitFor();
  await page.evaluate(()=>window.__finishOldHistory({error:{code:'NETWORK'}}));
  assert.equal(await page.locator('[data-stock-status]').textContent(),'','late history failure cannot overwrite a refreshed dialog');
  checks.push('history pagination and safe preservation of merchant text');await context.close();
 }
 {
  const{page,context}=await scene({panel:false});await page.addInitScript(()=>{window.__stockSoldOut=true;window.__stockAssistantAvailable=true;});await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('[data-add-selected]').isDisabled(),true);assert.match(await page.locator('[data-add-selected]').textContent(),/Esgotado/);
  await page.click('#menuAssistantToggle');await page.fill('#menuAssistantInput','Mostrar produtos');await page.locator('#menuAssistantForm button[type=submit]').click();
  await page.locator('.assistant-suggestion-action').waitFor();assert.equal(await page.locator('.assistant-suggestion-action').isDisabled(),true);assert.match(await page.locator('.assistant-suggestion-action').textContent(),/Esgotado/);
  checks.push('sold-out item is disabled in catalog and assistant suggestions');await context.close();
 }
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'results.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
