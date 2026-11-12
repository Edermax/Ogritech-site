const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),fixture=require('../tests/fixtures/platform-admin.cjs');
const root=process.cwd(),out='outputs/admin-navigation';fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
 if(!file.startsWith(root+path.sep)||/^\/(?:\.|private|supabase|node_modules|outputs|tests)/.test(pathname))return res.writeHead(403).end();
 const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)];
 res.writeHead(200,{'Content-Type':type||'application/octet-stream'}).end(fs.readFileSync(file));
}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)}),results=[];
 try{
  for(const width of[320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await context.route('**/supabase-config.js*',r=>r.fulfill({contentType:'application/javascript',body:fixture}));
   await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:''}));
   await context.route('**/pwa.js*',r=>r.fulfill({contentType:'application/javascript',body:''}));
   await context.route('https://*.supabase.co/**',r=>r.abort());
   await page.goto(base+'/admin.html');await page.locator('#adminLoading').waitFor({state:'hidden'});
   for(const theme of['light','dark']){
    await page.evaluate(theme=>OgritechPanelTheme.set(theme),theme);
    for(const [key,parent]of[['overview','overview'],['businesses','businesses'],['trialReviews','businesses'],['users','users'],['billing','billing'],['products','billing'],['plans','billing'],['account','account']]){
     await page.locator('.platform-menu a[href="#'+parent+'"]').click();
     if(key!==parent)await page.locator('#adminSectionTabs a[href="#'+key+'"]').click();
     if(key==='trialReviews')await page.locator('[data-review-id]').first().waitFor();
     assert.equal(new URL(page.url()).hash,'#'+key);
     assert.equal(await page.locator('.platform-menu a[aria-current="page"]').getAttribute('href'),'#'+parent);
     assert.deepEqual(await page.locator('.platform-menu a').allTextContents(),['Resumo','Negócios','Acessos','Financeiro','Conta']);
     assert.ok(await page.locator('.platform-menu a').evaluateAll(els=>els.every(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),key+' '+width);
     const panel={overview:'adminSummary',account:'adminAccount'}[key]||key;
     assert.equal(await page.locator('#'+panel).isVisible(),true);
     if(key==='account'){
      assert.equal(await page.locator('.admin-account .owner-avatar').isVisible(),true);
      assert.ok(await page.locator('#platformOwnerName').evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=150&&r.height<=44;}),'Administrator name has room to read');
      assert.equal(await page.locator('.admin-account .platform-owner-card small').isVisible(),true);
     }
     await page.mouse.move(1,1);await page.screenshot({path:out+'/'+key+'-'+theme+'-'+width+'.png'});
    }
    await page.locator('.platform-menu a[href="#businesses"]').click();
    assert.equal(await page.locator('#businessSearch').isVisible(),true);
    if(width<=1000){
     assert.equal(await page.locator('#segmentFilter').isVisible(),false);
     await page.locator('#adminAdvancedFilters>summary').click();
     await page.locator('#segmentFilter').selectOption('Confeitaria');
     assert.match(await page.locator('#adminAdvancedFilters>summary').textContent(),/ativos/);
     assert.equal(await page.locator('#businessTableBody tr').count(),1);
     await page.locator('#segmentFilter').selectOption('all');
     await page.locator('#adminAdvancedFilters>summary').click();
    }
    await page.locator('#businessSearch').fill('Confeitaria');
    assert.equal(await page.locator('#businessTableBody tr').count(),1);
    const more=page.locator('#businessTableBody .admin-more-actions>summary').first();await more.click();
    assert.equal(await page.locator('#businessTableBody [data-action="delete"]').first().isVisible(),true);
    await page.locator('#businessTableBody [data-action="edit"]').first().click();
    const footer=page.locator('#businessForm .admin-modal-actions');
    assert.equal(await footer.locator('button[type="submit"]').textContent(),'Salvar negócio');
    assert.equal(await footer.locator('button[type="button"]').textContent(),'Cancelar');
    assert.ok(await footer.locator('button').evaluateAll(els=>els.every(el=>el.getBoundingClientRect().height>=44)));
    await footer.locator('button[type="button"]').click();
    assert.equal(await page.locator('#businessModal').isVisible(),false);
    await page.locator('#businessSearch').fill('');
    await page.locator('.platform-menu a[href="#billing"]').click();
    await page.locator('#adminSectionTabs a[href="#products"]').click();
    await page.goBack();assert.equal(new URL(page.url()).hash,'#billing');
    await page.goForward();assert.equal(new URL(page.url()).hash,'#products');
    assert.equal(await page.locator('.platform-menu a[aria-current="page"]').getAttribute('href'),'#billing');
    results.push({width,theme,stableNavigation:true,subareas:true,filters:true,contextualActions:true,consistentSaveCancel:true,history:true});
   }
   assert.deepEqual(errors,[]);
   const calls=await page.evaluate(()=>__fixtureCalls);
   assert.ok(calls.every(call=>!call.rpc||['is_platform_admin','platform_menu_trial_reviews'].includes(call.rpc)));
   assert.ok(calls.every(call=>!call.function||call.action==='list'));
   await context.close();
  }
  fs.writeFileSync(out+'/result.json',JSON.stringify({productionWrites:0,results},null,2));console.log(JSON.stringify({scenarios:results.length,allPassed:true,productionWrites:0}));
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
