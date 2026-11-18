// Browser-only synthetic ledger. SQL tests exercise the real authorization and locks.
export function installStockFixture() {
  const original=window.supabaseClient.rpc;
  window.__stock={quantity:0,version:0,enabled:false};window.__stockMovements=[];window.__stockRetries={};
  window.supabaseClient.rpc=async(name,args)=>{
    if(name==='public_menu_assistant_status'&&window.__stockAssistantAvailable)return{data:{available:true}};
    if(name==='public_menu_assistant_message'&&window.__stockAssistantAvailable){
      const menu=(await original('public_menu',{})).data,item=menu.categories[0].items[0];
      return{data:{reply:'Produto cadastrado para teste',suggestions:[{name:item.name,label:item.prices[0].label,price:25,menu_item_price_id:item.prices[0].id}]}};
    }
    if(name==='menu_onboarding_status'){
      const response=await original(name,args);response.data.inventory_enabled=response.data.offer_code==='encomendas';return response;
    }
    if(name==='public_menu'){
      const response=await original(name,args);
      if(window.__stockSoldOut)response.data.categories.forEach(c=>c.items.forEach(i=>i.stock_available=false));return response;
    }
    if(!['catalog_inventory','catalog_stock_command'].includes(name))return original(name,args);
    window.__calls.push({name,args});
    const menu=(await original('public_menu',{})).data;
    const item=menu.categories[0].items[0];
    const effective=(await original('menu_onboarding_status',{})).data.offer_code;
    if(effective!=='encomendas')return{error:{code:'42501',message:'Plano Completo necessário'}};
    if(name==='catalog_inventory'){
      if(window.__stockReadFailures>0){window.__stockReadFailures--;return{error:{code:'NETWORK'}};}
      return{data:{products:window.__stock.version?[{...window.__stock,item_id:item.id,item_name:item.name}]:[],movements:window.__stockMovements.filter(m=>!args.before_id||m.id<args.before_id).slice(0,50)}};
    }
    const signature=JSON.stringify({...args,request_id:null});
    const prior=window.__stockRetries[args.request_id];
    if(prior)return prior.signature===signature?{data:{quantity:prior.quantity,replayed:true}}:{error:{code:'23505',message:'Chave repetida'}};
    if(args.expected_version!==window.__stock.version)return{error:{code:'40001',message:'O estoque mudou. Atualize os dados e revise a movimentação'}};
    const s=window.__stock,before=s.quantity;
    if(args.operation==='entry')s.quantity+=args.supplied_quantity;
    if(args.operation==='exit')s.quantity-=args.supplied_quantity;
    if(args.operation==='adjust'||(args.operation==='enable'&&s.version===0))s.quantity=args.supplied_quantity;
    s.enabled=args.operation!=='disable';s.version++;
    window.__stockMovements.unshift({id:s.version,item_name:item.name,kind:args.operation,delta:s.quantity-before,quantity_before:before,quantity_after:s.quantity,reason:args.reason,created_at:new Date().toISOString()});
    window.__stockRetries[args.request_id]={signature,quantity:s.quantity};
    if(window.__stockLoseResponse){window.__stockLoseResponse=false;return{error:{code:'NETWORK'}};}
    if(window.__stockReadFailuresAfterCommand){window.__stockReadFailures=window.__stockReadFailuresAfterCommand;window.__stockReadFailuresAfterCommand=0;}
    return{data:{quantity:s.quantity}};
  };
}
