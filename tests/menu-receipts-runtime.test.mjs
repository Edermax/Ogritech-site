import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import {z} from 'zod';
const business='11111111-1111-4111-8111-111111111111',order='22222222-2222-4222-8222-222222222222',receipt='33333333-3333-4333-8333-333333333333';
const base={barbershop_id:business,order_id:order};
async function fixture({denied=false,stale=false,bytes=new Uint8Array([137,80,78,71,13,10,26,10])}={}){
 const calls=[];let handler;
 const metadata={id:receipt,object_path:`${business}/${order}/${receipt}.png`,original_name:'comprovante.png',file_size:8,content_type:'image/png',state:'reserved'};
 const user={auth:{getUser:async()=>({data:{user:{id:'fixture-user'}}})},rpc:async(name,args)=>{
  calls.push({name,args,role:'user'});
  if(denied)return{error:{code:'42501'}};
  if(name==='record_menu_order_payment')return stale?{error:{code:'40001'}}:{data:{payment_status:'paid',has_receipt:Boolean(args.receipt_id)}};
  return{data:metadata};
 }};
 const admin={rpc:async(name,args)=>{calls.push({name,args,role:'service'});return{data:null};},storage:{from:bucket=>{
  assert.equal(bucket,'menu-payment-receipts');return{
   createSignedUploadUrl:async(path,options)=>{calls.push({action:'sign_upload',path,options});return{data:{token:'fixture-signed-token'}};},
   createSignedUrl:async(path,seconds)=>{calls.push({action:'sign_download',path,seconds});return{data:{signedUrl:'https://fixture.invalid/storage/v1/object/sign/menu-payment-receipts/test?token=fixture'}};},
   download:async()=>({data:new Blob([bytes])}),remove:async()=>{calls.push({action:'remove'});return{data:[]};}
  };
 }}};
 const source=await readFile(new URL('../supabase/functions/menu-order-receipts/index.ts',import.meta.url),'utf8');
 runInNewContext(stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm,'')),{z,createClient:(url,key)=>key==='service'?admin:user,Request,Response,Blob,Uint8Array,TextEncoder,TextDecoder,
  Deno:{env:{get:key=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'service',ALLOWED_ORIGINS:'https://ogritech.com.br'})[key]},serve:fn=>{handler=fn;}}});
 const request=body=>handler(new Request('https://fixture.invalid/receipts',{method:'POST',headers:{Authorization:'Bearer fixture-user'},body:JSON.stringify({...base,...body})}));
 return{request,calls,handler};
}
test('receipt upload is authenticated and authorized before a private URL is signed',async()=>{
 const f=await fixture({denied:true});const response=await f.request({action:'upload_url',file_name:'comprovante.png',file_size:8,content_type:'image/png'});
 assert.equal(response.status,403);assert.equal(f.calls.some(call=>call.action==='sign_upload'),false);
 const anonymous=await f.handler(new Request('https://fixture.invalid/receipts',{method:'POST',body:'{}'}));assert.equal(anonymous.status,401);
});
test('receipt type/size limits and a scoped server-generated object key precede upload',async()=>{
 const f=await fixture();
 for(const change of[{file_size:5242881},{content_type:'text/html'}])assert.equal((await f.request({action:'upload_url',file_name:'receipt.png',file_size:8,content_type:'image/png',...change})).status,422);
 const response=await f.request({action:'upload_url',file_name:'receipt.png',file_size:8,content_type:'image/png'});assert.equal(response.status,200);
 const result=(await response.json()).data;assert.equal(result.receipt_id,receipt);assert.equal(result.path,`${business}/${order}/${receipt}.png`);assert.equal(result.token,'fixture-signed-token');
 assert.equal(f.calls.find(call=>call.action==='sign_upload').options.upsert,false);
});
test('a mismatched file is discarded and never marks an order paid',async()=>{
 const f=await fixture({bytes:new Uint8Array(8)});const response=await f.request({action:'confirm_payment',receipt_id:receipt,expected_updated_at:'2026-11-12T00:00:00Z'});
 assert.equal(response.status,422);assert.equal((await response.json()).error.code,'invalid_receipt');
 assert.equal(f.calls.some(call=>call.action==='remove'),true);assert.equal(f.calls.some(call=>call.name==='record_menu_order_payment'),false);
});
test('the real bytes must be verified by the service before a user can attach and mark paid',async()=>{
 const f=await fixture();const response=await f.request({action:'confirm_payment',receipt_id:receipt,expected_updated_at:'2026-11-12T00:00:00Z'});
 assert.equal(response.status,200);
 const verify=f.calls.findIndex(call=>call.name==='backend_menu_receipt_state'),payment=f.calls.findIndex(call=>call.name==='record_menu_order_payment');
 assert.ok(verify>=0&&payment>verify);assert.equal(f.calls[verify].role,'service');assert.equal(f.calls[payment].role,'user');assert.equal(f.calls[payment].args.receipt_id,receipt);
});
test('attachment stays optional and stale order versions return an explicit conflict',async()=>{
 for(const stale of[false,true]){const f=await fixture({stale});const response=await f.request({action:'confirm_payment',expected_updated_at:'2026-11-12T00:00:00Z'});
  assert.equal(response.status,stale?409:200);assert.equal(f.calls.some(call=>call.name==='backend_menu_receipt_state'),false);
  if(stale)assert.equal((await response.json()).error.code,'order_changed');
 }
});
test('receipt downloads authorize ownership before issuing a URL valid for five minutes',async()=>{
 const f=await fixture();assert.equal((await f.request({action:'download'})).status,200);assert.equal(f.calls[0].name,'menu_order_receipt_access');
 assert.equal(f.calls.find(call=>call.action==='sign_download').seconds,300);
});
