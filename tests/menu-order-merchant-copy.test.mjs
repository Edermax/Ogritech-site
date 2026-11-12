import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source=await readFile(new URL('../pedido/pedido.js',import.meta.url),'utf8');
const whatsappSource=await readFile(new URL('../menu-whatsapp.js',import.meta.url),'utf8');
test('order tracking uses the contact returned for the order, independent from the URL slug',async()=>{
  for(const [slug,phone,name] of [['outra-loja','5511988887777','Outra Loja'],['diniz-doces','5516991596865','Diniz Doces'],['diniz-doces-previa-7d1','','Diniz Doces']]){
    const root={innerHTML:''};
    const globalThis={};
    runInNewContext(whatsappSource,{globalThis,Intl});
    runInNewContext(source,{
      location:{search:`?referencia=FIXTURE&token=fixture&empresa=${slug}`},URLSearchParams,Intl,globalThis,
      document:{getElementById:(id)=>id==='order'?root:{addEventListener(){},disabled:false,textContent:''}},
      supabaseClient:{rpc:async()=>({data:{reference:'FIXTURE',customer_name:'Teste',fulfillment_type:'pickup',status:'received',payment_status:'pending',items:[],total_amount:25,whatsapp_phone:phone,menu_title:name}})}
    });
    await new Promise(resolve=>setImmediate(resolve));
    assert.match(root.innerHTML,/Pagamento pendente/);
    if(!phone){
      assert.doesNotMatch(root.innerHTML,/wa\.me|Enviar resumo pelo WhatsApp/);
    }else{
      assert.match(root.innerHTML,new RegExp(`https:\\/\\/wa\\.me\\/${phone}`));
      assert.match(root.innerHTML,/Enviar resumo pelo WhatsApp/);
      assert.match(decodeURIComponent(root.innerHTML),new RegExp(name));
    }
  }
});

test('rejected order does not ask for payment and offers a status question',async()=>{
  const root={innerHTML:''};
  const globalThis={};
  runInNewContext(whatsappSource,{globalThis,Intl});
  runInNewContext(source,{
    location:{search:'?referencia=FIXTURE&token=fixture'},URLSearchParams,Intl,globalThis,
    document:{getElementById:(id)=>id==='order'?root:{addEventListener(){},disabled:false,textContent:''}},
    supabaseClient:{rpc:async()=>({data:{reference:'FIXTURE',customer_name:'Teste',fulfillment_type:'pickup',status:'rejected',payment_status:'pending',items:[],total_amount:25,whatsapp_phone:'5511999999999',menu_title:'Loja teste'}})}
  });
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(root.innerHTML,/Este pedido não seguirá para pagamento/);
  assert.doesNotMatch(root.innerHTML,/Pagamento pendente/);
  assert.match(decodeURIComponent(root.innerHTML),/pedido FIXT-URE foi recusado/);
  assert.match(root.innerHTML,/Recusado/);
  assert.match(root.innerHTML,/Falar pelo WhatsApp/);
});

test('image policy permits local previews and only the two trusted menu image buckets',async()=>{
  const headers=await readFile(new URL('../_headers',import.meta.url),'utf8');
  const directive=headers.match(/img-src ([^;]+);/)[1].split(/\s+/);
  assert.deepEqual(directive,["'self'",'data:','blob:','https://fuesdztsvrkkgnbqhcxi.supabase.co/storage/v1/object/public/menu-images/','https://mvzcoaiiwytycdqcvydf.supabase.co/storage/v1/object/public/menu-images/']);
  assert.doesNotMatch(headers,/img-src[^;]*(?:\*|https:;)/);
});

test('reviewing a paid order never tells the customer to pay again or implies an automatic refund',async()=>{
 for(const status of ['confirmed','rejected']){
  const root={innerHTML:''},globalThis={};runInNewContext(whatsappSource,{globalThis,Intl});
  runInNewContext(source,{location:{search:'?referencia=FIXTURE&token=fixture'},URLSearchParams,Intl,globalThis,
   document:{getElementById:id=>id==='order'?root:{addEventListener(){},disabled:false,textContent:''}},
   supabaseClient:{rpc:async()=>({data:{reference:'FIXTURE',order_number:7,customer_name:'Teste',fulfillment_type:'pickup',status,payment_status:'paid',items:[],subtotal:25,delivery_fee:0,total_amount:25,whatsapp_phone:'5511999999999',menu_title:'Loja teste'}})}});
  await new Promise(resolve=>setImmediate(resolve));assert.match(root.innerHTML,/#7/);
  assert.doesNotMatch(decodeURIComponent(root.innerHTML),/O pedido ainda não foi pago/);
  if(status==='rejected')assert.match(root.innerHTML,/eventual devolução/);
  else assert.match(decodeURIComponent(root.innerHTML),/pagamento já está registrado como recebido/);
 }
});
