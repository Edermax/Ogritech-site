import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const published=process.env.OGRITECH_RETURN_BROWSER_PUBLISHED==='1';
const origin=published?'https://ogritech.com.br':'https://menu-return.ogritech.invalid',output=resolve(root,published?'outputs/menu-panel-return-public':'outputs/menu-panel-return');
const publishedFiles=new Map();
async function publishedBody(path){if(!publishedFiles.has(path))publishedFiles.set(path,(async()=>{const response=await fetch(origin+path+'?return_check='+Date.now(),{signal:AbortSignal.timeout(20000)});assert(response.ok,'Published file unavailable: '+path);return Buffer.from(await response.arrayBuffer());})());return publishedFiles.get(path);}
await mkdir(output,{recursive:true});
const report={checks:[],errors:[],externalRequests:[]};
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
try{
 for(const width of [320,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   const business='11111111-1111-4111-8111-111111111111',type=()=>sessionStorage.getItem('fixtureUserType')||'owner';
   const category={id:'category',name:'Produtos',active:true,sort_order:1,menu_items:[{id:'product',name:'Produto de teste',active:true,available:true,sort_order:1,menu_item_prices:[{id:'price',label:'Unidade',price:10,active:true}]}]};
   const menu={id:'menu',barbershop_id:business,slug:'loja-teste',title:'Loja de teste',template_code:'confectionery',published:true,accepts_pickup:true,accepts_delivery:false,accepted_payment_methods:['cash'],weekly_hours:{weekdays:[1,2,3,4,5],opens_at:'08:00',closes_at:'18:00'},visual_identity:{primary_color:'#112233',accent_color:'#08b9d3'},menu_delivery_zones:[],menu_categories:[category]};
   window.BARBERSHOP_ID=business;window.currentRole='owner';window.IS_DEMO=false;window.businessConfig={name:menu.title};window.OGRITECH_ENV='production';
   window.__calls=[];window.__sharedLink=null;window.renderMenuShare=(_,url)=>{window.__sharedLink=url;};
   window.ogritechEnvironmentUrl=path=>{const url=new URL(path,location.origin);url.searchParams.set('env','production');return url.href;};
   window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   window.supabaseClient={
    auth:{getSession:async()=>({data:{session:{user:{id:type()}}}}),getUser:async()=>{window.__calls.push('identity');return{data:{user:type()==='anonymous'?null:{id:type()}}};},onAuthStateChange:callback=>{window.__authChanged=callback;}},
    from(table){let columns='';const q={select(value){columns=value;return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(a,b){window.__calls.push({table,columns});const data=table==='online_menus'?(columns==='barbershop_id'?(type()==='owner'?{barbershop_id:business}:null):structuredClone(menu)):[];return Promise.resolve({data}).then(a,b);}};return q;},
    rpc:async(name,args)=>{
     window.__calls.push({name,args});
     if(name==='is_business_team')return{data:type()==='owner'};
     if(name==='is_platform_admin')return{data:type()==='platform-admin'};
     if(name==='menu_catalog_draft_status')return{data:{exists:false}};
     if(name==='menu_onboarding_status')return{data:{exists:true,next_step:'ready',completed_count:8,total_count:8,checks:Object.fromEntries(['segment','identity','catalog','fulfillment','payments','hours','test_order','review'].map(key=>[key,true]))}};
     if(name==='public_menu_assistant_status')return{data:{available:false}};
     if(name==='public_menu')return{data:{menu:{...menu,payment_methods:['cash']},categories:[{...category,items:category.menu_items.map(item=>({...item,prices:item.menu_item_prices}))}],delivery_zones:[]}};
     return{data:{}};
    }
   };
  });
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==origin){report.externalRequests.push(url.href);return route.abort();}
   const path=resolve(root,'.'+decodeURIComponent(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));
   if(!path.startsWith(root+sep))return route.fulfill({status:403});
   try{
    let body=published?await publishedBody(url.pathname):await readFile(path);
    const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'}[extname(path)]||'application/octet-stream';
    if(url.pathname==='/admin.html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
    else if(url.pathname==='/painel/')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('<style>html{visibility:hidden}</style>','').replace('</body>','<script src="/menu-branding.js"></script><script src="/commercial-admin.js"></script><script src="/panel-navigation.js"></script></body>'));
    else if(type==='text/html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>/https:|supabase-config/.test(tag)?'':tag));
    return route.fulfill({contentType:type,body});
   }catch{return route.fulfill({status:404});}
  });
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(origin+'/painel/?secao=loja');
  assert.equal(await page.evaluate(async()=>{const loaded=await window.loadMenuAdmin();document.getElementById("content").hidden=!loaded;document.getElementById("panelLoadState").hidden=loaded;return loaded;}),true);
  await page.waitForFunction(()=>document.body.dataset.panelRoute==='menu');
  assert.equal(new URL(await page.locator('#menuOperationPublicLink').getAttribute('href')).searchParams.get('origem'),'painel');
  assert.equal(await page.evaluate(()=>new URL(window.__sharedLink).searchParams.has('origem')),false);
  await page.click('#menuOperationPublicLink');
  await page.locator('#menuPanelReturnLink[href]').waitFor({state:'visible'});
  assert.equal(context.pages().length,1,'The installed app stays in the same browsing context');
  assert.equal(new URL(page.url()).searchParams.has('origem'),false);
  await page.screenshot({path:resolve(output,`owner-menu-${width}.png`)});
  await page.reload();await page.locator('#menuPanelReturnLink[href]').waitFor({state:'visible'});
  await page.click('#menuPanelReturnLink');
  await page.waitForURL(url=>url.pathname==='/painel/'&&url.searchParams.get('secao')==='loja');
  await page.evaluate(async()=>{const loaded=await window.loadMenuAdmin();document.getElementById("content").hidden=!loaded;document.getElementById("panelLoadState").hidden=loaded;return loaded;});
  await page.waitForFunction(()=>document.body.dataset.panelRoute==='menu');
  report.checks.push(`panel → public menu → menu tab in the same window, clean sharing and reload ${width}px`);

  await page.goto(origin+'/cardapio/?empresa=loja-teste');
  await page.locator('#catalog .menu-item-card').waitFor();
  assert.equal(await page.locator('#menuPanelReturn').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.__calls.includes('identity')),false);
  await page.screenshot({path:resolve(output,`public-menu-${width}.png`)});
  for(const type of ['anonymous','another-owner']){
   await page.evaluate(type=>sessionStorage.setItem('fixtureUserType',type),type);
   await page.goto(origin+'/cardapio/?empresa=loja-teste&origem=painel');
   await page.locator('#catalog .menu-item-card').waitFor();
   assert.equal(await page.locator('#menuPanelReturn').isVisible(),false);
  }
  await page.evaluate(()=>sessionStorage.setItem('fixtureUserType','owner'));
  await page.goto(origin+'/cardapio/?empresa=loja-teste&origem=painel');
  await page.locator('#menuPanelReturnLink[href]').waitFor({state:'visible'});
  await page.evaluate(()=>{sessionStorage.setItem('fixtureUserType','anonymous');window.__authChanged('SIGNED_OUT',null);});
  assert.equal(await page.locator('#menuPanelReturn').isVisible(),false);
  report.checks.push(`public visitors, unrelated accounts and sign-out never expose the shortcut ${width}px`);
  await page.evaluate(()=>sessionStorage.setItem('fixtureUserType','platform-admin'));
  await page.goto(origin+'/cardapio/?empresa=loja-teste&origem=administracao');
  await page.locator('#menuPanelReturnLink[href]').waitFor({state:'visible'});
  assert.match(await page.locator('#menuPanelReturnLink').textContent(),/Voltar à Ogritech/);
  await page.reload();await page.locator('#menuPanelReturnLink[href]').waitFor({state:'visible'});
  await page.screenshot({path:resolve(output,`administrator-menu-${width}.png`)});
  await page.click('#menuPanelReturnLink');
  await page.waitForURL(url=>url.pathname==='/admin.html'&&url.hash==='#businesses');
  report.checks.push(`administrator menu preview returns to Ogritech businesses after reload ${width}px`);
  await page.evaluate(()=>{sessionStorage.setItem('ogritechMasterMode','true');sessionStorage.setItem('ogritechMasterBusinessId','11111111-1111-4111-8111-111111111111');});
  await page.goto(origin+'/painel/');
  await page.addScriptTag({url:origin+'/auth.js'});
  await page.locator('#platformAdminReturn').waitFor({state:'visible'});
  assert.ok(await page.locator('#backToShowcase').evaluate(el=>el.getBoundingClientRect().height>=44));
  assert.equal(await page.locator('#platformAdminReturn').evaluate(el=>el.closest('header')===null),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:resolve(output,`administrator-panel-${width}.png`)});
  await page.click('#backToShowcase');
  await page.waitForURL(url=>url.pathname==='/admin.html'&&url.hash==='#businesses');
  report.checks.push(`verified support returns before business data finishes loading, no mobile overflow ${width}px`);
  await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
 await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
