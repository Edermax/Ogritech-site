-- Read-only export. Apply the generated statements only to the isolated restore target.
-- Reset local default grants before restoring the source ACLs, including column grants.
with relations as (
  select c.*,n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m','f','S')
), statements as (
  select 1 phase,format('revoke all on schema %I from PUBLIC, anon, authenticated, service_role;',nspname) statement
  from pg_namespace where nspname in ('public','private')
  union all
  select 2,format('revoke all on %s %I.%I from PUBLIC, anon, authenticated, service_role;',
    case when relkind='S' then 'sequence' else 'table' end,nspname,relname) from relations
  union all
  select 3,format('grant %s on schema %I to %s%s;',acl.privilege_type,n.nspname,
    case when acl.grantee=0 then 'PUBLIC' else quote_ident(role.rolname) end,
    case when acl.is_grantable then ' with grant option' else '' end)
  from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
  left join pg_roles role on role.oid=acl.grantee
  where n.nspname in ('public','private') and (acl.grantee=0 or role.rolname in ('anon','authenticated','service_role'))
  union all
  select 4,format('grant %s on %s %I.%I to %s%s;',acl.privilege_type,
    case when relation.relkind='S' then 'sequence' else 'table' end,relation.nspname,relation.relname,
    case when acl.grantee=0 then 'PUBLIC' else quote_ident(role.rolname) end,
    case when acl.is_grantable then ' with grant option' else '' end)
  from relations relation
  cross join lateral aclexplode(coalesce(relation.relacl,acldefault(case when relation.relkind='S' then 'S'::"char" else 'r'::"char" end,relation.relowner))) acl
  left join pg_roles role on role.oid=acl.grantee
  where acl.grantee=0 or role.rolname in ('anon','authenticated','service_role')
  union all
  select 5,format('grant %s (%I) on table %I.%I to %s%s;',acl.privilege_type,attribute.attname,relation.nspname,relation.relname,
    case when acl.grantee=0 then 'PUBLIC' else quote_ident(role.rolname) end,
    case when acl.is_grantable then ' with grant option' else '' end)
  from relations relation join pg_attribute attribute on attribute.attrelid=relation.oid and attribute.attnum>0 and not attribute.attisdropped
  cross join lateral aclexplode(attribute.attacl) acl left join pg_roles role on role.oid=acl.grantee
  where acl.grantee=0 or role.rolname in ('anon','authenticated','service_role')
)
select statement from statements order by phase,statement;
