begin;
set local search_path=public,extensions;
select extensions.no_plan();

select extensions.has_table('public','menu_onboarding_events','eventos de onboarding existem');
select extensions.has_column('public','online_menus','test_order_completed_at','pedido de teste é persistido');
select extensions.has_column('public','online_menus','review_confirmed_at','revisão é persistida');
select extensions.has_column('public','menu_orders','is_test','pedido de teste é distinguível');
select extensions.ok(has_function_privilege('authenticated','public.menu_onboarding_status(uuid)','EXECUTE'),'usuário autenticado alcança status autorizado');
select extensions.ok(not has_function_privilege('anon','public.set_menu_publication(uuid,boolean)','EXECUTE'),'anon não publica cardápio');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('menu_onboarding_status','save_menu_onboarding_settings','run_menu_test_order','confirm_menu_review','set_menu_publication') and p.prosecdef),'wrappers públicos não são security definer');

insert into public.barbershops(id,name,slug,segment) values('a1000000-0000-4000-8000-000000000001','Loja Autônoma','loja-autonoma','Lanchonete');
insert into public.barbershops(id,name,slug,segment) values('a1000000-0000-4000-8000-000000000002','Outra Loja','outra-loja','Restaurante');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('a2000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','autonomo@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('a2000000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('a3000000-0000-4000-8000-000000000001','Cliente Autônomo','Lanchonete','Gestor','autonomo@example.invalid','Teste','Agenda',97,'Ativo','a1000000-0000-4000-8000-000000000001');
insert into public.profiles(id,barbershop_id,full_name,role) values('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Gestor Autônomo','owner');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.platform_set_product_subscription('a3000000-0000-4000-8000-000000000001','menu',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),'active',null)$$,'ativa Cardápio');
select extensions.lives_ok($$select public.apply_menu_catalog_template('a1000000-0000-4000-8000-000000000001','snack-bar','loja-autonoma-menu')$$,'aplica template');
select extensions.is(public.menu_onboarding_status('a1000000-0000-4000-8000-000000000001')->>'next_step','identity','retomada exige configuração explícita');
select extensions.throws_ok($$select public.set_menu_publication('a1000000-0000-4000-8000-000000000001',true)$$,'23514','Conclua todas as etapas antes de publicar','não publica prematuramente');
reset role;
delete from public.platform_admins where user_id='a2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.menu_onboarding_status('a1000000-0000-4000-8000-000000000002')$$,'42501','Acesso negado','outro tenant permanece invisível');
reset role;

insert into public.menu_items(id,barbershop_id,category_id,name,item_type)
select 'a4000000-0000-4000-8000-000000000001',barbershop_id,id,'Lanche teste','simple' from public.menu_categories where menu_id=(select id from public.online_menus where barbershop_id='a1000000-0000-4000-8000-000000000001') order by sort_order limit 1;
insert into public.menu_item_prices(barbershop_id,menu_item_id,label,price) values('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','Padrão',25);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":10,"delivery_fee":5,"accepts_delivery":true,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":["pix","cash"],"weekdays":[1,2,3,4,5,6],"opens_at":"10:00","closes_at":"22:00","delivery_zone":{"code":"centro","name":"Centro","fee":5,"minimum_order":10}}')$$,'salva configuração validada');
select extensions.is(public.menu_onboarding_status('a1000000-0000-4000-8000-000000000001')->>'next_step','test_order','configuração completa libera teste');
select extensions.throws_ok($$select public.confirm_menu_review('a1000000-0000-4000-8000-000000000001')$$,'23514','Faça o pedido de teste antes da revisão','revisão exige teste');
select extensions.lives_ok($$select public.run_menu_test_order('a1000000-0000-4000-8000-000000000001')$$,'pedido de teste é executado pelo servidor');
reset role;
select extensions.is((select count(*) from public.menu_orders where barbershop_id='a1000000-0000-4000-8000-000000000001' and is_test),1::bigint,'pedido de teste é gravado');
select extensions.is((select total_amount from public.menu_orders where is_test),30::numeric,'pedido de teste usa preço real e região de entrega');
select extensions.is((select onboarding_step from public.online_menus where barbershop_id='a1000000-0000-4000-8000-000000000001'),'review','onboarding avança para revisão');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.confirm_menu_review('a1000000-0000-4000-8000-000000000001')$$,'gestor confirma revisão');
select extensions.is(public.menu_onboarding_status('a1000000-0000-4000-8000-000000000001')->>'next_step','ready','revisão libera publicação');
select extensions.lives_ok($$select public.set_menu_publication('a1000000-0000-4000-8000-000000000001',true)$$,'publica depois dos gates');
reset role;
select extensions.ok((select published and published_at is not null from public.online_menus where barbershop_id='a1000000-0000-4000-8000-000000000001'),'publicação fica rastreada');
select extensions.is((select count(*) from public.menu_onboarding_events where barbershop_id='a1000000-0000-4000-8000-000000000001'),4::bigint,'ações do onboarding são auditadas');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Alterar publicada"}')$$,'23514','Despublique o cardápio antes de alterar a configuração','edição publicada exige despublicação explícita');
select extensions.lives_ok($$select public.set_menu_publication('a1000000-0000-4000-8000-000000000001',false)$$,'gestor despublica sem suporte obrigatório');
reset role;
select extensions.ok(not (select published from public.online_menus where barbershop_id='a1000000-0000-4000-8000-000000000001'),'despublicação é imediata');


set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$update public.online_menus set published=true,published_at=now() where barbershop_id='a1000000-0000-4000-8000-000000000001'$$,'42501','permission denied for table online_menus','DML direto não contorna publicação');
select extensions.throws_ok($$update public.online_menus set test_order_completed_at=now(),review_confirmed_at=now() where barbershop_id='a1000000-0000-4000-8000-000000000001'$$,'42501','permission denied for table online_menus','DML não falsifica teste ou revisão');
select extensions.throws_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":100,"delivery_fee":5,"accepts_delivery":true,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":["pix","cash"],"weekdays":[1,2,3,4,5,6],"opens_at":null,"closes_at":"22:00","delivery_zone":{"code":"centro","name":"Centro","fee":5,"minimum_order":100}}')$$,'22023','Configuração inválida','rejeita configuração inválida 1 sem salvar parcialmente');
select extensions.throws_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":100,"delivery_fee":5,"accepts_delivery":true,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":[],"weekdays":[1,2,3,4,5,6],"opens_at":"10:00","closes_at":"22:00","delivery_zone":{"code":"centro","name":"Centro","fee":5,"minimum_order":100}}')$$,'22023','Configuração inválida','rejeita configuração inválida 2 sem salvar parcialmente');
select extensions.throws_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":100,"delivery_fee":5,"accepts_delivery":true,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":["pix","cash"],"weekdays":[null],"opens_at":"10:00","closes_at":"22:00","delivery_zone":{"code":"centro","name":"Centro","fee":5,"minimum_order":100}}')$$,'22023','Configuração inválida','rejeita configuração inválida 3 sem salvar parcialmente');
select extensions.throws_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":100,"delivery_fee":5,"accepts_delivery":true,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":["pix","cash"],"weekdays":[1,2,3,4,5,6],"opens_at":"10:00","closes_at":"22:00","delivery_zone":{"code":"centro","name":null,"fee":5,"minimum_order":100}}')$$,'22023','Região de entrega inválida','rejeita configuração inválida 4 sem salvar parcialmente');
select extensions.lives_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":100,"delivery_fee":5,"accepts_delivery":true,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":["pix","cash"],"weekdays":[1,2,3,4,5,6],"opens_at":"10:00","closes_at":"22:00","delivery_zone":{"code":"centro","name":"Centro","fee":5,"minimum_order":100}}')$$,'salva mínimo de pedido para testar paridade');
update public.menu_item_prices set price=30 where menu_item_id='a4000000-0000-4000-8000-000000000001';
update public.menu_items set minimum_quantity=3,maximum_quantity=5,lead_time_hours=24 where id='a4000000-0000-4000-8000-000000000001';
insert into public.menu_option_groups(id,barbershop_id,menu_id,name,minimum_selections,maximum_selections,free_selections)
select 'a5000000-0000-4000-8000-000000000001',barbershop_id,id,'Coberturas',2,2,1 from public.online_menus where barbershop_id='a1000000-0000-4000-8000-000000000001';
insert into public.menu_options(id,barbershop_id,option_group_id,name,price_delta,maximum_quantity)
values('a6000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','Queijo',5,2);
insert into public.menu_item_option_groups(barbershop_id,menu_item_id,option_group_id)
values('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001');
select extensions.is(public.menu_onboarding_status('a1000000-0000-4000-8000-000000000001')->>'next_step','test_order','mudar catálogo invalida teste e revisão');
select extensions.throws_ok($$select public.set_menu_publication('a1000000-0000-4000-8000-000000000001',true)$$,'23514','Conclua todas as etapas antes de publicar','revisão antiga não autoriza nova versão');
select extensions.is((public.run_menu_test_order('a1000000-0000-4000-8000-000000000001')->>'total_amount')::numeric,110::numeric,'teste respeita mínimo, adicionais parcialmente grátis e frete');
select extensions.is((public.run_menu_test_order('a1000000-0000-4000-8000-000000000001')->>'total_amount')::numeric,110::numeric,'repetir teste da mesma versão é idempotente');
select extensions.is((select count(*) from public.menu_orders where is_test),2::bigint,'repetição não gera outro pedido');
select extensions.ok((select scheduled_for>=now()+interval '24 hours' and public_token_hash is null from public.menu_orders where is_test and scheduled_for is not null),'encomenda de teste respeita antecedência sem token público');
select extensions.is((select quantity from public.menu_order_items where order_id=(select id from public.menu_orders where scheduled_for is not null)),3,'teste usa quantidade mínima real');
select extensions.lives_ok($$select public.confirm_menu_review('a1000000-0000-4000-8000-000000000001')$$,'revisão atual pode ser confirmada');
select extensions.lives_ok($$select public.set_menu_publication('a1000000-0000-4000-8000-000000000001',true)$$,'publica configuração testada');
select extensions.throws_ok($$update public.menu_item_prices set price=40 where menu_item_id='a4000000-0000-4000-8000-000000000001'$$,'23514','Despublique o cardápio antes de alterar o catálogo','impede mudança publicada sem revisão');
reset role;
set local role anon;
select extensions.is(public.public_menu('loja-autonoma-menu')->'menu'->'payment_methods','["cash", "pix"]'::jsonb,'formas de pagamento chegam ao consumidor');
select extensions.is(public.public_menu('loja-autonoma-menu')->'menu'->'weekly_hours'->>'opens_at','10:00','horários informados chegam ao consumidor');
select extensions.ok(not has_function_privilege('anon','private.create_menu_order_core(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,boolean)','EXECUTE'),'modo de teste é privado');
reset role;


set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.set_menu_publication('a1000000-0000-4000-8000-000000000001',false);
select extensions.throws_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":100,"delivery_fee":5,"accepts_delivery":false,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":["pix","cash"],"weekdays":[1,2,3,4,5,6],"opens_at":"10:00","closes_at":"22:00","delivery_zone":{"code":"centro","name":"Centro","fee":5,"minimum_order":100},"accepts_pickup":false}')$$,'22023','Configuração inválida','rejeita ausência de entrega e retirada');
select extensions.lives_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":100,"delivery_fee":5,"accepts_delivery":true,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":["pix","cash"],"weekdays":[1,2,3,4,5,6],"opens_at":"10:00","closes_at":"22:00","delivery_zone":{"code":"centro","name":"Centro","fee":5,"minimum_order":100},"accepts_pickup":false}')$$,'permite estabelecimento somente com entrega');
select extensions.is((select accepts_pickup from public.online_menus where barbershop_id='a1000000-0000-4000-8000-000000000001'),false,'opção de retirada é persistida');
select extensions.throws_ok($$select public.set_menu_publication('a1000000-0000-4000-8000-000000000001',null)$$,'22023','Publicação inválida','ação de publicação nula é rejeitada');
reset role;
update public.profiles set role='employee' where id='a2000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a2000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.save_menu_onboarding_settings('a1000000-0000-4000-8000-000000000001','{"slug":"loja-autonoma-menu","title":"Loja Autônoma","description":"Pedido direto","minimum_order":100,"delivery_fee":5,"accepts_delivery":true,"visual_identity":{"primary_color":"#111827","accent_color":"#F59E0B"},"payment_methods":["pix","cash"],"weekdays":[1,2,3,4,5,6],"opens_at":"10:00","closes_at":"22:00","delivery_zone":{"code":"centro","name":"Centro","fee":5,"minimum_order":100}}')$$,'42501','Acesso negado','funcionário não altera configuração');
select extensions.throws_ok($$select public.run_menu_test_order('a1000000-0000-4000-8000-000000000001')$$,'42501','Acesso negado','funcionário não aprova teste');
select extensions.throws_ok($$select public.confirm_menu_review('a1000000-0000-4000-8000-000000000001')$$,'42501','Acesso negado','funcionário não confirma revisão');
select extensions.throws_ok($$select public.set_menu_publication('a1000000-0000-4000-8000-000000000001',true)$$,'42501','Acesso negado','funcionário não publica');
reset role;

select * from extensions.finish();
rollback;
