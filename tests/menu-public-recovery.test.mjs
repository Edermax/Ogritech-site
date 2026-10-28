import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
const catalog=await readFile(new URL('../cardapio/cardapio.js',import.meta.url),'utf8');
const tracking=await readFile(new URL('../pedido/pedido.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const fields=()=>{const map=new Map();return id=>{if(!map.has(id))map.set(id,{innerHTML:'',textContent:'',value:'',disabled:false,dataset:{},handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},focus(){},showModal(){}});return map.get(id);};};

test('catalog connection failure offers retry and a later valid response can load',async()=>{
  const $=fields();let attempts=0,retry;
  const body=catalog.slice(catalog.indexOf('  async function loadMenuData()'),catalog.indexOf('  async function init()'));
  const context={$ ,slug:'fixture',init(){retry=true;},supabaseClient:{rpc:async()=>{if(++attempts===1)throw Error('offline');return {data:{menu:{title:'Fixture'}}};}}};
  runInNewContext(body,context);
  assert.equal(await context.loadMenuData(),null);
  assert.match($('loading').innerHTML,/Tentar novamente/);
  $('retryMenuLoad').handlers.click();assert.equal(retry,true);
  assert.equal((await context.loadMenuData()).menu.title,'Fixture');
});

test('tracking retries a failed first load, preserves last status on later failure and refreshes without another order',async()=>{
  const $=fields();let calls=0;
  const order=status=>({reference:'FIXTURE',customer_name:'Cliente',fulfillment_type:'pickup',status,payment_status:'pending',items:[],total_amount:25});
  runInNewContext(tracking,{location:{search:'?referencia=FIXTURE&token=fixture'},URLSearchParams,Intl,document:{getElementById:$},supabaseClient:{rpc:async(name)=>{
    assert.equal(name,'public_get_menu_order');calls++;
    if(calls===1||calls===3)throw Error('offline');
    return {data:order(calls===2?'received':'confirmed')};
  }}});
  await tick();assert.match($('order').innerHTML,/Não foi possível consultar/);assert.equal($('refreshOrder').disabled,false);
  await $('refreshOrder').handlers.click();assert.match($('order').innerHTML,/Recebido/);
  const previous=$('order').innerHTML;
  await $('refreshOrder').handlers.click();assert.equal($('order').innerHTML,previous);assert.match($('orderRefreshMessage').textContent,/preservada/);
  await $('refreshOrder').handlers.click();assert.match($('order').innerHTML,/Confirmado/);assert.equal($('refreshOrder').disabled,false);
});

test('assistant selections use the minimum product quantity and preserve an explicit valid quantity',()=>{
  const $=fields(),cart=new Map();
  const body=catalog.slice(catalog.indexOf('  function addConfigured('),catalog.indexOf('  function assistantMessage('));
  const context={$ ,cart,pendingRequestId:null,updateCart(){},isQuoteItem:()=>false,clean:String,money:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})};
  runInNewContext(body,context);
  const price={id:'price',amount:1.5,label:'Unidade',item:{name:'Doces',minimum_quantity:50,maximum_quantity:100,option_groups:[]}};
  context.configure(price);assert.equal([...cart.values()][0].quantity,50);
  cart.clear();context.configure(price,75);assert.equal([...cart.values()][0].quantity,75);
  context.configure({...price,item:{...price.item,option_groups:[{id:'group',name:'Sabores',minimum_selections:1,maximum_selections:1,options:[]}]}});
  assert.equal($('configurator').dataset.quantity,50);
});

test('assistant releases submit and keeps the message when network and browser storage fail',async()=>{
  const $=fields();let handler,calls=0;
  $('menuAssistantInput').value='Quero chocolate';
  const body=catalog.slice(catalog.indexOf('  $("menuAssistantForm").addEventListener("submit"'),catalog.indexOf('  $("configuratorForm").addEventListener('));
  const context={$ ,assistantSessionToken:null,assistantMessage(){},assistantControls(){},slug:'fixture',isDinizMenu:false,createUuid:()=> 'fixture-session',sessionStorage:{getItem(){throw Error('storage');},setItem(){throw Error('storage');}},supabaseClient:{rpc:async()=>{calls++;throw Error('offline');}}};
  runInNewContext(body,context);handler=$('menuAssistantForm').handlers.submit;const button={disabled:false};
  await handler({preventDefault(){},submitter:button});assert.equal(calls,1);assert.equal(button.disabled,false);assert.equal($('menuAssistantInput').value,'Quero chocolate');
});
