begin;
set local search_path=public,extensions;
select extensions.no_plan();
insert into public.barbershops(id,name,slug,segment) values('ee100000-0000-4000-8000-000000000001','Plan fixture','configurable-plan-fixture','Restaurante');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('ee200000-0000-4000-8000-000000000001','Plan fixture','Restaurante','Fixture','plan-owner@example.invalid','Teste','Encomendas',49.90,'Ativo','ee100000-0000-4000-8000-000000000001');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('ee800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plan-admin@example.invalid','','{}','{}',now(),now()),
 ('ee800000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','plan-owner@example.invalid','','{}','{}',now(),now());
insert into public.profiles(id,barbershop_id,full_name,role,active) values
 ('ee800000-0000-4000-8000-000000000001','ee100000-0000-4000-8000-000000000001','Plan admin','admin',true),
 ('ee800000-0000-4000-8000-000000000002','ee100000-0000-4000-8000-000000000001','Plan owner','owner',true);
insert into public.platform_admins(user_id) values('ee800000-0000-4000-8000-000000000001');
create function pg_temp.plan_payload(code text,name text,offer text,monthly numeric,annual numeric) returns jsonb language sql as $$
 select jsonb_build_object('code',code,'name',name,'offer_code',offer,'monthly_fee',monthly,'annual_fee',annual,
 'description','Plano de teste transacional','features',jsonb_build_array('Recurso de exemplo'),'featured',false,'active',true,'display_order',10,'max_users',3)
$$;
select extensions.ok(not has_function_privilege('anon','public.platform_save_menu_plan(jsonb)','execute'),'anonymous cannot create plans');
set local role anon;
select extensions.ok(jsonb_array_length(public.public_menu_plans())>=2,'public catalog lists active flagship plans');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ee800000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($$select public.platform_save_menu_plan(pg_temp.plan_payload('forbidden-plan','Forbidden','encomendas',59.90,599))$$,'42501',null,'business owner is not a platform administrator');
select set_config('request.jwt.claims','{"sub":"ee800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
create temporary table custom_plan as select public.platform_save_menu_plan(pg_temp.plan_payload('fixture-encomendas-pro','Fixture Encomendas Pro','encomendas',59.90,599)) as data;
select extensions.is((select (data->>'monthly_fee')::numeric from custom_plan),59.90::numeric,'administrator creates a priced plan');
select extensions.is((select data->>'menu_offer_code' from custom_plan),'encomendas','plan has an explicit capability family');
select extensions.throws_ok($$select public.platform_save_menu_plan(pg_temp.plan_payload('fixture-encomendas-pro','Duplicate','encomendas',59.90,599))$$,'23505',null,'duplicate code is rejected');
select extensions.throws_ok($$select public.platform_save_menu_plan(pg_temp.plan_payload('invalid-family','Invalid','other',59.90,599))$$,'22023',null,'unsupported capabilities are rejected');
select extensions.throws_ok($$select public.platform_save_menu_plan(pg_temp.plan_payload('invalid-annual','Invalid','encomendas',10,121))$$,'22023',null,'annual cannot exceed twelve monthly payments');
select extensions.throws_ok($$select public.platform_save_menu_plan(pg_temp.plan_payload('invalid-negative','Invalid','encomendas',-1,1))$$,'22023',null,'negative price is rejected');
create temporary table simple_plan as select public.platform_save_menu_plan(pg_temp.plan_payload('fixture-cardapio-pro','Fixture Cardápio Pro','cardapio',39.90,399)) as data;
reset role;
select extensions.ok(exists(select 1 from jsonb_array_elements(public.public_menu_plans()) p where p->>'code'='fixture-encomendas-pro'),'new active plan is available publicly');
select extensions.throws_ok($$update public.saas_plans set annual_fee=1 where code='cardapio' and menu_offer_code='cardapio'$$,'23514',null,'flagship annual price remains protected');
select extensions.throws_ok($$update public.saas_plans set menu_offer_code='cardapio' where id=(select (data->>'id')::uuid from custom_plan)$$,'23514',null,'capability family cannot silently change for existing subscribers');
insert into public.billing_customers(saas_client_id,billing_email) values('ee200000-0000-4000-8000-000000000001','plan-owner@example.invalid');
insert into public.platform_subscriptions(billing_customer_id,product_id,plan_id,status,base_amount,current_period_end)
select bc.id,p.product_id,p.id,'trial',p.monthly_fee,now()+interval '7 days' from public.billing_customers bc,public.saas_plans p
where bc.saas_client_id='ee200000-0000-4000-8000-000000000001' and p.code='foundation' and p.menu_offer_code='encomendas';
insert into private.billing_signups(id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,barbershop_id,saas_client_id,trial_ends_at)
values('ee300000-0000-4000-8000-000000000001','00000000001651','Plan fixture','Fixture','plan-owner@example.invalid','11999999999','monthly','pix',4990,1,0,4990,'fixture','configurable-plan-token','menu','ee100000-0000-4000-8000-000000000001','ee200000-0000-4000-8000-000000000001',now()+interval '7 days');
create temporary table original_boundary as select trial_started_at,trial_ends_at,access_until from private.billing_signups where id='ee300000-0000-4000-8000-000000000001';
select public.backend_billing_change_offer('ee100000-0000-4000-8000-000000000001','fixture-encomendas-pro',(select updated_at from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'));
select extensions.is((select total_cents from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'),5990,'same-family plan change updates the agreed amount');
select extensions.is((select saas_plan_id from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'),(select (data->>'id')::uuid from custom_plan),'billing records selected plan identity');
select extensions.is((select trial_ends_at from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'),(select trial_ends_at from original_boundary),'new plan does not reset trial');
select extensions.ok(private.menu_has_orders('ee100000-0000-4000-8000-000000000001'),'Encomendas variant retains order permissions');
update public.saas_plans set monthly_fee=69.90,annual_fee=699 where id=(select (data->>'id')::uuid from custom_plan);
select extensions.is((select base_monthly_cents from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'),5990,'catalog price edit does not reprice existing contract');
select extensions.is((select plan_annual_cents from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'),59900,'annual contract snapshot is preserved');
select extensions.lives_ok($$select public.backend_billing_choose_payment_update('ee300000-0000-4000-8000-000000000001','{"cycle":"annual","payment_method":"pix","base_monthly_cents":5990,"cycle_months":12,"discount_bps":1667,"total_cents":59900,"status":"trial_active"}'::jsonb)$$,'renewal uses agreed annual amount despite catalog change');
select extensions.throws_ok($$update private.billing_signups set total_cents=1 where id='ee300000-0000-4000-8000-000000000001'$$,'23514',null,'signed price constraint rejects a tampered amount');
select public.backend_billing_change_offer('ee100000-0000-4000-8000-000000000001','fixture-cardapio-pro',(select updated_at from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'));
select extensions.ok(not private.menu_has_orders('ee100000-0000-4000-8000-000000000001'),'Cardápio variant cannot gain order permissions');
update public.saas_plans set active=false where id=(select (data->>'id')::uuid from simple_plan);
select extensions.ok(private.business_product_is_active('ee100000-0000-4000-8000-000000000001','menu'),'deactivating plan preserves existing access');
select extensions.ok(not exists(select 1 from jsonb_array_elements(public.public_menu_plans()) p where p->>'code'='fixture-cardapio-pro'),'inactive plan disappears from new signups');
select extensions.throws_ok($$select public.backend_billing_signup_create(jsonb_build_object('product_code','menu','plan_id',(select data->>'id' from simple_plan),'tax_document','00000000001652','business_name','New fixture','responsible_name','Fixture','email','new-plan@example.invalid','phone','11999999999','cycle','monthly','payment_method','pix','base_monthly_cents',3990,'cycle_months',1,'discount_bps',0,'total_cents',3990,'terms_version','fixture','management_token_hash','new-plan-fixture','trial_ends_at',now()+interval '14 days'))$$,'22023',null,'inactive plan cannot be purchased through crafted API payload');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ee800000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.ok(exists(select 1 from jsonb_array_elements(public.business_subscription_center('ee100000-0000-4000-8000-000000000001')->'products') product,jsonb_array_elements(product->'plans') p where p->>'code'='fixture-cardapio-pro'),'owner can identify their current inactive plan');
select extensions.is((public.business_plan_capacity('ee100000-0000-4000-8000-000000000001')->>'max_users')::integer,3,'inactive current plan keeps enforcing its user limit');
select extensions.is((public.business_subscription_center('ee100000-0000-4000-8000-000000000001')->'subscriptions'->0->>'contract_monthly_cents')::integer,3990,'owner sees the contract amount');
reset role;
create temporary table reserved_plan as select public.backend_billing_offer_change_claim('ee100000-0000-4000-8000-000000000001','fixture-encomendas-pro',(select updated_at from private.billing_signups where id='ee300000-0000-4000-8000-000000000001')) as data;
select extensions.is((select (data->'target_plan'->>'monthly_fee')::numeric from reserved_plan),69.90::numeric,'reservation freezes the canonical plan price');
update public.saas_plans set monthly_fee=79.90,annual_fee=799 where id=(select (data->>'id')::uuid from custom_plan);
select extensions.throws_ok($$select public.backend_billing_offer_change_commit((select (data->>'operation_id')::uuid from reserved_plan),(select (data->>'lease_token')::uuid from reserved_plan))$$,'40001',null,'price change during provider update cannot commit a different amount');
select public.backend_billing_offer_change_finish((select (data->>'operation_id')::uuid from reserved_plan),(select (data->>'lease_token')::uuid from reserved_plan),false);
select extensions.is((select plan_annual_cents from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'),39900,'failed change preserves previous contract');
select extensions.is((select trial_ends_at from private.billing_signups where id='ee300000-0000-4000-8000-000000000001'),(select trial_ends_at from original_boundary),'all changes preserve original trial boundary');
select * from extensions.finish();
rollback;
