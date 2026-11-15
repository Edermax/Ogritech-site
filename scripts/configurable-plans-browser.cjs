// Real markup/controllers, synthetic catalog and billing API. Never contacts a provider.
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const adminFixture = require('../tests/fixtures/platform-admin.cjs');
const root = process.cwd(), out = 'outputs/configurable-plans'; fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req,res) => {
  try {
    const pathname = new URL(req.url,'http://localhost').pathname, file = path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if (!file.startsWith(root+path.sep) || /^\/(?:\.|private|supabase|node_modules|outputs|tests)(?:\/|$)/.test(pathname)) return res.writeHead(403).end();
    const type = {'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)];
    res.writeHead(200,{'Content-Type':type||'application/octet-stream'}).end(fs.readFileSync(file));
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||(process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
  const report = [];
  const externalBlock = context => context.route('https://**', route => route.fulfill({contentType:'application/javascript',body:''}));
  async function publicPage(catalog, width, { failCatalog=false, billingState=null, priceConflict=false } = {}) {
    const context = await browser.newContext({viewport:{width,height:940},serviceWorkers:'block',reducedMotion:'reduce'}), page = await context.newPage(), calls=[], errors=[];
    page.on('pageerror',error=>errors.push(error.message)); await externalBlock(context);
    await context.addInitScript(({catalog,failCatalog})=>{window.__catalog=catalog;window.__catalogFail=failCatalog;},{catalog,failCatalog});
    await context.route('**/supabase-config.js*',route=>route.fulfill({contentType:'application/javascript',body:`
      window.OGRITECH_ENV='staging';window.OGRITECH_SUPABASE_URL=location.origin;window.OGRITECH_SUPABASE_PUBLISHABLE_KEY='fixture';
      window.ogritechEnvironmentUrl=path=>{const url=new URL(path,location.origin);url.searchParams.set('env','staging');return url.href;};
      window.supabaseClient={rpc:async name=>name==='public_menu_plans'?(window.__catalogFail?{error:{message:'fixture outage'}}:{data:window.__catalog.filter(plan=>plan.active!==false).map(plan=>({...plan,offer_code:plan.menu_offer_code}))}):{data:null},
       auth:{getSession:async()=>({data:{session:{user:{id:'fixture-owner'}}}}),signOut:async()=>({})},
       from(){const q={select(){return q;},eq(){return q;},maybeSingle:async()=>({data:{active:true,role:'owner',barbershop_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}})};return q;},
       functions:{invoke:async(name,{body})=>{const response=await fetch('/functions/v1/ogritech-billing',{method:'POST',body:JSON.stringify(body)});return response.ok?{data:await response.json()}:{error:{context:response}};}}};
    `}));
    let conflictPending = priceConflict;
    await context.route('**/functions/v1/ogritech-billing',async route=>{
      const body=route.request().postDataJSON();
      if(body.action==='trial_configuration')return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{available:true,phone_verification:false,turnstile_site_key:''}})});
      calls.push(body);
      if(body.action==='billing_status')return route.fulfill({contentType:'application/json',body:JSON.stringify({data:billingState})});
      if(body.action==='change_offer'){
        const plan=catalog.find(plan=>plan.id===body.plan_id);billingState={...billingState,plan_id:plan.id,plan_name:plan.name,offer:plan.menu_offer_code,monthly_cents:Math.round(plan.monthly_fee*100),annual_cents:Math.round(plan.annual_fee*100),total_cents:Math.round((billingState.cycle==='annual'?plan.annual_fee:plan.monthly_fee)*100)};
        return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{offer:plan.menu_offer_code}})});
      }
      if(conflictPending){conflictPending=false;await page.evaluate(id=>{const plan=window.__catalog.find(plan=>plan.id===id);plan.annual_fee=750;},body.plan_id);return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:{code:'price_changed',message:'O valor do plano mudou.'}})});}
      return route.fulfill({contentType:'application/json',body:JSON.stringify({data:{trial_ends_at:'2099-01-01T00:00:00Z',login_url:'/login/'}})});
    });
    return {context,page,calls,errors};
  }
  async function fillSignup(page) {
    await page.locator('[name=business_name]').fill('Negócio preservado');await page.locator('[name=tax_document]').fill('52998224725');
    await page.locator('[name=responsible_name]').fill('Pessoa Teste');await page.locator('[name=email]').fill('plan-fixture@example.invalid');
    await page.locator('[name=phone]').fill('11999999999');await page.locator('[name=segment]').selectOption('Pizzaria');
    await page.locator('[name=service_invoice_preference]').selectOption('not_requested');await page.locator('[name=accepted_terms]').check();await page.locator('[name=publish_whatsapp]').check();
  }
  try {
    let catalog=[];
    for(const width of [390,1440]) {
      const context=await browser.newContext({viewport:{width,height:940},serviceWorkers:'block',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));await externalBlock(context);
      await context.route('**/supabase-config.js*',route=>route.fulfill({contentType:'application/javascript',body:adminFixture+`
        window.__planTables=tables;window.__savedPlans=[];
        const originalRpc=window.supabaseClient.rpc.bind(window.supabaseClient);
        window.supabaseClient.rpc=async(name,{payload}={})=>{
          if(name!=='platform_save_menu_plan')return originalRpc(name);
          window.__savedPlans.push(structuredClone(payload));if(window.__savePlanFailure)return {error:{code:'08006'}};
          let row=tables.saas_plans.find(plan=>plan.id===payload.id);
          if(!row&&tables.saas_plans.some(plan=>plan.code===payload.code))return{error:{code:'23505',message:'Já existe um plano com esse código.'}};
          if(!row){row={id:crypto.randomUUID(),product_id:'product-1'};tables.saas_plans.push(row);}
          Object.assign(row,{...payload,id:row.id,menu_offer_code:payload.offer_code});return{data:row};
        };
      `}));
      await context.route('**/pwa.js*',route=>route.fulfill({contentType:'application/javascript',body:''}));
      await page.goto(origin+'/admin.html');await page.locator('#adminLoading').waitFor({state:'hidden'});
      await page.locator('.platform-menu a[href="#billing"]').click();await page.locator('#adminSectionTabs a[href="#plans"]').click();await page.locator('#newPlanButton').click();
      await page.locator('#planName').fill('Encomendas Pro');assert.equal(await page.locator('#planCode').inputValue(),'encomendas-pro');
      await page.locator('#planOffer').selectOption('encomendas');await page.locator('#planPrice').fill('79.90');await page.locator('#planAnnualPrice').fill('720');
      await page.locator('#planMaxUsers').fill('3');await page.locator('#planDescription').fill('Encomendas para uma equipe de três usuários.');await page.locator('#planFeatures').fill('Catálogo completo\nGestão de pedidos');
      await page.evaluate(()=>{window.__savePlanFailure=true;});await page.locator('#savePlanButton').click();
      await page.locator('#planFormMessage').filter({hasText:/Não foi possível salvar/}).waitFor();assert.equal(await page.locator('#planName').inputValue(),'Encomendas Pro');
      await page.evaluate(()=>{window.__savePlanFailure=false;});await page.locator('#savePlanButton').click();await page.locator('#planModal').waitFor({state:'hidden'});
      let plan=await page.evaluate(()=>window.__planTables.saas_plans.find(plan=>plan.code==='encomendas-pro'));
      let card=page.locator('.plan-card').filter({has:page.locator(`[data-edit-plan="${plan.id}"]`)});
      assert.match(await card.textContent(),/79,90/);assert.match(await card.textContent(),/720,00/);
      const href=new URL(await card.locator('a').getAttribute('href'),origin);assert.equal(href.pathname,'/criar-cardapio/encomendas/');assert.equal(href.searchParams.get('plano_id'),plan.id);
      await card.locator('[data-edit-plan]').click();assert.equal(await page.locator('#planCode').isEditable(),false);assert.equal(await page.locator('#planOffer').isDisabled(),true);
      await page.locator('#planActive').uncheck();await page.locator('#savePlanButton').click();await page.locator('#planModal').waitFor({state:'hidden'});
      assert.match(await card.textContent(),/Indisponível para novas contratações/);assert.equal(await card.locator('a').count(),0);
      await card.locator('[data-edit-plan]').click();await page.locator('#planActive').check();await page.locator('#savePlanButton').click();await page.locator('#planModal').waitFor({state:'hidden'});
      await page.locator('#newPlanButton').click();await page.locator('#planName').fill('Cardápio Equipe');await page.locator('#planOffer').selectOption('cardapio');
      await page.locator('#planPrice').fill('49.90');await page.locator('#planAnnualPrice').fill('499');await page.locator('#planDescription').fill('Seleção no WhatsApp para uma equipe de cinco usuários.');await page.locator('#planMaxUsers').fill('5');
      await page.locator("#planModal .platform-modal-card").evaluate(el=>{el.scrollTop=0;});await page.screenshot({path:`${out}/create-plan-${width}.png`});await page.locator('#savePlanButton').click();await page.locator('#planModal').waitFor({state:'hidden'});
      catalog=await page.evaluate(()=>window.__planTables.saas_plans.filter(plan=>['encomendas-pro','cardapio-equipe'].includes(plan.code)));
      await page.locator('#plansGrid').screenshot({path:`${out}/catalog-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
      report.push({width,adminCreate:true,failedSavePreservesFields:true,deactivationAndReactivation:true,explicitCapabilityFamily:true});await context.close();
      for(const plan of catalog) {
        const f=await publicPage(catalog,width);await f.page.goto(origin+`/criar-cardapio/${plan.menu_offer_code}/?plano_id=${plan.id}`);
        await f.page.waitForFunction(()=>!document.getElementById('submitButton').disabled);assert.equal(await f.page.locator('#signupPlanChoice').inputValue(),plan.id);
        assert.match(await f.page.locator('#selectedOfferName').textContent(),new RegExp(plan.name));await f.page.locator('[name=cycle]').selectOption('annual');await fillSignup(f.page);
        await f.page.locator('#submitButton').click();await f.page.locator('#resultSection').waitFor({state:'visible'});const request=f.calls.find(call=>call.action==='start_trial');
        assert.equal(request.plan_id,plan.id);assert.equal(request.offer,plan.menu_offer_code);assert.equal(request.expected_total_cents,Math.round(plan.annual_fee*100));assert.deepEqual(f.errors,[]);await f.context.close();
      }
    }
    const plan=catalog.find(plan=>plan.menu_offer_code==='encomendas');
    const stale=await publicPage(catalog,390,{priceConflict:true});await stale.page.goto(origin+`/criar-cardapio/encomendas/?plano_id=${plan.id}`);await stale.page.waitForFunction(()=>!document.getElementById('submitButton').disabled);
    await stale.page.locator('[name=cycle]').selectOption('annual');await fillSignup(stale.page);await stale.page.locator('#submitButton').click();
    await stale.page.locator('#formMessage').filter({hasText:/Confira o novo valor/}).waitFor();assert.equal(await stale.page.locator('[name=business_name]').inputValue(),'Negócio preservado');assert.match(await stale.page.locator('#selectedOfferPrice').textContent(),/750,00/);
    await stale.page.locator('#submitButton').click();await stale.page.locator('#resultSection').waitFor({state:'visible'});assert.equal(stale.calls.at(-1).expected_total_cents,75000);assert.deepEqual(stale.errors,[]);await stale.context.close();
    const missing=await publicPage(catalog,390);await missing.page.goto(origin+'/criar-cardapio/encomendas/?plano_id=99999999-9999-4999-8999-999999999999');
    await missing.page.locator('#formMessage').filter({hasText:/Esse plano não está disponível/}).waitFor();assert.equal(await missing.page.locator('#submitButton').isDisabled(),true);await missing.page.locator('#signupPlanChoice').selectOption(plan.id);assert.equal(await missing.page.locator('#submitButton').isDisabled(),false);await missing.context.close();
    const unavailable=await publicPage(catalog,390,{failCatalog:true});await unavailable.page.goto(origin+'/criar-cardapio/encomendas/');await unavailable.page.locator('#formMessage').filter({hasText:/Não foi possível carregar os planos/}).waitFor();assert.equal(await unavailable.page.locator('#submitButton').isDisabled(),true);await unavailable.context.close();
    const changedCatalog=catalog.map(plan=>({...plan,monthly_fee:89.90,annual_fee:899}));
    const billing=await publicPage(changedCatalog,390,{billingState:{plan_id:plan.id,plan_name:plan.name,offer:'encomendas',monthly_cents:7990,annual_cents:72000,cycle:'annual',total_cents:72000,payment_method:'pix',status:'active',trial_ends_at:'2099-01-01T00:00:00Z',access_until:'2099-01-01T00:00:00Z'}});
    await billing.page.goto(origin+'/assinatura/');await billing.page.locator('#billingStatus').filter({hasText:'Assinatura ativa'}).waitFor();assert.match(await billing.page.locator('#billingCycle').textContent(),/720,00/);assert.doesNotMatch(await billing.page.locator('#billingCycle').textContent(),/899,00/);
    await billing.page.screenshot({path:`${out}/contract-price-preserved.png`});assert.deepEqual(billing.errors,[]);await billing.context.close();
    report.push({publicCustomSignup:true,priceConflictPreservesForm:true,unavailablePlanBlocked:true,catalogOutageBlocked:true,contractPricePreserved:true});
    fs.writeFileSync(`${out}/result.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
