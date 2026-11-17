export function installCatalogFixture({profile,offer,trial,quote,plans,origin}) {

  const tenant='aabbccdd-1234-4000-8000-123456789012';
  window.IS_DEMO=false;window.BARBERSHOP_ID=tenant;window.currentRole='owner';window.businessConfig={name:'Negócio de teste'};window.renderSettings=()=>{};
  window.OGRITECH_SUPABASE_URL=origin;window.OGRITECH_SUPABASE_PUBLISHABLE_KEY='fixture';window.OGRITECH_ENV='production';
  window.escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.ogritechEnvironmentUrl=path=>new URL(path,location.origin).href;
  window.__calls=[];window.__profile=profile;window.__template=profile==='food'?'pizzeria':profile;window.__segment={food:'food',crafts:'crafts',products:'products'}[profile];
  const effective=trial?'encomendas':offer;
  const categories=[{id:'category-fixture',name:profile==='food'?'Pratos':'Produtos',items:[{id:'item-fixture',name:profile==='food'?'Prato de teste':'Peça artesanal',description:'Exemplo de teste',image_url:'',item_type:'simple',unit_label:'unidade',minimum_quantity:1,maximum_quantity:10,metadata:quote?{order_mode:'quote'}:{},prices:[{id:'price-fixture',label:profile==='food'?'Padrão':'Material natural',price:25}],option_groups:[]}]}];
  const identity={primary_color:'#243b53',accent_color:'#237c89',logo_path:'',cover_path:''};
  const menu=()=>({id:'menu-fixture',barbershop_id:tenant,slug:'fixture',title:'Negócio de teste',description:'Produtos de exemplo',template_code:window.__template,profile_code:window.__profile,offer_code:effective,published:false,accepts_pickup:true,accepts_delivery:false,minimum_order:0,delivery_fee:0,visual_identity:identity,accepted_payment_methods:['pix'],payment_methods:['pix'],weekly_hours:{weekdays:[1,2,3],opens_at:'09:00',closes_at:'18:00'},whatsapp_phone:'5511999999999',menu_delivery_zones:[],menu_categories:categories.map(c=>({...c,active:true,sort_order:0,menu_items:c.items.map(i=>({...i,active:true,available:true,sort_order:0,menu_item_prices:i.prices.map(p=>({...p,active:true})),menu_item_option_groups:[]}))}))});
  const templates=[{code:'pizzeria',name:'Pizzaria'},{code:'restaurant',name:'Restaurante'},{code:'confectionery',name:'Confeitaria'},{code:'snack-bar',name:'Lanchonete'},{code:'crafts',name:'Artesanato e personalizados'},{code:'products',name:'Produtos em geral'}];
  window.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'fixture-owner'}}}}),signOut:async()=>({})},
   rpc:async(name,args)=>{
    window.__calls.push({name,args});
    if(name==='public_menu_plans')return{data:plans};
    if(name==='public_menu')return{data:{menu:menu(),categories,delivery_zones:[]}};
    if(name==='public_menu_assistant_status')return{data:{available:false}};
    if(name==='menu_onboarding_status')return{data:{exists:true,segment:window.__segment,profile_code:window.__profile,offer_code:effective,selected_offer_code:offer,plan_name:plans.find(p=>p.offer_code===offer).name,next_step:'review',completed_count:7,total_count:8,checks:{segment:true,identity:true,catalog:true,fulfillment:true,payments:true,hours:true,test_order:true,review:false}}};
    if(name==='menu_branding')return{data:{identity,published:false,has_draft:false}};
    if(name==='catalog_order_history')return{data:[]};
    if(name==='change_catalog_profile'){window.__template=args.target_template_code;window.__profile=args.target_template_code==='pizzeria'?'food':args.target_template_code;return{data:{saved:true}};}
    if(name==='set_catalog_business_segment'){const chosen=OgritechCatalogProfiles.segment(args.target_segment_code);window.__segment=chosen.code;window.__template=chosen.template;window.__profile=chosen.profile;return{data:{segment:chosen.code,profile_code:chosen.profile}};}
    if(name==='save_catalog_coupon')return{data:{saved:true}};
    if(name==='business_subscription_center')return{data:{products:[{code:'menu',name:'Catálogo',plans,modules:[]}],subscriptions:[{id:'sub',product_code:'menu',plan_id:plans.find(p=>p.offer_code===offer).id,plan_name_snapshot:plans.find(p=>p.offer_code===offer).name,status:trial?'trial':'active',billing_cycle:'monthly',current_period_end:'2099-01-01T00:00:00Z',effective_offer_code:effective,modules:[]}]}};
    return{data:null};
   },from(table){const data=table==='online_menus'?menu():table==='menu_orders'?[]:table==='menu_catalog_templates'?templates:table==='profiles'?{active:true,role:'owner',barbershop_id:tenant}:null;
    const q={select(){return q;},eq(){return q;},order(){return q;},limit(){return q;},maybeSingle(){return q;},then(resolve,reject){return Promise.resolve({data,error:null}).then(resolve,reject);}};return q;},
   functions:{invoke:async(name,{body})=>{
    window.__calls.push({name,args:body});
    if(body.action==='billing_status')return{data:{data:{offer:'encomendas',plan_id:plans[1].id,plan_name:plans[1].name,monthly_cents:2990,annual_cents:29900,effective_offer:'encomendas',cycle:window.__billingCycle||'monthly',payment_method:'card',status:'active',trial_ends_at:'2020-01-01T00:00:00Z',access_until:'2099-01-01T00:00:00Z',subscription_created:!window.__reauthorization,payment_requested:false,payment_reauthorization_required:Boolean(window.__reauthorization)}}};
    if(body.action==='change_offer'){window.__billingCycle=body.cycle;window.__reauthorization=true;return{data:{data:{reauthorization_required:true}}};}
    if(body.action==='choose_payment'){window.__reauthorization=false;return{data:{data:{checkout_url:null}}};}
    return{data:{data:{offer:body.offer}},error:null};
   }}};

}
