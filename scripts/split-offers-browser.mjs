import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),origin='https://offers.ogritech.invalid';
const output=resolve(root,'outputs/split-offers');await mkdir(output,{recursive:true});
const report={externalRequests:[],checks:[],pageErrors:[],billingRequests:[]};
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
const menu={id:'menu-fixture',slug:'fixture',title:'Loja de teste',description:'Catálogo de teste',template_code:'pizzeria',published:false,accepts_pickup:true,accepts_delivery:false,minimum_order:0,delivery_fee:0,visual_identity:{primary_color:'#111827',accent_color:'#f59e0b'},accepted_payment_methods:['pix'],payment_methods:['pix'],weekly_hours:{weekdays:[1,2,3],opens_at:'10:00',closes_at:'22:00'},menu_delivery_zones:[],menu_categories:[]};
const categories=[{id:'category-fixture',name:'Bolos',items:[{id:'item-fixture',name:'Bolo de chocolate',description:'Recheio de brigadeiro',item_type:'weight',minimum_quantity:1,maximum_quantity:5,unit_label:'kg',prices:[{id:'price-fixture',label:'2 kg',price:100}],option_groups:[]}]}];
async function pageFor(kind,offer='cardapio',width=1440){
 const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(({origin,kind,offer,menu,categories})=>{
  window.__calls=[];window.__offer=offer;window.IS_DEMO=false;window.BARBERSHOP_ID='aabbccdd-1234-4000-8000-123456789012';window.currentRole='owner';window.businessConfig={name:'Loja de teste'};
  window.OGRITECH_SUPABASE_URL=origin;window.OGRITECH_SUPABASE_PUBLISHABLE_KEY='fixture';window.renderWhatsAppShare=()=>{};
  window.ogritechEnvironmentUrl=path=>new URL(path,location.origin).href;window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const checks={segment:true,identity:true,catalog:true,fulfillment:true,payments:true,hours:true,test_order:true,review:false};
  const plans=[{id:'simple-plan',code:'cardapio',name:'Cardápio',monthly_fee:29.9},{id:'full-plan',code:'foundation',name:'Encomendas',monthly_fee:49.9}];
  window.renderSettings=()=>{};
  const status=()=>({exists:true,offer_code:window.__offer,next_step:'review',completed_count:7,total_count:8,checks});
  window.supabaseClient={rpc:async(name,args)=>{
    window.__calls.push({name,args});
    if(name==='public_menu')return{data:{menu:{...menu,offer_code:window.__offer,whatsapp_phone:'5511999999999'},categories,delivery_zones:[]}};
    if(name==='public_menu_assistant_status')return{data:{available:false}};
    if(name==='menu_onboarding_status')return{data:status()};
    if(name==='business_subscription_center')return{data:{products:[{code:'menu',name:'Cardápio e Encomendas',description:'Escolha seu plano',plans,modules:[]}],subscriptions:[{id:'sub',product_code:'menu',plan_id:window.__offer==='cardapio'?'simple-plan':'full-plan',status:'trial',billing_cycle:'annual',current_period_end:'2026-12-01T00:00:00Z',modules:[]}]}};
    if(name==='menu_catalog_draft_status')return{data:{exists:false}};
    return{data:null,error:null};
   },functions:{invoke:async(name,{body})=>{window.__calls.push({name,args:body});if(body.action==='change_offer')window.__offer=body.offer;return{data:{data:{offer:window.__offer,trial_ends_at:'2026-12-01T00:00:00Z'}},error:null};}},
   from(table){const data=table==='online_menus'?{...menu,menu_categories:categories.map(c=>({...c,active:true,sort_order:0,menu_items:c.items.map(i=>({...i,active:true,available:true,sort_order:0,menu_item_prices:i.prices.map(p=>({...p,active:true})),menu_item_option_groups:[]}))}))}:table==='menu_orders'?[]:table==='menu_catalog_templates'?[{code:'pizzeria',name:'Pizzaria'}]:table==='barbershops'?{name:'Loja de teste',segment:'Restaurante'}:null;
    const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject);}};return q;}
  };
  if(kind==='admin') {
    window.supabaseClient.auth={getSession:async()=>({data:{session:{user:{id:'fixture-admin'}}}}),signOut:async()=>({})};
    window.supabaseClient.rpc=async(name,args)=>{window.__calls.push({name,args});return{data:name==='is_platform_admin'?true:null,error:null};};
    window.supabaseClient.functions.invoke=async(name,{body})=>{window.__calls.push({name,args:body});if(name==='platform-users')return{data:{users:[],auth_users_without_profile:[]}};if(body.action==='change_offer')window.__offer=body.offer;return{data:{data:{offer:window.__offer}}};};
    window.supabaseClient.from=table=>{
      const rows={saas_clients:[{id:'client',barbershop_id:window.BARBERSHOP_ID,name:'Loja de teste',segment:'Restaurante',contact_name:'Pessoa Teste',owner_email:'fixture@example.invalid',plan:window.__offer==='cardapio'?'Cardápio':'Encomendas',monthly_fee:window.__offer==='cardapio'?29.9:49.9,status:'Ativo',origin:'Teste',invite_status:'Enviado',created_at:'2026-11-13T00:00:00Z'}],saas_plans:plans.map(p=>({...p,product_id:'product',features:[],description:p.name,active:true})),platform_products:[{id:'product',code:'menu',name:'Cardápio e Encomendas',launch_state:'active'}],platform_subscriptions:[{id:'sub',billing_customer_id:'customer',product_id:'product',plan_id:window.__offer==='cardapio'?'simple-plan':'full-plan',status:'trial',base_amount:window.__offer==='cardapio'?29.9:49.9,current_period_end:'2026-12-01T00:00:00Z'}],billing_customers:[{id:'customer',saas_client_id:'client',billing_email:'fixture@example.invalid'}],profiles:{full_name:'Admin teste',active:true}};
      const q={select(){return q;},eq(){return q;},is(){return q;},order(){return q;},limit(){return q;},single(){return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve({data:rows[table]||[],error:null}).then(resolve,reject);}};return q;
    };
  }
 },{origin,kind,offer,menu,categories});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin){report.externalRequests.push(url.origin);return route.fulfill({contentType:'application/javascript',body:''});}
  if(url.pathname==='/functions/v1/ogritech-billing'){
   const body=route.request().postDataJSON();if(body.action==='trial_configuration')return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{available:true,phone_verification:false,turnstile_site_key:''}})});report.billingRequests.push(body);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{trial_ends_at:'2026-12-01T00:00:00Z',login_url:'/login/',whatsapp_share_id:null}})});
  }
  let path=decodeURIComponent(url.pathname).replace(/^\//,'');if(!path||path.endsWith('/'))path+='index.html';
  const target=resolve(root,path);if(!target.startsWith(root+sep))return route.fulfill({status:403});
  try{
   let body=await readFile(target);const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon','.webmanifest':'application/manifest+json'}[extname(target)]||'application/octet-stream';
   if(contentType==='text/html'){
    let html=body.toString();
    if(['panel','admin'].includes(kind))html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>/src="(?:\/)?(?:commercial-admin|subscription-admin|product-offers|panel-navigation|admin)\.js/.test(tag)?tag:'');
    else html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>/src="[^\"]*(?:https:|supabase-config|pwa\.js|assistant-widget|whatsapp\/share)/.test(tag)?'':tag);
    body=Buffer.from(html);
   }
   return route.fulfill({contentType,body});
  }catch{return route.fulfill({status:404});}
 });
 const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));return{page,context};
}
try{
 for(const width of [1440,390]){
  const {page,context}=await pageFor('home','cardapio',width);await page.goto(origin+'/',{waitUntil:'networkidle'});
  for(const offer of ['cardapio','encomendas'])assert.equal(await page.locator(`[data-offer="${offer}"]`).count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('#preco').screenshot({path:resolve(output,`prices-${width}.png`),style:".site-header{visibility:hidden}"});report.checks.push(`home two offers ${width}px`);await context.close();
 }
 for(const offer of ['cardapio','encomendas']){
  const {page,context}=await pageFor('signup',offer,390);await page.goto(origin+'/criar-cardapio/?plano='+offer,{waitUntil:'networkidle'});
  assert.equal(await page.locator('[name=offer]').inputValue(),offer);await page.selectOption('[name=cycle]','annual');assert.match(await page.locator('#selectedOfferPrice').textContent(),offer==='cardapio'?/299,00/:/499,00/);
  await page.fill('[name=business_name]','Loja Teste');await page.fill('[name=tax_document]','52998224725');await page.fill('[name=responsible_name]','Pessoa Teste');await page.fill('[name=email]','fixture@example.invalid');await page.fill('[name=phone]','11999999999');await page.selectOption('[name=segment]','Pizzaria');await page.selectOption('[name=service_invoice_preference]','not_requested');await page.check('[name=accepted_terms]');await page.check('[name=publish_whatsapp]');
  await page.click('#submitButton');await page.locator('#resultSection').waitFor({state:'visible'});assert.equal(report.billingRequests.at(-1).offer,offer);assert.equal(report.billingRequests.at(-1).cycle,'annual');report.checks.push(`${offer} annual signup payload`);await context.close();
 }
 for(const offer of ['cardapio','encomendas']){
  const {page,context}=await pageFor('catalog',offer,390);await page.goto(origin+'/cardapio/?empresa=fixture',{waitUntil:'networkidle'});await page.click('[data-add-selected]');await page.click('#checkoutButton');
  if(offer==='cardapio'){
   assert.equal(await page.locator('#checkout').isVisible(),false);assert.equal(await page.locator('#whatsappSelectionLink').isVisible(),true);
   const target=new URL(await page.locator('#whatsappSelectionLink').getAttribute('href'));assert.equal(target.hostname,'wa.me');assert.match(target.searchParams.get('text'),/Bolo de chocolate.*2 kg/);assert.match(target.searchParams.get('text'),/pagamento e entrega/);
   assert.equal((await page.evaluate(()=>window.__calls)).some(call=>call.name.includes('create_menu_order')),false);
  }else{assert.equal(await page.locator('#checkout').isVisible(),true);assert.equal(await page.locator('#whatsappSelectionLink').isVisible(),false);}
  await page.screenshot({path:resolve(output,`catalog-${offer}-mobile.png`),fullPage:true});report.checks.push(`${offer} public consumer flow`);await context.close();
 }
 for(const width of [390,1440])for(const offer of ['cardapio','encomendas']){
  const {page,context}=await pageFor('panel',offer,width);await page.goto(origin+'/painel/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{document.documentElement.style.visibility='visible';document.getElementById('content').hidden=false;document.querySelectorAll('.view-section').forEach(el=>el.classList.add('hidden'));document.getElementById('menuView').classList.remove('hidden');await window.loadMenuAdmin();await window.loadSubscriptionCenter();});
  await page.evaluate(()=>window.OgritechMenuWorkspace.select('settings'));assert.equal(await page.locator('#menuFulfillmentChoices').isVisible(),offer==='encomendas');assert.equal(await page.locator('#menuPaymentChoices').isVisible(),offer==='encomendas');
  await page.evaluate(()=>window.OgritechMenuWorkspace.select('review'));assert.equal(await page.locator('#menuTestOrderButton').evaluate(el=>el.classList.contains('menu-offer-hidden')),offer==='cardapio');
  await page.evaluate(()=>{window.OgritechPanelNavigation.show('configuracoes');document.querySelectorAll('[data-owner-only]').forEach(el=>{el.hidden=false;el.classList.remove('hidden');});});
  assert.equal(await page.locator('[data-billing-cycle]').inputValue(),'annual');
  const other=offer==='cardapio'?'encomendas':'cardapio';
  const current=page.locator('[data-current-plan]');assert.equal(await current.getAttribute('data-current-plan'),offer);assert.match(await current.locator('header').textContent(),/Seu plano atual/);assert.match(await current.locator('header').textContent(),offer==='cardapio'?/Ogritech Cardápio/:/Ogritech Encomendas/);assert.match(await current.locator('.subscription-current-price').textContent(),offer==='cardapio'?/299,00 por ano/:/499,00 por ano/);
  assert.equal(await page.locator('[data-alternative-plan]').count(),1);assert.equal(await page.locator('[data-alternative-plan]').getAttribute('data-alternative-plan'),other);assert.equal(await page.locator('[data-alternative-plan="'+offer+'"]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.locator('#subscriptionCenter').screenshot({path:resolve(output,`current-plan-${offer}-${width}.png`)});
  page.once('dialog',dialog=>dialog.dismiss());await page.click('[data-subscription-action=change_plan]');assert.equal(await page.evaluate(()=>window.__offer),offer);assert.equal((await page.evaluate(()=>window.__calls)).filter(call=>call.args?.action==='change_offer').length,0);
  page.once('dialog',dialog=>dialog.accept());await page.click('[data-subscription-action=change_plan]');await page.waitForFunction(expected=>window.__offer===expected,other);
  await page.waitForFunction(()=>document.getElementById('subscriptionMessage').textContent.includes('sem novo teste'));assert.match(await page.locator('#subscriptionMessage').textContent(),/sem novo teste/i);assert.equal(await page.locator('[data-current-plan]').getAttribute('data-current-plan'),other);assert.equal(await page.locator('[data-alternative-plan]').getAttribute('data-alternative-plan'),offer);report.checks.push(`${offer} current plan, alternatives and confirmed switching ${width}px`);await context.close();
 }
 {
  const {page,context}=await pageFor('admin','encomendas',1440);await page.goto(origin+'/admin.html#plans',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.getElementById('plansGrid').querySelectorAll('.plan-card').length===2);
  for(const text of ['29,90','299,00','49,90','499,00'])assert.ok((await page.locator('#plansGrid').textContent()).includes(text));
  await page.locator('#plansGrid').screenshot({path:resolve(output,'admin-plans.png')});
  await page.click('a[href="#products"][data-admin-group]');await page.selectOption('[data-admin-offer]','cardapio');await page.click('[data-product-action="change_offer"]');
  await page.waitForFunction(()=>window.__offer==='cardapio');assert.ok((await page.evaluate(()=>window.__calls)).some(call=>call.args?.action==='change_offer'&&call.args.offer==='cardapio'));
  report.checks.push('master admin displays both monthly/annual prices and changes customer plan');await context.close();
 }
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalRequests,[]);
 await writeFile(resolve(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,pageErrors:report.pageErrors,externalRequests:report.externalRequests}));
}finally{await browser.close();}
