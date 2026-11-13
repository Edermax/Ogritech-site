// Real panel markup/styles with isolated Auth/data fixtures. No customer writes.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {server,setup,extra}=require('./menu-merchant-browser.cjs');
const out='outputs/panel-theme-review';fs.mkdirSync(out,{recursive:true});
async function goWorkspace(page,key){
 const sections={operation:'cardapio',catalog:'produtos',settings:'loja',review:'loja',sales:'vendas'};
 await page.locator('.menu-item[data-section="'+sections[key]+'"]').click();
 await page.waitForFunction(()=>window.OgritechMenuWorkspace.state().ready);
 if(key==='settings')await page.locator('[data-menu-workspace="settings"]').click();
}
async function settle(page){await page.evaluate(async()=>{
 await new Promise(resolve=>requestAnimationFrame(resolve));
 await Promise.all(document.getAnimations().filter(animation=>animation instanceof CSSTransition).map(animation=>animation.finished.catch(()=>{})));
});}

async function styles(page){return page.evaluate(()=>[...document.querySelectorAll('body *')]
 .filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden'&&!['SCRIPT','STYLE','OPTION'].includes(el.tagName))
 .map(el=>{const s=getComputedStyle(el);return{tag:el.tagName,id:el.id,classes:el.className?.baseVal??el.className,
  color:s.color,background:s.backgroundColor,border:s.borderColor,font:s.fontFamily,fontSize:s.fontSize,padding:s.padding,radius:s.borderRadius};}));}

async function darkIssues(page){return page.evaluate(()=>{
 const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
 const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const issues=[];
 for(const el of document.querySelectorAll('body *')){
  if(!el.getClientRects().length||el.closest('.menu-branding-preview,#menuShareQr,.menu-qr-paper')||['SCRIPT','STYLE','SVG','IMG','CANVAS','OPTION'].includes(el.tagName))continue;
  const s=getComputedStyle(el);if(s.visibility==='hidden')continue;
  const own=rgb(s.backgroundColor),text=[...el.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
  const selector=el.id?'#'+el.id:el.tagName.toLowerCase()+'.'+[...el.classList].join('.');
  if(own.length>=3&&(own[3]??1)>.95&&own.slice(0,3).every(v=>v>210))issues.push({kind:'light-surface',selector,text:text.slice(0,65)});
  if(!text||el.closest('button:disabled,[aria-disabled="true"]'))continue;
  let bg=[255,255,255],layers=[];
  for(let parent=el;parent;parent=parent.parentElement)layers.unshift(rgb(getComputedStyle(parent).backgroundColor));
  for(const c of layers){const alpha=c[3]??1;if(c.length>=3)bg=c.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));}
  const fg=rgb(s.color),alpha=fg[3]??1,ink=fg.slice(0,3).map((v,i)=>v*alpha+bg[i]*(1-alpha));
  const ratio=(Math.max(luminance(ink),luminance(bg))+.05)/(Math.min(luminance(ink),luminance(bg))+.05);
  const large=parseFloat(s.fontSize)>=24||parseFloat(s.fontSize)>=18.66&&Number(s.fontWeight)>=700;
  if(ratio<(large?3:4.5))issues.push({kind:'contrast',selector,ratio:Math.round(ratio*100)/100,text:text.slice(0,65)});
 }
 return issues;
});}

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
 const results=[];
 async function check(page,label){
  // Compare identical interaction states: clicking a launcher can leave :hover
  // behind a modal until Chromium recomputes hit testing on the next frame.
  await page.mouse.move(1,1);
  await settle(page);
  await page.evaluate(()=>OgritechPanelTheme.set('light'));await settle(page);const original=await styles(page);
  await page.evaluate(()=>OgritechPanelTheme.set('dark'));await settle(page);
  const issues=await darkIssues(page);assert.deepEqual(issues,[],label);
  if(/assistant|operation|review|account|ready-whatsapp/.test(label))await page.screenshot({path:out+'/'+label+'-dark.png'});
  await page.evaluate(()=>OgritechPanelTheme.set('light'));await settle(page);assert.deepEqual(await styles(page),original,'Original light appearance: '+label);
  results.push({scene:label,darkContrastPassed:true,lightPreserved:true});
 }
 try{
  for(const width of[390,1440]){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));await setup(page,'owner');await extra(page);
   await context.route('**/supabase-config.js*',r=>r.fulfill({contentType:'application/javascript',body:''}));
   await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
   await page.goto(base+'/painel/');await page.locator('#menuOrdersList article').first().waitFor();await page.locator('#panelNotificationReports button').first().waitFor({state:'attached'});
   await page.locator('.menu-item[data-section="configuracoes"]').click();await page.locator('#subscriptionList article').waitFor();
   await page.locator('[data-panel-theme-select]').selectOption('dark');await page.reload();await page.locator('#menuOrdersList article').first().waitFor();assert.equal(await page.locator('html').getAttribute('data-panel-theme'),'dark');
   await page.locator('.menu-item[data-section="configuracoes"]').click();await page.locator('[data-panel-theme-select]').selectOption('light');await check(page,'account-'+width);
   await page.locator('#changePasswordButton').click();await check(page,'password-'+width);await page.locator('#changePasswordDialog').evaluate(el=>el.close());
   await page.locator('.menu-item[data-section="cardapio"]').click();
   for(const section of['operation','settings','catalog','review','sales']){
    await goWorkspace(page,section);
    await page.locator('#menuView details').evaluateAll(elements=>elements.forEach(el=>{if(el.getClientRects().length)el.open=true;}));
    await check(page,section+'-'+width);
   }
   await goWorkspace(page,'catalog');await page.locator('#panelAddProduct').click();await check(page,'product-editor-'+width);await page.locator('#menuItemCancel').click();
   await page.locator('.panel-product-more>summary').first().click();await check(page,'product-actions-'+width);
   await goWorkspace(page,'operation');
   const orderControls=page.locator('#menuOrdersList button');
   await orderControls.evaluateAll(elements=>elements.forEach(el=>{el.disabled=true;}));
   await check(page,'disabled-operation-'+width);
   await page.evaluate(()=>OgritechPanelTheme.set('dark'));
   assert.ok(await orderControls.evaluateAll(elements=>elements.every(el=>getComputedStyle(el).backgroundColor==='rgb(23, 39, 52)')));
   await page.evaluate(()=>OgritechPanelTheme.set('light'));
   await orderControls.evaluateAll(elements=>elements.forEach(el=>{el.disabled=false;}));
   assert.equal(await page.locator('#menuOrdersList [data-order-action="ready"]').count(),1);
   const callsBeforeReady=await page.evaluate(()=>window.__calls.length);
   await page.locator('#menuOrdersList [data-order-action="ready"]').click();
   await check(page,'ready-whatsapp-'+width);
   const readyUrl=new URL(await page.locator('#menuReadyWhatsApp').getAttribute('href'));
   assert.equal(readyUrl.hostname,'wa.me');assert.equal(readyUrl.pathname,'/5511999999999');assert.match(readyUrl.searchParams.get('text'),/#2/);
   await page.locator('#menuReadyText').fill('Sua encomenda está pronta!');assert.equal(new URL(await page.locator('#menuReadyWhatsApp').getAttribute('href')).searchParams.get('text'),'Sua encomenda está pronta!');
   await page.locator('#menuReadyCancel').click();assert.equal(await page.evaluate(()=>window.__calls.length),callsBeforeReady);
   assert.equal(await page.evaluate(()=>window.__notificationOrders[1].status),'confirmed');
   await page.locator('#menuOrdersList [data-order-action="mark_paid"]').first().click();await check(page,'payment-'+width);await page.locator('#menuPaymentCancel').click();
   await page.locator('#menuOrdersList [data-order-action="review_decision"]').first().click();await check(page,'decision-'+width);await page.locator('#menuDecisionCancel').click();
   await page.locator('#panelAssistantOpen').click();await page.locator('.ogri-assistant__panel').waitFor({state:'visible'});await check(page,'assistant-'+width);
   await page.locator('.ogri-assistant__option[data-topic="pedidos"]').click();await check(page,'assistant-answer-'+width);await page.locator('.ogri-assistant__close').click();
   await page.locator('#panelNotificationButton').click();await page.locator('#panelNotificationReports button').first().waitFor();await check(page,'notifications-'+width);
   await page.locator('#panelNotificationReadAll').click();await check(page,'notifications-read-'+width);
   await page.locator('#panelNotificationReports button').first().click();await page.locator('#salesReportExports').waitFor({state:'visible'});await check(page,'report-'+width);await page.locator('#salesReportClose').click();
   // Simulate the unpublished catalog and pending-control states without saving.
   await page.evaluate(async()=>{const {data}=await supabaseClient.from('online_menus').select().maybeSingle();data.published=false;await loadMenuAdmin();});
   for(const section of['settings','catalog','review']){
    await goWorkspace(page,section);
    await page.locator('#menuView details').evaluateAll(elements=>elements.forEach(el=>{if(el.getClientRects().length)el.open=true;}));
    await check(page,'draft-'+section+'-'+width);
   }
   assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
   const adminContext=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',reducedMotion:'reduce'}),adminPage=await adminContext.newPage();
   await adminPage.goto(base+'/admin.html');await adminPage.locator('#adminLoading').evaluate(el=>el.remove());
   await check(adminPage,'admin-'+width);await adminPage.locator('#trialReviewDialog').evaluate(el=>el.showModal());await check(adminPage,'admin-decision-'+width);await adminPage.locator('#trialReviewDialog').evaluate(el=>el.close());await adminContext.close();
  }
  fs.writeFileSync(out+'/result.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
