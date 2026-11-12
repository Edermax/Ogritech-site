// Synthetic administration records; all mutations are rejected.
module.exports=String.raw`
window.__fixtureCalls=[];
window.ogritechEnvironmentUrl=path=>path;
const tables={
 profiles:{full_name:'Administrador de teste',active:true},
 saas_clients:[{id:'client-1',barbershop_id:'business-1',name:'Confeitaria de exemplo',segment:'Confeitaria',contact_name:'Responsável de exemplo',owner_email:'owner@example.invalid',phone:'11999999999',plan:'Cardápio',monthly_fee:49.90,origin:'Cliente real',status:'Ativo',invite_status:'Aceito',notes:'Cadastro de teste; nenhum dado de produção.'},{id:'client-2',barbershop_id:'business-2',name:'Salgaderia de exemplo',segment:'Lanchonete',contact_name:'Responsável de teste',owner_email:null,phone:null,plan:'Cardápio',monthly_fee:49.90,origin:'Demonstração',status:'Suspenso'}],
 saas_plans:[{id:'plan-1',product_id:'product-1',code:'menu',name:'Cardápio',monthly_fee:49.9,description:'Cardápio e pedidos para o seu negócio.',features:['Catálogo de produtos','Pedidos online'],featured:true,max_users:5,max_professionals:1,max_services:10}],
 platform_products:[{id:'product-1',code:'menu',name:'Cardápio',launch_state:'Disponível'}],
 platform_subscriptions:[{id:'subscription-1',billing_customer_id:'customer-1',product_id:'product-1',plan_id:'plan-1',status:'active',base_amount:49.90,current_period_end:'2099-12-31T00:00:00Z'},{id:'subscription-2',billing_customer_id:'customer-2',product_id:'product-1',plan_id:'plan-1',status:'suspended',base_amount:49.9}],
 billing_customers:[{id:'customer-1',saas_client_id:'client-1'},{id:'customer-2',saas_client_id:'client-2'}],
 platform_invoices:[{id:'invoice-1',invoice_number:'TESTE-001',billing_customer_id:'customer-1',status:'open',issue_date:'2026-11-01',due_date:'2099-12-31',total:49.9,discount_total:0,credit_total:0,paid_total:0,refunded_total:0},{id:'invoice-2',invoice_number:'TESTE-002',billing_customer_id:'customer-1',status:'paid',issue_date:'2026-10-01',due_date:'2026-10-10',total:49.9,discount_total:0,credit_total:0,paid_total:49.9,refunded_total:0},{id:'invoice-3',invoice_number:'TESTE-003',billing_customer_id:'customer-2',status:'overdue',issue_date:'2026-10-01',due_date:'2026-10-10',total:49.9,discount_total:0,credit_total:0,paid_total:0,refunded_total:0}],
 platform_payments:[{id:'payment-1',invoice_id:'invoice-2',method:'pix',status:'approved',gross_amount:49.9,paid_at:'2026-10-10T00:00:00Z'}],platform_refunds:[]
};
window.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'admin-test'}}}}),signOut:async()=>({})},
 rpc:async(name)=>{window.__fixtureCalls.push({rpc:name});if(name==='is_platform_admin')return {data:true};if(name==='platform_menu_trial_reviews')return{data:[{id:'review-1',business_name:'Confeitaria de teste',contact_email:'example@example.invalid',document_last_four:'1234',phone_last_four:'5678',reasons:['phone_used'],status:'pending'}]};throw Error('Mutation not allowed: '+name);},
 functions:{invoke:async(name,options)=>{window.__fixtureCalls.push({function:name,action:options.body.action});if(name==='platform-users'&&options.body.action==='list')return {data:{users:[{id:'user-1',barbershop_id:'business-1',full_name:'Usuário de teste',email:'owner@example.invalid',role:'owner',active:true}]}};throw Error('Unexpected function');}},
 from(table){window.__fixtureCalls.push({table});const q={select(){return q},eq(){return q},is(){return q},order(){return q},limit(){return q},single(){return q},then(resolve,reject){return Promise.resolve({data:tables[table]}).then(resolve,reject)}};return q;}
};`;
