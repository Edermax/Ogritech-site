begin;
set local search_path=public,extensions;
select extensions.plan(23);
select extensions.has_table('public','menu_catalog_templates','templates de catálogo existem');
select extensions.has_table('public','menu_option_groups','grupos de opções existem');
select extensions.has_table('public','menu_options','opções existem');
select extensions.has_table('public','menu_item_option_groups','vínculo item e grupo existe');
select extensions.has_table('public','menu_availability_rules','disponibilidade de catálogo existe');
select extensions.has_column('public','menu_items','item_type','item possui tipo universal');
select extensions.has_column('public','online_menus','visual_identity','identidade visual é controlada');
select extensions.has_column('public','online_menus','onboarding_step','progresso do onboarding é persistido');
select extensions.is((select count(*) from public.menu_catalog_templates where active),4::bigint,'quatro templates iniciais ativos');
select extensions.is((select count(distinct segment) from public.menu_catalog_templates),4::bigint,'templates cobrem quatro segmentos');
select extensions.ok(not has_table_privilege('anon','public.menu_catalog_templates','SELECT'),'anon não lê templates diretamente');
select extensions.ok(not has_function_privilege('anon','public.apply_menu_catalog_template(uuid,text,text)','EXECUTE'),'anon não aplica template');
select extensions.ok(has_function_privilege('authenticated','public.apply_menu_catalog_template(uuid,text,text)','EXECUTE'),'authenticated alcança wrapper autorizado');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_menu_catalog_template' and p.prosecdef),'wrapper de template é security invoker');
select extensions.throws_ok($$select public.apply_menu_catalog_template(gen_random_uuid(),'pizzeria','teste-sem-acesso')$$,'42501','Acesso negado','template exige identidade e assinatura');

insert into public.barbershops(id,name,slug,segment) values('81000000-0000-4000-8000-000000000001','Pizzaria Template','pizzaria-template','Pizzaria');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('82000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','template@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('82000000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('83000000-0000-4000-8000-000000000001','Cliente Template','Pizzaria','Gestor','template@example.invalid','Teste','Agenda',97,'Ativo','81000000-0000-4000-8000-000000000001');
insert into public.profiles(id,barbershop_id,full_name,role) values('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Gestor Template','owner');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.platform_set_product_subscription('83000000-0000-4000-8000-000000000001','menu',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),'active',null)$$,'ativa Cardápio para o teste');
select extensions.lives_ok($$select public.apply_menu_catalog_template('81000000-0000-4000-8000-000000000001','pizzeria','pizzaria-modelo')$$,'aplica template autorizado');
select extensions.is((select template_code from public.online_menus where barbershop_id='81000000-0000-4000-8000-000000000001'),'pizzeria','menu registra template');
select extensions.is((select published from public.online_menus where barbershop_id='81000000-0000-4000-8000-000000000001'),false,'template nunca publica automaticamente');
select extensions.is((select onboarding_step from public.online_menus where barbershop_id='81000000-0000-4000-8000-000000000001'),'catalog','onboarding avança até catálogo');
select extensions.is((select count(*) from public.menu_categories where barbershop_id='81000000-0000-4000-8000-000000000001'),4::bigint,'template cria quatro categorias editáveis');
select extensions.throws_ok($$select public.apply_menu_catalog_template('81000000-0000-4000-8000-000000000001','restaurant','outro-modelo')$$,'23514','O template só pode ser aplicado antes da criação do catálogo','reaplicação não sobrescreve catálogo');
select extensions.ok((select visual_identity ? 'primary_color' and visual_identity ? 'accent_color' from public.online_menus where barbershop_id='81000000-0000-4000-8000-000000000001'),'template aplica tema controlado');
select * from extensions.finish();
rollback;
