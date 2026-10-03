-- Read-only production invariants. Update these expected values in the same
-- commit that promotes a reviewed migration batch.
do $audit$
declare
    actual integer;
    latest_name text;
begin
    select count(*) into actual from supabase_migrations.schema_migrations;
    if actual <> 55 then
        raise exception 'Unexpected production migration count: %, expected 55', actual;
    end if;

    select name into latest_name
    from supabase_migrations.schema_migrations
    order by version::numeric desc limit 1;
    if latest_name is distinct from 'billing_rejected_email_event' then
        raise exception 'Unexpected production migration baseline: %', latest_name;
    end if;

    select count(*) into actual
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
    if actual <> 0 then
        raise exception 'Public tables without RLS: %', actual;
    end if;

    select count(*) into actual
    from (
        select schemaname, tablename, policy_role, cmd
        from pg_policies, unnest(roles) as policy_role
        where schemaname = 'public' and permissive = 'PERMISSIVE'
        group by schemaname, tablename, policy_role, cmd
        having count(*) > 1
    ) overlapping;
    if actual <> 11 then
        raise exception 'Unexpected overlapping RLS policy groups: %, expected known pg_policies drift 11', actual;
    end if;

    select count(*) into actual
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and (has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
    if actual <> 0 then
        raise exception 'Exposed SECURITY DEFINER functions in public: %', actual;
    end if;
end
$audit$;
