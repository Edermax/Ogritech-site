begin;
set local search_path=public,extensions;
select extensions.no_plan();

insert into public.barbershops(id,name,slug,segment) values
('c8100000-0000-4000-8000-000000000001','Loja padrão','standard-menu-fixture','Confeitaria'),
('c8100000-0000-4000-8000-000000000002','Outra loja','standard-menu-other','Confeitaria');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('c8200000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','standard-menu@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('c8200000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('c8300000-0000-4000-8000-000000000001','Loja padrão','Confeitaria','Gestor','standard-menu@example.invalid','Teste','Agenda',97,'Ativo','c8100000-0000-4000-8000-000000000001');
insert into public.profiles(id,barbershop_id,full_name,role)
values('c8200000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000001','Gestor','owner');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.platform_set_product_subscription('c8300000-0000-4000-8000-000000000001','menu',
  (select p.id from public.saas_plans p join public.platform_products product on product.id=p.product_id where product.code='menu' and p.code='foundation'),'active',null);
reset role;
delete from public.platform_admins where user_id='c8200000-0000-4000-8000-000000000001';

insert into public.online_menus(id,barbershop_id,slug,title,published,published_at,accepts_delivery)
values('c8400000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000001','standard-menu-public','Loja padrão',false,null,true),
      ('c8400000-0000-4000-8000-000000000002','c8100000-0000-4000-8000-000000000002','standard-menu-other','Outra loja',false,null,false);
insert into public.menu_delivery_zones(barbershop_id,menu_id,code,name,fee,minimum_order,active)
values('c8100000-0000-4000-8000-000000000001','c8400000-0000-4000-8000-000000000001','centro','Centro',8,0,true);
update public.online_menus set published=true,published_at=now()
where id in ('c8400000-0000-4000-8000-000000000001','c8400000-0000-4000-8000-000000000002');
insert into public.menu_orders(id,barbershop_id,menu_id,customer_name,customer_phone,fulfillment_type,consent_at)
values('c8500000-0000-4000-8000-000000000001','c8100000-0000-4000-8000-000000000001','c8400000-0000-4000-8000-000000000001','Cliente teste','11999999999','pickup',now()),
      ('c8500000-0000-4000-8000-000000000002','c8100000-0000-4000-8000-000000000002','c8400000-0000-4000-8000-000000000002','Cliente outra loja','11999999999','pickup',now()),
      ('c8500000-0000-4000-8000-000000000003','c8100000-0000-4000-8000-000000000001','c8400000-0000-4000-8000-000000000001','Cliente pago','11999999999','pickup',now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c8200000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.save_menu_contact('c8100000-0000-4000-8000-000000000001','55 11 98888-7777')$$,'owner saves own WhatsApp');
select extensions.is(public.public_menu('standard-menu-public')->'menu'->>'whatsapp_phone','5511988887777','public menu returns the configured contact');
select extensions.throws_ok($$select public.save_menu_contact('c8100000-0000-4000-8000-000000000002','5511999999999')$$,'42501','Acesso negado','contact is tenant scoped');
select extensions.lives_ok($$select public.save_published_menu_settings('c8100000-0000-4000-8000-000000000001',
  '{"slug":"standard-menu-public","title":"Loja padrão atualizada","description":"Novo atendimento","minimum_order":20,"delivery_fee":9,"accepts_delivery":true,"accepts_pickup":true,"payment_methods":["pix"],"weekdays":[1,2,3,4,5],"opens_at":"09:00","closes_at":"18:00"}',
  '[{"code":"centro","name":"Centro","fee":9,"minimum_order":20}]')$$,'owner changes settings without unpublishing');
select extensions.ok((select published from public.online_menus where id='c8400000-0000-4000-8000-000000000001'),'menu remains published');
select extensions.is((select fee::text from public.menu_delivery_zones where menu_id='c8400000-0000-4000-8000-000000000001' and code='centro'),'9.00','delivery fee changes');
select extensions.throws_ok($$select public.save_published_menu_settings('c8100000-0000-4000-8000-000000000002','{}','[]')$$,'42501','Acesso negado','settings are tenant scoped');
select extensions.lives_ok($$select public.update_menu_order_operation('c8100000-0000-4000-8000-000000000001','c8500000-0000-4000-8000-000000000003','mark_paid')$$,'owner records payment');
select extensions.throws_ok($$select public.update_menu_order_operation('c8100000-0000-4000-8000-000000000001','c8500000-0000-4000-8000-000000000003','reject')$$,'22023','Transição de pedido inválida','paid order cannot be rejected');
select extensions.lives_ok($$select public.update_menu_order_operation('c8100000-0000-4000-8000-000000000001','c8500000-0000-4000-8000-000000000001','reject')$$,'owner rejects request');
select extensions.throws_ok($$select public.update_menu_order_operation('c8100000-0000-4000-8000-000000000001','c8500000-0000-4000-8000-000000000001','confirm')$$,'22023','Transição de pedido inválida','rejected order cannot be confirmed');
select extensions.throws_ok($$select public.update_menu_order_operation('c8100000-0000-4000-8000-000000000002','c8500000-0000-4000-8000-000000000002','reject')$$,'42501','Acesso negado','orders are tenant scoped');
select * from extensions.finish();
rollback;
