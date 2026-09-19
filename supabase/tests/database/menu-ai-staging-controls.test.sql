begin;
set local search_path=public,extensions;
select extensions.no_plan();

select extensions.has_table('private','menu_ai_environment_controls','controles globais ficam no schema privado');
select extensions.has_table('private','menu_ai_staging_events','telemetria híbrida fica no schema privado');
select extensions.has_function('public','menu_ai_staging_gate',array['text','text'],'gate público limitado existe');
select extensions.has_function('public','save_menu_ai_staging_consent',array['uuid','boolean','text'],'aceite por empresa existe');
select extensions.has_function('public','set_menu_ai_environment_controls',array['text','boolean','boolean','integer','integer'],'controle administrativo existe');
select extensions.has_function('public','record_menu_ai_staging_event',array['text','text','text','text','text','text','text','integer','integer','integer','integer'],'telemetria de serviço existe');
select extensions.ok(not has_table_privilege('anon',(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='menu_ai_environment_controls'),'SELECT'),'anon não lê controles privados');
select extensions.ok(not has_table_privilege('authenticated',(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='menu_ai_staging_events'),'SELECT'),'usuário autenticado não lê telemetria privada');
select extensions.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'menu_ai_%' and p.prosecdef),'wrappers públicos são invoker');
select extensions.is((select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='private' and c.relname='menu_ai_environment_controls' and a.attname='hybrid_enabled'),'false','IA global nasce desativada');
select extensions.is((select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='private' and c.relname='menu_ai_environment_controls' and a.attname='kill_switch'),'true','kill switch nasce ativo');
select extensions.is((select pg_get_expr(d.adbin,d.adrelid) from pg_attrdef d join pg_class c on c.oid=d.adrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum=d.adnum where n.nspname='private' and c.relname='menu_ai_environment_controls' and a.attname='maximum_calls'),'0','limite de chamadas nasce em zero');
select extensions.is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('menu_ai_environment_controls','menu_ai_staging_events')),2::bigint,'as duas tabelas privadas estão presentes');
select extensions.is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like '%menu_ai%'),4::bigint,'as quatro funções privadas estão presentes');
select extensions.ok(has_function_privilege('service_role','public.record_menu_ai_staging_event(text,text,text,text,text,text,text,integer,integer,integer,integer)','EXECUTE'),'somente o serviço registra telemetria');
select extensions.ok(has_schema_privilege('service_role','private','USAGE'),'serviço consegue resolver a função privada');
select extensions.ok(not has_function_privilege('anon','public.record_menu_ai_staging_event(text,text,text,text,text,text,text,integer,integer,integer,integer)','EXECUTE'),'anon não registra telemetria');

set local role anon;
select extensions.is(public.menu_ai_staging_gate('cardapio-inexistente','abcdefghijklmnopqrstuvwx')->>'code','hybrid_disabled','gate falha fechado antes de consultar negócio');
select extensions.throws_ok($$select public.menu_ai_staging_gate('x','abcdefghijklmnopqrstuvwx')$$,'22023','Cardápio inválido','slug inválido é rejeitado');
select extensions.throws_ok($$select public.menu_ai_staging_gate('cardapio-inexistente','curta')$$,'22023','Sessão inválida','sessão inválida é rejeitada');
reset role;

select * from extensions.finish();
rollback;
