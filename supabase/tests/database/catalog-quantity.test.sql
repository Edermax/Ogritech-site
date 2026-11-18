begin;
set local search_path=public,extensions;
select extensions.no_plan();
insert into public.barbershops(id,name,slug,segment) values('ce100000-0000-4000-8000-000000000001','Quantidade Teste','quantity-fixture','Confeitaria');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('ce200000-0000-4000-8000-000000000001','Quantidade Teste','Confeitaria','Fixture','quantity@example.invalid','Teste','Catálogo Essencial',9.90,'Ativo','ce100000-0000-4000-8000-000000000001');
insert into private.billing_signups(id,saas_plan_id,tax_document,business_name,responsible_name,email,phone,cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,terms_version,management_token_hash,product_code,barbershop_id,saas_client_id,trial_ends_at)
select 'ce300000-0000-4000-8000-000000000001',id,'00000000001772','Quantidade Teste','Fixture','quantity@example.invalid','11999999999','monthly','pix',990,1,0,990,'fixture','quantity-fixture','menu','ce100000-0000-4000-8000-000000000001','ce200000-0000-4000-8000-000000000001',now()+interval '14 days'
from public.saas_plans where code='catalogo-essencial';
insert into public.billing_customers(saas_client_id,billing_email) values('ce200000-0000-4000-8000-000000000001','quantity@example.invalid');
insert into public.platform_subscriptions(billing_customer_id,product_id,plan_id,status,billing_cycle,base_amount,current_period_start,current_period_end)
select bc.id,p.product_id,p.id,'trial','monthly',9.90,now(),now()+interval '14 days' from public.billing_customers bc,public.saas_plans p where bc.saas_client_id='ce200000-0000-4000-8000-000000000001' and p.code='catalogo-essencial';
insert into public.business_whatsapp_shares(barbershop_id,phone) values('ce100000-0000-4000-8000-000000000001','5511999999999');
insert into auth.users(id,instance_id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('ce800000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','quantity@example.invalid','{}','{}',now(),now());
insert into public.profiles(id,barbershop_id,full_name,role,active) values('ce800000-0000-4000-8000-000000000001','ce100000-0000-4000-8000-000000000001','Quantity owner','owner',true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ce800000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.apply_menu_catalog_template('ce100000-0000-4000-8000-000000000001','confectionery','quantity-fixture');
select public.save_menu_onboarding_settings('ce100000-0000-4000-8000-000000000001','{"slug":"quantity-fixture","title":"Quantidade Teste","description":"Confeitaria de teste","minimum_order":0,"delivery_fee":0,"accepts_delivery":false,"accepts_pickup":true,"visual_identity":{"primary_color":"#243b53","accent_color":"#237c89"},"payment_methods":["pix"],"weekdays":[1,2,3,4,5],"opens_at":"09:00","closes_at":"18:00"}');
select extensions.lives_ok($$select public.save_menu_catalog_item('ce100000-0000-4000-8000-000000000001','{"category_name":"Doces","name":"Pirulito artesanal","minimum_quantity":100,"maximum_quantity":500,"prices":[{"label":"Unidade","price":1.5}],"metadata":{"quantity_rules":{"step":25,"distribution_step":25,"options":["Chocolate","Chocolate branco","Morango","Banana"]}},"option_groups":[{"name":"Embalagem","selection_type":"single","minimum_selections":0,"maximum_selections":1,"options":[{"name":"Presente","price_delta":0.5}]}]}')$$,'owner saves whole-unit lots and flavors');
select extensions.is((select metadata->'quantity_rules'->>'step' from public.menu_items where barbershop_id='ce100000-0000-4000-8000-000000000001'),'25','purchase multiple persisted');
select extensions.throws_ok($$select public.save_menu_catalog_item('ce100000-0000-4000-8000-000000000002','{"category_name":"Doces","name":"Unauthorized","prices":[{"label":"Unidade","price":1.5}],"metadata":{"quantity_rules":{"step":25,"options":[]}}}')$$,'42501',null,'rules cannot modify another tenant');
reset role;
create temporary table quantity_fixture as select i.id item_id,p.id price_id from public.menu_items i join public.menu_item_prices p on p.menu_item_id=i.id where i.barbershop_id='ce100000-0000-4000-8000-000000000001';
grant select on quantity_fixture to anon,authenticated;
select extensions.ok(not has_function_privilege('anon','private.validate_catalog_distribution(jsonb,numeric,numeric,integer,jsonb)','execute'),'internal validator is not a public RPC');
select extensions.throws_ok($$select private.validate_catalog_quantity_rules('{"step":0,"options":[]}',100,null)$$,'22023',null,'zero multiple rejected');
select extensions.throws_ok($$select private.validate_catalog_quantity_rules('{"step":25,"options":[]}',110,null)$$,'22023',null,'minimum must be a purchase multiple');
select extensions.throws_ok($$select private.validate_catalog_quantity_rules('{"step":25,"options":[]}',100,130)$$,'22023',null,'maximum must be a purchase multiple');
select extensions.throws_ok($$select private.validate_catalog_quantity_rules('{"step":25,"distribution_step":10,"options":["A"]}',100,null)$$,'22023',null,'every permitted total must be distributable');
select extensions.throws_ok($$select private.validate_catalog_quantity_rules('{"step":25,"distribution_step":25,"options":["A"," a "]}',100,null)$$,'22023',null,'duplicate option names rejected');
select extensions.throws_ok($$select private.validate_catalog_quantity_rules('{"step":25,"distribution_step":25,"options":[""]}',100,null)$$,'22023',null,'empty option name rejected');
select extensions.throws_ok($$select private.validate_catalog_quantity_rules('{"step":25,"options":"A"}',100,null)$$,'22023',null,'options must be a bounded array');
select extensions.is(private.validate_catalog_quantity_rules(null,1,null),null::jsonb,'legacy products keep existing behavior');
select extensions.is(private.validate_catalog_quantity_rules('{"step":25,"options":[]}',100,null)->>'step','25','lots can be used without flavors');
select extensions.is(private.validate_catalog_quantity_rules('{"step":25,"distribution_step":5,"options":["A"]}',100,null)->>'distribution_step','5','flavor and purchase multiples may differ');

set local role authenticated;
select public.catalog_stock_command('ce100000-0000-4000-8000-000000000001',(select item_id from quantity_fixture),'enable',1000,'Saldo fictício para teste',gen_random_uuid(),0);
select extensions.lives_ok($$select public.run_menu_test_order('ce100000-0000-4000-8000-000000000001')$$,'onboarding builds a valid lot and composition');
reset role;
select extensions.is((select sum(opt.quantity) from public.menu_order_item_options opt join public.menu_order_items i on i.id=opt.order_item_id join public.menu_orders o on o.id=i.order_id where o.barbershop_id='ce100000-0000-4000-8000-000000000001' and o.is_test and opt.group_name='Distribuição'),100::bigint,'onboarding composition uses absolute quantities');
select extensions.is((select quantity from private.catalog_stock where barbershop_id='ce100000-0000-4000-8000-000000000001'),1000::bigint,'onboarding does not move inventory');
set local role authenticated;
select public.confirm_menu_review('ce100000-0000-4000-8000-000000000001');
select public.set_menu_publication('ce100000-0000-4000-8000-000000000001',true);
reset role;
select extensions.is(jsonb_path_query_first(public.public_menu('quantity-fixture'),'$.categories[*].items[*].metadata.quantity_rules.options[1]')#>>'{}','Chocolate branco','public catalog includes configured choices');
create function pg_temp.quantity_order(qty integer,parts jsonb,key uuid default gen_random_uuid(),extras jsonb default '[]') returns jsonb language sql as $$
 select public.public_create_menu_order_v2('quantity-fixture','Cliente fictício','','11988887777','pickup',null,'',jsonb_build_array(jsonb_build_object('menu_item_price_id',(select price_id from quantity_fixture),'quantity',qty,'distribution',parts,'selections',extras)),true,key)
$$;
set local role anon;
select extensions.throws_ok($$select pg_temp.quantity_order(75,'[{"name":"Chocolate","quantity":75}]')$$,'22023',null,'minimum enforced on server');
select extensions.throws_ok($$select pg_temp.quantity_order(101,'[{"name":"Chocolate","quantity":101}]')$$,'22023',null,'purchase multiple enforced on server');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":75}]')$$,'22023',null,'incomplete composition rejected');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":75},{"name":"Banana","quantity":50}]')$$,'22023',null,'excess composition rejected');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":30},{"name":"Banana","quantity":70}]')$$,'22023',null,'flavor multiple enforced on server');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Unknown","quantity":100}]')$$,'22023',null,'unknown flavor rejected');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":50},{"name":"Chocolate","quantity":50}]')$$,'22023',null,'duplicate flavor rejected');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":-25}]')$$,'22023',null,'negative portion rejected');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":100.5}]')$$,'22023',null,'fractional portion rejected');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":"100"}]')$$,'22023',null,'string quantity rejected');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'null')$$,'22023',null,'null composition rejected');
select extensions.throws_ok($$select pg_temp.quantity_order(525,'[{"name":"Chocolate","quantity":525}]')$$,'22023',null,'product maximum enforced');
create temporary table quantity_sale as select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":25},{"name":"Chocolate branco","quantity":25},{"name":"Morango","quantity":25},{"name":"Banana","quantity":25}]','ce900000-0000-4000-8000-000000000001') data;
select extensions.is((select data->>'subtotal' from quantity_sale),'150.00','four flavors cost the unit price times a hundred');
select extensions.is(pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":25},{"name":"Chocolate branco","quantity":25},{"name":"Morango","quantity":25},{"name":"Banana","quantity":25}]','ce900000-0000-4000-8000-000000000001')->>'reference',(select data->>'reference' from quantity_sale),'repeated checkout reuses the same order');
select extensions.throws_ok($$select pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":100}]','ce900000-0000-4000-8000-000000000001')$$,'23505',null,'reused request cannot change flavors');
select extensions.is(pg_temp.quantity_order(125,'[{"name":"Chocolate","quantity":50},{"name":"Chocolate branco","quantity":25},{"name":"Morango","quantity":25},{"name":"Banana","quantity":25}]')->>'subtotal','187.50','quantity above one hundred is accepted with configured multiple');
reset role;
select extensions.is((select count(*) from public.menu_orders where barbershop_id='ce100000-0000-4000-8000-000000000001' and not is_test),2::bigint,'invalid and repeated requests leave no extra orders');
select extensions.is((select quantity from private.catalog_stock where barbershop_id='ce100000-0000-4000-8000-000000000001'),775::bigint,'inventory deducts total units once, not units times portions');
select extensions.is((select sum(opt.quantity) from public.menu_order_item_options opt join public.menu_order_items i on i.id=opt.order_item_id join public.menu_orders o on o.id=i.order_id where o.public_reference=(select data->>'reference' from quantity_sale) and opt.group_name='Distribuição'),100::bigint,'flavor snapshots preserve the exact absolute quantities');
select extensions.is((select sum(opt.line_total) from public.menu_order_item_options opt join public.menu_order_items i on i.id=opt.order_item_id join public.menu_orders o on o.id=i.order_id where o.public_reference=(select data->>'reference' from quantity_sale) and opt.group_name='Distribuição'),0::numeric,'flavor portions have no extra charges');
select extensions.is(jsonb_array_length(public.public_get_menu_order((select data->>'reference' from quantity_sale),(select data->>'token' from quantity_sale))->'items'->0->'options'),4,'token-protected tracking includes flavor snapshots');
select extensions.is(public.public_get_menu_order((select data->>'reference' from quantity_sale),'wrong-token'),null::jsonb,'tracking options cannot be read without the token');
select extensions.is(pg_temp.quantity_order(100,'[{"name":"Chocolate","quantity":100}]',gen_random_uuid(),jsonb_build_array(jsonb_build_object('menu_option_id',(select o.id from public.menu_options o where o.barbershop_id='ce100000-0000-4000-8000-000000000001' and o.name='Presente'),'quantity',1)))->>'subtotal','200.00','paid extras keep their separate per-unit calculation');

-- Publishing quantity changes preserves IDs, balances and historical portions.
set local role authenticated;
select public.save_menu_catalog_draft('ce100000-0000-4000-8000-000000000001',jsonb_build_object('categories',jsonb_build_array(jsonb_build_object('name','Doces novos','menu_items',(select jsonb_agg(to_jsonb(i)||jsonb_build_object('metadata','{"quantity_rules":{"step":25,"distribution_step":25,"options":["Chocolate","Morango"]}}'::jsonb,'menu_item_prices','[{"label":"Unidade","price":2}]'::jsonb)) from public.menu_items i where i.barbershop_id='ce100000-0000-4000-8000-000000000001')))));
select extensions.lives_ok($$select public.publish_menu_catalog_draft('ce100000-0000-4000-8000-000000000001')$$,'published quantity edits are atomic');
select extensions.is((select id from public.menu_items where barbershop_id='ce100000-0000-4000-8000-000000000001'),(select item_id from quantity_fixture),'editing a published product preserves its identity');
reset role;
select extensions.is((select quantity from private.catalog_stock where barbershop_id='ce100000-0000-4000-8000-000000000001'),675::bigint,'published edit preserves the inventory balance');
select extensions.is((select i.menu_item_id from public.menu_order_items i join public.menu_orders o on o.id=i.order_id where o.public_reference=(select data->>'reference' from quantity_sale)),(select item_id from quantity_fixture),'historical item link remains stable');
select extensions.ok(exists(select 1 from public.menu_order_item_options opt join public.menu_order_items i on i.id=opt.order_item_id join public.menu_orders o on o.id=i.order_id where o.public_reference=(select data->>'reference' from quantity_sale) and opt.option_name='Banana' and opt.quantity=25),'removing a flavor never rewrites historical orders');
select extensions.is(public.public_menu('quantity-fixture')->'categories'->0->'items'->0->'metadata'->'quantity_rules'->'options','["Chocolate","Morango"]'::jsonb,'future orders receive the new choice list');
select * from extensions.finish();
rollback;
