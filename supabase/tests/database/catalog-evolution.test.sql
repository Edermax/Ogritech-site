begin;
set local search_path=public,extensions;
select extensions.no_plan();
select extensions.is((select monthly_fee from public.saas_plans where code='catalogo-essencial'),9.90::numeric,'Essencial monthly price');
select extensions.is((select annual_fee from public.saas_plans where code='catalogo-essencial'),99.00::numeric,'Essencial annual price');
select extensions.is((select monthly_fee from public.saas_plans where code='catalogo-completo'),29.90::numeric,'Completo monthly price');
select extensions.is((select annual_fee from public.saas_plans where code='catalogo-completo'),299.00::numeric,'Completo annual price');
select extensions.ok(not exists(select 1 from jsonb_array_elements(public.public_menu_plans()) p where p->>'code' in ('cardapio','foundation')),'legacy contracts are not new public offers');
select extensions.is((select monthly_fee from public.saas_plans where code='foundation' and menu_offer_code='encomendas'),49.90::numeric,'legacy price remains intact');
select extensions.is((select count(*) from public.menu_catalog_templates where active),6::bigint,'food models and two new models');
select extensions.ok(not has_function_privilege('anon','public.change_catalog_profile(uuid,text)','execute'),'anonymous cannot change profile');
select extensions.ok(not has_function_privilege('authenticated','public.backend_catalog_offer_change_claim(uuid,text,timestamptz,text)','execute'),'only billing backend reserves a cycle change');

insert into public.barbershops(id,name,slug,segment) values('cc100000-0000-4000-8000-000000000001','Artesanato Teste','catalog-evolution-fixture','Artesanato e personalizados');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('cc200000-0000-4000-8000-000000000001','Artesanato Teste','Artesanato','Fixture','catalog-owner@example.invalid','Teste','Catálogo Essencial',9.90,'Ativo','cc100000-0000-4000-8000-000000000001');
insert into private.billing_signups(id,saas_plan_id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,barbershop_id,saas_client_id,trial_ends_at)
select 'cc300000-0000-4000-8000-000000000001',id,'00000000001771','Artesanato Teste','Fixture','catalog-owner@example.invalid','11999999999','monthly','pix',990,1,0,990,'fixture','catalog-evolution-fixture','menu','cc100000-0000-4000-8000-000000000001','cc200000-0000-4000-8000-000000000001',now()+interval '14 days'
from public.saas_plans where code='catalogo-essencial';
insert into public.billing_customers(saas_client_id,billing_email) values('cc200000-0000-4000-8000-000000000001','catalog-owner@example.invalid');
insert into public.platform_subscriptions(billing_customer_id,product_id,plan_id,status,billing_cycle,base_amount,current_period_start,current_period_end)
select bc.id,p.product_id,p.id,'trial','monthly',9.90,now(),now()+interval '14 days' from public.billing_customers bc,public.saas_plans p where bc.saas_client_id='cc200000-0000-4000-8000-000000000001' and p.code='catalogo-essencial';
insert into public.business_whatsapp_shares(barbershop_id,phone) values('cc100000-0000-4000-8000-000000000001','5511999999999');
insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('cc800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','catalog-owner@example.invalid','{}','{}',now(),now());
insert into public.profiles(id,barbershop_id,full_name,role,active) values('cc800000-0000-4000-8000-000000000001','cc100000-0000-4000-8000-000000000001','Catalog owner','owner',true);
select extensions.ok(private.menu_has_orders('cc100000-0000-4000-8000-000000000001'),'Essencial selection gets Complete trial capabilities');
select extensions.is((select offer_code from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),'cardapio','selected future offer remains Essential');
create temporary table original_trial as select trial_started_at,trial_ends_at from private.billing_signups where id='cc300000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.is(public.menu_onboarding_status('cc100000-0000-4000-8000-000000000001')->>'profile_code','crafts','signup segment suggests craft profile before creating catalog');
select public.apply_menu_catalog_template('cc100000-0000-4000-8000-000000000001','crafts','catalog-evolution-fixture');
select extensions.is((select count(*) from public.menu_items where barbershop_id='cc100000-0000-4000-8000-000000000001'),0::bigint,'template never publishes fictitious products');
select extensions.throws_ok($$select public.change_catalog_profile('cc100000-0000-4000-8000-000000000002','products')$$,'42501',null,'profile changes cannot cross tenant boundaries');
reset role;
insert into public.menu_items(id,barbershop_id,category_id,name,item_type)
select 'cc600000-0000-4000-8000-000000000001',barbershop_id,id,'Vaso artesanal','configurable' from public.menu_categories where barbershop_id='cc100000-0000-4000-8000-000000000001' order by sort_order limit 1;
insert into public.menu_item_prices(id,barbershop_id,menu_item_id,label,price) values('cc700000-0000-4000-8000-000000000001','cc100000-0000-4000-8000-000000000001','cc600000-0000-4000-8000-000000000001','Cerâmica · pequeno',25);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.save_menu_onboarding_settings('cc100000-0000-4000-8000-000000000001','{"slug":"catalog-evolution-fixture","title":"Artesanato Teste","description":"Peças artesanais","minimum_order":0,"delivery_fee":0,"accepts_delivery":false,"accepts_pickup":true,"visual_identity":{"primary_color":"#70452D","accent_color":"#B87540"},"payment_methods":["pix"],"weekdays":[1,2,3,4,5],"opens_at":"09:00","closes_at":"18:00"}')$$,'craft catalog requires no restaurant-specific fields');
select public.change_catalog_profile('cc100000-0000-4000-8000-000000000001','products');
select extensions.is((select slug from public.online_menus where barbershop_id='cc100000-0000-4000-8000-000000000001'),'catalog-evolution-fixture','profile preserves public address');
select extensions.is((select count(*) from public.menu_items where barbershop_id='cc100000-0000-4000-8000-000000000001'),1::bigint,'profile preserves merchant products');
select public.save_catalog_coupon('cc100000-0000-4000-8000-000000000001','{"code":"PRESENTE","amount":5}');
select public.run_menu_test_order('cc100000-0000-4000-8000-000000000001');
select public.confirm_menu_review('cc100000-0000-4000-8000-000000000001');
select public.set_menu_publication('cc100000-0000-4000-8000-000000000001',true);
reset role;
select extensions.is(public.public_menu('catalog-evolution-fixture')->'menu'->>'profile_code','products','public response contains presentation profile');
set local role anon;
create temporary table coupon_order as select public.public_create_catalog_order('catalog-evolution-fixture','Cliente Teste','','11988887777','pickup',null,'Pedido de teste',
 '[{"menu_item_price_id":"cc700000-0000-4000-8000-000000000001","quantity":2,"selections":[]}]',true,'cc900000-0000-4000-8000-000000000001',null,'','PRESENTE') as data;
select extensions.is((select (data->>'total_amount')::numeric from coupon_order),45::numeric,'server computes coupon from authoritative prices');
select extensions.is((select (data->>'discount_amount')::numeric from coupon_order),5::numeric,'fixed coupon subtracts only its configured value');
select extensions.is(public.public_create_catalog_order('catalog-evolution-fixture','Cliente Teste','','11988887777','pickup',null,'Pedido de teste',
 '[{"menu_item_price_id":"cc700000-0000-4000-8000-000000000001","quantity":2,"selections":[]}]',true,'cc900000-0000-4000-8000-000000000001',null,'','PRESENTE')->>'reference',(select data->>'reference' from coupon_order),'coupon retry returns same order');
select extensions.throws_ok($$select public.public_create_catalog_order('catalog-evolution-fixture','Cliente Teste','','11988887777','pickup',null,'Pedido de teste','[{"menu_item_price_id":"cc700000-0000-4000-8000-000000000001","quantity":2,"selections":[]}]',true,'cc900000-0000-4000-8000-000000000002',null,'','INVALIDO')$$,'22023',null,'invalid coupon rolls back the attempted order');
reset role;
select extensions.is((select count(*) from public.menu_orders where barbershop_id='cc100000-0000-4000-8000-000000000001' and not is_test),1::bigint,'retry and invalid coupon create no duplicate or orphan orders');
select extensions.ok(private.catalog_can_cover('cc100000-0000-4000-8000-000000000001'),'Complete trial includes a cover even when Essential was selected');
savepoint quote_catalog;
update public.online_menus set published=false where barbershop_id='cc100000-0000-4000-8000-000000000001';
update public.menu_items set metadata='{"order_mode":"quote"}' where id='cc600000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.lives_ok($$select public.run_menu_test_order('cc100000-0000-4000-8000-000000000001')$$,'quote catalog supports the private synthetic onboarding test');
select public.confirm_menu_review('cc100000-0000-4000-8000-000000000001');
select public.set_menu_publication('cc100000-0000-4000-8000-000000000001',true);
set local role anon;
select extensions.throws_ok($$select public.public_create_menu_order_v2('catalog-evolution-fixture','Cliente Teste','','11988887777','pickup',null,'','[{"menu_item_price_id":"cc700000-0000-4000-8000-000000000001","quantity":1}]',true,'cc900000-0000-4000-8000-000000000004')$$,'22023',null,'reference-price quote cannot be submitted as a final-price order');
reset role;
rollback to savepoint quote_catalog;
release savepoint quote_catalog;
grant select on coupon_order to authenticated;

-- Expire only the fixture trial; selected Essential remains active after payment.
update private.billing_signups set trial_ends_at=now()-interval '1 minute',status='active',access_until=now()+interval '1 month' where id='cc300000-0000-4000-8000-000000000001';
update public.platform_subscriptions set status='active',current_period_end=now()+interval '1 month' where billing_customer_id=(select id from public.billing_customers where saas_client_id='cc200000-0000-4000-8000-000000000001');
select extensions.ok(not private.menu_has_orders('cc100000-0000-4000-8000-000000000001'),'Essential no longer creates orders after trial');
select extensions.ok(not private.catalog_can_cover('cc100000-0000-4000-8000-000000000001'),'new Essential has basic branding after trial');
select extensions.throws_ok($$select public.public_create_menu_order_v2('catalog-evolution-fixture','Cliente Teste','','11988887777','pickup',null,'','[{"menu_item_price_id":"cc700000-0000-4000-8000-000000000001","quantity":1}]',true,'cc900000-0000-4000-8000-000000000003')$$,'42501',null,'direct endpoint cannot bypass Essential restriction');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cc800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.save_catalog_coupon('cc100000-0000-4000-8000-000000000001','{"code":"OUTRO","amount":1}')$$,'42501',null,'coupon administration is Complete-only');
select extensions.is(jsonb_array_length(public.catalog_order_history('cc100000-0000-4000-8000-000000000001')),1,'previous order remains available through narrow history');
select extensions.lives_ok($$select public.finish_catalog_order('cc100000-0000-4000-8000-000000000001',(select id from public.menu_orders where public_reference=(select data->>'reference' from coupon_order)),'completed')$$,'previous commitment can be concluded without new-order permission');
reset role;

-- An annual plan/cycle change reserves and commits a single canonical amount.
create temporary table change_claim as select public.backend_catalog_offer_change_claim('cc100000-0000-4000-8000-000000000001','catalogo-completo',(select updated_at from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),'annual') as data;
select public.backend_billing_offer_change_commit((select (data->>'operation_id')::uuid from change_claim),(select (data->>'lease_token')::uuid from change_claim));
select public.backend_billing_offer_change_finish((select (data->>'operation_id')::uuid from change_claim),(select (data->>'lease_token')::uuid from change_claim),false);
select extensions.is((select total_cents from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),29900,'Complete annual is 29900 cents without a second discount');
select extensions.is((select cycle_months from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),12,'annual recurrence uses twelve months');
select extensions.is((select trial_started_at from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),(select trial_started_at from original_trial),'plan and cycle change never restarts trial');
create temporary table cycle_claim as select public.backend_catalog_offer_change_claim('cc100000-0000-4000-8000-000000000001','catalogo-completo',(select updated_at from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),'monthly') as data;
select public.backend_billing_offer_change_commit((select (data->>'operation_id')::uuid from cycle_claim),(select (data->>'lease_token')::uuid from cycle_claim));
select public.backend_billing_offer_change_finish((select (data->>'operation_id')::uuid from cycle_claim),(select (data->>'lease_token')::uuid from cycle_claim),false);
select extensions.is((select cycle_months from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),1,'same-plan cycle change switches the recurrence interval');
select extensions.is((select total_cents from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),2990,'same-plan cycle change uses the monthly price');
create temporary table downgrade_claim as select public.backend_catalog_offer_change_claim('cc100000-0000-4000-8000-000000000001','catalogo-essencial',(select updated_at from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),'monthly') as data;
select public.backend_billing_offer_change_commit((select (data->>'operation_id')::uuid from downgrade_claim),(select (data->>'lease_token')::uuid from downgrade_claim));
select public.backend_billing_offer_change_finish((select (data->>'operation_id')::uuid from downgrade_claim),(select (data->>'lease_token')::uuid from downgrade_claim),false);
select extensions.ok(private.menu_has_orders('cc100000-0000-4000-8000-000000000001'),'downgrade keeps already-paid Complete rights');
select extensions.is((select total_cents from private.billing_signups where id='cc300000-0000-4000-8000-000000000001'),990,'next monthly price is Essential');
select * from extensions.finish();
rollback;
