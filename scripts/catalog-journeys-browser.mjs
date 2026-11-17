import {installCatalogFixture} from '../tests/fixtures/catalog-business.mjs';
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
 await context.addInitScript(installCatalogFixture,{profile,offer,trial,quote,plans,origin});
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
  assert.match(await s.page.locator('h1').textContent(),/vitrine online/);assert.match(await s.page.locator('#catalogSegmentsTitle').textContent(),/seu negócio/);
  for(const price of ['9,90','99,00','29,90','299,00'])assert.ok((await s.page.locator('body').textContent()).includes(price));
  assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await s.page.screenshot({path:resolve(out,`home-${width}.png`),fullPage:true});checks.push(`marketing and four prices ${width}px`);await s.context.close();
 }
 for(const profile of ['food','crafts','products'])for(const offer of ['cardapio','encomendas'])for(const cycle of ['monthly','annual']){
  const s=await scene({profile,offer});await s.page.goto(origin+`/criar-cardapio/${offer}/?perfil=${profile}&ciclo=${cycle}`,{waitUntil:'networkidle'});
  await s.page.waitForFunction(()=>!document.getElementById('submitButton').disabled);
  const segment={food:'food',crafts:'crafts',products:'products'}[profile];
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
 {
  const s=await scene({offer:'encomendas'});await s.page.goto(origin+'/assinatura/',{waitUntil:'networkidle'});
  await s.page.waitForFunction(()=>document.getElementById('billingStatus').textContent==='Assinatura ativa');
  assert.equal(await s.page.locator('#billingForm').isVisible(),false);
  await s.page.selectOption('#changeOfferCycle','annual');s.page.once('dialog',d=>d.accept());await s.page.click('#changeOfferButton');
  await s.page.locator('#billingMessage').filter({hasText:'Autorize o próximo pagamento'}).waitFor();
  assert.equal(await s.page.locator('#billingForm').isVisible(),true);assert.equal(await s.page.locator('#recurringAuthorization').isChecked(),false);assert.equal(await s.page.locator('#backToMenu').isVisible(),true);
  await s.page.click('#paymentButton');assert.match(await s.page.locator('#billingMessage').textContent(),/Autorize/);
  assert.equal((await s.page.evaluate(()=>window.__calls)).filter(c=>c.args?.action==='choose_payment').length,0);
  await s.page.selectOption('#paymentMethod','pix');await s.page.click('#paymentButton');
  const calls=await s.page.evaluate(()=>window.__calls);assert.equal(calls.find(c=>c.args?.action==='change_offer').args.expected_total_cents,29900);assert.equal(calls.find(c=>c.args?.action==='choose_payment').args.cycle,'annual');
  checks.push('card cycle change preserves paid access and requires fresh payment authorization');await s.context.close();
 }
 {
  const s=await scene();await s.page.goto(origin+'/criar-cardapio/?segmento=collectibles',{waitUntil:'networkidle'});
  await s.page.waitForFunction(()=>!document.getElementById('submitButton').disabled);
  assert.equal(await s.page.locator('[name=segment]').inputValue(),'collectibles');
  assert.match(await s.page.locator('.intro h1').textContent(),/Vitrine/);
  const segments=await s.page.evaluate(()=>OgritechCatalogProfiles.segments.map(entry=>({code:entry.code,profile:entry.profile})));
  for(const segment of segments){
   await s.page.selectOption('[name=segment]',segment.code);
   const link=new URL(await s.page.locator('#choose-cardapio').getAttribute('href'));
   assert.equal(link.searchParams.get('segmento'),segment.code);assert.equal(link.searchParams.get('perfil'),segment.profile);
  }
  checks.push('all 19 activities retain exact selection across offer links');await s.context.close();
 }
 {
  const s=await scene({panel:true,profile:'crafts'});await s.page.goto(origin+'/painel/',{waitUntil:'networkidle'});
  await s.page.evaluate(async()=>{document.documentElement.style.visibility='visible';document.getElementById('content').hidden=false;document.getElementById('panelLoadState').hidden=true;document.querySelectorAll('.view-section').forEach(el=>el.classList.add('hidden'));document.getElementById('menuView').classList.remove('hidden');await window.loadMenuAdmin();window.OgritechMenuWorkspace.select('settings');});
  await s.page.selectOption('#catalogSegmentForm select','collectibles');s.page.once('dialog',d=>d.accept());await s.page.click('#catalogSegmentForm button');
  await s.page.locator('#catalogExtensionMessage').filter({hasText:'Atividade salva'}).waitFor();
  assert.equal(await s.page.locator('#catalogSegmentForm select').inputValue(),'collectibles');
  assert.equal(await s.page.locator('body').getAttribute('data-catalog-profile'),'products');
  await s.page.reload({waitUntil:'networkidle'});
  // Presentation rendering must not change merchant-authored product/category text.
  await s.page.evaluate(()=>{const node=document.createElement('p');node.id='terminologyStatus';node.textContent='Carregando cardápio';document.body.append(node);});
  await s.page.evaluate(()=>OgritechCatalogProfiles.apply(document.body,OgritechCatalogProfiles.profiles.products));
  await s.page.evaluate(()=>{document.getElementById('terminologyStatus').textContent='Falha ao abrir o cardápio';});
  await s.page.waitForFunction(()=>document.getElementById('terminologyStatus').textContent==='Falha ao abrir a vitrine');
  await s.page.evaluate(()=>{const node=document.createElement('strong');node.dataset.catalogUserContent='';node.id='merchantCopy';node.textContent='Livro Cardápio de Memórias';document.body.append(node);OgritechCatalogProfiles.apply(document.body,OgritechCatalogProfiles.profiles.crafts);});
  assert.equal(await s.page.locator('#merchantCopy').textContent(),'Livro Cardápio de Memórias');
  assert.equal(await s.page.locator('#terminologyStatus').textContent(),'Falha ao abrir o catálogo');
  checks.push('activity change, dynamic status updates and merchant text preservation');await s.context.close();
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(blockedRequests,[]);
 await writeFile(resolve(out,'results.json'),JSON.stringify({checks,pageErrors,blockedRequests},null,2));console.log(JSON.stringify({checks:checks.length,pageErrors,blockedRequests}));
}finally{await browser.close();}
