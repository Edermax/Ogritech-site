// Real pages, isolated data and callback transport; no messages or customer requests are sent.
const fs=require('fs'),assert=require('assert/strict'),{chromium}=require('playwright');
const {server,setup,extra}=require('./menu-merchant-browser.cjs');
const adminFixture=require('../tests/fixtures/platform-admin.cjs');
const {darkIssues,settle}=require('./panel-theme-checks.cjs');
const out='outputs/assistant-human-contact';fs.mkdirSync(out,{recursive:true});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)}),report=[];
 async function callbackRoute(page,calls){await page.route('**/rest/v1/rpc/public_submit_assistant_callback',route=>{calls.push({body:route.request().postDataJSON(),headers:route.request().headers()});return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{id:'fixture-request',delivery_status:'requested'}})});});}
 try{
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),calls=[];
   await context.route('https://**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
   await context.addInitScript(origin=>{window.OGRITECH_SUPABASE_URL=origin;window.OGRITECH_SUPABASE_PUBLISHABLE_KEY='fixture';},origin);await callbackRoute(page,calls);
   await page.goto(origin+'/');await page.locator('.ogri-assistant__toggle').click();await page.locator('[data-topic=contato]').click();
   assert.equal(await page.locator('[name=channel]').count(),1);assert.equal(await page.locator('[name=channel]').inputValue(),'E-mail');assert.equal(await page.locator('.ogri-assistant a[href^="tel:"],.ogri-assistant a[href*="wa.me"]').count(),0);
   await page.locator('[name=email]').fill('lead@example.invalid');await page.locator('[name=privacyConsent]').check();await page.locator('.ogri-assistant__submit').click();await page.locator('.ogri-assistant__message').filter({hasText:'Solicitação recebida'}).waitFor();assert.equal(calls[0].body.supplied_channel,'E-mail');assert.equal(calls[0].body.supplied_phone,'');assert.equal(calls[0].headers.authorization,undefined);
   await page.goto(origin+'/contato/');assert.equal(await page.locator('[name=preferencia]').inputValue(),'E-mail');assert.equal(await page.locator('[name=whatsapp]').isVisible(),false);report.push({width,visitorEmailOnly:true});await context.close();
   for(const eligible of [true,false]){
    const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),calls=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
    await setup(page,'owner');await extra(page);await page.addInitScript(eligible=>{
     window.__supportEligible=eligible;const rpc=supabaseClient.rpc.bind(supabaseClient);
     supabaseClient.rpc=async(name,args)=>name==='assistant_contact_options'?{data:{channels:window.__supportEligible?['Ligação','WhatsApp','E-mail']:['E-mail']}}:rpc(name,args);
     const getSession=supabaseClient.auth.getSession.bind(supabaseClient.auth);supabaseClient.auth.getSession=async()=>{const result=await getSession();result.data.session.access_token='fixture-user-token';return result;};
    },eligible);await callbackRoute(page,calls);await page.goto(origin+'/painel/');await page.locator('#loadingScreen').waitFor({state:'hidden'});await page.locator('#panelAssistantOpen').click();await page.locator('[data-request-contact]').click();await page.locator('.ogri-assistant__form').waitFor();
    assert.equal(await page.locator('[name=channel]').count(),eligible?3:1);assert.equal(await page.locator('.ogri-assistant a[href^="tel:"]').count(),eligible?1:0);
    if(eligible){
     await page.locator('[name=channel][value=WhatsApp]').check();await page.locator('[name=phone]').fill('11988887777');await page.locator('[name=privacyConsent]').check();await page.locator('.ogri-assistant__submit').click();assert.match(await page.locator('.ogri-assistant__form-message').textContent(),/Confirme o aceite/);assert.equal(calls.length,0);
     await page.locator('[name=whatsappConsent]').check();await page.screenshot({path:`${out}/customer-${width}.png`});await page.locator('.ogri-assistant__submit').click();await page.locator('.ogri-assistant__message').filter({hasText:'Solicitação recebida'}).waitFor();assert.equal(calls[0].body.supplied_channel,'WhatsApp');assert.equal(calls[0].headers.authorization,'Bearer fixture-user-token');
     await page.locator('.ogri-assistant__back').click();await page.locator('[data-request-contact]').click();await page.locator('.ogri-assistant__form').waitFor();await page.evaluate(()=>OgritechPanelTheme.set('dark'));await settle(page);assert.deepEqual(await darkIssues(page),[],'contact form contrast');
     await page.locator('[name=channel][value=Ligação]').check();await page.locator('[name=phone]').fill('11988887777');await page.locator('[name=privacyConsent]').check();await page.locator('.ogri-assistant__submit').click();await page.locator('.ogri-assistant__message').filter({hasText:'Solicitação recebida'}).waitFor();assert.equal(calls[1].body.supplied_channel,'Ligação');
    }
    assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));report.push({width,eligible,channelsCorrect:true});await context.close();
   }
  }
  const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}),page=await context.newPage();
  await context.route('https://**',r=>r.fulfill({body:'',contentType:'application/javascript'}));await context.route('**/supabase-config.js*',r=>r.fulfill({contentType:'application/javascript',body:adminFixture+`
   window.__supportDone=false;const from=supabaseClient.from.bind(supabaseClient);supabaseClient.from=table=>{if(table!=='platform_callback_requests')return from(table);let mutation=false;const q={select(){return q;},in(){return q;},order(){return q;},limit(){return q;},update(){mutation=true;return q;},eq(){return q;},then(resolve,reject){if(mutation)window.__supportDone=true;return Promise.resolve({data:mutation?null:window.__supportDone?[]:[{id:'support-1',contact_channel:'E-mail',email:'lead@example.invalid',status:'new',created_at:'2026-11-15T00:00:00Z'}]}).then(resolve,reject);}};return q;};` }));
  await page.route('**/admin.html',r=>r.fulfill({contentType:'text/html',body:fs.readFileSync('admin.html','utf8')}));
  await page.goto(origin+'/admin.html#support');await page.locator('#humanSupportList article').waitFor();assert.match(await page.locator('#humanSupportList').textContent(),/lead@example.invalid/);await page.locator('[data-support-complete]').click();await page.locator('#humanSupportMessage').filter({hasText:'Nenhuma solicitação'}).waitFor();report.push({adminHumanQueue:true});await context.close();
  fs.writeFileSync(`${out}/result.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
