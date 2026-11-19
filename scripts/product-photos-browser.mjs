import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {installCatalogFixture} from '../tests/fixtures/catalog-business.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),origin='https://photos.ogritech.invalid',out=resolve(root,'outputs/product-photos');await mkdir(out,{recursive:true});
const plans=[{id:'essential',offer_code:'cardapio',name:'Essencial'},{id:'complete',offer_code:'encomendas',name:'Completo'}];
const tenant='aabbccdd-1234-4000-8000-123456789012',photo=n=>`${tenant}/${String(n).repeat(8)}-1111-4111-8111-111111111111.webp`;
const checks=[],pageErrors=[],externalRequests=[];
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
async function scene({panel=true,limit=3,width=390,theme='light',existing=0,published=false,trial=false,role='owner'}={}){
 const context=await browser.newContext({viewport:{width,height:940},serviceWorkers:'block',reducedMotion:'reduce'});
 await context.addInitScript(installCatalogFixture,{profile:'products',offer:trial?'cardapio':limit===3?'encomendas':'cardapio',trial,quote:false,plans,origin});
 await context.addInitScript(({limit,existing,published,tenant,role})=>{
  window.currentRole=role;window.__photoLimit=limit;window.__photoCalls=[];window.__uploads=[];window.__removed=[];
  const path=n=>`${tenant}/${String(n).repeat(8)}-1111-4111-8111-111111111111.webp`,url=path=>location.origin+'/storage/v1/object/public/menu-images/'+path;
  window.__photoItem={id:'item-fixture',name:'Produto artesanal',description:'Produto de teste',unit_label:'unidade',minimum_quantity:1,maximum_quantity:10,image_url:existing?url(path(1)):'',metadata:{legacy_note:'preservar',gallery_images:Array.from({length:Math.max(0,existing-1)},(_,i)=>path(i+2))},prices:[{id:'price-fixture',label:'Padrão',price:25}],option_groups:[]};
  const rpc=window.supabaseClient.rpc.bind(window.supabaseClient),from=window.supabaseClient.from.bind(window.supabaseClient);
  window.supabaseClient.storage={from:()=>({upload:async(path,file)=>{window.__uploads.push({path,type:file.type,size:file.size});if(window.__uploadFailAt===window.__uploads.length)return{error:{message:'Falha de envio simulada'}};return{data:{path}};},getPublicUrl:path=>({data:{publicUrl:url(path)}}),remove:async paths=>{window.__removed.push(...paths);return{data:[]};}})};
  window.supabaseClient.rpc=async(name,args)=>{
   if(name==='menu_onboarding_status'){const r=await rpc(name,args);r.data.product_image_limit=window.__photoLimit;return r;}
   if(name==='menu_catalog_draft_status')return{data:{exists:Boolean(window.__photoDraft),payload:window.__photoDraft}};
   if(name==='public_menu'){const r=await rpc(name,args);r.data.menu.product_image_limit=window.__photoLimit;r.data.categories[0].items=[structuredClone(window.__photoItem)];return r;}
   if(['save_menu_catalog_item','save_menu_catalog_draft','publish_menu_catalog_draft'].includes(name)){
    window.__photoCalls.push({name,args:structuredClone(args)});if(window.__saveFail&&name!=='publish_menu_catalog_draft')return{error:{message:'Falha ao salvar simulada'}};if(window.__publishFail&&name==='publish_menu_catalog_draft')return{error:{message:'Falha ao publicar simulada'}};
    if(name==='save_menu_catalog_item')window.__photoItem={...window.__photoItem,...args.payload,prices:args.payload.prices,metadata:{...window.__photoItem.metadata,...args.payload.metadata}};
    if(name==='save_menu_catalog_draft')window.__photoDraft=args.draft_payload;
    if(name==='publish_menu_catalog_draft'){const item=window.__photoDraft.categories[0].menu_items[0];window.__photoItem={...window.__photoItem,...item,prices:item.menu_item_prices};window.__photoDraft=null;}
    return{data:{id:'item-fixture',saved:true,published}};
   }
   return rpc(name,args);
  };
  window.supabaseClient.from=table=>{if(table!=='online_menus')return from(table);const q={select(){return q;},eq(){return q;},maybeSingle(){return q;},then(done,fail){return Promise.resolve(from(table)).then(r=>({...r,data:{...r.data,published,menu_categories:[{id:'category-fixture',name:'Produtos',active:true,menu_items:[{...window.__photoItem,active:true,available:true,menu_item_prices:window.__photoItem.prices.map(p=>({...p,active:true})),menu_item_option_groups:[]}]}]}})).then(done,fail);}};return q;};
 },{limit,existing,published,tenant,role});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin!==origin){externalRequests.push(url.origin);return route.fulfill({body:''});}
  if(url.pathname.startsWith('/storage/'))return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="${url.pathname.includes('/11111111-')?'#b3e9ee':url.pathname.includes('/22222222-')?'#efd6b9':'#c5d8fa'}"/></svg>`});
  const file=resolve(root,decodeURIComponent(url.pathname).replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))return route.fulfill({status:403});
  try{let body=await readFile(file);const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';
   if(contentType==='text/html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>panel?(/src="(?:\/)?(?:catalog-profiles|commercial-admin|product-offers|panel-navigation|panel-theme|menu-branding|product-photos|product-photos-admin)\.js/.test(tag)?tag:''):(/src="[^\"]*(?:https:|supabase-config|pwa\.js|assistant-widget)/.test(tag)?'':tag)));
   return route.fulfill({body,contentType});
  }catch{return route.fulfill({status:404});}
 });
 const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));
 if(panel){await page.goto(origin+'/painel/',{waitUntil:'networkidle'});await page.waitForFunction(()=>typeof loadMenuAdmin==='function');await page.evaluate(async theme=>{document.documentElement.dataset.panelTheme=theme;document.documentElement.style.visibility='visible';document.getElementById('content').hidden=false;document.getElementById('panelLoadState').hidden=true;document.querySelectorAll('.view-section').forEach(n=>n.classList.add('hidden'));document.getElementById('menuView').classList.remove('hidden');await loadMenuAdmin();OgritechMenuWorkspace.select('catalog');},theme);if(role==='owner')await page.locator('[data-edit-menu-item]').click();}
 else await page.goto(origin+'/cardapio/?empresa=fixture',{waitUntil:'networkidle'});
 return{page,context};
}
async function choose(page,count,input='menuItemImage'){
 await page.evaluate(async({count,input})=>{const transfer=new DataTransfer();for(let i=0;i<count;i++){const c=document.createElement('canvas');c.width=360;c.height=240;const ctx=c.getContext('2d');ctx.fillStyle=['#6dd5e2','#e9b67f','#9faee5'][i];ctx.fillRect(0,0,360,240);const blob=await new Promise(done=>c.toBlob(done,'image/png'));transfer.items.add(new File([blob],`foto-${i}.png`,{type:'image/png'}));}const field=document.getElementById(input);field.files=transfer.files;field.dispatchEvent(new Event('change',{bubbles:true}));},{count,input});
 await page.waitForFunction(()=>!document.getElementById('menuPhotoStatus').textContent.includes('Preparando'));
}
async function save(page){await page.locator('#menuItemForm').evaluate(form=>form.requestSubmit());await page.waitForFunction(()=>!OgritechMenuWorkspace.state().busy&&(__photoCalls.length>0||document.getElementById('menuItemMessage').classList.contains('error')));}
try{
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  const {page,context}=await scene({width,theme});assert.match(await page.locator('#menuPhotoLimit').textContent(),/0 de 3/);await choose(page,3);assert.equal(await page.locator('.product-photo-editor-card').count(),3);assert.equal(await page.locator('#menuItemImage').isDisabled(),true);await page.locator('[data-photo-cover="2"]').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.locator('.product-photo-actions button').evaluateAll(buttons=>buttons.some(b=>b.scrollWidth>b.clientWidth+1)),false);await page.locator('#menuProductPhotosFieldset').screenshot({path:resolve(out,`editor-${theme}-${width}.png`)});await save(page);
  const state=await page.evaluate(()=>({uploads:__uploads,calls:__photoCalls,item:__photoItem}));assert.equal(state.uploads.length,3);assert(state.uploads.every(p=>p.path.startsWith('aabbccdd-1234-4000-8000-123456789012/')&&p.size>0));assert.equal(state.item.metadata.gallery_images.length,2);assert.equal(state.item.metadata.legacy_note,'preservar');checks.push(`Complete upload, cover, save and layout ${theme} ${width}px`);await context.close();
 }
 {
  const {page,context}=await scene({limit:1});await choose(page,2);assert.match(await page.locator('#menuPhotoStatus').textContent(),/permite 1 foto/);assert.equal(await page.locator('.product-photo-editor-card').count(),0);await choose(page,1);await save(page);assert.equal(await page.evaluate(()=>__uploads.length),1);assert.equal(await page.evaluate(()=>__photoItem.metadata.gallery_images.length),0);checks.push('Essential rejects a second photo and saves one');await context.close();
 }
 {
  const {page,context}=await scene({existing:3,limit:1});assert.equal(await page.locator('.is-archived').count(),2);await choose(page,1,'menuPhotoReplacement');await save(page);assert.equal(await page.evaluate(()=>__photoItem.metadata.gallery_images.length),2);assert.equal(await page.evaluate(()=>__uploads.length),1);checks.push('downgrade preserves extras while allowing cover replacement');await context.close();
 }
 {
  const {page,context}=await scene();await choose(page,3);await page.evaluate(()=>window.__uploadFailAt=2);await save(page);assert.equal(await page.evaluate(()=>__photoCalls.length),0);assert.equal(await page.evaluate(()=>__removed.length),1);assert.equal(await page.locator('.product-photo-editor-card').count(),3);await page.evaluate(()=>window.__uploadFailAt=0);await save(page);assert.equal(await page.evaluate(()=>__photoItem.metadata.gallery_images.length),2);checks.push('partial upload failure cleans new files and preserves previews for retry');await context.close();
 }
 {
  const {page,context}=await scene({published:true});await choose(page,3);await page.evaluate(()=>window.__publishFail=true);await save(page);assert.match(await page.locator('#menuItemMessage').textContent(),/não foi possível atualizar/);assert.equal(await page.locator('.product-photo-editor-card').count(),3);assert.equal(await page.evaluate(()=>__removed.length),0);await page.evaluate(()=>window.__publishFail=false);await save(page);assert.equal(await page.evaluate(()=>__uploads.length),3);assert.equal(await page.evaluate(()=>__photoItem.metadata.gallery_images.length),2);checks.push('saved draft survives publication failure and retries without reuploading');await context.close();
 }
 for(const width of [320,390,1440])for(const limit of [1,3]){
  const {page,context}=await scene({panel:false,width,limit,existing:3});assert.equal(await page.locator('[data-photo-index]').count(),limit===3?3:0);if(limit===3){await page.locator('[data-photo-index="2"]').click();assert.match(await page.locator('.menu-item-image').getAttribute('src'),/33333333/);await page.locator('[data-photo-index="2"]').press('ArrowLeft');assert.equal(await page.locator('[data-photo-count]').textContent(),'2 / 3');}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);if(limit===3)assert.equal(await page.locator('[data-photo-index]').evaluateAll(buttons=>buttons.every(b=>{const box=b.getBoundingClientRect(),p=b.closest('[data-product-photo-gallery]').getBoundingClientRect();return box.width>=44&&box.height>=44&&box.left>=p.left&&box.right<=p.right;})),true);await page.locator('.menu-item-card').screenshot({path:resolve(out,`public-${limit}-${width}.png`)});checks.push(`public gallery ${limit} photos ${width}px`);await context.close();
 }
 {
  const {page,context}=await scene({limit:3,trial:true});assert.match(await page.locator('#menuPhotoPlanNotice').textContent(),/Completo: até 3/);checks.push('Complete trial uses effective access');await context.close();
 }
 {
  const {page,context}=await scene({role:'employee'});assert.equal(await page.locator('#menuItemForm').isVisible(),false);assert.equal(await page.evaluate(()=>__photoCalls.length),0);checks.push('employee has no photo editing');await context.close();
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(externalRequests,[]);await writeFile(resolve(out,'results.json'),JSON.stringify({passed:true,checks,pageErrors,externalRequests,productionWrites:0},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,pageErrors,productionWrites:0}));
}catch(error){await writeFile(resolve(out,'failure.json'),JSON.stringify({error:error.stack,checks,pageErrors,externalRequests},null,2));throw error;}finally{await browser.close();}
