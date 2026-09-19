begin;
set local search_path=public,extensions;
select extensions.plan(19);
select extensions.has_function('public','business_product_catalog',array['uuid'],'catálogo autenticado existe');
select extensions.has_function('public','platform_set_product_subscription',array['uuid','text','uuid','text','numeric'],'gestão multiproduto existe');
select extensions.ok(not has_function_privilege('anon','public.business_product_catalog(uuid)','EXECUTE'),'anon não consulta catálogo privado');
select extensions.ok(not has_function_privilege('anon','public.platform_set_product_subscription(uuid,text,uuid,text,numeric)','EXECUTE'),'anon não altera assinatura');
select extensions.ok(has_function_privilege('authenticated','public.business_product_catalog(uuid)','EXECUTE'),'usuário autenticado pode consultar catálogo sob autorização');
select extensions.ok(has_function_privilege('authenticated','public.platform_set_product_subscription(uuid,text,uuid,text,numeric)','EXECUTE'),'admin autenticado alcança wrapper protegido');
select extensions.is((select count(*) from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code in ('pages','quotes','menu') and plan.code='foundation'),3::bigint,'produtos planejados têm plano interno de configuração');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('business_product_catalog','platform_set_product_subscription') and p.prosecdef),'wrappers públicos são security invoker');
select extensions.throws_ok($$select public.business_product_catalog(gen_random_uuid())$$,'42501','Acesso negado','catálogo nega acesso sem identidade');
select extensions.throws_ok($$select public.platform_set_product_subscription(gen_random_uuid(),'menu',gen_random_uuid(),'active',null)$$,'42501','Acesso negado','mutação nega acesso sem identidade');
select extensions.ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='platform_set_product_subscription' and p.prosecdef),'implementação privilegiada fica no schema privado');
select extensions.ok(exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='business_product_catalog' and p.prosecdef),'catálogo privilegiado fica no schema privado');

insert into public.barbershops(id,name,slug,segment) values('71000000-0000-4000-8000-000000000001','Teste Multiproduto','teste-multiproduto','Teste');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values('72000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','multi-admin@example.invalid','','{}','{}',now(),now());
insert into public.platform_admins(user_id) values('72000000-0000-4000-8000-000000000001');
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id)
values('73000000-0000-4000-8000-000000000001','Cliente Multiproduto','Teste','Admin','multi@example.invalid','Teste','Agenda',97,'Ativo','71000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"72000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.lives_ok($$select public.platform_set_product_subscription('73000000-0000-4000-8000-000000000001','pages',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='pages' and plan.code='foundation'),'active',null)$$,'ativa Páginas isoladamente');
select extensions.lives_ok($$select public.platform_set_product_subscription('73000000-0000-4000-8000-000000000001','menu',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),'active',null)$$,'ativa Cardápio em paralelo');
select extensions.is((select count(*) from public.platform_subscriptions subscription join public.billing_customers customer on customer.id=subscription.billing_customer_id where customer.saas_client_id='73000000-0000-4000-8000-000000000001' and subscription.status<>'cancelled'),3::bigint,'cliente mantém Agenda, Páginas e Cardápio simultaneamente');
select extensions.lives_ok($$select public.platform_set_product_subscription('73000000-0000-4000-8000-000000000001','menu',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),'cancelled',null)$$,'cancela somente Cardápio');
select extensions.is((select count(*) from public.platform_subscriptions subscription join public.billing_customers customer on customer.id=subscription.billing_customer_id join public.platform_products product on product.id=subscription.product_id where customer.saas_client_id='73000000-0000-4000-8000-000000000001' and product.code='pages' and subscription.status='active'),1::bigint,'Páginas permanece ativa após cancelar Cardápio');
select extensions.is((select count(*) from public.platform_subscriptions subscription join public.billing_customers customer on customer.id=subscription.billing_customer_id join public.platform_products product on product.id=subscription.product_id where customer.saas_client_id='73000000-0000-4000-8000-000000000001' and product.code='menu' and subscription.status='cancelled'),1::bigint,'Cardápio registra cancelamento isolado');
select extensions.is((select count(*) from public.platform_billing_audit_log where action='subscription.product_status_changed'),3::bigint,'mudanças multiproduto são auditadas');
select * from extensions.finish();
rollback;
