begin;
set local search_path=public,extensions;
select extensions.no_plan();
-- No external dispatcher is called by this transactional fixture.
create or replace function private.wake_menu_order_push_dispatch() returns void language plpgsql as $$ begin return; end $$;
insert into public.barbershops(id,name,slug,segment) values
('a9410000-0000-4000-8000-000000000001','Push fixture','push-fixture','Lanchonete'),
('a9410000-0000-4000-8000-000000000002','Outra fixture','push-other-fixture','Lanchonete');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('a9420000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-owner@example.invalid','','{}','{}',now(),now()),
('a9420000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-other@example.invalid','','{}','{}',now(),now()),
('a9420000-0000-4000-8000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-team@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('a9420000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id) values
('a9430000-0000-4000-8000-000000000001','Push fixture','Lanchonete','Owner','push-owner@example.invalid','Teste','Agenda',97,'Ativo','a9410000-0000-4000-8000-000000000001'),
('a9430000-0000-4000-8000-000000000002','Other fixture','Lanchonete','Owner','push-other@example.invalid','Teste','Agenda',97,'Ativo','a9410000-0000-4000-8000-000000000002');
insert into public.profiles(id,barbershop_id,full_name,role) values
('a9420000-0000-4000-8000-000000000001','a9410000-0000-4000-8000-000000000001','Owner','owner'),
('a9420000-0000-4000-8000-000000000002','a9410000-0000-4000-8000-000000000002','Other','owner'),
('a9420000-0000-4000-8000-000000000003','a9410000-0000-4000-8000-000000000001','Team','employee');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9420000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.platform_set_product_subscription('a9430000-0000-4000-8000-000000000001','menu',(select p.id from public.saas_plans p join public.platform_products product on product.id=p.product_id where product.code='menu' and p.code='foundation'),'active',null);
select public.apply_menu_catalog_template('a9410000-0000-4000-8000-000000000001','snack-bar','push-fixture-menu');
reset role;
delete from public.platform_admins where user_id='a9420000-0000-4000-8000-000000000001';
select extensions.ok(not has_table_privilege('authenticated','private.menu_order_push_devices','select'),'endpoints are not readable');
select extensions.ok(not has_function_privilege('anon','public.menu_order_push_device(uuid,text,text,text)','execute'),'anonymous subscriptions rejected');
select extensions.ok(not has_function_privilege('authenticated','public.claim_menu_order_push_jobs(text)','execute'),'worker cannot be called by business users');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9420000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.menu_order_push_device('a9410000-0000-4000-8000-000000000002','https://fcm.googleapis.com/fcm/send/test','B'||repeat('A',86),'enable')$$,'42501','Acesso não permitido','cannot subscribe to another tenant');
select extensions.throws_ok($$select public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://127.0.0.1/test','B'||repeat('A',86),'enable')$$,'22023','Dispositivo inválido','internal endpoints rejected');
select extensions.throws_ok($$select public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/test','B'||repeat('A',86),null)$$,'42501','Operação não permitida','null operation cannot enable a device');
select extensions.is(public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/test','B'||repeat('A',86),'enable')->>'enabled','true','device opts in');
select extensions.is(public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/test','B'||repeat('A',86),'enable')->>'enabled','true','registration is idempotent');
select set_config('request.jwt.claims','{"sub":"a9420000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select extensions.throws_ok($$select public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/test','B'||repeat('A',86),'enable')$$,'42501','Dispositivo vinculado a outra conta','another account cannot take the endpoint');
select set_config('request.jwt.claims','{"sub":"a9420000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/fixture-'||n,'B'||repeat('A',86),'enable') from generate_series(1,4) n;
select extensions.throws_ok($$select public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/limit','B'||repeat('A',86),'enable')$$,'23514','Limite de cinco dispositivos atingido','active device quota is enforced');
select public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/fixture-'||n,'B'||repeat('A',86),'disable') from generate_series(1,4) n;
reset role;
insert into public.menu_orders(id,barbershop_id,menu_id,customer_name,customer_phone,fulfillment_type,consent_at,is_test)
select 'a9440000-0000-4000-8000-000000000001',barbershop_id,id,'Cliente de teste','11999999999','pickup',now(),true from public.online_menus where slug='push-fixture-menu';
select extensions.is((select count(*) from private.menu_order_push_jobs where order_id in ('a9440000-0000-4000-8000-000000000001','a9440000-0000-4000-8000-000000000002')),0::bigint,'test orders never enqueue pushes');
insert into public.menu_orders(id,barbershop_id,menu_id,customer_name,customer_phone,fulfillment_type,consent_at)
select 'a9440000-0000-4000-8000-000000000002',barbershop_id,id,'Cliente de teste','11999999999','pickup',now() from public.online_menus where slug='push-fixture-menu';
select extensions.is((select count(*) from private.menu_order_push_jobs where order_id in ('a9440000-0000-4000-8000-000000000001','a9440000-0000-4000-8000-000000000002')),1::bigint,'one job for each opted-in device');
create temporary table push_claim as select * from public.claim_menu_order_push_jobs('B'||repeat('A',86));
select extensions.is((select count(*) from push_claim),1::bigint,'worker claims the job');
select extensions.is((select count(*) from public.claim_menu_order_push_jobs('B'||repeat('A',86))),0::bigint,'concurrent dispatcher cannot claim an active lease');
select extensions.is(public.finish_menu_order_push_job((select job_id from push_claim),gen_random_uuid(),'sent'),false,'wrong lease cannot acknowledge');
select extensions.is(public.finish_menu_order_push_job((select job_id from push_claim),(select lease from push_claim),'retry'),true,'temporary failure is retried');
select extensions.is((select state from private.menu_order_push_jobs where order_id in ('a9440000-0000-4000-8000-000000000001','a9440000-0000-4000-8000-000000000002')),'pending','retry remains queued');
update private.menu_order_push_jobs set available_at=now() where order_id='a9440000-0000-4000-8000-000000000002';
truncate push_claim;
insert into push_claim select * from public.claim_menu_order_push_jobs('B'||repeat('A',86));
select extensions.is((select attempts from private.menu_order_push_jobs where order_id in ('a9440000-0000-4000-8000-000000000001','a9440000-0000-4000-8000-000000000002')),2,'retry increments attempts');
select public.finish_menu_order_push_job((select job_id from push_claim),(select lease from push_claim),'expired');
select extensions.is((select active from private.menu_order_push_devices where endpoint='https://fcm.googleapis.com/fcm/send/test'),false,'expired push endpoint is deactivated');
insert into public.menu_orders(id,barbershop_id,menu_id,customer_name,customer_phone,fulfillment_type,consent_at)
select 'a9440000-0000-4000-8000-000000000003',barbershop_id,id,'Cliente de teste','11999999999','pickup',now() from public.online_menus where slug='push-fixture-menu';
select extensions.is((select count(*) from private.menu_order_push_jobs where order_id in ('a9440000-0000-4000-8000-000000000001','a9440000-0000-4000-8000-000000000002')),1::bigint,'inactive devices receive no new jobs');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a9420000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/test','B'||repeat('A',86),'enable');
select public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/test','B'||repeat('A',86),'disable');
select extensions.is(public.menu_order_push_device('a9410000-0000-4000-8000-000000000001','https://fcm.googleapis.com/fcm/send/test','B'||repeat('A',86),'status')->>'enabled','false','explicit opt-out persists');
reset role;
select * from extensions.finish();
rollback;
