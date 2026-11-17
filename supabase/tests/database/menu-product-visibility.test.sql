begin;
-- Historical scenarios seed contracts from the preceding commercial version.
update public.saas_plans set active=true where catalog_version=1 and product_id=(select id from public.platform_products where code='menu');
set local search_path=public,extensions;
select extensions.no_plan();

insert into public.barbershops(id,name,slug,segment) values
('c8100000-0000-4000-8000-000000000001','Visibility fixture','visibility-fixture','Confeitaria'),
('c8100000-0000-4000-8000-000000000002','Other fixture','visibility-other','Confeitaria');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('c8200000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','visibility-owner@example.invalid','','{}','{}',now(),now()),
('c8200000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','visibility-staff@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('c8200000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('c8300000-0000-4000-8000-000000000001','Visibility fixture','Confeitaria','Owner','visibility-owner@example.invalid','Teste','Agenda',97,'Ativo','c8100000-0000-4000-8000-000000000001');
insert into public.profiles(id,barbershop_id,full_name,role) values
('c8200000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000001','Visibility owner','owner'),
('c8200000-0000-4000-8000-000000000002','c8100000-0000-4000-8000-000000000001','Visibility staff','employee');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.platform_set_product_subscription('c8300000-0000-4000-8000-000000000001','menu',(select p.id from public.saas_plans p join public.platform_products product on product.id=p.product_id where product.code='menu' and p.code='foundation'),'active',null);
select public.apply_menu_catalog_template('c8100000-0000-4000-8000-000000000001','confectionery','visibility-fixture-menu');
reset role;
delete from public.platform_admins where user_id='c8200000-0000-4000-8000-000000000001';
set local role authenticated;
select public.save_menu_catalog_item('c8100000-0000-4000-8000-000000000001','{"category_name":"Doces","name":"Produto sazonal","description":"Receita preservada","prices":[{"label":"Padrão","price":20}],"metadata":{"order_mode":"direct"}}');
select public.save_menu_catalog_item('c8100000-0000-4000-8000-000000000001','{"category_name":"Doces","name":"Produto permanente","prices":[{"label":"Padrão","price":10}]}');
select set_config('visibility.item',(select id::text from public.menu_items where name='Produto sazonal' and barbershop_id='c8100000-0000-4000-8000-000000000001'),true);
select set_config('visibility.price',(select id::text from public.menu_item_prices where menu_item_id=current_setting('visibility.item')::uuid),true);
reset role;
update public.online_menus set published=true,published_at=now() where barbershop_id='c8100000-0000-4000-8000-000000000001';
set local role authenticated;
select public.save_menu_catalog_draft('c8100000-0000-4000-8000-000000000001',jsonb_build_object('categories',jsonb_build_array(jsonb_build_object('name','Doces','menu_items',
 (select jsonb_agg(to_jsonb(i)||jsonb_build_object('description','Alteração em rascunho','menu_item_prices',(select jsonb_agg(to_jsonb(p)) from public.menu_item_prices p where p.menu_item_id=i.id))) from public.menu_items i where i.barbershop_id='c8100000-0000-4000-8000-000000000001')))));

select extensions.lives_ok($$select public.set_menu_item_visibility('c8100000-0000-4000-8000-000000000001',current_setting('visibility.item')::uuid,false)$$,'owner can immediately hide a published product');
select extensions.ok(not jsonb_path_exists(public.public_menu('visibility-fixture-menu'),'$.categories[*].items[*] ? (@.name == "Produto sazonal")'),'hidden product disappears from the public menu immediately');
select extensions.ok(jsonb_path_exists(public.public_menu('visibility-fixture-menu'),'$.categories[*].items[*] ? (@.name == "Produto permanente")'),'other products stay visible');
select extensions.is((select count(*) from public.menu_items where barbershop_id='c8100000-0000-4000-8000-000000000001'),2::bigint,'hiding preserves the product row');
select extensions.is((select id::text from public.menu_item_prices where menu_item_id=current_setting('visibility.item')::uuid),current_setting('visibility.price'),'hiding preserves price IDs');
select extensions.is((select description from public.menu_items where id=current_setting('visibility.item')::uuid),'Receita preservada','hiding does not publish unrelated draft edits');
select extensions.ok(jsonb_path_exists(public.menu_catalog_draft_status('c8100000-0000-4000-8000-000000000001'),'$.payload.categories[*].menu_items[*] ? (@.name == "Produto sazonal" && @.active == false && @.available == false)'),'saved draft receives the same hidden state');
select extensions.ok((select published from public.online_menus where barbershop_id='c8100000-0000-4000-8000-000000000001'),'hiding keeps the menu published');
select extensions.lives_ok($$select public.publish_menu_catalog_draft('c8100000-0000-4000-8000-000000000001')$$,'other draft edits can still be published');
select extensions.ok(not jsonb_path_exists(public.public_menu('visibility-fixture-menu'),'$.categories[*].items[*] ? (@.name == "Produto sazonal")'),'publishing a draft does not accidentally reactivate the product');
select extensions.is((select description from public.menu_items where name='Produto sazonal' and barbershop_id='c8100000-0000-4000-8000-000000000001'),'Alteração em rascunho','hidden product data survives regenerated IDs during publication');
select set_config('visibility.item',(select id::text from public.menu_items where name='Produto sazonal' and barbershop_id='c8100000-0000-4000-8000-000000000001'),true);
select extensions.lives_ok($$select public.set_menu_item_visibility('c8100000-0000-4000-8000-000000000001',current_setting('visibility.item')::uuid,true)$$,'owner can reactivate a hidden product');
select extensions.ok(jsonb_path_exists(public.public_menu('visibility-fixture-menu'),'$.categories[*].items[*] ? (@.name == "Produto sazonal")'),'reactivated product returns to the public menu');
with changed as (update public.menu_items set available=false where id=current_setting('visibility.item')::uuid returning id)
select extensions.is((select count(*) from changed),0::bigint,'direct browser writes cannot bypass draft synchronization on a published menu');
select extensions.ok(jsonb_path_exists(public.public_menu('visibility-fixture-menu'),'$.categories[*].items[*] ? (@.name == "Produto sazonal")'),'blocked direct writes preserve public visibility');
select extensions.throws_ok($$select public.set_menu_item_visibility('c8100000-0000-4000-8000-000000000002',current_setting('visibility.item')::uuid,false)$$,'42501','Acesso negado','owner cannot change another tenant');
select extensions.throws_ok($$select public.set_menu_item_visibility('c8100000-0000-4000-8000-000000000001','c8600000-0000-4000-8000-000000000099',false)$$,'22023','Produto nao encontrado','unknown or foreign product IDs are rejected');
select extensions.throws_ok($$select public.set_menu_item_visibility('c8100000-0000-4000-8000-000000000001',current_setting('visibility.item')::uuid,null)$$,'22023','Visibilidade invalida','null visibility is rejected');
select public.save_menu_catalog_draft('c8100000-0000-4000-8000-000000000001','{"categories":[{"name":"Doces","menu_items":[{"id":"c8600000-0000-4000-8000-000000000003","name":"Produto novo no rascunho","menu_item_prices":[{"label":"Padrão","price":15}]}]}]}');
select extensions.is(public.set_menu_item_visibility('c8100000-0000-4000-8000-000000000001','c8600000-0000-4000-8000-000000000003',false)->>'published_changed','false','hiding a draft-only product never publishes it');
select extensions.ok(jsonb_path_exists(public.menu_catalog_draft_status('c8100000-0000-4000-8000-000000000001'),'$.payload.categories[*].menu_items[*] ? (@.available == false)'),'draft-only product remains saved and hidden');
select set_config('request.jwt.claims','{"sub":"c8200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($$select public.set_menu_item_visibility('c8100000-0000-4000-8000-000000000001',current_setting('visibility.item')::uuid,false)$$,'42501','Acesso negado','employee cannot change product visibility');
reset role;
select extensions.ok(not has_function_privilege('anon','public.set_menu_item_visibility(uuid,uuid,boolean)','EXECUTE'),'anonymous users cannot change visibility');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_menu_item_visibility' and p.prosecdef),'public wrapper does not bypass RLS');
select * from extensions.finish();
rollback;
