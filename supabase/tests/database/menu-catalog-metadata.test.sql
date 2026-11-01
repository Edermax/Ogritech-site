begin;
set local search_path=public,extensions;
select extensions.no_plan();

insert into public.barbershops(id,name,slug,segment) values
('b8100000-0000-4000-8000-000000000001','Metadata fixture','metadata-fixture','Confeitaria'),
('b8100000-0000-4000-8000-000000000002','Metadata other','metadata-other','Confeitaria');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('b8200000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','metadata-owner@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('b8200000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('b8300000-0000-4000-8000-000000000001','Metadata fixture','Confeitaria','Owner','metadata-owner@example.invalid','Teste','Agenda',97,'Ativo','b8100000-0000-4000-8000-000000000001');
insert into public.profiles(id,barbershop_id,full_name,role)
values('b8200000-0000-4000-8000-000000000001','b8100000-0000-4000-8000-000000000001','Metadata owner','owner');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.platform_set_product_subscription('b8300000-0000-4000-8000-000000000001','menu',(select p.id from public.saas_plans p join public.platform_products product on product.id=p.product_id where product.code='menu' and p.code='foundation'),'active',null);
select public.apply_menu_catalog_template('b8100000-0000-4000-8000-000000000001','confectionery','metadata-fixture-menu');
reset role;
delete from public.platform_admins where user_id='b8200000-0000-4000-8000-000000000001';

insert into public.online_menus(id,barbershop_id,slug,title)
values('b8400000-0000-4000-8000-000000000002','b8100000-0000-4000-8000-000000000002','metadata-other-menu','Other metadata');
insert into public.menu_categories(id,barbershop_id,menu_id,name)
values('b8500000-0000-4000-8000-000000000002','b8100000-0000-4000-8000-000000000002','b8400000-0000-4000-8000-000000000002','Other');
insert into public.menu_items(id,barbershop_id,category_id,name,metadata)
values('b8600000-0000-4000-8000-000000000002','b8100000-0000-4000-8000-000000000002','b8500000-0000-4000-8000-000000000002','Other item','{"private_legacy_note":"other tenant"}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.save_menu_catalog_item('b8100000-0000-4000-8000-000000000001','{"category_name":"Bolos","name":"Metadata quote","prices":[{"label":"Padrão","price":100}],"metadata":{"order_mode":"quote","configuration_required":true,"role":"platform_admin"}}')$$,'owner creates a quote item with validated product metadata');
select extensions.is((select metadata from public.menu_items where name='Metadata quote' and barbershop_id='b8100000-0000-4000-8000-000000000001'),' {"order_mode":"quote","configuration_required":true}'::jsonb,'creation keeps only the two permitted metadata fields');
select extensions.throws_ok($$select public.save_menu_catalog_item('b8100000-0000-4000-8000-000000000001','{"category_name":"Bolos","name":"Invalid mode","prices":[{"label":"Padrão","price":100}],"metadata":{"order_mode":"paid"}}')$$,'22023','Metadados do produto invalidos','invalid order mode is rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('b8100000-0000-4000-8000-000000000001','{"category_name":"Bolos","name":"Invalid boolean","prices":[{"label":"Padrão","price":100}],"metadata":{"configuration_required":"true"}}')$$,'22023','Metadados do produto invalidos','boolean strings are rejected');
select extensions.throws_ok($$select public.save_menu_catalog_item('b8100000-0000-4000-8000-000000000001','{"category_name":"Bolos","name":"Invalid metadata","prices":[{"label":"Padrão","price":100}],"metadata":[]}')$$,'22023','Metadados do produto invalidos','metadata must be an object');
select extensions.throws_ok($$select public.save_menu_catalog_item('b8100000-0000-4000-8000-000000000002','{"category_name":"Other","name":"Forbidden","prices":[{"label":"Padrão","price":100}],"metadata":{"order_mode":"quote"}}')$$,'42501','Acesso negado','owner cannot modify another tenant');
reset role;
update public.menu_items set metadata=metadata||'{"requires_human_confirmation":true,"legacy_note":"keep"}' where name='Metadata quote' and barbershop_id='b8100000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.save_menu_catalog_item('b8100000-0000-4000-8000-000000000001',jsonb_build_object('id',(select id from public.menu_items where name='Metadata quote' and barbershop_id='b8100000-0000-4000-8000-000000000001'),'category_name','Bolos','name','Metadata quote','prices','[{"label":"Padrão","price":110}]'::jsonb))$$,'old clients can update prices without supplying metadata');
select extensions.is((select metadata->>'order_mode' from public.menu_items where name='Metadata quote' and barbershop_id='b8100000-0000-4000-8000-000000000001'),'quote','omitted metadata preserves quote mode');
select extensions.lives_ok($$select public.save_menu_catalog_item('b8100000-0000-4000-8000-000000000001',jsonb_build_object('id',(select id from public.menu_items where name='Metadata quote' and barbershop_id='b8100000-0000-4000-8000-000000000001'),'category_name','Bolos','name','Metadata quote','prices','[{"label":"Padrão","price":110}]'::jsonb,'metadata','{"order_mode":"direct","configuration_required":false,"legacy_note":"tampered","role":"platform_admin"}'::jsonb))$$,'owner can change only the permitted metadata fields');
select extensions.is((select metadata from public.menu_items where name='Metadata quote' and barbershop_id='b8100000-0000-4000-8000-000000000001'),'{"order_mode":"direct","configuration_required":false,"requires_human_confirmation":true,"legacy_note":"keep"}'::jsonb,'update preserves server-owned metadata without accepting arbitrary changes');
reset role;
update public.online_menus set published=true,published_at=now() where barbershop_id='b8100000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.save_menu_catalog_draft('b8100000-0000-4000-8000-000000000001',jsonb_build_object('categories',jsonb_build_array(jsonb_build_object('name','Bolos','menu_items',(select jsonb_agg(to_jsonb(i)||jsonb_build_object('metadata','{"order_mode":"quote","configuration_required":true,"legacy_note":"tampered","role":"platform_admin"}'::jsonb,'menu_item_prices','[{"label":"Padrão","price":120}]'::jsonb)) from public.menu_items i where i.barbershop_id='b8100000-0000-4000-8000-000000000001')))));
select extensions.lives_ok($$select public.publish_menu_catalog_draft('b8100000-0000-4000-8000-000000000001')$$,'draft publication preserves validated metadata across regenerated item IDs');
select extensions.is((select metadata from public.menu_items where name='Metadata quote' and barbershop_id='b8100000-0000-4000-8000-000000000001'),'{"order_mode":"quote","configuration_required":true,"requires_human_confirmation":true,"legacy_note":"keep"}'::jsonb,'publication applies quote mode but retains original trusted metadata');
select extensions.is(public.public_menu('metadata-fixture-menu')->'categories'->0->'items'->0->'metadata'->>'order_mode','quote','public storefront receives quote mode after publication');

select public.save_menu_catalog_draft('b8100000-0000-4000-8000-000000000001',jsonb_build_object('categories',jsonb_build_array(jsonb_build_object('name','Bolos','menu_items',(select jsonb_agg((to_jsonb(i)-'metadata')||jsonb_build_object('menu_item_prices','[{"label":"Padrão","price":125}]'::jsonb)) from public.menu_items i where i.barbershop_id='b8100000-0000-4000-8000-000000000001')))));
select extensions.lives_ok($$select public.publish_menu_catalog_draft('b8100000-0000-4000-8000-000000000001')$$,'legacy drafts without metadata remain publishable');
select extensions.is((select metadata->>'order_mode' from public.menu_items where name='Metadata quote' and barbershop_id='b8100000-0000-4000-8000-000000000001'),'quote','legacy draft retains the original quote mode');

select public.save_menu_catalog_draft('b8100000-0000-4000-8000-000000000001','{"categories":[{"name":"Bolos","menu_items":[{"id":"b8600000-0000-4000-8000-000000000002","name":"Foreign ID clone","metadata":{"role":"platform_admin"},"menu_item_prices":[{"label":"Padrão","price":10}]}]}]}');
select extensions.lives_ok($$select public.publish_menu_catalog_draft('b8100000-0000-4000-8000-000000000001')$$,'untrusted draft IDs cannot import metadata from another tenant');
select extensions.is((select metadata from public.menu_items where name='Foreign ID clone' and barbershop_id='b8100000-0000-4000-8000-000000000001'),'{}'::jsonb,'foreign item metadata and arbitrary role fields are not copied');
select extensions.ok(not has_function_privilege('anon','public.save_menu_catalog_item(uuid,jsonb)','EXECUTE'),'anonymous role still cannot modify products');
select extensions.ok(not has_function_privilege('anon','public.publish_menu_catalog_draft(uuid)','EXECUTE'),'anonymous role still cannot publish drafts');
reset role;
select extensions.is((select metadata from public.menu_items where id='b8600000-0000-4000-8000-000000000002'),'{"private_legacy_note":"other tenant"}'::jsonb,'other tenant data remains untouched');
select extensions.ok(not exists(select 1 from public.platform_admins where user_id='b8200000-0000-4000-8000-000000000001'),'metadata payloads never grant platform administrator access');

select * from extensions.finish();
rollback;
