import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),origin='https://catalog.ogritech.invalid',out=resolve(root,'outputs/catalog-review/browser');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
const plans=[{id:'11111111-1111-4111-8111-111111111111',code:'catalogo-essencial',name:'Catálogo Essencial',menu_offer_code:'cardapio',offer_code:'cardapio',monthly_fee:9.90,annual_fee:99,active:true},
 {id:'22222222-2222-4222-8222-222222222222',code:'catalogo-completo',name:'Catálogo Completo',menu_offer_code:'encomendas',offer_code:'encomendas',monthly_fee:29.90,annual_fee:299,active:true}];
const checks=[],pageErrors=[],blockedRequests=[];
async function scene({profile='products',offer='cardapio',width=390,trial=false,quote=false,panel=false}={}){
 const context=await browser.newContext({viewport:{width,height:940},serviceWorkers:'block',reducedMotion:'reduce'}),calls=[];
 await context.addInitScript(({profile,offer,trial,quote,plans,origin})=>{
  const tenant='aabbccdd-1234-4000-8000-123456789012';
  window.IS_DEMO=false;window.BARBERSHOP_ID=tenant;window.currentRole='owner';window.businessConfig={name:'Negócio de teste'};window.renderSettings=()=>{};
  window.OGRITECH_SUPABASE_URL=origin;window.OGRITECH_SUPABASE_PUBLISHABLE_KEY='fixture';window.OGRITECH_ENV='production';
  window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.ogritechEnvironmentUrl=path=>new URL(path,location.origin).href;
  window.__calls=[];window.__profile=profile;window.__template=profile==='food'?'pizzeria':profile;
  const effective=trial?'encomendas':offer;
  const categories=[{id:'category-fixture',name:profile==='food'?'Pratos':'Produtos',items:[{id:'item-fixture',name:profile==='food'?'Prato de teste':'Peça artesanal',description:'Exemplo de teste',image_url:'',item_type:'simple',unit_label:'unidade',minimum_quantity:1,maximum_quantity:10,metadata:quote?{order_mode:'quote'}:{},prices:[{id:'price-fixture',label:profile==='food'?'Padrão':'Material natural',price:25}],option_groups:[]}]}];
  const identity={primary_color:'#243b53',accent_color:'#237c89',logo_path:'',cover_path:''};
  const menu=()=>({id:'menu-fixture',barbershop_id:tenant,slug:'fixture',title:'Negócio de teste',description:'Produtos de exemplo',template_code:window.__template,profile_code:window.__profile,offer_code:effective,published:false,accepts_pickup:true,accepts_delivery:false,minimum_order:0,delivery_fee:0,visual_identity:identity,accepted_payment_methods:['pix'],payment_methods:['pix'],weekly_hours:{weekdays:[1,2,3],opens_at:'09:00',closes_at:'18:00'},whatsapp_phone:'5511999999999',menu_delivery_zones:[],menu_categories:categories.map(c=>({...c,active:true,sort_order:0,menu_items:c.items.map(i=>({...i,active:true,available:true,sort_order:0,menu_item_prices:i.prices.map(p=>({...p,active:true})),menu_item_option_groups:[]}))}))});
  const templates=[{code:'pizzeria',name:'Pizzaria'},{code:'restaurant',name:'Restaurante'},{code:'confectionery',name:'Confeitaria'},{code:'snack-bar',name:'Lanchonete'},{code:'crafts',name:'Artesanato e personalizados'},{code:'products',name:'Produtos em geral'}];
  window.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'fixture-owner'}}}}),signOut:async()=>({})},
   rpc:async(name,args)=>{
    window.__calls.push({name,args});
    if(name==='public_menu_plans')return{data:plans};
    if(name==='public_menu')return{data:{menu:menu(),categories,delivery_zones:[]}};
    if(name==='public_menu_assistant_status')return{data:{available:false}};
    if(name==='menu_onboarding_status')return{data:{exists:true,profile_code:window.__profile,offer_code:effective,selected_offer_code:offer,plan_name:plans.find(p=>p.offer_code===offer).name,next_step:'review',completed_count:7,total_count:8,checks:{segment:true,identity:true,catalog:true,fulfillment:true,payments:true,hours:true,test_order:true,review:false}}};
    if(name==='menu_branding')return{data:{identity,published:false,has_draft:false}};
    if(name==='catalog_order_history')return{data:[]};
    if(name==='change_catalog_profile'){window.__template=args.target_template_code;window.__profile=args.target_template_code==='pizzeria'?'food':args.target_template_code;return{data:{saved:true}};}
    if(name==='save_catalog_coupon')return{data:{saved:true}};
    if(name==='business_subscription_center')return{data:{products:[{code:'menu',name:'Catálogo',plans,modules:[]}],subscriptions:[{id:'sub',product_code:'menu',plan_id:plans.find(p=>p.offer_code===offer).id,plan_name_snapshot:plans.find(p=>p.offer_code===offer).name,status:trial?'trial':'active',billing_cycle:'monthly',current_period_end:'2099-01-01T00:00:00Z',effective_offer_code:effective,modules:[]}]}};
    return{data:null};
   },from(table){const data=table==='online_menus'?menu():table==='menu_orders'?[]:table==='menu_catalog_templates'?templates:table==='profiles'?{active:true,role:'owner',barbershop_id:tenant}:null;
    const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject);}};return q;},
   functions:{invoke:async(name,{body})=>{window.__calls.push({name,args:body});return{data:{data:{offer:body.offer}},error:null};}}};
 },{profile,offer,trial,quote,plans,origin});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){blockedRequests.push(url.origin);return route.fulfill({body:''});}
  if(url.pathname==='/functions/v1/ogritech-billing'){
   const body=route.request().postDataJSON();calls.push(body);
   return route.fulfill({contentType:'application/json',body:JSON.stringify({data:body.action==='trial_configuration'?{available:true,phone_verification:false,turnstile_site_key:''}:{trial_ends_at:'2099-01-01T00:00:00Z',login_url:'/login/'}})});
  }
  const file=resolve(root,decodeURIComponent(url.pathname).replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+sep))return route.fulfill({status:403});
  try{let body=await readFile(file);const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';
   if(contentType==='text/html'){
    let text=body.toString();
    text=text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>panel?(/src="(?:\/)?(?:catalog-profiles|catalog-admin|commercial-admin|subscription-admin|product-offers|menu-branding|menu-branding-admin|panel-navigation)\.js/.test(tag)?tag:''):(/src="[^\"]*(?:https:|supabase-config|pwa\.js|assistant-widget)/.test(tag)?'':tag));body=Buffer.from(text);
   }
   return route.fulfill({contentType,body});
  }catch{return route.fulfill({status:404});}
 });
 const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));return{page,context,calls};
}
try{
 for(const width of [390,1440]){
  const s=await scene({width});await s.page.goto(origin+'/',{waitUntil:'networkidle'});
  assert.match(await s.page.locator('h1').textContent(),/catálogo/);assert.match(await s.page.locator('#catalogSegmentsTitle').textContent(),/seu negócio/);
  for(const price of ['9,90','99,00','29,90','299,00'])assert.ok((await s.page.locator('body').textContent()).includes(price));
  assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await s.page.screenshot({path:resolve(out,`home-${width}.png`),fullPage:true});checks.push(`marketing and four prices ${width}px`);await s.context.close();
 }
 for(const profile of ['food','crafts','products'])for(const offer of ['cardapio','encomendas'])for(const cycle of ['monthly','annual']){
  const s=await scene({profile,offer});await s.page.goto(origin+`/criar-cardapio/${offer}/?perfil=${profile}&ciclo=${cycle}`,{waitUntil:'networkidle'});
  await s.page.waitForFunction(()=>!document.getElementById('submitButton').disabled);
  const segment={food:'Pizzaria',crafts:'Artesanato e personalizados',products:'Produtos em geral'}[profile];
  assert.equal(await s.page.locator('[name=segment]').inputValue(),segment);assert.equal(await s.page.locator('[name=cycle]').inputValue(),cycle);
  const selected=plans.find(p=>p.offer_code===offer),amount=cycle==='annual'?selected.annual_fee:selected.monthly_fee;
  assert.match(await s.page.locator('#selectedOfferName').textContent(),profile==='food'?/Cardápio/:/Catálogo/);
  assert.match(await s.page.locator('#selectedOfferPrice').textContent(),new RegExp(amount.toFixed(2).replace('.',',')));
  assert.match(await s.page.locator('#selectedOfferSummary').textContent(),/14 dias grátis no Completo/);
  for(const [name,value] of Object.entries({business_name:'Loja Teste',tax_document:'52998224725',responsible_name:'Pessoa Teste',email:'fixture@example.invalid',phone:'11999999999'}))await s.page.locator(`[name=${name}]`).fill(value);
  await s.page.selectOption('[name=service_invoice_preference]','not_requested');await s.page.check('[name=accepted_terms]');await s.page.check('[name=publish_whatsapp]');
  await s.page.click('#submitButton');await s.page.locator('#resultSection').waitFor({state:'visible'});
  const payload=s.calls.find(c=>c.action==='start_trial');assert.equal(payload.offer,offer);assert.equal(payload.cycle,cycle);assert.equal(payload.segment,segment);assert.equal(payload.expected_total_cents,Math.round(amount*100));assert.equal(payload.payment_method,'pix');assert.equal(payload.recurring_authorized,false);
  if(profile==='crafts'&&offer==='cardapio'&&cycle==='annual')await s.page.screenshot({path:resolve(out,'crafts-essential-annual.png'),fullPage:true});
  checks.push(`${profile} ${offer} ${cycle} signup and selected price`);await s.context.close();
 }
 for(const profile of ['food','crafts','products'])for(const offer of ['cardapio','encomendas']){
  const s=await scene({profile,offer});await s.page.goto(origin+'/cardapio/?empresa=fixture',{waitUntil:'networkidle'});
  await s.page.click('[data-add-selected]');await s.page.click('#checkoutButton');
  if(offer==='cardapio'){
   await s.page.fill('#whatsappCustomerName','Cliente Teste');await s.page.fill('#whatsappCustomerPhone','11999999999');
   const link=new URL(await s.page.locator('#whatsappSelectionLink').getAttribute('href'));assert.equal(link.hostname,'wa.me');assert.match(link.searchParams.get('text'),profile==='food'?/Prato de teste/:/Peça artesanal/);
   assert.equal(await s.page.locator('#checkout').isVisible(),false);
  }else assert.equal(await s.page.locator('#checkout').isVisible(),true);
  if(profile==='crafts')await s.page.screenshot({path:resolve(out,`crafts-public-${offer}.png`),fullPage:true});
  checks.push(`${profile} public ${offer} flow`);await s.context.close();
 }
 {
  const s=await scene({profile:'crafts',offer:'encomendas',quote:true});await s.page.goto(origin+'/cardapio/?empresa=fixture',{waitUntil:'networkidle'});
  await s.page.click('[data-add-selected]');await s.page.click('#checkoutButton');await s.page.fill('#whatsappCustomerName','Cliente Teste');await s.page.fill('#whatsappCustomerPhone','11999999999');
  assert.equal(await s.page.locator('#checkout').isVisible(),false);const link=new URL(await s.page.locator('#whatsappSelectionLink').getAttribute('href'));assert.match(link.searchParams.get('text'),/referência/);checks.push('custom quote never becomes a fixed-price checkout');await s.context.close();
 }
 for(const trial of [false,true]){
  const s=await scene({profile:'crafts',offer:'cardapio',panel:true,trial,width:1440});await s.page.goto(origin+'/painel/',{waitUntil:'networkidle'});
  await s.page.evaluate(async()=>{document.documentElement.style.visibility='visible';document.getElementById('content').hidden=false;document.getElementById('panelLoadState').hidden=true;document.querySelectorAll('.view-section').forEach(el=>el.classList.add('hidden'));document.getElementById('menuView').classList.remove('hidden');await window.loadMenuAdmin();await window.loadSubscriptionCenter();window.OgritechMenuWorkspace.select('settings');});
  assert.equal(await s.page.locator('#catalogProfileForm').isVisible(),true);assert.equal(await s.page.locator('#catalogCouponForm').count(),trial?1:0);
  if(trial){await s.page.fill('#catalogCouponForm [name=code]','ARTES');await s.page.fill('#catalogCouponForm [name=amount]','5');await s.page.click('#catalogCouponForm button');await s.page.locator('#catalogExtensionMessage').filter({hasText:'Cupom salvo'}).waitFor();}
  s.page.once('dialog',d=>d.accept());await s.page.selectOption('#catalogProfileForm select','products');await s.page.click('#catalogProfileForm button');await s.page.waitForFunction(()=>window.__profile==='products'&&document.getElementById('catalogProfileForm')?.elements.template.value==='products'&&document.getElementById('catalogProfileForm').checkVisibility());
  assert.equal((await s.page.evaluate(()=>window.__calls)).filter(c=>c.name==='apply_menu_catalog_template').length,0);
  await s.page.locator('#catalogExtensionMessage').filter({hasText:'Apresentação salva'}).waitFor();
  await s.page.screenshot({path:resolve(out,`panel-${trial?'complete-trial':'essential'}.png`),fullPage:true});checks.push(`profile-only switch preserves catalog, ${trial?'Complete trial':'paid Essential'} controls`);await s.context.close();
 }
 {
  const s=await scene();await s.page.goto(origin+'/cardapio/?empresa=fixture',{waitUntil:'networkidle'});
  const result=await s.page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=2400;canvas.height=1800;const ctx=canvas.getContext('2d');ctx.fillStyle='#237c89';ctx.fillRect(0,0,2400,1800);
   const source=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')),file=new File([source],'produto.png',{type:'image/png'});
   const optimized=await OgritechMenuBranding.prepareImage(file),bitmap=await createImageBitmap(optimized);const bounds=[bitmap.width,bitmap.height];bitmap.close();
   let rejected=false;try{await OgritechMenuBranding.prepareImage(new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'corrompido.png',{type:'image/png'}));}catch{rejected=true;}
   return{bounds,smaller:optimized.size<file.size,rejected};
  });
  assert.deepEqual(result,{bounds:[1600,1200],smaller:true,rejected:true});checks.push('new images are resized/compressed and corrupt images rejected');await s.context.close();
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(blockedRequests,[]);
 await writeFile(resolve(out,'results.json'),JSON.stringify({checks,pageErrors,blockedRequests},null,2));console.log(JSON.stringify({checks:checks.length,pageErrors,blockedRequests}));
}finally{await browser.close();}
