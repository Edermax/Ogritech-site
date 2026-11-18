import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {installCatalogFixture} from '../tests/fixtures/catalog-business.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),origin='https://quantity.ogritech.invalid',out=resolve(root,'outputs/quantity-review');
await mkdir(out,{recursive:true});
const plans=[{id:'essential',offer_code:'cardapio',name:'Essencial'},{id:'complete',offer_code:'encomendas',name:'Completo'}];
const rule={step:25,distribution_step:25,options:['Chocolate','Chocolate branco','Morango','Banana']};
const checks=[],pageErrors=[],externalRequests=[],assetErrors=[];
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
async function scene({width=390,panel=false,theme='light',published=false,configured=true,options=rule.options,offer='encomendas',role='owner',extras=false}={}){
 const context=await browser.newContext({viewport:{width,height:940},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(installCatalogFixture,{profile:'food',offer,trial:false,quote:false,plans,origin});
 await context.addInitScript(({rule,configured,options,published,role,extras})=>{
  window.currentRole=role;window.__quantityState={id:'item-fixture',name:'Pirulito artesanal',description:'Sabores do mesmo preço',minimum_quantity:configured?100:1,maximum_quantity:500,metadata:{legacy_note:'preservar',...(configured?{quantity_rules:{...rule,options}}:{})},prices:[{id:'price-fixture',label:'Unidade',price:1.5}],option_groups:extras?[{id:'packaging',name:'Embalagem',selection_type:'single',minimum_selections:0,maximum_selections:1,free_selections:0,options:[{id:'gift',name:'Embalagem presente',price_delta:.5,maximum_quantity:1}]}]:[]};
  window.__published=published;window.__quantityWrites=[];
  const originalRpc=window.supabaseClient.rpc.bind(window.supabaseClient),originalFrom=window.supabaseClient.from.bind(window.supabaseClient);
  const customize=data=>({...data,published:window.__published,menu_categories:[{id:'category-fixture',name:'Doces',active:true,menu_items:[{...window.__quantityState,active:true,available:true,unit_label:'unidade',item_type:'quantity',menu_item_prices:window.__quantityState.prices.map(p=>({...p,active:true})),menu_item_option_groups:[]}]}]});
  window.supabaseClient.from=table=>{
   if(table!=='online_menus')return originalFrom(table);
   const q={select(){return q;},eq(){return q;},maybeSingle(){return q;},then(done,fail){return Promise.resolve(originalFrom(table)).then(result=>({...result,data:customize(result.data)})).then(done,fail);}};return q;
  };
  window.supabaseClient.rpc=async(name,args)=>{
   if(name==='public_menu'){const result=await originalRpc(name,args);result.data.categories[0].items=[{...window.__quantityState,unit_label:'unidade',item_type:'quantity',stock_available:true}];return result;}
   if(['save_menu_catalog_item','save_menu_catalog_draft','publish_menu_catalog_draft','public_create_menu_order_v2','public_create_menu_order','public_create_catalog_order'].includes(name)){
    window.__quantityWrites.push({name,args:structuredClone(args)});
    if(window.__quantityReject)return{error:{code:'22023',message:'Falha de teste; tente novamente'}};
    if(name==='save_menu_catalog_item')window.__quantityState={...window.__quantityState,...args.payload,metadata:{...window.__quantityState.metadata,...args.payload.metadata}};
    if(name==='save_menu_catalog_draft')window.__draft=structuredClone(args.draft_payload);
    if(name==='publish_menu_catalog_draft'){const item=window.__draft.categories[0].menu_items[0];window.__quantityState={...window.__quantityState,...item,prices:item.menu_item_prices};}
    if(name.startsWith('public_create_')){const line=args.supplied_items[0],subtotal=line.quantity*1.5;return{data:{reference:'ABCDEF12',token:'fixture-token',order_number:1,subtotal,delivery_fee:0,total_amount:subtotal}};}
    return{data:{id:'item-fixture',saved:true,published:window.__published}};
   }
   if(name==='menu_catalog_draft_status')return{data:{has_draft:false}};
   if(name==='public_get_menu_order')return{data:{reference:'ABCDEF12',order_number:1,customer_name:'Cliente Teste',customer_phone:'11999999999',menu_title:'Loja Teste',menu_slug:'fixture',whatsapp_phone:'5511999999999',fulfillment_type:'pickup',status:'received',payment_status:'pending',subtotal:150,delivery_fee:0,total_amount:150,items:[{name:'Pirulito artesanal',label:'Unidade',quantity:100,line_total:150,options:rule.options.map(name=>({name,quantity:25,group_name:'Distribuição'}))}]}};
   return originalRpc(name,args);
  };
 },{rule,configured,options,published,role,extras});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){externalRequests.push(url.origin);return route.fulfill({body:''});}
  const file=resolve(root,decodeURIComponent(url.pathname).replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep))return route.fulfill({status:403});
  try{let body=await readFile(file);const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';
   if(contentType==='text/html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>panel?(/src="(?:\/)?(?:catalog-profiles|commercial-admin|product-offers|panel-navigation|panel-theme|menu-quantity|menu-quantity-admin)\.js/.test(tag)?tag:''):(/src="[^\"]*(?:https:|supabase-config|pwa\.js|assistant-widget)/.test(tag)?'':tag)));
   return route.fulfill({body,contentType});
  }catch(error){assetErrors.push({path:url.pathname,message:error.message});return route.fulfill({status:404});}
 });
 const page=await context.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
 if(panel){
  await page.goto(origin+'/painel/',{waitUntil:'networkidle'});await page.waitForFunction(()=>typeof window.loadMenuAdmin==='function',{timeout:10000});
  await page.evaluate(async theme=>{document.documentElement.dataset.panelTheme=theme;document.documentElement.style.visibility='visible';document.getElementById('content').hidden=false;document.getElementById('panelLoadState').hidden=true;document.querySelectorAll('.view-section').forEach(node=>node.classList.add('hidden'));document.getElementById('menuView').classList.remove('hidden');await window.loadMenuAdmin();OgritechMenuWorkspace.select('catalog');},theme);
 }else await page.goto(origin+'/cardapio/?empresa=fixture',{waitUntil:'networkidle'});
 return{page,context};
}
async function openProduct(page){await page.locator('[data-edit-menu-item]').first().click();}
async function openDistribution(page){await page.locator('[data-add-selected]').click();await page.locator('#quantityDistribution').waitFor();}
async function submitComposition(page){await page.locator('#configuratorForm button[type=submit]').click();}
try{
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  const {page,context}=await scene({panel:true,width,theme});await openProduct(page);
  assert.equal(await page.locator('#menuItemMinimum').inputValue(),'100');assert.equal(await page.locator('#menuQuantityStep').inputValue(),'25');
  assert.equal(await page.locator('[data-quantity-option]').count(),4);assert.match(await page.locator('#menuQuantityPreview').textContent(),/100, 125, 150/);
  assert.equal(await page.locator('#menuItemForm').evaluate(form=>form.checkValidity()),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('#menuQuantitySection').screenshot({path:resolve(out,`panel-${theme}-${width}.png`)});
  await page.locator('#menuItemForm').evaluate(form=>form.requestSubmit());await page.waitForFunction(()=>__quantityWrites.some(c=>c.name==='save_menu_catalog_item'));
  const write=await page.evaluate(()=>__quantityWrites.find(c=>c.name==='save_menu_catalog_item'));
  assert.deepEqual(write.args.payload.metadata.quantity_rules,rule);assert.equal(write.args.payload.minimum_quantity,100);
  checks.push(`existing lot configuration, persistence, theme and layout ${theme} ${width}px`);await context.close();
 }
 for(const width of [320,390,768,1440]){
  const {page,context}=await scene({width});await openDistribution(page);
  assert.match(await page.locator('#distributionNotice').textContent(),/Faltam distribuir 100/);await submitComposition(page);assert.equal(await page.locator('#cartCount').textContent(),'0');
  await page.locator('[data-distribute-plus]').nth(0).click();assert.match(await page.locator('#distributionCount').textContent(),/25 de 100/);
  await page.locator('[data-distribute-equally]').click();assert.deepEqual(await page.locator('[data-distribution-quantity]').evaluateAll(nodes=>nodes.map(n=>Number(n.value))),[25,25,25,25]);
  assert.match(await page.locator('#configuratorTotal').textContent(),/150,00/);assert.equal(await page.evaluate(()=>document.getElementById('quantityDistribution').scrollWidth>document.getElementById('quantityDistribution').clientWidth+1),false);
  await page.locator('#configurator').screenshot({path:resolve(out,`public-${width}.png`)});
  await submitComposition(page);await page.locator('#checkoutButton').click();assert.match(await page.locator('#cartItems').textContent(),/25 × Chocolate branco/);
  await page.locator('[data-cart-edit]').click();await page.locator('#distributionQuantity').fill('125');assert.match(await page.locator('#distributionNotice').textContent(),/Faltam distribuir 25/);
  await page.locator('[data-distribute-plus]').first().click();assert.match(await page.locator('#configuratorTotal').textContent(),/187,50/);
  await submitComposition(page);assert.match(await page.locator('#cartItems').textContent(),/50 × Chocolate/);assert.match(await page.locator('#cartItems').textContent(),/125 unidades/);
  checks.push(`four flavors, incomplete prevention, total price and cart editing ${width}px`);await context.close();
 }
 {
  const {page,context}=await scene({offer:'cardapio'});await openDistribution(page);await page.locator('[data-distribute-equally]').click();await submitComposition(page);await page.locator('#checkoutButton').click();await page.locator('#whatsappCustomerName').fill('Cliente Teste');await page.locator('#whatsappCustomerPhone').fill('11999999999');
  const url=new URL(await page.locator('#whatsappSelectionLink').getAttribute('href'));assert.match(url.searchParams.get('text'),/Distribuição: 25 × Chocolate/);assert.match(url.searchParams.get('text'),/150,00/);assert.equal(await page.evaluate(()=>__quantityWrites.length),0);
  checks.push('Essential WhatsApp selection includes absolute quantities without creating an order');await context.close();
 }
 {
  const {page,context}=await scene();await openDistribution(page);await page.locator('[data-distribute-equally]').click();await submitComposition(page);await page.locator('#checkoutButton').click();
  await page.locator('#orderForm [name=name]').fill('Cliente Teste');await page.locator('#orderForm [name=phone]').fill('11999999999');await page.locator('#orderForm [name=privacy]').check();await page.locator('#orderSubmitButton').click();await page.locator('#orderSuccess').waitFor({state:'visible'});
  const order=await page.evaluate(()=>__quantityWrites.find(c=>c.name==='public_create_menu_order_v2'));assert.equal(order.args.supplied_items[0].quantity,100);assert.deepEqual(order.args.supplied_items[0].distribution,rule.options.map(name=>({name,quantity:25})));assert.equal(order.args.supplied_items[0].selections.length,0);
  const message=new URL(await page.locator('#orderSuccess .order-whatsapp-action').getAttribute('href')).searchParams.get('text');assert.match(message,/25 × Morango/);
  await page.goto(origin+'/pedido/?referencia=ABCDEF12&token=fixture-token',{waitUntil:'networkidle'});assert.match(await page.locator('#order').textContent(),/25 × Chocolate branco/);
  const trackingMessage=new URL(await page.locator('.order-whatsapp').getAttribute('href')).searchParams.get('text');assert.match(trackingMessage,/25 × Banana/);
  checks.push('Complete checkout payload, confirmation and tracking preserve the distribution');await context.close();
 }
 {
  const {page,context}=await scene({panel:true,configured:false,published:true});await openProduct(page);await page.locator('#menuItemMinimum').fill('100');await page.locator('#menuQuantityRulesEnabled').check();await page.locator('#menuQuantityDistributionEnabled').check();
  await page.locator('.quantity-bulk summary').click();await page.locator('#menuQuantityBulk').fill('Chocolate\nChocolate branco\nMorango\nBanana\nChocolate');await page.locator('#menuQuantityImportOptions').click();assert.equal(await page.locator('[data-quantity-option]').count(),4);
  await page.locator('#menuItemForm').evaluate(form=>form.requestSubmit());await page.waitForFunction(()=>__quantityWrites.some(c=>c.name==='publish_menu_catalog_draft'));
  const draft=await page.evaluate(()=>__quantityWrites.find(c=>c.name==='save_menu_catalog_draft').args.draft_payload.categories[0].menu_items[0]);assert.deepEqual(draft.metadata.quantity_rules,rule);assert.equal(draft.metadata.legacy_note,'preservar');assert.equal(await page.evaluate(()=>__published),true);
  checks.push('new configuration on a published product, bulk import and legacy metadata preserved');await context.close();
 }
 {
  const {page,context}=await scene({panel:true});await openProduct(page);await page.locator('#menuQuantityDistributionStep').fill('10');assert.equal(await page.locator('#menuItemForm').evaluate(form=>form.checkValidity()),false);
  await page.locator('#menuQuantityDistributionStep').fill('25');await page.locator('[data-quantity-option]').nth(1).fill('Chocolate');assert.match(await page.locator('#menuQuantityPreview').textContent(),/mesmo nome/);
  await page.locator('[data-quantity-option]').nth(1).fill('Chocolate branco');await page.locator('#menuQuantityRulesEnabled').uncheck();assert.equal(await page.locator('#menuItemForm').evaluate(form=>form.checkValidity()),true);
  await page.locator('#menuItemForm').evaluate(form=>form.requestSubmit());await page.waitForFunction(()=>__quantityWrites.length>0);assert.equal(await page.evaluate(()=>__quantityWrites[0].args.payload.metadata.quantity_rules),null);
  checks.push('invalid and duplicate configuration rejected; explicit disabling clears rules');await context.close();
 }
 {
  const {page,context}=await scene({options:Array.from({length:50},(_,i)=>`Sabor ${i+1}`)});await openDistribution(page);await page.locator('#distributionSearch').fill('Sabor 50');assert.equal(await page.locator('[data-distribution-name]:visible').count(),1);await page.locator('[data-distribute-equally]').click();assert.match(await page.locator('#distributionNotice').textContent(),/Quantidade completa/);await submitComposition(page);assert.equal(await page.locator('#cartCount').textContent(),'100');checks.push('fifty options: search does not change total and equal split skips zero portions');await context.close();
 }
 {
  const {page,context}=await scene({extras:true});await openDistribution(page);await page.locator('[data-distribute-equally]').click();await page.locator('input[value=gift]').check();assert.match(await page.locator('#configuratorTotal').textContent(),/200,00/);await submitComposition(page);await page.locator('#checkoutButton').click();await page.locator('[data-cart-edit]').click();assert.equal(await page.locator('input[value=gift]').isChecked(),true);await page.locator('#distributionQuantity').fill('125');await page.locator('#closeConfigurator').click();assert.match(await page.locator('#cartItems').textContent(),/100 unidades/);checks.push('paid extras remain per unit and canceling an edit preserves the original selection');await context.close();
 }
 {
  const {page,context}=await scene({options:[]});await page.locator('[data-quantity-select]').fill('125');await page.locator('[data-add-selected]').click();await page.locator('#checkoutButton').click();await page.locator('[data-cart-increase]').click();assert.match(await page.locator('.cart-quantity output').textContent(),/150/);await page.locator('[data-cart-decrease]').click();assert.match(await page.locator('.cart-quantity output').textContent(),/125/);checks.push('lots without distribution use configured increments above a hundred');await context.close();
 }
 {
  const {page,context}=await scene();
  for(let i=0;i<2;i++){await openDistribution(page);await page.locator('[data-distribute-equally]').click();await submitComposition(page);}
  await page.locator('#checkoutButton').click();assert.equal(await page.locator('.cart-item').count(),1);assert.match(await page.locator('#cartItems').textContent(),/200 unidades/);assert.match(await page.locator('#cartItems').textContent(),/50 × Banana/);
  await page.locator('[data-cart-edit]').click();await page.locator('#distributionQuantity').fill('225');await page.locator('[data-distribute-equally]').click();await submitComposition(page);assert.equal(await page.locator('.cart-item').count(),1);assert.match(await page.locator('#cartItems').textContent(),/225 unidades/);assert.match(await page.locator('#cartItems').textContent(),/75 × Chocolate/);
  checks.push('repeated identical compositions merge actual portions and editing replaces the original line');await context.close();
 }
 {
  const {page,context}=await scene();await openDistribution(page);await page.locator('[data-distribute-equally]').click();await submitComposition(page);await page.locator('#checkoutButton').click();
  await page.locator('#orderForm [name=name]').fill('Cliente Teste');await page.locator('#orderForm [name=phone]').fill('11999999999');await page.locator('#orderForm [name=privacy]').check();await page.evaluate(()=>window.__quantityReject=true);await page.locator('#orderSubmitButton').click();await page.locator('#orderMessage').filter({hasText:'Falha de teste'}).waitFor();assert.equal(await page.locator('#cartCount').textContent(),'100');
  await page.evaluate(()=>window.__quantityReject=false);await page.locator('#orderSubmitButton').click();await page.locator('#orderSuccess').waitFor({state:'visible'});const writes=await page.evaluate(()=>__quantityWrites.filter(call=>call.name==='public_create_menu_order_v2'));assert.equal(writes.length,2);assert.equal(writes[0].args.client_request_id,writes[1].args.client_request_id);assert.deepEqual(writes[0].args.supplied_items,writes[1].args.supplied_items);
  checks.push('failed checkout preserves quantities and retries the identical request without duplication');await context.close();
 }
 {
  const {page,context}=await scene({panel:true,role:'employee'});assert.equal(await page.locator('#menuItemForm').isVisible(),false);assert.equal(await page.evaluate(()=>__quantityWrites.length),0);checks.push('employee cannot configure product quantity rules');await context.close();
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);
 await writeFile(resolve(out,'results.json'),JSON.stringify({passed:true,checks,pageErrors,externalRequests,productionWrites:0},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,pageErrors,productionWrites:0}));
}catch(error){await writeFile(resolve(out,'failure.json'),JSON.stringify({error:error.stack,checks,pageErrors,externalRequests,assetErrors},null,2));throw error;}finally{await browser.close();}
