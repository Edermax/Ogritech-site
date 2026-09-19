begin;
set local search_path = public, extensions;
select extensions.plan(5);

select extensions.has_function('public', 'menu_pilot_metrics', array['uuid','timestamp with time zone','timestamp with time zone','integer','integer'], 'função agregada do piloto existe');
select extensions.function_privs_are('public', 'menu_pilot_metrics', array['uuid','timestamp with time zone','timestamp with time zone','integer','integer'], 'authenticated', array['EXECUTE'], 'somente usuário autenticado recebe execução explícita');
select extensions.function_privs_are('public', 'menu_pilot_metrics', array['uuid','timestamp with time zone','timestamp with time zone','integer','integer'], 'anon', array[]::text[], 'anon não executa métricas do piloto');
select extensions.is((select prosecdef from pg_proc where oid='public.menu_pilot_metrics(uuid,timestamptz,timestamptz,integer,integer)'::regprocedure), false, 'função usa security invoker');
select extensions.is((select proconfig @> array['search_path=""'] from pg_proc where oid='public.menu_pilot_metrics(uuid,timestamptz,timestamptz,integer,integer)'::regprocedure), true, 'search_path permanece vazio');

select * from extensions.finish();
rollback;
