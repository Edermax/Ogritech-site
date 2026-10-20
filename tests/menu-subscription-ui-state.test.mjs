import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
const source=await readFile(new URL('../assinatura/assinatura.js',import.meta.url),'utf8');
function renderer(){
 const elements=new Map();
 const $=id=>{if(!elements.has(id)){const classes=new Set();elements.set(id,{removeAttribute(){},textContent:'',value:'',className:'',classList:{add(c){classes.add(c);},remove(c){classes.delete(c);},toggle(c,on){if(on)classes.add(c);else classes.delete(c);},contains(c){return classes.has(c);}}});}return elements.get(id);};
 const render=runInNewContext(source.slice(source.indexOf('function render(state)'),source.indexOf('async function load()'))+';render',{$,Date,URL,formatDate:value=>value});
 return {render,$};
}
const future=new Date(Date.now()+86400000).toISOString();
const base={cycle:'monthly',payment_method:'pix',trial_ends_at:future,access_until:future,days_remaining:1};
test('paid and scheduled-cancellation states retain access without offering another checkout',()=>{
 for(const status of ['active','cancel_at_period_end']){
  const {render,$}=renderer();render({...base,status});
  assert.equal($('billingForm').classList.contains('hidden'),true);assert.equal($('backToMenu').classList.contains('hidden'),false);
  assert.doesNotMatch($('billingSummary').textContent,/período gratuito terminou/);
 }
});
test('pending existing payment cannot show a second payment form',()=>{
 const {render,$}=renderer();render({...base,status:'payment_pending',subscription_created:true});assert.equal($('billingForm').classList.contains('hidden'),true);
 render({...base,status:'trial_active'});assert.equal($('billingForm').classList.contains('hidden'),false);
});
test('missing and cancelled subscriptions clear stale Pix and access controls',()=>{
 const {render,$}=renderer();render({...base,status:'payment_pending',pix:{qr_code:'fixture-pix'}});assert.equal($('pixCode').value,'fixture-pix');
 render({...base,status:'cancelled'});assert.equal($('pixCode').value,'');assert.equal($('pixPanel').classList.contains('hidden'),true);assert.equal($('backToMenu').classList.contains('hidden'),true);
 render(null);assert.equal($('billingForm').classList.contains('hidden'),true);assert.match($('billingSummary').textContent,/ainda não tem/);
});

test('panel uses only Cardápio and keeps subscription navigation accessible for old multi-product accounts',async()=>{
 const source=await readFile(new URL('../script.js',import.meta.url),'utf8');
 const functionSource=source.slice(source.indexOf('async function applyProductAccess()'),source.indexOf('const dashboardView'));
 const items=['cardapio','configuracoes','agenda','landing','orcamentos'].map(section=>({dataset:{section},classList:{toggle(){}},setAttribute(){}}));
 const shown=[];
 const apply=runInNewContext('let activeProductCodes=new Set();'+functionSource+';applyProductAccess',{
  IS_DEMO:false,BARBERSHOP_ID:'fixture',menuItems:items,
  PRODUCT_SECTION_CODES:{agenda:'agenda',landing:'pages',orcamentos:'quotes',cardapio:'menu'},
  AGENDA_SECTIONS:new Set(['agenda','configuracoes']),
  supabaseClient:{rpc:async()=>({data:['menu','agenda','pages','quotes'].map(code=>({code,subscribed:true,status:'active'}))})},
  document:{body:{classList:{toggle(){}}},querySelector(){return null;}},openAppointmentButton:null,
  businessConfig:{},applyBusinessCustomization(){},showSection(section){shown.push(section);}
 });
 assert.equal(await apply(),'cardapio');assert.deepEqual(shown,['cardapio']);
 assert.equal(items[1].dataset.productAllowed,'true');
 for(const item of items.slice(2))assert.equal(item.dataset.productAllowed,'false');
});


test('expired Pix is hidden and checkout resume accepts only the provider URL',()=>{
 const {render,$}=renderer();
 render({...base,status:'payment_pending',pix:{qr_code:'expired-qr',expires_at:new Date(Date.now()-60000).toISOString()}});
 assert.equal($('pixPanel').classList.contains('hidden'),true);assert.equal($('pixCode').value,'');assert.match($('billingSummary').textContent,/venceu/);
 render({...base,payment_method:'card',status:'payment_pending',checkout_url:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=fixture'});
 assert.equal($('resumeCheckout').classList.contains('hidden'),false);
 for(const checkout_url of ['https://evil.invalid/subscriptions/checkout','javascript:alert(1)','https://www.mercadopago.com.br@evil.invalid/subscriptions/checkout']){
  render({...base,payment_method:'card',status:'payment_pending',checkout_url});assert.equal($('resumeCheckout').classList.contains('hidden'),true);
 }
 render({...base,status:'active'});assert.equal($('resumeCheckout').classList.contains('hidden'),true);
});
