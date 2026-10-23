import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../cardapio/cardapio.js',import.meta.url),'utf8').then(text=>text.replaceAll('\r\n','\n'));
const start=source.indexOf('  $("orderForm").addEventListener("submit", async (event) => {');
const end=source.indexOf('\n  });\n  init();',start);
const body=source.slice(start,end+6);
function setup({lead=0,scheduled=''}={}){
 let handler;const fields=new Map(),ids=[];
 const data={name:'Teste',phone:'00000000000',fulfillment:'pickup',privacy:'on',scheduled_for:scheduled};
 const cart=new Map([['item',{menu_item_price_id:'price',quantity:1,selections:[]}]]);
 const field=id=>{if(!fields.has(id))fields.set(id,{disabled:false,textContent:'',addEventListener:(name,fn)=>{handler=fn;},setAttribute(){},focus(){},scrollIntoView(){}});return fields.get(id);};
 const context={$:field,cart,FormData:class{get(key){return data[key]??'';}},requiredLeadTime:()=>lead,isDinizMenu:false,slug:'fixture',createUuid:()=>`request-${Math.random()}`,pendingRequestId:null,Date,Number,supabaseClient:{rpc:async(name,args)=>{ids.push(args.client_request_id);throw Error('network');}}};
 vm.runInNewContext(body,context);
 return {fields,ids,cart,submit:()=>handler({preventDefault(){},target:{reset(){throw Error('must not reset on failure');}}})};
}
test('invalid scheduled order leaves submit enabled and never calls the server',async()=>{
 const page=setup({lead:48});await page.submit();assert.equal(page.ids.length,0);assert.equal(page.fields.get('orderSubmitButton')?.disabled??false,false);assert.match(page.fields.get('orderMessage').textContent,/48 horas/);
});
test('network failure permits retry, preserves cart and reuses the same idempotency key',async()=>{
 const page=setup();await page.submit();assert.equal(page.fields.get('orderSubmitButton').disabled,false);assert.equal(page.cart.size,1);assert.match(page.fields.get('orderMessage').textContent,/conexão/);await page.submit();assert.equal(page.ids.length,2);assert.equal(page.ids[0],page.ids[1]);
});
