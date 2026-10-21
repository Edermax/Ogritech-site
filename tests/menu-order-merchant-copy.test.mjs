import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source=await readFile(new URL('../pedido/pedido.js',import.meta.url),'utf8');
test('order tracking keeps another merchant independent from the Diniz contact',async()=>{
  for(const slug of ['outra-loja','diniz-doces-previa-7d1']){
    const root={innerHTML:''};
    runInNewContext(source,{
      location:{search:`?referencia=FIXTURE&token=fixture&empresa=${slug}`},URLSearchParams,Intl,
      document:{getElementById:()=>root},
      supabaseClient:{rpc:async()=>({data:{reference:'FIXTURE',customer_name:'Teste',fulfillment_type:'pickup',status:'received',payment_status:'pending',items:[],total_amount:25}})}
    });
    await new Promise(resolve=>setImmediate(resolve));
    assert.match(root.innerHTML,/Pagamento pendente/);
    if(slug==='outra-loja'){
      assert.match(root.innerHTML,/ao estabelecimento/);
      assert.doesNotMatch(root.innerHTML,/Diniz|wa\.me|Enviar código pelo WhatsApp/);
    }else{
      assert.match(root.innerHTML,/à Diniz Doces/);
      assert.match(root.innerHTML,/https:\/\/wa\.me\/5516991596865/);
    }
  }
});

test('image policy permits only the production menu image storage beyond local images',async()=>{
  const headers=await readFile(new URL('../_headers',import.meta.url),'utf8');
  const directive=headers.match(/img-src ([^;]+);/)[1].split(/\s+/);
  assert.deepEqual(directive,["'self'",'data:','https://mvzcoaiiwytycdqcvydf.supabase.co/storage/v1/object/public/menu-images/']);
  assert.doesNotMatch(headers,/img-src[^;]*(?:\*|https:;)/);
});
