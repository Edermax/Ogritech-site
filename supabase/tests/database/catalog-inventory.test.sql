begin;
set local search_path=public,extensions;
select extensions.no_plan();
insert into public.barbershops(id,name,slug,segment) values('cd100000-0000-4000-8000-000000000001','Artesanato Teste','inventory-fixture','Artesanato e personalizados');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('cd200000-0000-4000-8000-000000000001','Artesanato Teste','Artesanato','Fixture','catalog-owner@example.invalid','Teste','Catálogo Essencial',9.90,'Ativo','cd100000-0000-4000-8000-000000000001');
insert into private.billing_signups(id,saas_plan_id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,barbershop_id,saas_client_id,trial_ends_at)
select 'cd300000-0000-4000-8000-000000000001',id,'00000000001771','Artesanato Teste','Fixture','catalog-owner@example.invalid','11999999999','monthly','pix',990,1,0,990,'fixture','inventory-fixture','menu','cd100000-0000-4000-8000-000000000001','cd200000-0000-4000-8000-000000000001',now()+interval '14 days'
from public.saas_plans where code='catalogo-essencial';
insert into public.billing_customers(saas_client_id,billing_email) values('cd200000-0000-4000-8000-000000000001','catalog-owner@example.invalid');
insert into public.platform_subscriptions(billing_customer_id,product_id,plan_id,status,billing_cycle,base_amount,current_period_start,current_period_end)
select bc.id,p.product_id,p.id,'trial','monthly',9.90,now(),now()+interval '14 days' from public.billing_customers bc,public.saas_plans p where bc.saas_client_id='cd200000-0000-4000-8000-000000000001' and p.code='catalogo-essencial';
insert into public.business_whatsapp_shares(barbershop_id,phone) values('cd100000-0000-4000-8000-000000000001','5511999999999');
insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('cd800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','catalog-owner@example.invalid','{}','{}',now(),now());
insert into public.profiles(id,barbershop_id,full_name,role,active) values('cd800000-0000-4000-8000-000000000001','cd100000-0000-4000-8000-000000000001','Catalog owner','owner',true);
select extensions.ok(private.menu_has_orders('cd100000-0000-4000-8000-000000000001'),'Essencial selection gets Complete trial capabilities');
select extensions.is((select offer_code from private.billing_signups where id='cd300000-0000-4000-8000-000000000001'),'cardapio','selected future offer remains Essential');
create temporary table original_trial as select trial_started_at,trial_ends_at from private.billing_signups where id='cd300000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cd800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.is(public.menu_onboarding_status('cd100000-0000-4000-8000-000000000001')->>'profile_code','crafts','signup segment suggests craft profile before creating catalog');
select public.apply_menu_catalog_template('cd100000-0000-4000-8000-000000000001','crafts','inventory-fixture');
select extensions.is((select count(*) from public.menu_items where barbershop_id='cd100000-0000-4000-8000-000000000001'),0::bigint,'template never publishes fictitious products');
select extensions.throws_ok($$select public.change_catalog_profile('cd100000-0000-4000-8000-000000000002','products')$$,'42501',null,'profile changes cannot cross tenant boundaries');
reset role;
insert into public.menu_items(id,barbershop_id,category_id,name,item_type)
select 'cd600000-0000-4000-8000-000000000001',barbershop_id,id,'Vaso artesanal','configurable' from public.menu_categories where barbershop_id='cd100000-0000-4000-8000-000000000001' order by sort_order limit 1;
insert into public.menu_item_prices(id,barbershop_id,menu_item_id,label,price) values('cd700000-0000-4000-8000-000000000001','cd100000-0000-4000-8000-000000000001','cd600000-0000-4000-8000-000000000001','Cerâmica · pequeno',25);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cd800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.save_menu_onboarding_settings('cd100000-0000-4000-8000-000000000001','{"slug":"inventory-fixture","title":"Artesanato Teste","description":"Peças artesanais","minimum_order":0,"delivery_fee":0,"accepts_delivery":false,"accepts_pickup":true,"visual_identity":{"primary_color":"#70452D","accent_color":"#B87540"},"payment_methods":["pix"],"weekdays":[1,2,3,4,5],"opens_at":"09:00","closes_at":"18:00"}')$$,'craft catalog requires no restaurant-specific fields');
select public.change_catalog_profile('cd100000-0000-4000-8000-000000000001','products');
select extensions.is((select slug from public.online_menus where barbershop_id='cd100000-0000-4000-8000-000000000001'),'inventory-fixture','profile preserves public address');
select extensions.is((select count(*) from public.menu_items where barbershop_id='cd100000-0000-4000-8000-000000000001'),1::bigint,'profile preserves merchant products');
select public.save_catalog_coupon('cd100000-0000-4000-8000-000000000001','{"code":"PRESENTE","amount":5}');
select public.run_menu_test_order('cd100000-0000-4000-8000-000000000001');
select public.confirm_menu_review('cd100000-0000-4000-8000-000000000001');
select public.set_menu_publication('cd100000-0000-4000-8000-000000000001',true);
reset role;
select extensions.is(public.public_menu('inventory-fixture')->'menu'->>'profile_code','products','public response contains presentation profile');
-- Helpers keep every command on the public API, with different request IDs.
create function pg_temp.stock_cmd(op text,qty numeric,ver bigint,key uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.catalog_stock_command('cd100000-0000-4000-8000-000000000001','cd600000-0000-4000-8000-000000000001',op,qty,'Contagem de teste',key,ver)
$$;
create function pg_temp.stock_order(qty integer,key uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.public_create_menu_order_v2('inventory-fixture','Cliente fictício','','11988887777','pickup',null,'',jsonb_build_array(jsonb_build_object('menu_item_price_id','cd700000-0000-4000-8000-000000000001','quantity',qty)),true,key)
$$;
select extensions.ok(not has_table_privilege('authenticated','private.catalog_stock','select'),'no direct stock reads');
select extensions.ok(not has_table_privilege('authenticated','private.catalog_stock_movements','update'),'ledger cannot be edited by clients');
select extensions.ok(not has_function_privilege('anon','public.catalog_inventory(uuid,uuid,bigint)','execute'),'stock history is private');
select extensions.ok(not has_function_privilege('authenticated','private.reserve_catalog_inventory(uuid)','execute'),'checkout hook cannot be invoked by owners');
select extensions.ok(not exists(select 1 from private.catalog_stock),'existing products do not get invented balances');
set local role authenticated;
select extensions.is(public.menu_onboarding_status('cd100000-0000-4000-8000-000000000001')->>'inventory_enabled','true','Complete trial includes stock');
select extensions.throws_ok($$select public.catalog_inventory('cd100000-0000-4000-8000-000000000002')$$,'42501',null,'cross-tenant reads denied');
select extensions.throws_ok($$select public.catalog_stock_command('cd100000-0000-4000-8000-000000000002','cd600000-0000-4000-8000-000000000001','enable',9,'Motivo teste',gen_random_uuid(),0)$$,'42501',null,'cross-tenant writes denied');
select extensions.throws_ok($$select pg_temp.stock_cmd('enable',1.5,0)$$,'22023',null,'fractional stock rejected');
select extensions.throws_ok($$select pg_temp.stock_cmd('enable',-1,0)$$,'22023',null,'negative opening balance rejected');
select extensions.throws_ok($$select pg_temp.stock_cmd('enable','NaN',0)$$,'22023',null,'nonfinite input rejected');
select extensions.throws_ok($$select pg_temp.stock_cmd(null,5,0)$$,'22023',null,'null operation rejected');
select extensions.throws_ok($$select public.catalog_stock_command('cd100000-0000-4000-8000-000000000001','cd600000-0000-4000-8000-000000000001','enable',5,' ',gen_random_uuid(),0)$$,'22023',null,'meaningful reason required');
select extensions.is(pg_temp.stock_cmd('enable',5,0,'cd900000-0000-4000-8000-000000000001')->>'quantity','5','opening balance stored');
select extensions.is(pg_temp.stock_cmd('enable',5,0,'cd900000-0000-4000-8000-000000000001')->>'replayed','true','lost response retries do not move stock again');
select extensions.throws_ok($$select pg_temp.stock_cmd('enable',6,0,'cd900000-0000-4000-8000-000000000001')$$,'23505',null,'retry key cannot change payload');
select extensions.is(public.catalog_inventory('cd100000-0000-4000-8000-000000000001')->'products'->0->>'quantity','5','current quantity visible to manager');
select extensions.throws_ok($$select pg_temp.stock_cmd('exit',6,1)$$,'23514',null,'no negative stock');
select extensions.throws_ok($$select pg_temp.stock_cmd('entry',1,0)$$,'40001',null,'stale form cannot overwrite a newer balance');
select extensions.throws_ok($$select pg_temp.stock_cmd('entry',0,1)$$,'22023',null,'zero entry rejected');
select extensions.is(pg_temp.stock_cmd('entry',2,1)->>'quantity','7','manual entry');
select extensions.is(pg_temp.stock_cmd('exit',1,2)->>'quantity','6','manual exit');
select extensions.is(pg_temp.stock_cmd('adjust',5,3)->>'quantity','5','physical-count adjustment records the difference');
select extensions.lives_ok($$select public.run_menu_test_order('cd100000-0000-4000-8000-000000000001')$$,'synthetic test order still works');
select extensions.is(public.catalog_inventory('cd100000-0000-4000-8000-000000000001')->'products'->0->>'quantity','5','synthetic order never moves stock');
reset role;
select extensions.is((select count(*) from private.catalog_stock_movements),4::bigint,'invalid commands and test order create no extra movements');
select extensions.ok((public.public_menu('inventory-fixture')->'categories'->0->'items'->0->>'stock_available')::boolean,'available flag shown');
select extensions.ok(not (public.public_menu('inventory-fixture')->'categories'->0->'items'->0 ? 'quantity'),'public menu does not leak exact stock');
set local role anon;
create temporary table stock_sale as select pg_temp.stock_order(2,'cd900000-0000-4000-8000-000000000002') data;
select extensions.is(pg_temp.stock_order(2,'cd900000-0000-4000-8000-000000000002')->>'reference',(select data->>'reference' from stock_sale),'checkout retry returns existing order');
reset role;
select extensions.is((select quantity from private.catalog_stock),3::bigint,'real order deducted exactly once');
create temporary table sale_id as select id from public.menu_orders where public_reference=(select data->>'reference' from stock_sale);
grant select on sale_id to authenticated;
select extensions.is((select quantity from private.catalog_stock_allocations),2::bigint,'reservation quantity matches snapshots');
-- Separate lines/options of the same product share one balance.
set local role anon;
select public.public_create_menu_order_v2('inventory-fixture','Cliente fictício','','11988887776','pickup',null,'',
 '[{"menu_item_price_id":"cd700000-0000-4000-8000-000000000001","quantity":1},{"menu_item_price_id":"cd700000-0000-4000-8000-000000000001","quantity":2}]',true,'cd900000-0000-4000-8000-000000000003');
select extensions.throws_ok($$select pg_temp.stock_order(1)$$,'23514',null,'stale cart cannot buy sold-out stock');
reset role;
select extensions.is((select quantity from private.catalog_stock),0::bigint,'all lines aggregate per product');
select extensions.is((select count(*) from public.menu_orders where not is_test and barbershop_id='cd100000-0000-4000-8000-000000000001'),2::bigint,'insufficient checkout rolls back order and counter');
select extensions.ok(not (public.public_menu('inventory-fixture')->'categories'->0->'items'->0->>'stock_available')::boolean,'sold-out availability flag');
set local role authenticated;
select public.update_menu_order_operation('cd100000-0000-4000-8000-000000000001',(select id from sale_id),'confirm');
reset role;
select extensions.is((select quantity from private.catalog_stock),0::bigint,'confirming does not deduct twice');
set local role authenticated;
select public.review_menu_order_decision('cd100000-0000-4000-8000-000000000001',(select id from sale_id),'rejected',(select updated_at from public.menu_orders where id=(select id from sale_id)),'Decisão de teste');
reset role;
select extensions.is((select quantity from private.catalog_stock),2::bigint,'refusal returns reserved units');
set local role authenticated;
select public.review_menu_order_decision('cd100000-0000-4000-8000-000000000001',(select id from sale_id),'confirmed',(select updated_at from public.menu_orders where id=(select id from sale_id)),'Decisão de teste');
reset role;
select extensions.is((select quantity from private.catalog_stock),0::bigint,'reversing refusal reserves stock again');
set local role authenticated;
select pg_temp.stock_cmd('disable',null,(public.catalog_inventory('cd100000-0000-4000-8000-000000000001')->'products'->0->>'version')::bigint);
reset role;
update public.menu_orders set status='cancelled' where id=(select id from sale_id);
select extensions.is((select quantity from private.catalog_stock),2::bigint,'cancellation returns units even after tracking disabled');
update public.menu_orders set status='cancelled' where id=(select id from sale_id);
select extensions.is((select quantity from private.catalog_stock),2::bigint,'repeated cancellation has no extra return');
set local role authenticated;
select pg_temp.stock_cmd('enable',null,(public.catalog_inventory('cd100000-0000-4000-8000-000000000001')->'products'->0->>'version')::bigint);
select extensions.is(public.catalog_inventory('cd100000-0000-4000-8000-000000000001')->'products'->0->>'quantity','2','reenabling preserves previous stock');
reset role;
-- Expire trial into Essential: neither reads nor manual movements remain unlocked.
update public.platform_subscriptions set status='active' where billing_customer_id in(select id from public.billing_customers where saas_client_id='cd200000-0000-4000-8000-000000000001');
update private.billing_signups set status='active',trial_ends_at=now()-interval '1 day',access_until=now()+interval '30 days' where id='cd300000-0000-4000-8000-000000000001';
select extensions.ok(not private.catalog_inventory_access('cd100000-0000-4000-8000-000000000001'),'active Essential excludes inventory');
set local role authenticated;
select extensions.throws_ok($$select public.catalog_inventory('cd100000-0000-4000-8000-000000000001')$$,'42501',null,'Essential read denied on server');
select extensions.throws_ok($$select pg_temp.stock_cmd('entry',1,1)$$,'42501',null,'Essential mutation denied on server');
reset role;
select extensions.is((select quantity from private.catalog_stock),2::bigint,'downgrade preserves data');
select extensions.ok((public.public_menu('inventory-fixture')->'categories'->0->'items'->0->>'stock_available')::boolean,'Essential keeps manual availability');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('catalog_inventory','catalog_stock_command') and p.prosecdef),'public API never bypasses RLS implicitly');
select extensions.ok(not exists(select 1 from private.catalog_stock_movements where quantity_after<>quantity_before+delta),'ledger reconciles every movement');
-- Paid Complete rights remain authoritative until the purchased boundary.
update public.platform_subscriptions set catalog_access_offer='encomendas',catalog_access_until=now()+interval '1 day'
where billing_customer_id in(select id from public.billing_customers where saas_client_id='cd200000-0000-4000-8000-000000000001');
select extensions.ok(private.catalog_inventory_access('cd100000-0000-4000-8000-000000000001'),'paid Complete rights survive a scheduled downgrade');
set local role authenticated;
select extensions.is(public.catalog_inventory('cd100000-0000-4000-8000-000000000001')->'products'->0->>'quantity','2','restored entitlement reveals preserved balance');
select extensions.throws_ok($$select public.catalog_stock_command('cd100000-0000-4000-8000-000000000001','cd600000-0000-4000-8000-000000000099','enable',3,'Contagem teste',gen_random_uuid(),0)$$,'22023',null,'a foreign or missing product cannot receive this tenant stock');
reset role;
update public.profiles set role='employee' where id='cd800000-0000-4000-8000-000000000001';
set local role authenticated;
select extensions.throws_ok($$select public.catalog_inventory('cd100000-0000-4000-8000-000000000001')$$,'42501',null,'employee cannot inspect manager inventory');
select extensions.throws_ok($$select pg_temp.stock_cmd('entry',1,1)$$,'42501',null,'employee cannot move stock');
reset role;
update public.profiles set role='owner' where id='cd800000-0000-4000-8000-000000000001';
-- Removing a product never erases its audited movements or prevents a prior return.
create temporary table movements_before_delete as select count(*) count from private.catalog_stock_movements;
update public.online_menus set published=false where barbershop_id='cd100000-0000-4000-8000-000000000001';
delete from public.menu_items where id='cd600000-0000-4000-8000-000000000001';
select extensions.is((select count(*) from private.catalog_stock_movements),(select count from movements_before_delete),'deleting product preserves its history');
set local role authenticated;
select extensions.is(public.catalog_inventory('cd100000-0000-4000-8000-000000000001')->'products'->0->>'archived','true','global history includes deleted product');
select extensions.throws_ok($$select pg_temp.stock_cmd('entry',1,1)$$,'22023',null,'deleted products cannot receive new manual stock');
reset role;
update public.menu_orders set status='cancelled' where barbershop_id='cd100000-0000-4000-8000-000000000001' and not is_test;
select extensions.is((select quantity from private.catalog_stock),5::bigint,'prior sale can return units after product deletion');
select * from extensions.finish();
rollback;
