import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=resolve(fileURLToPath(new URL('../',import.meta.url))),origin='https://account-switch.ogritech.invalid';
const output=resolve(root,'outputs/account-switch');await mkdir(output,{recursive:true});
const report={checks:[],errors:[],externalRequests:[]};
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
try{
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
  await context.addInitScript(()=>{
   if(sessionStorage.getItem('fixtureAccountInitialized'))return;
   sessionStorage.setItem('fixtureAccountInitialized','true');
   const old={id:'previous-user',email:'previous@example.invalid'},newUser={id:'new-user',email:'new@example.invalid'};
   let session={user:old};window.__calls=[];
   for(const[key,value]of Object.entries({japaAuth:'true',japaUserId:old.id,japaBarbershopId:'previous-business',ogritechOperationalSession:'previous-context',ogritechMasterMode:'true',ogritechMasterBusinessId:'previous-business',ogritechMasterBusinessName:'Previous business','ogritechSignupEmail:production':newUser.email}))sessionStorage.setItem(key,value);
   const client={auth:{getSession:async()=>{window.__calls.push({type:'restore'});return{data:{session}};},signOut:async options=>{window.__calls.push({type:'logout',scope:options.scope});session=null;return{error:null};},signInWithPassword:async input=>{if(input.email!==newUser.email)throw Error('Wrong fixture account');session={user:newUser};window.__calls.push({type:'login',userId:newUser.id});return{data:{user:newUser,session},error:null};}},rpc:async name=>{window.__calls.push({type:'rpc',name});return{data:false};},from(table){const q={select:()=>q,eq(column,id){if(table!=='profiles'||column!=='id'||id!==newUser.id)throw Error('Wrong profile lookup');window.__calls.push({type:'profile',id});return q;},single:async()=>({data:{role:'owner',active:true,full_name:'Novo proprietário',barbershop_id:'new-business'}})};return q;}};
   window.supabase={createClient:()=>client};
  });
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin){report.externalRequests.push(url.href);return route.abort();}
   if(url.pathname==='/painel/')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Destino de teste</title><p>Destino após autenticação</p>'});
   const file=resolve(root,'.'+(url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname));if(!file.startsWith(root+sep))return route.fulfill({status:403});
   try{let body=await readFile(file);const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon'}[extname(file)]||'application/octet-stream';if(type==='text/html')body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,tag=>/https:|pwa\.js|assistant-widget/.test(tag)?'':tag));return route.fulfill({contentType:type,body});}catch{return route.fulfill({status:404});}
  });
  const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(origin+'/login/?primeiro_acesso=1',{waitUntil:'networkidle'});
  assert.equal(new URL(page.url()).pathname,'/login/');
  assert.equal(await page.locator('#email').inputValue(),'new@example.invalid');
  assert.match(await page.locator('#loginMessage').textContent(),/convite/);
  const before=await page.evaluate(()=>({calls:window.__calls,oldTenant:sessionStorage.getItem('japaBarbershopId'),master:sessionStorage.getItem('ogritechMasterMode')}));
  assert.equal(before.oldTenant,null);assert.equal(before.master,null);assert.deepEqual(before.calls,[{type:'logout',scope:'local'}]);
  await page.screenshot({path:resolve(output,`fresh-login-${width}.png`)});
  await page.fill('#password','fixture-password');
  await page.locator('#loginForm button[type=submit]').click();await page.waitForURL(url=>url.pathname==='/painel/');
  const after=await page.evaluate(()=>({user:sessionStorage.getItem('japaUserId'),business:sessionStorage.getItem('japaBarbershopId'),master:sessionStorage.getItem('ogritechMasterMode'),pending:sessionStorage.getItem('ogritechSignupEmail:production')}));
  assert.deepEqual(after,{user:'new-user',business:'new-business',master:null,pending:null});
  report.checks.push(`new-account entry ignores old session and establishes the new tenant ${width}px`);await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
