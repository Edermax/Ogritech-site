import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { createHmac, webcrypto } from "node:crypto";
import test from "node:test";
import { z } from "zod";

const pixAttempt={request_id:"11111111-1111-4111-8111-111111111111",external_reference:"signup:aabbccdd-1234-4000-8000-123456789012:pix:11111111-1111-4111-8111-111111111111",expires_at:new Date(Date.now()+72*3600000).toISOString()};
const root = new URL("../", import.meta.url);
const signup = { id: "aabbccdd-1234-4000-8000-123456789012", product_code: "menu", total_cents: 4990, cycle_months: 1,
  email: "fixture@example.invalid", status: "trial_active", trial_ends_at: new Date(Date.now()+3600000).toISOString(), access_until: null };

// Execute the real Edge handler with only the database and provider replaced.
const runtimeLogs=[];

async function loadHandler(name, admin, fetchImpl, environment = {}, clock = Date) {
  let handler;
  const source = await readFile(new URL(`supabase/functions/${name}/index.ts`, root), "utf8");
  const code = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, ""));
  runInNewContext(code, {
    createClient: () => admin, z, fetch: fetchImpl, crypto: webcrypto, Request, Response, URL, URLSearchParams, Date: clock, TextEncoder, AbortSignal,
    console: { error() {}, info(value) { runtimeLogs.push(JSON.parse(value)); } },
    Deno: { env: { get: key => ({ SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture",
      MERCADO_PAGO_ACCESS_TOKEN: "fixture", MERCADO_PAGO_WEBHOOK_SECRET: "fixture-secret", BILLING_CRON_SECRET: "fixture-cron", ...environment })[key] }, serve: value => { handler = value; } }
  });
  return handler;
}

function webhookDb({ rpcFailure = false, completionFailure = false } = {}) {
  const events = new Map();
  let calls = 0;
  return { events, get calls() { return calls; }, setRpcFailure(value) { rpcFailure=value; }, setCompletionFailure(value) { completionFailure=value; },
    rpc: async name => name.endsWith("lookup") ? { data: signup } : (calls++, { error: rpcFailure ? { code: "fixture_failure" } : null }),
    from: () => {
      let op, values, row;
      const chain = {
        insert(value) { if(events.has(value.provider_event_id)) return Promise.resolve({error:{code:"23505"}}); events.set(value.provider_event_id,{...value}); return Promise.resolve({error:null}); },
        select() { op="select";return chain; }, update(value) { op="update";values=value;return chain; },
        eq(key,value) { if(key==="provider_event_id") row=events.get(value);return chain; },
        single: async () => ({data:row,error:null}),
        then(resolve,reject) { if(op==="update" && !(completionFailure && values.processed_at)) Object.assign(row,values);
          return Promise.resolve({error:completionFailure && values?.processed_at ? {code:"fixture_failure"}:null}).then(resolve,reject); }
      }; return chain;
    }
  };
}

function notification(id="evt-1",type="payment") {
  const dataId="payment-1", requestId="fixture-request", ts=String(Date.now());
  const signature=createHmac("sha256","fixture-secret").update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return new Request("https://fixture.invalid/webhook",{method:"POST",headers:{"content-type":"application/json","x-request-id":requestId,"x-signature":`ts=${ts},v1=${signature}`},body:JSON.stringify({id,type,data:{id:dataId}})});
}
const provider = async () => Response.json({ status:"approved", transaction_amount:49.90,currency_id:"BRL",external_reference:`signup:${signup.id}` });

test("webhook retries an unprocessed notification after a provider failure",async()=>{
  const db=webhookDb();let failures=1;
  const handler=await loadHandler("mercado-pago-webhook",db,async()=>failures-- > 0 ? new Response("failure",{status:503}):provider());
  assert.equal((await handler(notification())).status,500);
  assert.equal((await handler(notification())).status,200);
  assert.equal(db.calls,1);
  assert.ok(db.events.get("evt-1").processed_at);
  assert.equal(db.events.get("evt-1").error_message,null);
  assert.equal((await handler(notification())).status,200);
  assert.equal(db.calls,1);
});

test("webhook does not acknowledge failed financial persistence",async()=>{
  const db=webhookDb({rpcFailure:true});const handler=await loadHandler("mercado-pago-webhook",db,provider);
  assert.equal((await handler(notification())).status,500);
  assert.equal(db.events.get("evt-1").processed_at,undefined);
  db.setRpcFailure(false);
  assert.equal((await handler(notification())).status,200);
  assert.equal(db.calls,2);
});

test("webhook can retry when completion of the event itself fails",async()=>{
  const db=webhookDb({completionFailure:true});const handler=await loadHandler("mercado-pago-webhook",db,provider);
  assert.equal((await handler(notification())).status,500);
  db.setCompletionFailure(false);
  assert.equal((await handler(notification())).status,200);
});

test("webhook rejects a payment whose amount or currency differs from the offer",async()=>{
  for(const resource of [{transaction_amount:1,currency_id:"BRL"},{transaction_amount:49.90,currency_id:"USD"}]) {
    const db=webhookDb();const handler=await loadHandler("mercado-pago-webhook",db,async()=>Response.json({status:"approved",external_reference:`signup:${signup.id}`,...resource}));
    assert.equal((await handler(notification())).status,500);assert.equal(db.calls,0);
  }
});

test("webhook does not query the provider with an invalid signature",async()=>{
  let called=false;const handler=await loadHandler("mercado-pago-webhook",webhookDb(),async()=>{called=true;return provider();});
  const request=notification();request.headers.set("x-signature","ts=1,v1=invalid");
  assert.equal((await handler(request)).status,401);assert.equal(called,false);
});

test("subscription notification uses the actual payment ID for idempotency",async()=>{
  const db=webhookDb(),rpc=db.rpc,applied=[];
  db.rpc=async(name,args)=>{if(name.endsWith("apply")) applied.push(args);return rpc(name,args);};
  const handler=await loadHandler("mercado-pago-webhook",db,async url=>Response.json(url.includes("/v1/payments/")?{id:"actual-payment",status:"approved",transaction_amount:49.90,currency_id:"BRL"}:{status:"processed",external_reference:`signup:${signup.id}`,payment:{id:"actual-payment",status:"approved"}}));
  assert.equal((await handler(notification("evt-1","subscription_authorized_payment"))).status,200);
  assert.equal(applied[0].target_payment_id,"actual-payment");assert.equal(applied[0].target_status,"approved");
});

test("a processed subscription invoice with a rejected payment does not grant access",async()=>{
  const db=webhookDb(),rpc=db.rpc,applied=[];
  db.rpc=async(name,args)=>{if(name.endsWith("apply")) applied.push(args);return rpc(name,args);};
  const handler=await loadHandler("mercado-pago-webhook",db,async url=>Response.json(url.includes("/v1/payments/")?{id:"actual-payment",status:"rejected"}:{status:"processed",external_reference:`signup:${signup.id}`,payment:{id:"actual-payment",status:"approved"}}));
  assert.equal((await handler(notification("evt-1","subscription_authorized_payment"))).status,200);
  assert.equal(applied[0].target_status,"rejected");
});

test("lifecycle keeps the payment idempotency key stable after a persistence failure",async()=>{
  const keys=[],bodies=[];let writes=0;
  const admin={rpc:async name=>name.endsWith("pix_due")?{data:[signup]}:name.endsWith("prepare_pix")?{data:pixAttempt}:name.endsWith("expired")?{data:[]}:{error:++writes===1?{code:"fixture"}:null}};
  const handler=await loadHandler("billing-lifecycle",admin,async(_url,options)=>{keys.push(options.headers["X-Idempotency-Key"]);bodies.push(JSON.parse(options.body));return Response.json({id:"provider-payment",payment_method_id:"pix",status:"pending",currency_id:"BRL",transaction_amount:49.9,point_of_interaction:{transaction_data:{qr_code:"fixture-qr"}}});});
  const request=()=>new Request("https://fixture.invalid/lifecycle",{method:"POST",headers:{"x-cron-secret":"fixture-cron"}});
  assert.equal((await handler(request())).status,502);
  assert.equal((await handler(request())).status,200);
  assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.match(keys[0],/^[a-f0-9-]{36}$/);assert.deepEqual(bodies[0],bodies[1],"retry payload including expiration remains identical");
});

test("lifecycle fails visibly when access suspension cannot be persisted",async()=>{
  const expired={...signup,trial_ends_at:new Date(Date.now()-3600000).toISOString()};
  const admin={rpc:async name=>name.endsWith("pix_due")?{data:[]}:name.endsWith("prepare_pix")?{data:pixAttempt}:name.endsWith("expired")?{data:[expired]}:{error:{code:"fixture"}}};
  const handler=await loadHandler("billing-lifecycle",admin,provider);
  const response=await handler(new Request("https://fixture.invalid/lifecycle",{method:"POST",headers:{"x-cron-secret":"fixture-cron"}}));
  assert.equal(response.status,502);const body=await response.json();assert.equal(body.data.suspended,0);assert.equal(body.data.failures,1);
});

test("real quote handler returns the monthly and annual Cardápio offers",async()=>{
  const handler=await loadHandler("ogritech-billing",{},async()=>assert.fail("no provider call expected"));
  for(const [cycle,total] of [["monthly",4990],["annual",49900]]) {
    const response=await handler(new Request("https://fixture.invalid/billing",{method:"POST",body:JSON.stringify({action:"quote",product:"menu",cycle})}));
    assert.equal(response.status,200);assert.equal((await response.json()).data.total_cents,total);
  }
});

test("payment choice does not claim success when subscription or audit persistence fails",async()=>{
  for(const failingTable of ["platform_subscriptions","platform_billing_audit_log"]) {
    const admin={auth:{getUser:async()=>({data:{user:{id:"fixture-owner"}}})},rpc:async name=>({data:name.endsWith("lookup")?signup:null,error:null}),from:table=>{
      const data=table==="profiles"?{active:true,role:"owner",barbershop_id:signup.id}:{id:"fixture-id"};
      const result={data,error:table===failingTable?{code:"fixture"}:null};
      const chain={select(){return chain;},update(){return chain;},eq(){return chain;},insert:async()=>result,
        maybeSingle:async()=>result,single:async()=>result,then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};
      return chain;
    }};
    const handler=await loadHandler("ogritech-billing",admin,async()=>assert.fail("Pix choice must not charge the provider"));
    const response=await handler(new Request("https://fixture.invalid/billing",{method:"POST",headers:{authorization:"Bearer fixture"},body:JSON.stringify({action:"choose_payment",product:"menu",barbershop_id:signup.id,cycle:"annual",payment_method:"pix",recurring_authorized:false})}));
    assert.equal(response.status,500,failingTable);assert.equal((await response.json()).error.code,"billing_update_failed");
  }
});

test("Cardápio hosted checkout sends pending recurrence without a plan or card token",async()=>{
  for(const [cycle,months,amount] of [["monthly",1,49.9],["annual",12,499]]) {
    const writes=[];
    const paidUntil=new Date(Date.now()+7*86400000).toISOString();
    const admin={auth:{getUser:async()=>({data:{user:{id:"fixture-owner"}}})},rpc:async(name,args)=>{
      writes.push({name,args});return {data:name.endsWith("lookup")?{...signup,access_until:paidUntil}:null,error:null};
    },from:table=>{
      const result={data:table==="profiles"?{active:true,role:"owner",barbershop_id:signup.id}:{id:"fixture-id"},error:null};
      const chain={select(){return chain;},update(){return chain;},eq(){return chain;},insert:async()=>result,
        maybeSingle:async()=>result,single:async()=>result,then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};
      return chain;
    }};
    let sent;
    const handler=await loadHandler("ogritech-billing",admin,async(url,options)=>{
      assert.equal(url,"https://api.mercadopago.com/preapproval");sent=JSON.parse(options.body);
      return Response.json({id:"fixture-preapproval",init_point:"https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=fixture-preapproval"});
    });
    const response=await handler(new Request("https://fixture.invalid/billing",{method:"POST",headers:{authorization:"Bearer fixture"},body:JSON.stringify({action:"choose_payment",product:"menu",barbershop_id:signup.id,cycle,payment_method:"card",recurring_authorized:true})}));
    assert.equal(response.status,200);
    assert.equal(sent.status,"pending");assert.equal(sent.preapproval_plan_id,undefined);assert.equal(sent.card_token_id,undefined);
    assert.equal(sent.auto_recurring.frequency,months);assert.equal(sent.auto_recurring.transaction_amount,amount);assert.equal(sent.auto_recurring.currency_id,"BRL");
    assert.equal(sent.auto_recurring.start_date,paidUntil);assert.equal(sent.external_reference,`signup:${signup.id}`);
    assert.equal(sent.auto_recurring.free_trial,undefined,"changing payment must not restart the trial");
    const persisted=writes.find(row=>row.name==="backend_billing_choose_payment_update");
    assert.equal(persisted.args.payload.provider_plan_id,"");assert.equal(persisted.args.payload.provider_subscription_id,"fixture-preapproval");
  }
});

test("sandbox QA requires administrative authentication and the exact staging project",async()=>{
  const providerMustNotRun=async()=>assert.fail("provider must not be called before authorization and environment checks");
  const handler=await loadHandler("menu-sandbox-qa",{},providerMustNotRun);
  for(const authorization of ["","Bearer anon-fixture"]) {
    const response=await handler(new Request("https://fixture.invalid/qa",{method:"POST",headers:{authorization},body:JSON.stringify({cycle:"monthly"})}));
    assert.equal(response.status,401);
  }
  const response=await handler(new Request("https://fixture.invalid/qa",{method:"POST",headers:{authorization:"Bearer fixture","x-qa-admin-key":"fixture"},body:JSON.stringify({cycle:"monthly"})}));
  assert.equal(response.status,403,"a valid administrative key from another environment cannot run QA");
});

test("sandbox QA expires and cannot operate after its approved window",async()=>{
  class ExpiredClock extends Date { static now(){return Date.parse("2026-10-20T01:31:00Z");} }
  const handler=await loadHandler("menu-sandbox-qa",{},async()=>assert.fail("expired QA must not call provider"),{SUPABASE_URL:"https://fuesdztsvrkkgnbqhcxi.supabase.co"},ExpiredClock);
  const response=await handler(new Request("https://fixture.invalid/qa",{method:"POST",headers:{authorization:"Bearer fixture","x-qa-admin-key":"fixture"},body:JSON.stringify({cycle:"monthly"})}));
  assert.equal(response.status,403);
});

function signedNotice({dataId="AbC123",bodyId=dataId,ts=String(Date.now()),secret="fixture-secret",path="webhook",type="payment",liveMode}={}) {
  const requestId="signed-fixture";
  const signature=createHmac("sha256",secret).update(`id:${type==="order"?dataId:dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest("hex");
  return new Request(`https://fixture.invalid/${path}?data.id=${encodeURIComponent(dataId)}`,{method:"POST",headers:{"content-type":"application/json","x-request-id":requestId,"x-signature":`ts=${ts},v1=${signature}`},body:JSON.stringify({id:"signed-event",type,data:{id:bodyId},...(liveMode===undefined?{}:{live_mode:liveMode})})});
}

test("webhook validates normalized query ID and rejects expired or conflicting signed notifications",async()=>{
  const db=webhookDb();let calls=0;
  const handler=await loadHandler("mercado-pago-webhook",db,async()=>{calls++;return provider();});
  assert.equal((await handler(signedNotice({bodyId:"different"}))).status,400);
  assert.equal((await handler(signedNotice({ts:String(Date.now()-11*60000)}))).status,401);
  assert.equal(calls,0);
  assert.equal((await handler(signedNotice())).status,200,"uppercase provider IDs are normalized only in the signature manifest");
  assert.equal(calls,1);
});

test("plan and unknown webhook topics do not enter the payment inbox",async()=>{
  const db=webhookDb();const handler=await loadHandler("mercado-pago-webhook",db,async()=>assert.fail("unsupported topic must not fetch a payment"));
  assert.equal((await handler(signedNotice({type:"subscription_preapproval_plan"}))).status,200);
  assert.equal(db.events.size,0);
});

test("payment authorization and invoice processing alone cannot grant access",async()=>{
  for(const status of ["authorized","processed","pending"]) {
    const db=webhookDb();const handler=await loadHandler("mercado-pago-webhook",db,async()=>Response.json({status,transaction_amount:49.9,currency_id:"BRL",external_reference:`signup:${signup.id}`}));
    assert.equal((await handler(notification())).status,200);assert.equal(db.calls,0);
  }
  const db=webhookDb();const handler=await loadHandler("mercado-pago-webhook",db,async()=>Response.json({status:"processed",external_reference:`signup:${signup.id}`}));
  assert.equal((await handler(notification("invoice-no-payment","subscription_authorized_payment"))).status,500);
  assert.equal(db.calls,0);
});

test("sandbox webhook fails closed without dedicated credentials and outside staging",async()=>{
  const db=webhookDb();const handler=await loadHandler("mercado-pago-webhook",db,async()=>assert.fail("sandbox must not use Agenda credentials"));
  assert.equal((await handler(signedNotice({path:"menu-sandbox-webhook"}))).status,503);
  const stageHandler=await loadHandler("mercado-pago-webhook",db,async()=>assert.fail("dedicated signature secret is required"),{SUPABASE_URL:"https://fuesdztsvrkkgnbqhcxi.supabase.co",MP_MENU_SANDBOX_ACCESS_TOKEN:"sandbox-token"});
  assert.equal((await stageHandler(signedNotice({path:"menu-sandbox-webhook"}))).status,503);
  assert.equal(db.events.size,0);
});

test("sandbox webhook uses dedicated token and refuses resources from another seller",async()=>{
  const db=webhookDb();const handler=await loadHandler("mercado-pago-webhook",db,async(_url,options)=>{
    assert.equal(options.headers.Authorization,"Bearer sandbox-token");
    return Response.json({collector_id:123,live_mode:false,status:"approved",external_reference:`signup:${signup.id}`,transaction_amount:49.9,currency_id:"BRL"});
  },{SUPABASE_URL:"https://fuesdztsvrkkgnbqhcxi.supabase.co",MP_MENU_SANDBOX_ACCESS_TOKEN:"sandbox-token",MP_MENU_SANDBOX_WEBHOOK_SECRET:"sandbox-secret"});
  assert.equal((await handler(signedNotice({path:"menu-sandbox-webhook",secret:"sandbox-secret"}))).status,500);
  assert.equal(db.calls,0);
  assert.equal(db.events.get("menu_sandbox:signed-event").error_message,"sandbox_resource_mismatch");
});

test("card QA cancels the authorized fixture before testing rejection and reuses the buyer",async()=>{
  class TestClock extends Date { static now(){return Date.parse("2026-10-19T23:00:00Z");} }
  const operations=[];let scenario;
  const handler=await loadHandler("menu-sandbox-qa",{},async(url,options)=>{
    const body=options.body?JSON.parse(options.body):null;
    if(url.endsWith("/users/me"))return Response.json({id:3778177682,tags:["test_user"]});
    if(url.endsWith("/v1/card_tokens")){
      scenario=body.cardholder.name;
      if(scenario==="OTHE")assert.ok(operations.includes("cancelled"),"cleanup must finish before the next scenario");
      return Response.json({id:"fixture-token"});
    }
    if(url.endsWith("/preapproval")&&options.method==="POST"){
      assert.equal(body.payer_email,"test_user_7651078366654254160@testuser.com");
      return scenario==="APRO"?Response.json({id:"fixture-preapproval",status:"authorized"}, {status:201}):Response.json({message:"test refusal"},{status:400});
    }
    if(url.includes("/authorized_payments/search?"))return Response.json({results:[{id:"fixture-invoice",status:"processed",payment:{id:123,status:"approved"}}]});
    if(url.endsWith("/preapproval/fixture-preapproval")){
      if(options.method==="PUT"){assert.equal(body.status,"cancelled");operations.push("cancelled");}
      return Response.json({status:"cancelled"});
    }
    assert.fail(`Unexpected provider operation: ${url}`);
  },{SUPABASE_URL:"https://fuesdztsvrkkgnbqhcxi.supabase.co",MP_MENU_SANDBOX_ACCESS_TOKEN:"sandbox-token"},TestClock);
  const response=await handler(new Request("https://fixture.invalid/qa",{method:"POST",headers:{authorization:"Bearer fixture","x-qa-admin-key":"fixture"},body:JSON.stringify({action:"card_scenarios"})}));
  assert.equal(response.status,200);const data=(await response.json()).data;
  assert.equal(data.outcomes.length,2);assert.equal(data.outcomes[0].cancelled,true);assert.equal(data.outcomes[1].subscriptionCreated,false);
});

test("sandbox approval and rejection reach the correct billing transition with a signed notification",async()=>{
  for(const status of ["approved","rejected"]) {
    const db=webhookDb(),rpc=db.rpc,applied=[];
    db.rpc=async(name,args)=>{if(name.endsWith("apply"))applied.push(args);return rpc(name,args);};
    const handler=await loadHandler("mercado-pago-webhook",db,async()=>Response.json({id:"AbC123",collector_id:3778177682,live_mode:false,status,transaction_amount:49.9,currency_id:"BRL",external_reference:`signup:${signup.id}`}),{SUPABASE_URL:"https://fuesdztsvrkkgnbqhcxi.supabase.co",MP_MENU_SANDBOX_ACCESS_TOKEN:"sandbox-token",MP_MENU_SANDBOX_WEBHOOK_SECRET:"sandbox-secret"});
    const request=()=>signedNotice({path:"menu-sandbox-webhook",secret:"sandbox-secret"});
    assert.equal((await handler(request())).status,200);
    assert.equal(applied.length,1);assert.equal(applied[0].target_status,status);
    if(status==="approved")assert.ok(Date.parse(applied[0].target_access_until)>Date.parse(signup.trial_ends_at));
    else assert.equal(applied[0].target_access_until,null);
    assert.equal((await handler(request())).status,200);assert.equal(applied.length,1,"duplicate notification must not grant another period");
  }
});

test("sandbox notification cannot mutate an Agenda signup or process live resources",async()=>{
  for(const liveMode of [true,false]) {
    const db=webhookDb(),rpc=db.rpc;
    db.rpc=async name=>name.endsWith("lookup")?{data:{...signup,product_code:"agenda"}}:rpc(name);
    const handler=await loadHandler("mercado-pago-webhook",db,async()=>Response.json({collector_id:3778177682,live_mode:liveMode,status:"approved",transaction_amount:49.9,currency_id:"BRL",external_reference:`signup:${signup.id}`}),{SUPABASE_URL:"https://fuesdztsvrkkgnbqhcxi.supabase.co",MP_MENU_SANDBOX_ACCESS_TOKEN:"sandbox-token",MP_MENU_SANDBOX_WEBHOOK_SECRET:"sandbox-secret"});
    assert.equal((await handler(signedNotice({path:"menu-sandbox-webhook",secret:"sandbox-secret"}))).status,500);
    assert.equal(db.calls,0);
  }
});

test("lifecycle generates renewal only for Cardápio and ignores retired Agenda",async()=>{
  const requests=[];
  const admin={rpc:async name=>name.endsWith("pix_due")?{data:[signup,{...signup,id:"aabbccdd-1234-4000-8000-123456789013",product_code:"agenda"}]}:name.endsWith("prepare_pix")?{data:pixAttempt}:name.endsWith("expired")?{data:[]}:{error:null}};
  const handler=await loadHandler("billing-lifecycle",admin,async(_url,options)=>{
    requests.push({authorization:options.headers.Authorization,body:JSON.parse(options.body)});
    return Response.json({id:`fixture-${requests.length}`,payment_method_id:"pix",status:"pending",currency_id:"BRL",transaction_amount:49.9,point_of_interaction:{transaction_data:{qr_code:"fixture-qr"}}});
  },{SUPABASE_URL:"https://fuesdztsvrkkgnbqhcxi.supabase.co",MP_MENU_SANDBOX_ACCESS_TOKEN:"sandbox-token",MP_MENU_SANDBOX_WEBHOOK_SECRET:"sandbox-secret"});
  const response=await handler(new Request("https://fixture.invalid/lifecycle",{method:"POST",headers:{"x-cron-secret":"fixture-cron"}}));
  assert.equal(response.status,200);assert.equal(requests.length,1);
  assert.equal(requests[0].authorization,"Bearer sandbox-token");assert.match(requests[0].body.notification_url,/menu-sandbox-webhook$/);

});

test("recurring test-user live flag requires exact buyer and API-verified test seller",async()=>{
 for(const [buyer,tags,expected] of [["3774414383",["test_user"],200],["other-buyer",["test_user"],500],["3774414383",[],500]]){
  const db=webhookDb();
  const handler=await loadHandler("mercado-pago-webhook",db,async url=>String(url).endsWith('/users/me')?Response.json({id:3778177682,tags}):Response.json({id:"AbC123",collector_id:3778177682,payer:{id:buyer},live_mode:true,status:"approved",transaction_amount:49.9,currency_id:"BRL",external_reference:`signup:${signup.id}`}),{SUPABASE_URL:"https://fuesdztsvrkkgnbqhcxi.supabase.co",MP_MENU_SANDBOX_ACCESS_TOKEN:"sandbox-token",MP_MENU_SANDBOX_WEBHOOK_SECRET:"sandbox-secret"});
  assert.equal((await handler(signedNotice({path:"menu-sandbox-webhook",secret:"sandbox-secret"}))).status,expected);
  assert.equal(db.calls,expected===200?1:0);
 }
});

test("integrated QA expires at the newly authorized deadline",async()=>{
 class ExpiredClock extends Date {static now(){return Date.parse('2026-10-20T04:31:00Z');}}
 const handler=await loadHandler('menu-sandbox-qa',{},async()=>assert.fail('expired QA must not reach provider'),{SUPABASE_URL:'https://fuesdztsvrkkgnbqhcxi.supabase.co'},ExpiredClock);
 const response=await handler(new Request('https://fixture.invalid/qa',{method:'POST',headers:{'x-qa-admin-key':'fixture'},body:JSON.stringify({action:'e2e_start'})}));
 assert.equal(response.status,403);
});

function cancellationDb({status='active',persistFailure=false}={}){
 const record={...signup,status,access_until:new Date(Date.now()+86400000).toISOString(),provider_subscription_id:'fixture-sub',provider_payment_id:'fixture-paid'};
 const writes=[];
 return {record,writes,from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:record};},update(value){return {eq:async()=>{writes.push(value);return {error:persistFailure?{code:'fixture_failure'}:null};}};}};},async rpc(){return {data:true,error:null};}};
}

test('cancellation cannot succeed locally when provider still authorizes recurrence',async()=>{
 const db=cancellationDb();
 const handler=await loadHandler('ogritech-billing',db,async(_url,options)=>Response.json(options.method==='PUT'?{error:'provider_failure'}:{status:'authorized'},{status:options.method==='PUT'?500:200}),{SUPABASE_URL:'https://fuesdztsvrkkgnbqhcxi.supabase.co',MP_MENU_SANDBOX_ACCESS_TOKEN:'sandbox-token'});
 const response=await handler(new Request('https://fixture.invalid/billing',{method:'POST',headers:{'content-type':'application/json','x-management-token':'a'.repeat(64)},body:JSON.stringify({action:'cancel'})}));
 assert.equal(response.status,502);assert.equal(db.writes.length,0);
});

test('cancellation retries retain the paid boundary and never cancel the approved installment',async()=>{
 for(const [status,persistFailure,expected] of [['active',false,200],['cancel_at_period_end',false,200],['active',true,500]]){
  const db=cancellationDb({status,persistFailure}),calls=[];
  const handler=await loadHandler('ogritech-billing',db,async(url,options)=>{calls.push(String(url));assert.equal(options.headers.Authorization,'Bearer sandbox-token');return Response.json({status:'cancelled'});},{SUPABASE_URL:'https://fuesdztsvrkkgnbqhcxi.supabase.co',MP_MENU_SANDBOX_ACCESS_TOKEN:'sandbox-token'});
  const response=await handler(new Request('https://fixture.invalid/billing',{method:'POST',headers:{'content-type':'application/json','x-management-token':'a'.repeat(64)},body:JSON.stringify({action:'cancel'})}));
  assert.equal(response.status,expected);assert.equal(calls.length,2);assert.ok(calls.every(url=>url.includes('/preapproval/')));
  assert.equal(db.writes[0].status,'cancel_at_period_end');assert.equal(db.writes[0].access_until,db.record.access_until);
 }
});

test('retired Agenda trial is rejected before any database or provider operation',async()=>{
 const handler=await loadHandler('ogritech-billing',{},async()=>assert.fail('retired trial must not call provider'));
 const response=await handler(new Request('https://fixture.invalid/billing',{method:'POST',body:JSON.stringify({action:'start_trial',product:'agenda',business_name:'Fixture',responsible_name:'Fixture',tax_document:'00000000000000',email:'fixture@example.invalid',phone:'11999999999',cycle:'monthly',payment_method:'pix',terms_version:'fixture',accepted_terms:true,accepted_privacy:true,recurring_authorized:false})}));
 assert.equal(response.status,410);assert.equal((await response.json()).error.code,'product_retired');
});

test('existing subscription or pending payment blocks a second checkout before provider calls',async()=>{
 for(const existing of [{status:'active',provider_subscription_id:'fixture-sub'},{status:'payment_pending',provider_payment_id:'fixture-pay'}]){
  const admin={auth:{getUser:async()=>({data:{user:{id:'fixture-owner'}}})},rpc:async()=>({data:{...signup,...existing}}),from(){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:{active:true,role:'owner',barbershop_id:signup.id}};}};}};
  const handler=await loadHandler('ogritech-billing',admin,async()=>assert.fail('duplicate checkout must not reach provider'));
  const response=await handler(new Request('https://fixture.invalid/billing',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({action:'choose_payment',product:'menu',barbershop_id:signup.id,cycle:'monthly',payment_method:'card',recurring_authorized:true})}));
  assert.equal(response.status,409);assert.equal((await response.json()).error.code,'billing_already_configured');
 }
});


test('billing status resumes only the pending checkout belonging to this signup',async()=>{
 for(const mismatch of [false,true]) {
  const record={...signup,payment_method:'card',status:'payment_pending',provider_subscription_id:'existing-sub'};
  const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>({data:record}),from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{active:true,role:'owner',barbershop_id:signup.id}})};}};
  const handler=await loadHandler('ogritech-billing',db,async(url,options)=>{
   assert.match(url,/preapproval\/existing-sub$/);assert.equal(options.headers.Authorization,'Bearer sandbox-token');
   return Response.json({id:'existing-sub',status:'pending',external_reference:`signup:${mismatch?'other':signup.id}`,init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=existing-sub'});
  },{SUPABASE_URL:'https://fuesdztsvrkkgnbqhcxi.supabase.co',MP_MENU_SANDBOX_ACCESS_TOKEN:'sandbox-token'});
  const response=await handler(new Request('https://fixture.invalid/billing',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({action:'billing_status',product:'menu',barbershop_id:signup.id})}));
  assert.equal(response.status,200);const data=(await response.json()).data;
  assert.equal(Boolean(data.checkout_url),!mismatch);assert.equal(data.status,'payment_pending');
 }
});

test('Pix worker rejects a provider response without a valid QR or matching amount',async()=>{
 for(const override of [{point_of_interaction:{}},{transaction_amount:1},{currency_id:'USD'},{status:'approved'}]) {
  let writes=0;
  const db={rpc:async name=>name.endsWith('pix_due')?{data:[signup]}:name.endsWith('prepare_pix')?{data:pixAttempt}:name.endsWith('expired')?{data:[]}:(writes++,{error:null})};
  const handler=await loadHandler('billing-lifecycle',db,async()=>Response.json({id:'pix-payment',payment_method_id:'pix',status:'pending',currency_id:'BRL',transaction_amount:49.9,point_of_interaction:{transaction_data:{qr_code:'fixture-qr'}},...override}));
  const response=await handler(new Request('https://fixture.invalid/lifecycle',{method:'POST',headers:{'x-cron-secret':'fixture-cron'}}));
  assert.equal(response.status,502);assert.equal(writes,0);assert.equal((await response.json()).data.pix_created,0);
 }
});


test('billing status database failures are not reported as a missing subscription',async()=>{
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>({error:{code:'fixture'}}),from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{active:true,role:'owner',barbershop_id:signup.id}})};}};
 const handler=await loadHandler('ogritech-billing',db,async()=>assert.fail('no provider call on lookup failure'));
 const response=await handler(new Request('https://fixture.invalid/billing',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({action:'billing_status',product:'menu',barbershop_id:signup.id})}));
 assert.equal(response.status,503);assert.equal((await response.json()).error.code,'billing_status_unavailable');
});

test('Pix selection after expiry keeps past_due and the paid access boundary',async()=>{
 const boundary=new Date(Date.now()-3600000).toISOString(),writes=[];
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async(name,args)=>{writes.push({name,args});return {data:name.endsWith('lookup')?{...signup,status:'past_due',access_until:boundary}:null};},from:table=>{
  const result={data:table==='profiles'?{active:true,role:'owner',barbershop_id:signup.id}:{id:'fixture-id'},error:null};
  const chain={select(){return chain;},update(value){writes.push({table,value});return chain;},eq(){return chain;},insert:async()=>result,maybeSingle:async()=>result,single:async()=>result,then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}};return chain;
 }};
 const handler=await loadHandler('ogritech-billing',db,async()=>assert.fail('Pix selection does not charge'));
 const response=await handler(new Request('https://fixture.invalid/billing',{method:'POST',headers:{authorization:'Bearer fixture'},body:JSON.stringify({action:'choose_payment',product:'menu',barbershop_id:signup.id,cycle:'monthly',payment_method:'pix',recurring_authorized:false})}));
 assert.equal(response.status,200);assert.equal(writes.find(row=>row.name==='backend_billing_choose_payment_update').args.payload.status,'past_due');
 assert.equal(writes.find(row=>row.table==='platform_subscriptions').value.next_billing_on,boundary.slice(0,10));
});


const orderFixture=()=>({id:'ORD01TESTPIX2026102000000001',user_id:'3778177682',country_code:'BRA',total_amount:'49.90',external_reference:`signup_${signup.id}_pix_fixture`,status:'processed',status_detail:'accredited',transactions:{payments:[{id:'PAY01TESTPIX2026102000000001',amount:'49.90',status:'processed',status_detail:'accredited',payment_method:{id:'pix',qr_code:'fixture-qr'}}]}});
const ordersEnv={SUPABASE_URL:'https://fuesdztsvrkkgnbqhcxi.supabase.co',MP_MENU_SANDBOX_ACCESS_TOKEN:'sandbox-token',MP_MENU_SANDBOX_WEBHOOK_SECRET:'sandbox-secret',MP_MENU_SANDBOX_PIX_ORDERS:'true'};

test('production Pix uses Payments API and its production webhook even when the sandbox Orders flag is set',async()=>{
 const productionUrl='https://mvzcoaiiwytycdqcvydf.supabase.co';
 let sent,written,providerCalls=0;
 const db={rpc:async(name,args)=>name.endsWith('pix_due')?{data:[signup]}:name.endsWith('prepare_pix')?{data:pixAttempt}:name.endsWith('expired')?{data:[]}:(written=args,{error:null})};
 const handler=await loadHandler('billing-lifecycle',db,async(url,options)=>{
  providerCalls++;assert.equal(url,'https://api.mercadopago.com/v1/payments');
  assert.equal(options.headers.Authorization,'Bearer production-fixture-token');
  assert.equal(options.headers['X-Idempotency-Key'],pixAttempt.request_id);
  sent=JSON.parse(options.body);
  return Response.json({id:'production-fixture-payment',payment_method_id:'pix',status:'pending',currency_id:'BRL',transaction_amount:49.9,point_of_interaction:{transaction_data:{qr_code:'fixture-qr'}}});
 },{...ordersEnv,SUPABASE_URL:productionUrl,MERCADO_PAGO_ACCESS_TOKEN:'production-fixture-token'});
 const response=await handler(new Request('https://fixture.invalid/lifecycle',{method:'POST',headers:{'x-cron-secret':'fixture-cron'}}));
 assert.equal(response.status,200);assert.equal(providerCalls,1);
 assert.equal(sent.notification_url,`${productionUrl}/functions/v1/mercado-pago-webhook`);
 assert.equal(sent.payment_method_id,'pix');assert.equal(sent.transaction_amount,49.9);
 assert.equal(sent.external_reference,pixAttempt.external_reference);
 assert.equal(written.payload.provider_payment_id,'production-fixture-payment');
 assert.equal((await response.json()).data.pix_created,1);
});

test('production ignores signed Orders notifications before querying the provider or recording an event',async()=>{
 const db=webhookDb();
 const handler=await loadHandler('mercado-pago-webhook',db,async()=>assert.fail('a sandbox Orders flag cannot enable Orders processing in production'),{
  ...ordersEnv,SUPABASE_URL:'https://mvzcoaiiwytycdqcvydf.supabase.co'
 });
 const response=await handler(signedNotice({dataId:orderFixture().id.toLowerCase(),path:'mercado-pago-webhook',type:'order',liveMode:true}));
 assert.equal(response.status,200);assert.equal(await response.text(),'ignored');
 assert.equal(db.events.size,0);assert.equal(db.calls,0);
});

test('Orders Pix worker is opt-in and records the order ID with a stable amount',async()=>{
 let sent,written;
 const db={rpc:async(name,args)=>name.endsWith('pix_due')?{data:[signup]}:name.endsWith('prepare_pix')?{data:pixAttempt}:name.endsWith('expired')?{data:[]}:(written=args,{error:null})};
 const handler=await loadHandler('billing-lifecycle',db,async(url,options)=>{
  assert.equal(url,'https://api.mercadopago.com/v1/orders');sent=JSON.parse(options.body);
  const order=orderFixture();order.status='action_required';order.transactions.payments[0].status='action_required';order.external_reference=pixAttempt.external_reference.replaceAll(":","_").slice(0,64);return Response.json(order);
 },ordersEnv);
 const response=await handler(new Request('https://fixture.invalid/lifecycle',{method:'POST',headers:{'x-cron-secret':'fixture-cron'}}));
 assert.equal(response.status,200);assert.equal(sent.external_reference.length,64);assert.match(sent.external_reference,/^signup_aabbccdd-1234-4000-8000-123456789012_pix_[a-f0-9-]+$/);assert.equal(sent.total_amount,'49.90');assert.equal(sent.processing_mode,'automatic');assert.equal(sent.transactions.payments[0].expiration_time,'PT72H');
 assert.equal(written.payload.provider_payment_id,orderFixture().id);assert.equal(written.payload.qr_code,'fixture-qr');
});

test('signed sandbox Pix order grants once using the order ID and verified test seller',async()=>{
 const db=webhookDb(),rpc=db.rpc,applied=[];db.rpc=async(name,args)=>{if(name.endsWith('apply'))applied.push(args);return rpc(name,args);};
 const handler=await loadHandler('mercado-pago-webhook',db,async url=>Response.json(String(url).endsWith('/users/me')?{id:'3778177682',tags:['test_user']}:orderFixture()),ordersEnv);
 const request=()=>signedNotice({dataId:orderFixture().id,path:'menu-sandbox-webhook',type:'order',secret:'sandbox-secret',liveMode:false});
 assert.equal((await handler(request())).status,200);assert.equal(applied[0].target_payment_id,orderFixture().id);assert.equal(applied[0].target_status,'approved');
 assert.equal((await handler(request())).status,200);assert.equal(applied.length,1);
});

test('Orders sandbox rejects real notifications, wrong amounts and another seller',async()=>{
 for(const scenario of ['live','amount','seller']){
  const db=webhookDb();const order=orderFixture();if(scenario==='amount'){order.total_amount='50.00';order.transactions.payments[0].amount='50.00';}if(scenario==='seller')order.user_id='other';
  const handler=await loadHandler('mercado-pago-webhook',db,async url=>Response.json(String(url).endsWith('/users/me')?{id:'3778177682',tags:['test_user']}:order),ordersEnv);
  assert.equal((await handler(signedNotice({dataId:order.id,path:'menu-sandbox-webhook',type:'order',secret:'sandbox-secret',liveMode:scenario==='live'}))).status,500);assert.equal(db.calls,0);
 }
});


test('Orders signature accepts raw and canonical IDs but rejects a different resource',async()=>{
 const db=webhookDb(),order=orderFixture();
 const handler=await loadHandler('mercado-pago-webhook',db,async url=>Response.json(String(url).endsWith('/users/me')?{id:'3778177682',tags:['test_user']}:order),ordersEnv);
 const original=signedNotice({dataId:order.id,path:'menu-sandbox-webhook',type:'order',secret:'sandbox-secret',liveMode:false});
 const wrongHeaders=new Headers(original.headers),requestId=wrongHeaders.get('x-request-id'),ts=wrongHeaders.get('x-signature').match(/ts=(\d+)/)[1];
 const wrong=createHmac('sha256','sandbox-secret').update(`id:other-resource;request-id:${requestId};ts:${ts};`).digest('hex');
 wrongHeaders.set('x-signature',`ts=${ts},v1=${wrong}`);
 assert.equal((await handler(new Request(original.url,{method:'POST',headers:wrongHeaders,body:await original.clone().text()}))).status,401);
 assert.equal(db.calls,0);
 const canonicalHeaders=new Headers(original.headers);
 const canonical=createHmac('sha256','sandbox-secret').update(`id:${order.id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
 canonicalHeaders.set('x-signature',`ts=${ts},v1=${canonical}`);
 assert.equal((await handler(new Request(original.url,{method:'POST',headers:canonicalHeaders,body:await original.clone().text()}))).status,200);
 assert.equal((await handler(original)).status,200);
 assert.equal(db.calls,1);
 const logged=runtimeLogs.at(-1);
 assert.deepEqual(Object.keys(logged).sort(),['canonical_form','event','id_source','matched','request_id','resource_id']);
 assert.equal(logged.matched,true);assert.equal(logged.canonical_form,'raw');
 assert.equal(JSON.stringify(logged).includes('sandbox-secret'),false);
});

test("signup validates and persists the service invoice preference without changing the trial price", async () => {
  for (const taxDocument of ["11222333000181", "52998224725"]) for (const preference of ["requested", "not_requested", undefined]) {
    let clientRecord, invitationRedirect;
    const admin = {
      rpc: async name => ({ data: name === "backend_billing_signup_create" ? signup.id : null, error: null }),
      auth: { admin: { inviteUserByEmail: async (email, options) => { invitationRedirect=options.redirectTo; return { data: { user: { id: "fixture-owner" } }, error: null }; } } },
      from(table) {
        const chain = {
          insert(value) { if (table === "saas_clients") clientRecord = value; return chain; },
          select() { return chain; }, eq() { return chain; }, update() { return chain; }, delete() { return chain; },
          single: async () => ({ data: { id: "fixture-id" }, error: null }),
          then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); }
        }; return chain;
      }
    };
    const handler = await loadHandler("ogritech-billing", admin, async () => { throw Error("Unexpected provider payment"); }, {
      BILLING_TERMS_VERSION: "fixture", BILLING_TERMS_SHA256: "a".repeat(64),
      ...(preference === "requested" ? { SUPABASE_URL: "https://fuesdztsvrkkgnbqhcxi.supabase.co", PUBLIC_APP_URL: "https://ogritech.com.br" } : {})
    });
    const body = { action: "start_trial", product: "menu", business_name: "Fixture", responsible_name: "Fixture",
      tax_document: taxDocument, email: "fixture@example.invalid", phone: "11999999999", segment: "Restaurante",
      cycle: "monthly", payment_method: "pix", terms_version: "fixture", accepted_terms: true, accepted_privacy: true,
      recurring_authorized: false, ...(preference === undefined ? {} : { service_invoice_preference: preference }) };
    const response = await handler(new Request("https://fixture.invalid/billing", { method: "POST", body: JSON.stringify(body) }));
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(new URL(invitationRedirect).searchParams.get("env"), preference === "requested" ? "staging" : null);
    assert.equal(new URL(result.data.login_url).searchParams.get("env"), preference === "requested" ? "staging" : null);
    assert.equal(clientRecord.monthly_fee, 49.9);
    assert.match(clientRecord.notes, preference === "requested" ? /solicitada pelo cliente/ : (preference === "not_requested" || taxDocument.length === 11) ? /Não constitui dispensa/ : /não informada/);
    const invalid = await handler(new Request("https://fixture.invalid/billing", { method: "POST", body: JSON.stringify({ ...body, service_invoice_preference: "skip_tax" }) }));
    assert.equal(invalid.status, 422);
  }
});
