import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:8107',out='outputs/vitrine-preview';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
const checks=[],errors=[],external=[];
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.route('**/*',async route=>{if(new URL(route.request().url()).origin!==base){external.push(route.request().url());return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push({url:page.url(),stack:error.stack}));
  await page.goto(base+'/',{waitUntil:'networkidle'});assert.match(await page.locator('h1').textContent(),/Sua vitrine online/);
  for(const [tab,index] of [['Artesanato',1],['Vestuário',2]]){
   await page.getByRole('tab',{name:tab,exact:true}).click();
   await page.locator('[data-slide]').nth(index).locator('img').first().waitFor();
   await page.locator('.showcase').screenshot({path:`${out}/home-${tab.toLowerCase()}-${width}.png`,animations:'disabled'});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.goto(base+'/criar-cardapio/?segmento=collectibles',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.getElementById('submitButton').disabled);
  assert.equal(await page.locator('[name=segment]').inputValue(),'collectibles');checks.push(`signup ${width}`);
  for(const [profile,title] of [['food','Cardápio'],['crafts','Catálogo'],['products','Vitrine']]){
   await page.goto(base+`/cardapio/?empresa=fixture&perfil=${profile}`,{waitUntil:'networkidle'});
   await page.locator('#content').waitFor({state:'visible'});assert.match(await page.title(),new RegExp(title));
   assert.equal(await page.locator('body').getAttribute('data-catalog-profile'),profile);checks.push(`public ${profile} ${width}`);
  }
  await page.goto(base+'/painel/?perfil=crafts',{waitUntil:'networkidle'});
  await page.locator('#catalogSegmentForm').waitFor({state:'visible'});
  await page.selectOption('#catalogSegmentForm select','collectibles');page.once('dialog',dialog=>dialog.accept());await page.click('#catalogSegmentForm button');
  await page.locator('#catalogExtensionMessage').filter({hasText:'Atividade salva'}).waitFor();checks.push(`owner activity change ${width}`);
  await page.screenshot({path:`${out}/panel-${width}.png`});
  await page.goto(base+'/admin.html',{waitUntil:'networkidle'});
  await page.locator('.platform-menu a[href="#businesses"]').click();
  assert.equal(await page.locator('#businessTableBody tr').count(),2);
  assert.equal(await page.locator('#businessSegment option[value=collectibles]').count(),1);
  checks.push(`administration ${width}`);
  await page.goto(base+'/contato/',{waitUntil:'networkidle'});
  assert.equal(await page.locator('[name=tipo_negocio] option').count(),20);
  assert.equal(await page.locator('#adaptive input').count(),2);checks.push(`contact ${width}`);
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await writeFile(`${out}/results.json`,JSON.stringify({checks,errors,external},null,2));console.log(JSON.stringify({checks:checks.length,errors,external}));
}finally{await browser.close();}
