import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const source = (await readFile(new URL('../admin.js', import.meta.url), 'utf8')).replace(/initializeDashboard\(\);\s*$/, '');
function harness() {
 const elements = new Map();
 const node = id => { if (!elements.has(id)) elements.set(id,{textContent:'',hidden:false,innerHTML:'',value:'',disabled:false,focus(){},classList:{toggle(){}}});return elements.get(id); };
 const links = ['overview','businesses','users','plans','products','billing'].map(key=>({href:`#${key}`,classList:{toggle(){}},attributes:{},getAttribute(){return this.href},setAttribute(k,v){this.attributes[k]=v},removeAttribute(k){delete this.attributes[k]}}));
 const context = vm.createContext({Intl,Date,console,URL,location:{hash:''},window:{scrollTo(){}},document:{getElementById:node,querySelectorAll(selector){return selector === '.platform-menu a' ? links : []}},supabaseClient:{rpc(){throw new Error('Unexpected mutation')}}});
 vm.runInContext(source,context);
 return {context,node,links,run:code=>vm.runInContext(code,context)};
}
test('owner navigation changes only the selected area and falls back safely',()=>{
 const h=harness(); h.context.location.hash='#billing';h.run('selectAdminView()');
 assert.equal(h.node('billing').hidden,false);assert.equal(h.node('businesses').hidden,true);assert.equal(h.node('adminSummary').hidden,true);assert.equal(h.node('adminViewTitle').textContent,'Cobranças');assert.equal(h.links[5].attributes['aria-current'],'page');
 h.context.location.hash='#unknown';h.run('selectAdminView()');assert.equal(h.node('adminSummary').hidden,false);assert.equal(h.node('billing').hidden,true);
});
test('owner prices keep cents and legacy accounts cannot be operated',()=>{
 const h=harness();assert.match(h.run('money.format(49.9)'),/49,90/);
 h.run(`products=[{id:'menu',code:'menu'}];billingCustomers=[{id:'c',saas_client_id:'business'}];subscriptions=[{billing_customer_id:'c',product_id:'menu',status:'trial',current_period_end:'2099-01-01'}];`);
 assert.equal(h.run(`canOperateMenu({id:'business',status:'Ativo'})`),true);
 assert.equal(h.run(`canOperateMenu({id:'legacy',status:'Ativo'})`),false);
 h.run(`subscriptions[0].current_period_end='2000-01-01'`);assert.equal(h.run(`canOperateMenu({id:'business',status:'Ativo'})`),false);
});
test('retired product actions cannot trigger subscription requests',async()=>{
 const h=harness();h.run(`businesses=[{id:'business'}];products=[{id:'menu',code:'menu'}];billingCustomers=[{id:'c',saas_client_id:'business'}];subscriptions=[{billing_customer_id:'c',product_id:'menu',status:'active'}]`);await h.run(`changeProductSubscription({dataset:{productCode:'pages',productAction:'activate'}})`);
});

test('archived or retired business users show no credential or activation actions',()=>{
 const h=harness();h.node('userBusinessFilter').value='all';h.run("users=[{id:'u',full_name:'Archived user',role:'owner',barbershop_id:'archived',active:false}]; renderUsers()");
 assert.match(h.node('usersTableBody').innerHTML,/Registro histórico/);assert.doesNotMatch(h.node('usersTableBody').innerHTML,/data-user-action/);
});

test('editing preserves existing segment and origin options without duplicating them',()=>{
 const h=harness();
 h.context.Option=function(text,value){this.text=text;this.value=value;};
 for(const [id,value] of [['businessSegment','Confeitaria, bolos e doces'],['businessOrigin','Indicação']]){
  const select=h.node(id);select.options=[{value:'Outro'}];select.append=option=>select.options.push(option);
  h.context.fieldId=id;h.context.savedValue=value;
  h.run('selectExistingBusinessValue(fieldId,savedValue)');
  assert.equal(select.value,value);assert.equal(select.options.length,2);
  h.run('selectExistingBusinessValue(fieldId,savedValue)');
  assert.equal(select.options.length,2);
 }
});

test('billing submit buttons route to their RPC and recover after a rejected operation',async()=>{
 for(const [handler,rpc,button,message] of [
  ['saveInvoice','platform_create_invoice','saveInvoiceButton','invoiceFormMessage'],
  ['savePayment','platform_record_payment','savePaymentButton','paymentFormMessage'],
  ['saveRefund','platform_register_refund','saveRefundButton','refundFormMessage']
 ]){
  const h=harness(),calls=[];
  h.context.supabaseClient.rpc=async(name,payload)=>{calls.push({name,payload});return {error:{message:'Operação recusada no teste'}};};
  h.node('invoiceQuantity').value='1';h.node('invoiceUnitAmount').value='49.90';
  h.context.event={preventDefault(){}};
  await h.run(`${handler}(event)`);
  assert.equal(calls.length,1);assert.equal(calls[0].name,rpc);
  assert.equal(h.node(button).disabled,false);assert.match(h.node(message).textContent,/recusada/);
 }
});

test('invalid invoice discount stops before any financial request',async()=>{
 const h=harness();h.node('invoiceQuantity').value='1';h.node('invoiceUnitAmount').value='10';h.node('invoiceDiscount').value='11';
 h.context.event={preventDefault(){}};await h.run('saveInvoice(event)');
 assert.match(h.node('invoiceFormMessage').textContent,/não podem superar/);
});
