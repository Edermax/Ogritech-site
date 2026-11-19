import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),adminFixture=require('../tests/fixtures/platform-admin.cjs');
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),origin='https://ogritech.com.br',out=resolve(root,'outputs/usage-review');await mkdir(out,{recursive:true});
const checks=[],pageErrors=[],unexpectedRequests=[];
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
async function scene({path='/',width=390,admin=false,storageBlocked=false,expired=false}={}){
 const requests=[],pending=[],context=await browser.newContext({viewport:{width,height:940},serviceWorkers:'block',reducedMotion:'reduce',acceptDownloads:true});
 if(admin)await context.addInitScript({content:adminFixture});
 await context.addInitScript(({admin,storageBlocked,expired})=>{
  window.OGRITECH_USAGE_TEST=true;window.__usageFail=false;window.__usageCalls=[];window.__usageHold=false;window.__usageHeld=[];
  if(storageBlocked){Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Blocked','SecurityError');}});Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('Blocked','SecurityError');}});}
  if(expired)localStorage.setItem('ogritechUsageConsent:v1',JSON.stringify({allowed:true,at:Date.now()-181*86400000}));
  if(admin){const rpc=window.supabaseClient.rpc.bind(window.supabaseClient);window.supabaseClient.rpc=async(name,args)=>{
   if(name!=='platform_usage_report')return rpc(name,args);window.__usageCalls.push(structuredClone(args));
   if(window.__usageFail)return{error:{code:window.__usageFail===true?'08006':window.__usageFail}};
   if(window.__usageHold&&args.scope==='app')await new Promise(done=>window.__usageHeld.push(done));
   const data={period:{start:args.start_date,end:args.end_date,scope:args.scope,timezone:'America/Sao_Paulo'},activated_at:'2026-11-19T11:15:00Z',latest_event_at:'2026-11-19T12:00:00Z',summary:{visitors:args.scope==='app'?9:100,sessions:120,page_views:250,engaged_sessions:60,clicks:40,signups:6,publications:3},daily:[{day:args.start_date,visitors:40,page_views:80},{day:args.end_date,visitors:60,page_views:170}],pages:[{page:'home',views:150,sessions:100,average_scroll:62.5,average_active_seconds:35},{page:'signup',views:100,sessions:20,average_scroll:20,average_active_seconds:null}],clicks:[{page:'home',target:'hero_signup',clicks:30,sessions:22},{page:'panel',target:'panel_products',clicks:10,sessions:8}],sources:[{source:'instagram',sessions:80},{source:'direct',sessions:40}],devices:[{device:'mobile',sessions:90},{device:'desktop',sessions:30}],paths:[{previous:'home',page:'signup',transitions:20}],signup_funnel:[{step:'signup_open',count:20},{step:'signup_started',count:15},{step:'signup_submitted',count:10},{step:'signup_completed',count:6}],app_funnel:[{step:'panel_open',count:8},{step:'products_open',count:6},{step:'product_saved',count:4},{step:'catalog_published',count:3}]};
   if(window.__usageEmpty){data.summary={visitors:0,sessions:0,page_views:0,engaged_sessions:0};for(const key of ['daily','pages','clicks','sources','devices','paths'])data[key]=[];data.signup_funnel=data.signup_funnel.map(s=>({...s,count:0}));data.app_funnel=data.app_funnel.map(s=>({...s,count:0}));data.latest_event_at=null;}
   if(window.__usageMalicious){data.pages.push({page:'<img src=x onerror=alert(1)>',views:'=bad'});data.clicks.push({page:'unknown',target:'<script>bad</script>',clicks:1});}
   return{data};
  };}
 },{admin,storageBlocked,expired});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/rest/v1/rpc/public_record_platform_usage'){
   const payload=request.postDataJSON();requests.push(payload);const state=await route.request().frame().evaluate(()=>({fail:window.__usageHttpFail||false,hold:window.__usageHttpHold||false}));if(state.hold)await new Promise(done=>pending.push(done));return route.fulfill({status:state.fail?500:200,contentType:'application/json',body:JSON.stringify({accepted:payload.events.length,limited:false})});
  }
  if(url.origin!==origin||request.method()!=='GET'){unexpectedRequests.push({origin:url.origin,method:request.method()});return route.fulfill({body:''});}
  const file=resolve(root,decodeURIComponent(url.pathname).replace(/^\//,'')+(url.pathname.endsWith('/')?'index.html':''));if(!file.startsWith(root+sep))return route.fulfill({status:403});
  try{let body=await readFile(file);const contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.webp':'image/webp'}[extname(file)]||'application/octet-stream';
   if(contentType==='text/html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>admin?(/src="[^\"]*(?:https:|supabase-config)/.test(tag)?'':tag):(/src="\/usage-(?:model|analytics)\.js/.test(tag)?tag:'')));
   return route.fulfill({body,contentType});
  }catch{return route.fulfill({status:404});}
 });
 const page=await context.newPage();page.on('pageerror',e=>pageErrors.push(e.message));await page.clock.install({time:new Date('2026-11-19T12:00:00Z')});await page.goto(origin+path,{waitUntil:'networkidle'});
 if(admin)await page.waitForFunction(()=>document.getElementById('adminLoading').classList.contains('hidden'));
 else await page.evaluate(()=>document.documentElement.style.visibility='visible');
 return{page,context,requests,release:()=>pending.splice(0).forEach(done=>done())};
}
async function allow(page){await page.locator('[data-usage-choice="true"]').click();await page.evaluate(()=>OgritechUsage.flush());}
async function refresh(page){await page.locator('#usageRefresh').click();await page.waitForFunction(()=>document.getElementById('traffic').getAttribute('aria-busy')==='false');}
try{
 {
  const {page,context,requests}=await scene({path:'/?utm_source=instagram&email=private@example.com&token=secret'});assert.equal(await page.locator('.usage-consent').isVisible(),true);await page.evaluate(()=>OgritechUsage.flush());assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>localStorage.getItem('ogritechUsageVisitor:v1')),null);
  const targets=await page.locator('.usage-consent-actions button').evaluateAll(buttons=>buttons.map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})));assert(targets.every(b=>b.w>=44&&b.h>=44));checks.push('no collection or identifier before consent; equal accessible choices');
  await page.locator('[data-usage-choice="false"]').click();await page.clock.fastForward(30000);await page.evaluate(()=>OgritechUsage.flush());assert.equal(requests.length,0);checks.push('refusal leaves all statistics disabled');
  await page.locator('.usage-preferences').click();await allow(page);assert.equal(requests[0].events[0].event,'page_view');assert.equal(requests[0].events[0].source,'instagram');checks.push('permission starts first-party page collection');
  await page.locator('.usage-preferences').click();await allow(page);assert.equal(requests.flatMap(r=>r.events).filter(e=>e.event==='page_view').length,1);checks.push('saving an unchanged permission never creates an extra page view');
  await page.evaluate(()=>{document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();});document.querySelector('a[href^="/criar-cardapio"]').click();scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*.8);});await page.waitForTimeout(100);await page.evaluate(()=>OgritechUsage.flush());
  const all=requests.flatMap(r=>r.events);assert(all.some(e=>e.event==='click'));assert(all.some(e=>e.event==='scroll'&&e.value===75));assert(!JSON.stringify(all).includes('secret'));assert(!JSON.stringify(all).includes('private@example.com'));assert(all.every(e=>e.page==='home'));checks.push('clicks, scroll milestones and attribution omit URLs, tokens and form text');
  const visitor=all[0].visitor_id;await page.goto(origin+'/login/?token=another-secret',{waitUntil:'networkidle'});await page.evaluate(()=>document.documentElement.style.visibility='visible');await page.evaluate(()=>OgritechUsage.flush());assert.equal(requests.at(-1).events[0].visitor_id,visitor);assert.equal(requests.at(-1).events[0].source,'instagram');assert.equal(requests.at(-1).events[0].page,'login');checks.push('page navigation keeps anonymous visitor and first-session source');
  await page.evaluate(()=>OgritechUsage.track('click','login'));await page.locator('.usage-preferences').click();await page.locator('[data-usage-choice="false"]').click();const count=requests.length;await page.evaluate(()=>OgritechUsage.flush());await page.clock.fastForward(60000);assert.equal(requests.length,count);assert.equal(await page.evaluate(()=>localStorage.getItem('ogritechUsageVisitor:v1')),null);assert.equal(await page.evaluate(()=>sessionStorage.getItem('ogritechUsageSession:v1')),null);checks.push('revocation clears pending events and browser identifiers');await context.close();
 }
 {
  const {page,context,requests}=await scene({path:'/criar-cardapio/?email=private@example.com'});await allow(page);await page.locator('input[name=email]').fill('private@example.com');await page.locator('input[name=phone]').fill('11988887777');await page.evaluate(()=>{OgritechUsage.track('signup_submitted');OgritechUsage.track('signup_completed');return OgritechUsage.flush();});const events=requests.flatMap(r=>r.events);assert.equal(events.filter(e=>e.event==='signup_started').length,1);assert(events.some(e=>e.event==='signup_completed'));assert(!JSON.stringify(events).includes('private@example.com'));assert(!JSON.stringify(events).includes('11988887777'));checks.push('signup progress records steps without entered contents');await context.close();
 }
 {
  const {page,context,requests}=await scene();await allow(page);await page.clock.fastForward(30000);await page.evaluate(()=>OgritechUsage.flush());assert(requests.flatMap(r=>r.events).some(e=>e.event==='engagement'&&e.value>=15));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(60000);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(15000);await page.evaluate(()=>OgritechUsage.flush());const times=requests.flatMap(r=>r.events).filter(e=>e.event==='engagement').map(e=>e.value);assert(Math.max(...times)<=45);checks.push('engagement measures visible active time, excluding hidden tabs');
  const oldSession=requests[0].events[0].session_id;await page.evaluate(()=>OgritechUsage.track('click','plans'));await page.clock.fastForward(31*60000);await page.evaluate(()=>{OgritechUsage.track('click','login');return OgritechUsage.flush();});await page.evaluate(()=>OgritechUsage.flush());assert(requests.flatMap(r=>r.events).some(e=>e.session_id!==oldSession));assert(requests.every(r=>new Set(r.events.map(e=>e.session_id)).size===1));checks.push('idle session rotation never mixes sessions in one batch');await context.close();
 }
 {
  const {page,context,requests}=await scene();await allow(page);await page.evaluate(()=>{window.__usageHttpFail=true;OgritechUsage.track('click','plans');return OgritechUsage.flush();});const failed=requests.at(-1);await page.evaluate(()=>{window.__usageHttpFail=false;return OgritechUsage.flush();});assert.deepEqual(requests.at(-1),failed);checks.push('transport retry preserves event ids for server deduplication');await context.close();
 }
 {
  const {page,context,requests,release}=await scene();await page.locator('[data-usage-choice="true"]').click();await page.evaluate(()=>{window.__usageHttpHold=true;void OgritechUsage.flush();});await page.waitForTimeout(100);assert.equal(requests.length,1);await page.evaluate(()=>{window.__usageHttpHold=false;OgritechUsage.track('click','hero_signup');dispatchEvent(new Event('pagehide'));});await page.waitForTimeout(100);assert.equal(requests.length,2);assert(requests[1].events.some(e=>e.event==='click'&&e.target==='hero_signup'));release();await page.waitForTimeout(50);checks.push('navigation flush preserves CTA clicks while another request is still in flight');await context.close();
 }
 {
  const {page,context,requests}=await scene({storageBlocked:true});await allow(page);assert.equal(requests[0].events[0].event,'page_view');checks.push('restricted browser storage does not break site or permission flow');await context.close();
 }
 {
  const {page,context,requests}=await scene({expired:true});assert.equal(await page.locator('.usage-consent').isVisible(),true);await page.evaluate(()=>OgritechUsage.flush());assert.equal(requests.length,0);checks.push('expired permission requires a new choice');await context.close();
 }
 {
  const {page,context,requests}=await scene({path:'/?env=staging'});assert.equal(await page.locator('.usage-consent').count(),0);assert.equal(requests.length,0);checks.push('staging visits never enter production statistics');await context.close();
 }
 for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
  const {page,context,requests}=await scene({path:'/admin.html#traffic',width,admin:true});await page.waitForFunction(()=>document.getElementById('traffic').getAttribute('aria-busy')==='false'&&!document.getElementById('usageResults').hidden);await page.evaluate(theme=>OgritechPanelTheme.set(theme),theme);
  assert.equal(await page.locator('#usageVisitors').textContent(),'100');assert.equal(await page.locator('#usageSignupFunnel li').count(),4);assert.match(await page.locator('#usageSignupFunnel').textContent(),/não chegaram/);assert.equal(await page.locator('.usage-consent').count(),0);assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:resolve(out,`admin-${theme}-${width}.png`),fullPage:true});checks.push(`private report, funnels and layout ${theme} ${width}px`);await context.close();
 }
 {
  const {page,context}=await scene({path:'/admin.html#traffic',admin:true});await page.waitForFunction(()=>!document.getElementById('usageResults').hidden);await page.locator('#usageScope').selectOption('app');await page.waitForFunction(()=>document.getElementById('usageVisitors').textContent==='9');assert.equal(await page.evaluate(()=>__usageCalls.at(-1).scope),'app');
  await page.locator('#usageScope').selectOption('all');await page.waitForFunction(()=>document.getElementById('usageVisitors').textContent==='100');await page.evaluate(()=>window.__usageHold=true);await page.locator('#usageScope').selectOption('app');await page.waitForFunction(()=>__usageHeld.length===1);await page.locator('#usageScope').selectOption('site');await page.waitForFunction(()=>!document.getElementById('usageResults').hidden&&document.getElementById('usageVisitors').textContent==='100');await page.evaluate(()=>{window.__usageHold=false;__usageHeld.splice(0).forEach(done=>done());});await page.waitForTimeout(100);assert.equal(await page.locator('#usageVisitors').textContent(),'100');assert.equal(await page.locator('#usageScope').inputValue(),'site');checks.push('a late response never replaces the selected report');
  await page.evaluate(()=>window.__usageFail=true);await refresh(page);assert.match(await page.locator('#usageMessage').textContent(),/Não foi possível/);assert.equal(await page.locator('#usageResults').isVisible(),false);await page.evaluate(()=>window.__usageFail=false);await refresh(page);assert.equal(await page.locator('#usageResults').isVisible(),true);checks.push('scope filtering, error visibility and refresh recovery');
  await page.evaluate(()=>window.__usageEmpty=true);await refresh(page);assert.equal(await page.locator('#usageZero').isVisible(),true);assert.equal(await page.locator('#usageEngagement').textContent(),'—');checks.push('empty reports show no fabricated activity or invalid percentages');
  await page.evaluate(()=>{window.__usageEmpty=false;window.__usageMalicious=true;});await refresh(page);assert.equal(await page.locator('#usagePageTable img').count(),0);assert(!await page.locator('#usagePageTable').textContent().then(t=>t.includes('<img')));const downloadPromise=page.waitForEvent('download');await page.locator('#usageExport').click();const download=await downloadPromise;const file=resolve(out,'report.csv');await download.saveAs(file);const csv=await readFile(file,'utf8');assert(csv.includes('Instagram'));assert(!csv.includes('onerror'));assert(!csv.includes('<script>'));checks.push('CSV export and safe labels never emit injected content or identifiers');
  const calls=await page.evaluate(()=>__usageCalls.length);await page.locator('#usageStart').fill('2099-01-01');await page.evaluate(()=>document.getElementById('usageFilters').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));assert.equal(await page.evaluate(()=>__usageCalls.length),calls);assert.match(await page.locator('#usageMessage').textContent(),/período válido/);checks.push('invalid periods are refused before requesting data');await context.close();
 }
 assert.deepEqual(pageErrors,[]);assert.deepEqual(unexpectedRequests,[]);await writeFile(resolve(out,'results.json'),JSON.stringify({passed:true,checks,pageErrors,unexpectedRequests,productionWrites:0},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,pageErrors,productionWrites:0}));
}catch(error){await writeFile(resolve(out,'failure.json'),JSON.stringify({error:error.stack,checks,pageErrors,unexpectedRequests},null,2));throw error;}finally{await browser.close();}
