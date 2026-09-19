begin;
set local search_path = public, extensions;
select extensions.plan(25);

select extensions.has_table('public','platform_products','catálogo de produtos existe');
select extensions.has_table('public','platform_modules','módulos opcionais existem');
select extensions.has_table('public','plan_entitlements','direitos de plano existem');
select extensions.has_table('public','subscription_modules','módulos contratados existem');
select extensions.has_column('public','saas_plans','product_id','plano pertence a produto');
select extensions.has_column('public','saas_plans','code','plano possui código estável');
select extensions.has_column('public','platform_subscriptions','product_id','assinatura pertence a produto');
select extensions.is(
  (select array_agg(code order by display_order) from public.platform_products),
  array['agenda','pages','quotes','menu']::text[],
  'quatro produtos oficiais foram registrados'
);
select extensions.is(
  (select count(*) from public.saas_plans where product_id is null),
  0::bigint,
  'nenhum plano ficou sem produto'
);
select extensions.is(
  (select count(*) from public.platform_subscriptions where product_id is null),
  0::bigint,
  'nenhuma assinatura ficou sem produto'
);
select extensions.ok(exists(
  select 1 from pg_indexes where schemaname='public' and indexname='platform_subscriptions_one_open_product_idx'
), 'unicidade de assinatura aberta por cliente e produto existe');
select extensions.ok(exists(
  select 1 from pg_constraint where conrelid='public.platform_subscriptions'::regclass
    and conname='platform_subscriptions_plan_product_fk'
), 'plano e assinatura devem pertencer ao mesmo produto');
select extensions.ok(exists(
  select 1 from pg_constraint where conrelid='public.subscription_modules'::regclass
    and conname='subscription_modules_module_product_fk'
), 'módulo contratado deve pertencer ao produto da assinatura');
select extensions.is((select relrowsecurity from pg_class where oid='public.platform_products'::regclass),true,'RLS em produtos');
select extensions.is((select relrowsecurity from pg_class where oid='public.platform_modules'::regclass),true,'RLS em módulos');
select extensions.is((select relrowsecurity from pg_class where oid='public.plan_entitlements'::regclass),true,'RLS em direitos');
select extensions.is((select relrowsecurity from pg_class where oid='public.subscription_modules'::regclass),true,'RLS em módulos contratados');
select extensions.ok(not has_table_privilege('anon','public.platform_products','SELECT'),'anon não lê produtos diretamente');
select extensions.ok(not has_table_privilege('anon','public.platform_modules','SELECT'),'anon não lê módulos diretamente');
select extensions.ok(not has_table_privilege('anon','public.plan_entitlements','SELECT'),'anon não lê direitos diretamente');
select extensions.ok(not has_table_privilege('anon','public.subscription_modules','SELECT'),'anon não lê módulos contratados');
select extensions.ok(not has_function_privilege('anon','private.business_has_product_access(uuid,text)','EXECUTE'),'anon não executa autorização multiproduto');
select extensions.ok(has_function_privilege('authenticated','private.business_has_product_access(uuid,text)','EXECUTE'),'authenticated pode avaliar acesso sob identidade');
select extensions.is(private.business_has_product_access(gen_random_uuid(),'menu'),false,'sem identidade e assinatura o acesso é negado');
select extensions.is(private.business_entitlement(gen_random_uuid(),'menu','missing'),null::jsonb,'direito ausente é negado por padrão');

select * from extensions.finish();
rollback;
