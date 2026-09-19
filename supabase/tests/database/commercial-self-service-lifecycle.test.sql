begin;
set local search_path=public,extensions;
select extensions.no_plan();

select extensions.has_function('public','business_subscription_center',array['uuid'],'centro de assinatura existe');
select extensions.has_function('public','self_service_product_subscription',array['uuid','text','text','uuid','text'],'ciclo de assinatura existe');
select extensions.has_function('public','self_service_subscription_module',array['uuid','text','uuid','boolean'],'gestão de módulos existe');
select extensions.has_function('public','business_portability_export',array['uuid'],'exportação existe');
select extensions.ok(not has_function_privilege('anon','public.business_subscription_center(uuid)','EXECUTE'),'anon não consulta assinatura');
select extensions.ok(not has_function_privilege('anon','public.business_portability_export(uuid)','EXECUTE'),'anon não exporta dados');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('business_subscription_center','self_service_product_subscription','self_service_subscription_module','business_portability_export') and p.prosecdef),'wrappers públicos são invoker');
select extensions.throws_ok($$select public.business_subscription_center(gen_random_uuid())$$,'42501','Acesso negado','sem identidade não acessa centro');

insert into public.barbershops(id,name,slug,segment) values
('81000000-0000-4000-8000-000000000001','Autonomia Um','autonomia-um','Alimentação'),
('81000000-0000-4000-8000-000000000002','Autonomia Dois','autonomia-dois','Serviços');
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
('82000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner.lifecycle@example.invalid','','{}','{}',now(),now()),
('82000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','employee.lifecycle@example.invalid','','{}','{}',now(),now());
insert into public.saas_clients(id,name,segment,contact_name,owner_email,origin,plan,monthly_fee,status,barbershop_id) values
('83000000-0000-4000-8000-000000000001','Cliente Autonomia','Alimentação','Dona','owner.lifecycle@example.invalid','Teste','Agenda',97,'Ativo','81000000-0000-4000-8000-000000000001'),
('83000000-0000-4000-8000-000000000002','Outro Cliente','Serviços','Dono','other.lifecycle@example.invalid','Teste','Agenda',97,'Ativo','81000000-0000-4000-8000-000000000002');
insert into public.profiles(id,barbershop_id,full_name,role) values
('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','Dona Autônoma','owner'),
('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000001','Funcionário','employee');
insert into public.platform_modules(product_id,code,name,description)
select id,'reports_plus','Relatórios avançados','Módulo local de teste' from public.platform_products where code='menu';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select extensions.throws_ok($$select public.business_subscription_center('81000000-0000-4000-8000-000000000001')$$,'42501','Acesso negado','funcionário não administra assinatura');
select extensions.throws_ok($$select public.business_portability_export('81000000-0000-4000-8000-000000000001')$$,'42501','Acesso negado','funcionário não exporta dados');

select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select extensions.throws_ok($$select public.business_subscription_center('81000000-0000-4000-8000-000000000002')$$,'42501','Acesso negado','proprietário não atravessa tenant');
select extensions.lives_ok($$select public.business_subscription_center('81000000-0000-4000-8000-000000000001')$$,'proprietário consulta centro');
select extensions.is((public.business_subscription_center('81000000-0000-4000-8000-000000000001')->'products' @> '[{"code":"menu"}]'::jsonb),true,'catálogo contém Cardápio');

select extensions.throws_ok($$select public.self_service_product_subscription('81000000-0000-4000-8000-000000000001','menu','invalid',null,null)$$,'22023','Ação inválida','ação fora da lista é rejeitada');
select extensions.throws_ok($$select public.self_service_product_subscription('81000000-0000-4000-8000-000000000001','menu','subscribe',(select id from public.saas_plans limit 1),null)$$,'22023','Plano incompatível ou inativo','plano de outro produto é rejeitado');
select extensions.lives_ok($$select public.self_service_product_subscription('81000000-0000-4000-8000-000000000001','menu','subscribe',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),null)$$,'proprietário contrata Cardápio');
set local role postgres;
select extensions.is((select count(*) from public.platform_subscriptions s join public.billing_customers c on c.id=s.billing_customer_id join public.platform_products p on p.id=s.product_id where c.saas_client_id='83000000-0000-4000-8000-000000000001' and p.code='menu' and s.status='active'),1::bigint,'provisionamento cria assinatura ativa local');
set local role authenticated;
select extensions.throws_ok($$select public.self_service_product_subscription('81000000-0000-4000-8000-000000000001','menu','subscribe',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' limit 1),null)$$,'23505','Solução já contratada','contratação duplicada é rejeitada');

select extensions.lives_ok($$select public.self_service_subscription_module('81000000-0000-4000-8000-000000000001','menu',(select id from public.platform_modules where code='reports_plus'),true)$$,'ativa módulo');
set local role postgres;
select extensions.is((select status from public.subscription_modules item join public.platform_modules module on module.id=item.module_id where module.code='reports_plus'),'active','módulo fica ativo');
set local role authenticated;
select extensions.throws_ok($$select public.self_service_subscription_module('81000000-0000-4000-8000-000000000001','menu',(select id from public.platform_modules where code='reports_plus'),null)$$,'22023','Estado do módulo inválido','estado nulo é rejeitado');

select extensions.lives_ok($$select public.self_service_product_subscription('81000000-0000-4000-8000-000000000001','menu','cancel',null,'Preferência do cliente')$$,'agenda cancelamento');
set local role postgres;
select extensions.is((select cancel_at_period_end from public.platform_subscriptions s join public.billing_customers c on c.id=s.billing_customer_id join public.platform_products p on p.id=s.product_id where c.saas_client_id='83000000-0000-4000-8000-000000000001' and p.code='menu' and s.status<>'cancelled'),true,'cancelamento preserva assinatura até o período');
set local role authenticated;
select extensions.is(private.business_has_product_access('81000000-0000-4000-8000-000000000001','menu'),true,'acesso permanece durante período contratado');
set local role postgres;
select extensions.is((select status from public.subscription_modules item join public.platform_modules module on module.id=item.module_id where module.code='reports_plus'),'cancel_at_period_end','módulo acompanha cancelamento futuro');
set local role authenticated;
select extensions.throws_ok($$select public.self_service_subscription_module('81000000-0000-4000-8000-000000000001','menu',(select id from public.platform_modules where code='reports_plus'),true)$$,'22023','Assinatura ativa não encontrada','módulo não muda durante cancelamento');
select extensions.lives_ok($$select public.self_service_product_subscription('81000000-0000-4000-8000-000000000001','menu','reactivate',null,null)$$,'reativa antes do fim');
set local role postgres;
select extensions.is((select cancel_at_period_end from public.platform_subscriptions s join public.billing_customers c on c.id=s.billing_customer_id join public.platform_products p on p.id=s.product_id where c.saas_client_id='83000000-0000-4000-8000-000000000001' and p.code='menu' and s.status<>'cancelled'),false,'reativação remove cancelamento');
select extensions.is((select status from public.subscription_modules item join public.platform_modules module on module.id=item.module_id where module.code='reports_plus'),'active','reativação recupera módulo');
set local role authenticated;

insert into public.business_clients(barbershop_id,name,phone,email) values('81000000-0000-4000-8000-000000000001','Cliente exportável','11999990000','export@example.invalid');
select extensions.lives_ok($$select public.business_portability_export('81000000-0000-4000-8000-000000000001')$$,'gera exportação consolidada');
select extensions.is((public.business_portability_export('81000000-0000-4000-8000-000000000001')->>'schema_version')::integer,1,'exportação possui versão');
select extensions.is(jsonb_array_length(public.business_portability_export('81000000-0000-4000-8000-000000000001')->'business_clients'),1,'exportação limita clientes ao tenant');
select extensions.ok((public.business_portability_export('81000000-0000-4000-8000-000000000001')::text not like '%public_access_token%'),'exportação não inclui token público');
set local role postgres;
select extensions.ok((select count(*)>=5 from public.platform_billing_audit_log where actor_id='82000000-0000-4000-8000-000000000001'),'operações self-service são auditadas');

update public.platform_subscriptions set cancel_at_period_end=true,current_period_end=now()-interval '1 second'
where id=(select s.id from public.platform_subscriptions s join public.billing_customers c on c.id=s.billing_customer_id join public.platform_products p on p.id=s.product_id where c.saas_client_id='83000000-0000-4000-8000-000000000001' and p.code='menu' and s.status<>'cancelled');
set local role authenticated;
select extensions.lives_ok($$select public.self_service_product_subscription('81000000-0000-4000-8000-000000000001','menu','subscribe',(select plan.id from public.saas_plans plan join public.platform_products product on product.id=plan.product_id where product.code='menu' and plan.code='foundation'),null)$$,'nova contratação é permitida após o período cancelado');
set local role postgres;
select extensions.is((select count(*) from public.platform_subscriptions s join public.billing_customers c on c.id=s.billing_customer_id join public.platform_products p on p.id=s.product_id where c.saas_client_id='83000000-0000-4000-8000-000000000001' and p.code='menu' and s.status='cancelled'),1::bigint,'assinatura vencida é encerrada');
select extensions.is((select count(*) from public.platform_subscriptions s join public.billing_customers c on c.id=s.billing_customer_id join public.platform_products p on p.id=s.product_id where c.saas_client_id='83000000-0000-4000-8000-000000000001' and p.code='menu' and s.status='active'),1::bigint,'nova assinatura assume o acesso');

select * from extensions.finish();
rollback;
