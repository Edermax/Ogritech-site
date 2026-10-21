import {z} from "npm:zod@4.1.5";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.112.3";
const CYCLES={monthly:{months:1,discountBps:0},quarterly:{months:3,discountBps:300},semiannual:{months:6,discountBps:500},annual:{months:12,discountBps:1000}} as const;
const PRODUCT_PRICES={agenda:9700,menu:4990} as const;
function quote(cycle: keyof typeof CYCLES, product: keyof typeof PRODUCT_PRICES = "agenda") {
  const rule = CYCLES[cycle], base = PRODUCT_PRICES[product], subtotal = base * rule.months;
  if (product === "menu" && cycle === "annual") return { base_monthly_cents: base, months: 12, discount_bps: 1667,
    subtotal_cents: subtotal, total_cents: 49_900 };
  return { base_monthly_cents: base, months: rule.months, discount_bps: rule.discountBps,
    subtotal_cents: subtotal, total_cents: Math.round(subtotal * (10_000 - rule.discountBps) / 10_000) };
}

function menuCheckoutPayload(signup: { id: string; email: string; trial_ends_at: string; access_until?: string | null }, cycle: "monthly" | "annual", appUrl: string, backendUrl: string) {
  const offer = quote(cycle, "menu");
  const start = Math.max(Date.now() + 60_000, Date.parse(signup.access_until || signup.trial_ends_at));
  if (!Number.isFinite(start)) throw new Error("invalid_billing_boundary");
  return {
    reason: `Ogritech Cardápio ${cycle === "annual" ? "anual" : "mensal"}`,
    payer_email: signup.email, external_reference: `signup:${signup.id}`, status: "pending",
    auto_recurring: { frequency: offer.months, frequency_type: "months", transaction_amount: offer.total_cents / 100,
      currency_id: "BRL", start_date: new Date(start).toISOString() },
    back_url: `${appUrl}/assinatura/?pagamento=retorno`, notification_url: `${backendUrl}/functions/v1/mercado-pago-webhook`,
  };
}


Deno.serve(async(req:Request)=>{
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
let adminKey="";try{adminKey=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}catch{adminKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";}
if(!adminKey||req.headers.get("x-qa-admin-key")!==adminKey)return reply({error:{code:"unauthorized"}},401);
if(Deno.env.get("SUPABASE_URL")!=="https://fuesdztsvrkkgnbqhcxi.supabase.co")return reply({error:{code:"disabled"}},403);
if(req.method!=="POST")return reply({error:{code:"method_not_allowed"}},405);
const parsed=z.object({action:z.enum(["pending","card_scenarios","e2e_start","e2e_status","e2e_replay","e2e_cancel"]).default("pending"),cycle:z.enum(["monthly","annual"]).default("monthly")}).strict().safeParse(await req.json().catch(()=>null));
if(!parsed.success)return reply({error:{code:"invalid_input"}},422);
const deadline=parsed.data.action.startsWith("e2e_")?"2026-10-20T04:30:00Z":"2026-10-20T01:30:00Z";
if(Date.now()>Date.parse(deadline))return reply({error:{code:"disabled"}},403);
// The approved integrated run has finished. Re-deploying this archive must not restart it.
if(parsed.data.action.startsWith("e2e_"))return reply({error:{code:"qa_run_closed"}},410);
const token=Deno.env.get("MP_MENU_SANDBOX_ACCESS_TOKEN");
const api=async(path:string,method="GET",body?:unknown)=>{const r=await fetch("https://api.mercadopago.com"+path,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))};};
try{
const me=await api("/users/me");if(!me.ok||String(me.data.id)!=="3778177682"||!me.data.tags?.includes("test_user"))return reply({error:{code:"wrong_seller"}},409);
if(parsed.data.action.startsWith("e2e_")){
 const signupId="e2300000-0000-4000-8000-000000000001";
 const admin=createClient(Deno.env.get("SUPABASE_URL")!,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const lookup=await admin.rpc("backend_billing_webhook_lookup",{target_signup_id:signupId,target_subscription_id:"",target_payment_id:""});
 if(lookup.error||!lookup.data||lookup.data.product_code!=="menu"||lookup.data.total_cents!==4990)return reply({error:{code:"fixture_missing"}},409);
 const signup=lookup.data;
 const stored=await admin.from("backend_billing_signups").select("provider_subscription_id,status,access_until").eq("id",signupId).single();
 if(stored.error)return reply({error:{code:"fixture_read_failed"}},500);
 let id=stored.data.provider_subscription_id;
 if(parsed.data.action==="e2e_start"){
  if(id)return reply({error:{code:"already_started"}},409);
  const card=await api("/v1/card_tokens","POST",{card_number:"5480832801033311",security_code:"123",expiration_month:11,expiration_year:2030,cardholder:{name:"APRO",identification:{type:"CPF",number:"12345678909"}}});
  if(!card.ok||!card.data.id)return reply({error:{code:"card_token_failed",providerStatus:card.status}},502);
  const made=await api("/preapproval","POST",{reason:"Ogritech Cardapio QA integrado",payer_email:"test_user_7651078366654254160@testuser.com",external_reference:`signup:${signupId}`,card_token_id:card.data.id,status:"authorized",auto_recurring:{frequency:1,frequency_type:"months",transaction_amount:49.9,currency_id:"BRL"},back_url:"https://ogritech.com.br/",notification_url:"https://fuesdztsvrkkgnbqhcxi.supabase.co/functions/v1/menu-sandbox-webhook"});
  if(!made.ok||!made.data.id)return reply({error:{code:"subscription_failed",providerStatus:made.status,message:made.data.message}},502);
  id=made.data.id;
  const saved=await admin.rpc("backend_billing_signup_provider_update",{target_signup_id:signupId,target_plan_id:"",target_subscription_id:id});
  if(saved.error){await api("/preapproval/"+encodeURIComponent(id),"PUT",{status:"cancelled"});return reply({error:{code:"persistence_failed"}},500);}
 }
 if(!id)return reply({data:{started:false,status:stored.data.status}});
 const subscription=await api("/preapproval/"+encodeURIComponent(id));
 if(!subscription.ok||String(subscription.data.collector_id)!=="3778177682")return reply({error:{code:"subscription_scope_mismatch"}},409);
 const invoices=await api("/authorized_payments/search?"+new URLSearchParams({preapproval_id:id}));
 const payments=(invoices.data.results||[]).map((p:any)=>({id:p.id,status:p.status,paymentId:p.payment?.id,paymentStatus:p.payment?.status}));
 const paymentEvidence=[];
 for(const invoice of payments){if(invoice.paymentId){const payment=await api("/v1/payments/"+encodeURIComponent(String(invoice.paymentId)));const p=payment.data;paymentEvidence.push({httpStatus:payment.status,id:p.id,collectorId:p.collector_id,payerId:p.payer?.id,collector:p.collector?.id,liveMode:p.live_mode,status:p.status,amount:p.transaction_amount,currency:p.currency_id,externalReference:p.external_reference,subscriptionId:p.metadata?.preapproval_id});}}
 let replayStatus=null;
 if(parsed.data.action==="e2e_replay"){
  const approved=payments.find((p:any)=>p.paymentStatus==="approved"&&p.paymentId);
  if(!approved)return reply({error:{code:"approved_payment_not_observed"},data:{payments}},409);
  const dataId=String(approved.paymentId),ts=String(Date.now()),requestId=crypto.randomUUID();
  const secret=Deno.env.get("MP_MENU_SANDBOX_WEBHOOK_SECRET")||"";
  if(!secret)return reply({error:{code:"signer_missing"}},503);
  const signingKey=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=await crypto.subtle.sign("HMAC",signingKey,new TextEncoder().encode(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`));
  const signature=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const body={id:`qa-replay-${dataId}`,type:"payment",data:{id:dataId},live_mode:false};
  const response=await fetch("https://fuesdztsvrkkgnbqhcxi.supabase.co/functions/v1/menu-sandbox-webhook",{method:"POST",headers:{"Content-Type":"application/json","x-request-id":requestId,"x-signature":`ts=${ts},v1=${signature}`},body:JSON.stringify(body)});
  replayStatus=response.status;
 }
 let cancelled=false;
 if(parsed.data.action==="e2e_cancel"){
  const managementToken=crypto.randomUUID()+crypto.randomUUID();
  const tokenDigest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(managementToken));
  const tokenHash=[...new Uint8Array(tokenDigest)].map(b=>b.toString(16).padStart(2,"0")).join("");
  const managementUpdate=await admin.from("backend_billing_signups").update({management_token_hash:tokenHash}).eq("id",signupId);
  if(managementUpdate.error)return reply({error:{code:"fixture_management_failed"}},500);
  const cancelledResponse=await fetch("https://fuesdztsvrkkgnbqhcxi.supabase.co/functions/v1/ogritech-billing",{method:"POST",headers:{"Content-Type":"application/json","x-management-token":managementToken},body:JSON.stringify({action:"cancel",reason:"Fim da homologacao ficticia autorizada"})});
  const final=await api("/preapproval/"+encodeURIComponent(id));cancelled=cancelledResponse.ok&&final.data.status==="cancelled";
  if(!cancelled)return reply({error:{code:"cleanup_failed",handlerStatus:cancelledResponse.status,handlerResponse:await cancelledResponse.json().catch(()=>({})),providerStatus:final.data.status}},502);
 }
 return reply({data:{signupId,subscriptionId:id,providerStatus:subscription.data.status,payments,paymentEvidence,replayStatus,cancelled,signupStatus:stored.data.status,accessUntil:stored.data.access_until}});
}
const buyer={data:{email:"test_user_7651078366654254160@testuser.com"}};
if(parsed.data.action==="card_scenarios"){
 const outcomes=[];
 for(const scenario of ["APRO","OTHE"]){
  const card=await api("/v1/card_tokens","POST",{card_number:"5480832801033311",security_code:"123",expiration_month:11,expiration_year:2030,cardholder:{name:scenario,identification:{type:"CPF",number:"12345678909"}}});
  if(!card.ok||!card.data.id)return reply({error:{code:"test_card_token_failed",scenario,providerStatus:card.status,message:card.data.message},data:{outcomes}},502);
  const created=await api("/preapproval","POST",{reason:"Ogritech Cardapio QA "+scenario,payer_email:buyer.data.email,external_reference:"menu-qa-20261019-"+scenario,card_token_id:card.data.id,status:"authorized",auto_recurring:{frequency:1,frequency_type:"months",transaction_amount:49.9,currency_id:"BRL"},back_url:"https://ogritech.com.br/"});
  if(!created.ok){outcomes.push({scenario,creationStatus:created.status,message:created.data.message,subscriptionCreated:false});continue;}
  const id=created.data.id;
  let invoices:any={status:0,data:{}},cancelled=false;
  try{invoices=await api("/authorized_payments/search?"+new URLSearchParams({preapproval_id:id}));}
  finally{const cancel=await api("/preapproval/"+encodeURIComponent(id),"PUT",{status:"cancelled"});const final=await api("/preapproval/"+encodeURIComponent(id));cancelled=cancel.ok&&final.data.status==="cancelled";}
  outcomes.push({scenario,id,creationStatus:created.status,status:created.data.status,cancelled,invoiceSearchStatus:invoices.status,invoices:(invoices.data.results||[]).map((p:any)=>({id:p.id,status:p.status,paymentId:p.payment?.id,paymentStatus:p.payment?.status}))});
  if(!cancelled)return reply({error:{code:"test_cleanup_failed"},data:{outcomes}},502);
 }
 return reply({data:{testSellerVerified:true,outcomes}});
}
const payload=menuCheckoutPayload({id:"aabbccdd-1234-4000-8000-123456789012",email:buyer.data.email,trial_ends_at:new Date(Date.now()+14*86400000).toISOString()},parsed.data.cycle,"https://ogritech.com.br","https://fuesdztsvrkkgnbqhcxi.supabase.co");
delete (payload as any).notification_url;
const made=await api("/preapproval","POST",payload);
if(!made.ok)return reply({error:{code:"provider_rejected",status:made.status,message:made.data.message,causes:(made.data.cause||[]).map((c:any)=>({code:c.code,description:c.description}))}},502);
const id=made.data.id;const got=await api("/preapproval/"+encodeURIComponent(id));
const cancel=await api("/preapproval/"+encodeURIComponent(id),"PUT",{status:"cancelled"});
const final=await api("/preapproval/"+encodeURIComponent(id));
return reply({data:{id,status:made.data.status,checkoutUrl:made.data.init_point,readbackStatus:got.status,cancelled:cancel.ok&&final.data.status==="cancelled",amount:got.data.auto_recurring?.transaction_amount,currency:got.data.auto_recurring?.currency_id,startDate:got.data.auto_recurring?.start_date,collectorId:got.data.collector_id}});
}catch{return reply({error:{code:"provider_unavailable"}},502);}
});
