begin;
set local search_path=public,extensions;
select extensions.plan(21);

select extensions.has_table('public','menu_delivery_zones','áreas de entrega existem');
select extensions.has_table('public','menu_order_item_options','snapshot de adicionais existe');
select extensions.has_column('public','menu_orders','client_request_id','pedido possui chave idempotente');
select extensions.has_column('public','menu_orders','scheduled_for','pedido aceita agendamento');
select extensions.has_function('public','public_create_menu_order_v2',array['text','text','text','text','text','jsonb','text','jsonb','boolean','uuid','timestamp with time zone','text'],'endpoint de pedido v2 existe');
select extensions.ok(has_function_privilege('anon','public.public_create_menu_order_v2(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamp with time zone,text)','EXECUTE'),'anon pode usar somente o endpoint público');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='public_create_menu_order_v2' and p.prosecdef),'wrapper público é security invoker');
select extensions.ok(not has_table_privilege('anon','public.menu_orders','SELECT'),'anon não lê pedidos diretamente');

insert into public.barbershops(id,name,slug,segment) values('91000000-0000-4000-8000-000000000001','Pizzaria Pedido','pizzaria-pedido','Pizzaria');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('92000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pedido@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('92000000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('93000000-0000-4000-8000-000000000001','Cliente Pedido','Pizzaria','Gestor','pedido@example.invalid','Teste','Agenda',97,'Ativo','91000000-0000-4000-8000-000000000001');
insert into public.profiles(id,barbershop_id,full_name,role) values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Gestor Pedido','owner');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.platform_set_product_subscription('93000000-0000-4000-8000-000000000001','menu',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),'active',null)$$,'ativa assinatura do Cardápio');
select extensions.lives_ok($$select public.apply_menu_catalog_template('91000000-0000-4000-8000-000000000001','pizzeria','pedido-seguro')$$,'cria catálogo sem publicar');
reset role;

insert into public.menu_items(id,barbershop_id,category_id,name,item_type)
select '94000000-0000-4000-8000-000000000001',barbershop_id,id,'Pizza teste','configurable' from public.menu_categories where menu_id=(select id from public.online_menus where slug='pedido-seguro') order by sort_order limit 1;
insert into public.menu_item_prices(id,barbershop_id,menu_item_id,label,price)
values('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','Média',20);
insert into public.menu_option_groups(id,barbershop_id,menu_id,name,minimum_selections,maximum_selections)
select '96000000-0000-4000-8000-000000000001',barbershop_id,id,'Adicionais',1,2 from public.online_menus where slug='pedido-seguro';
insert into public.menu_options(id,barbershop_id,option_group_id,name,price_delta)
values('97000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001','Queijo extra',5);
insert into public.menu_item_option_groups(barbershop_id,menu_item_id,option_group_id)
values('91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001');
insert into public.menu_delivery_zones(barbershop_id,menu_id,code,name,fee,minimum_order)
select barbershop_id,id,'centro','Centro',6,20 from public.online_menus where slug='pedido-seguro';
update public.online_menus set published=true,published_at=now(),accepts_delivery=true,minimum_order=10 where barbershop_id='91000000-0000-4000-8000-000000000001';

set local role anon;
select extensions.is((public.public_menu('pedido-seguro')->'delivery_zones'->0->>'fee')::numeric,6::numeric,'menu público expõe frete controlado');
select extensions.is((public.public_create_menu_order_v2('pedido-seguro','Cliente Teste','cliente@example.invalid','11999999999','delivery','{"text":"Rua Teste, 1","zone_code":"centro"}','', '[{"menu_item_price_id":"95000000-0000-4000-8000-000000000001","quantity":1,"selections":[{"menu_option_id":"97000000-0000-4000-8000-000000000001","quantity":1}]}]',true,'98000000-0000-4000-8000-000000000001',null,'')->>'total_amount')::numeric,31::numeric,'servidor calcula item, adicional e entrega');
reset role;
select extensions.is((select count(*) from public.menu_orders where menu_id=(select id from public.online_menus where slug='pedido-seguro')),1::bigint,'primeiro envio cria um pedido');
select extensions.is((select subtotal from public.menu_orders where client_request_id='98000000-0000-4000-8000-000000000001'),25::numeric,'subtotal ignora qualquer cálculo do navegador');
select extensions.is((select line_total from public.menu_order_item_options limit 1),5::numeric,'adicional é salvo como snapshot financeiro');
set local role anon;
select extensions.lives_ok($$select public.public_create_menu_order_v2('pedido-seguro','Cliente Teste','cliente@example.invalid','11999999999','delivery','{"text":"Rua Teste, 1","zone_code":"centro"}','', '[{"menu_item_price_id":"95000000-0000-4000-8000-000000000001","quantity":1,"selections":[{"menu_option_id":"97000000-0000-4000-8000-000000000001","quantity":1}]}]',true,'98000000-0000-4000-8000-000000000001',null,'')$$,'reenvio idêntico devolve a resposta anterior');
reset role;
select extensions.is((select count(*) from public.menu_orders where menu_id=(select id from public.online_menus where slug='pedido-seguro')),1::bigint,'reenvio não duplica pedido');
set local role anon;
select extensions.throws_ok($$select public.public_create_menu_order_v2('pedido-seguro','Cliente Teste','cliente@example.invalid','11999999999','delivery','{"text":"Rua Teste, 1","zone_code":"centro"}','', '[{"menu_item_price_id":"95000000-0000-4000-8000-000000000001","quantity":2,"selections":[{"menu_option_id":"97000000-0000-4000-8000-000000000001","quantity":1}]}]',true,'98000000-0000-4000-8000-000000000001',null,'')$$,'23505','Chave de repetição usada com dados diferentes','chave reutilizada com payload diferente é rejeitada');
select extensions.throws_ok($$select public.public_create_menu_order_v2('pedido-seguro','Cliente Teste','cliente@example.invalid','11999999999','pickup',null,'', '[{"menu_item_price_id":"95000000-0000-4000-8000-000000000001","quantity":1,"selections":[]}]',true,'98000000-0000-4000-8000-000000000002',null,'')$$,'22023','Seleções obrigatórias inválidas','grupo obrigatório é validado no servidor');
select extensions.throws_ok($$select public.public_create_menu_order_v2('pedido-seguro','Cliente Teste','cliente@example.invalid','11999999999','delivery','{"text":"Rua Teste, 1","zone_code":"fora"}','', '[{"menu_item_price_id":"95000000-0000-4000-8000-000000000001","quantity":1,"selections":[{"menu_option_id":"97000000-0000-4000-8000-000000000001","quantity":1}]}]',true,'98000000-0000-4000-8000-000000000003',null,'')$$,'22023','Área de entrega inválida','área não cadastrada é rejeitada');
reset role;
select extensions.is((select count(*) from public.menu_orders),1::bigint,'tentativas inválidas não deixam pedidos parciais');

select * from extensions.finish();
rollback;
