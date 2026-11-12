// Full administrative modules and populated, synthetic records; never save.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),fixture=require('../tests/fixtures/platform-admin.cjs');
const {settle,styles,darkIssues}=require('./panel-theme-checks.cjs');
const root=process.cwd(),out='outputs/panel-theme-review/administration';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||pathname.startsWith('/.')||/^\/(?:private|supabase|node_modules|outputs|tests)(?:\/|$)/.test(pathname))return res.writeHead(403).end();
  const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)];
  const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':type||'application/octet-stream'}).end(body);
 }catch{res.writeHead(404).end();}
});

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=process.env.ADMIN_THEME_BASE_URL||'http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)}),results=[];
 async function check(page,label){
  await page.mouse.move(1,1);await settle(page);
  await page.evaluate(()=>OgritechPanelTheme.set('light'));await settle(page);const light=await styles(page);
  await page.evaluate(()=>OgritechPanelTheme.set('dark'));await settle(page);
  assert.deepEqual(await darkIssues(page),[],label);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow: '+label);
  if(/businesses|billing|business-detail|trial-decision/.test(label))await page.screenshot({path:out+'/'+label+'.png'});
  await page.evaluate(()=>OgritechPanelTheme.set('light'));await settle(page);assert.deepEqual(await styles(page),light,'Light preserved: '+label);
  results.push({scene:label,darkContrastPassed:true,lightPreserved:true});
 }
 async function view(page,name){
  const group=name==='trialReviews'?'businesses':['plans','products'].includes(name)?'billing':name;
  await page.locator('.platform-menu a[href="#'+group+'"]').click();
  if(group!==name)await page.locator('#adminSectionTabs a[href="#'+name+'"]').click();
  await page.waitForFunction(key=>location.hash==='#'+key,name);await settle(page);
 }
 async function reveal(page,selector){const target=page.locator(selector).first();if(!await target.isVisible())await page.locator('.admin-more-actions').filter({has:page.locator(selector)}).first().locator('summary').click();return target;}
 async function close(page){await page.keyboard.press('Escape');await settle(page);}
 try{
  for(const viewport of[{width:390,height:844},{width:768,height:900},{width:1440,height:900}]){
   const {width}=viewport,context=await browser.newContext({viewport,serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await context.route('**/supabase-config.js*',r=>r.fulfill({contentType:'application/javascript',body:fixture}));
   await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
   await context.route('**/pwa.js*',r=>r.fulfill({contentType:'application/javascript',body:''}));
   await context.route('https://*.supabase.co/**',r=>r.abort());
   await page.goto(base+'/admin.html');await page.locator('#adminLoading').waitFor({state:'hidden'});
   assert.equal(await page.locator('#businessCount').innerText(),'2');
   for(const name of['overview','businesses','users','plans','products','trialReviews','billing','account']){
    await view(page,name);if(name==='trialReviews')await page.locator('[data-review-id]').first().waitFor();
    await check(page,name+'-'+width);
   }
   await view(page,'businesses');await page.locator('[data-action="detail"]').first().click();await check(page,'business-detail-'+width);
   await page.locator('#detailEditButton').click();await check(page,'business-edit-'+width);await close(page);
   await page.locator('#businessSearch').fill('Nenhum registro correspondente');await page.locator('#businessEmpty').waitFor({state:'visible'});await check(page,'empty-search-'+width);await page.locator('#businessSearch').fill('');
   await page.evaluate(()=>OgritechPanelTheme.set('dark'));await settle(page);
   const operate=page.locator('[data-action="operate"]:not(:disabled)').first();
   assert.equal(await operate.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(8, 185, 211)');
   await operate.hover();await settle(page);assert.equal(await operate.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(88, 213, 230)');
   assert.deepEqual(await darkIssues(page),[],'Hovered operation contrast');
   const disabled=page.locator('[data-action="operate"]:disabled');assert.equal(await disabled.count(),1);
   assert.equal(await disabled.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(23, 39, 52)');
   assert.equal(await disabled.evaluate(el=>getComputedStyle(el).opacity),'1');
   await page.mouse.move(1,1);await page.keyboard.press('Tab');await page.locator('#newBusinessButton').focus();
   assert.ok(await page.locator('#newBusinessButton').evaluate(el=>el.matches(':focus-visible')&&parseFloat(getComputedStyle(el).outlineWidth)>=3));
   await page.evaluate(()=>OgritechPanelTheme.set('light'));
   results.push({scene:'action-states-'+width,primaryCyan:true,hoverFeedback:true,disabledDistinct:true,keyboardFocusVisible:true});
   await view(page,'users');await page.locator('[data-user-action="edit"]').first().click();await check(page,'user-edit-'+width);await close(page);
   await page.locator('#newUserButton').click();await check(page,'user-create-'+width);await close(page);
   await view(page,'plans');await page.locator('[data-edit-plan]').first().click();await check(page,'plan-edit-'+width);await close(page);
   await view(page,'billing');await page.locator('#newInvoiceButton').click();await page.locator('#invoiceQuantity').fill('2');assert.match(await page.locator('#invoicePreviewTotal').innerText(),/99,80/);await check(page,'invoice-create-'+width);await close(page);
   await page.locator('[data-billing-action="pay"]').first().click();await check(page,'payment-form-'+width);await close(page);
   await (await reveal(page,'[data-billing-action="refund"]')).click();await check(page,'refund-form-'+width);await close(page);
   await view(page,'trialReviews');await page.locator('[data-review-id]').first().click();await check(page,'trial-decision-'+width);await page.locator('#closeTrialReview').click();
   // Only display the existing readonly credential card; no credential is made.
   await page.evaluate(()=>openAdminModal('temporaryPasswordModal'));await check(page,'credential-card-'+width);await close(page);
   await view(page,'account');await page.locator('[data-panel-theme-select]').selectOption('dark');await page.reload();await page.locator('#adminLoading').waitFor({state:'hidden'});assert.equal(await page.locator('html').getAttribute('data-panel-theme'),'dark');await page.locator('[data-panel-theme-select]').selectOption('light');
   assert.deepEqual(errors,[]);const calls=await page.evaluate(()=>__fixtureCalls);
   assert.ok(calls.every(call=>!call.rpc||['is_platform_admin','platform_menu_trial_reviews'].includes(call.rpc)));
   assert.ok(calls.every(call=>!call.function||call.action==='list'));
   await context.close();
  }
  fs.writeFileSync(out+'/result.json',JSON.stringify({productionWrites:0,results},null,2));console.log(JSON.stringify({scenes:results.length,allPassed:true}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
