import {z} from "npm:zod@4.1.5";
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
if(Deno.env.get("SUPABASE_URL")!=="https://fuesdztsvrkkgnbqhcxi.supabase.co"||Date.now()>Date.parse("2026-10-20T01:30:00Z"))return reply({error:{code:"disabled"}},403);
if(req.method!=="POST")return reply({error:{code:"method_not_allowed"}},405);
const parsed=z.object({action:z.enum(["pending","card_scenarios"]).default("pending"),cycle:z.enum(["monthly","annual"]).default("monthly")}).strict().safeParse(await req.json().catch(()=>null));
if(!parsed.success)return reply({error:{code:"invalid_input"}},422);
const token=Deno.env.get("MP_MENU_SANDBOX_ACCESS_TOKEN");
const api=async(path:string,method="GET",body?:unknown)=>{const r=await fetch("https://api.mercadopago.com"+path,{method,headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))};};
try{
const me=await api("/users/me");if(!me.ok||String(me.data.id)!=="3778177682"||!me.data.tags?.includes("test_user"))return reply({error:{code:"wrong_seller"}},409);
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
