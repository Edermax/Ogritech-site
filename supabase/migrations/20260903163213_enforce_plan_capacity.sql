-- Centraliza os limites comerciais de cada plano e impede que a interface,
-- integrações ou chaves privilegiadas criem recursos além do contratado.
alter table public.saas_plans
  add column max_users integer,
  add column max_professionals integer,
  add column max_services integer,
  add constraint saas_plans_max_users_positive check (max_users is null or max_users > 0),
  add constraint saas_plans_max_professionals_positive check (max_professionals is null or max_professionals > 0),
  add constraint saas_plans_max_services_positive check (max_services is null or max_services > 0);

comment on column public.saas_plans.max_users is
  'Máximo de acessos ativos owner/admin/employee; NULL significa ilimitado.';
comment on column public.saas_plans.max_professionals is
  'Máximo de profissionais ativos na agenda; NULL significa ilimitado.';
comment on column public.saas_plans.max_services is
  'Máximo de serviços ativos; NULL significa ilimitado.';

update public.saas_plans
set max_users = case name when 'Essencial' then 3 when 'Pro' then 10 else null end,
    max_professionals = case name when 'Essencial' then 3 when 'Pro' then 10 else null end,
    max_services = null;

create or replace function private.business_plan_capacity(target_barbershop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  plan_row public.saas_plans;
  client_row public.saas_clients;
begin
  if (select auth.uid()) is null or not private.is_business_manager(target_barbershop_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select client.* into client_row
  from public.saas_clients client
  where client.barbershop_id = target_barbershop_id
    and client.deleted_at is null
  limit 1;

  select plan.* into plan_row
  from public.saas_plans plan
  where plan.name = client_row.plan and plan.active
  limit 1;

  if client_row.id is null or plan_row.id is null then
    raise exception 'Plano ativo não encontrado para este negócio' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'plan', plan_row.name,
    'max_users', plan_row.max_users,
    'max_professionals', plan_row.max_professionals,
    'max_services', plan_row.max_services,
    'active_users', (
      select count(*) from public.profiles profile
      where profile.barbershop_id = target_barbershop_id
        and profile.active and profile.role in ('owner', 'admin', 'employee')
    ),
    'active_professionals', (
      select count(*) from public.employees employee
      where employee.barbershop_id = target_barbershop_id and employee.active
    ),
    'active_services', (
      select count(*) from public.services service
      where service.barbershop_id = target_barbershop_id and service.active
    )
  );
end;
$$;

create or replace function public.business_plan_capacity(target_barbershop_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.business_plan_capacity(target_barbershop_id) $$;

revoke all on function private.business_plan_capacity(uuid) from public, anon, authenticated;
revoke all on function public.business_plan_capacity(uuid) from public, anon;
grant execute on function public.business_plan_capacity(uuid) to authenticated;

create or replace function private.enforce_business_plan_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resource_name text;
  resource_limit integer;
  active_count integer;
  plan_name text;
  should_check boolean := false;
begin
  if tg_table_name = 'profiles' then
    if new.role not in ('owner', 'admin', 'employee') then return new; end if;
    should_check := new.active and case when tg_op = 'INSERT' then true else
      not old.active or old.barbershop_id is distinct from new.barbershop_id
      or old.role not in ('owner', 'admin', 'employee') end;
    resource_name := 'usuários';
  elsif tg_table_name = 'employees' then
    should_check := new.active and case when tg_op = 'INSERT' then true else
      not old.active or old.barbershop_id is distinct from new.barbershop_id end;
    resource_name := 'profissionais';
  elsif tg_table_name = 'services' then
    should_check := new.active and case when tg_op = 'INSERT' then true else
      not old.active or old.barbershop_id is distinct from new.barbershop_id end;
    resource_name := 'serviços';
  end if;

  if not should_check then return new; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.barbershop_id::text || ':' || tg_table_name, 0)
  );

  select plan.name,
         case tg_table_name
           when 'profiles' then plan.max_users
           when 'employees' then plan.max_professionals
           when 'services' then plan.max_services
         end
    into plan_name, resource_limit
  from public.saas_clients client
  join public.saas_plans plan on plan.name = client.plan and plan.active
  where client.barbershop_id = new.barbershop_id and client.deleted_at is null
  limit 1;

  if plan_name is null then
    raise exception 'Plano ativo não encontrado para este negócio' using errcode = 'P0001';
  end if;
  if resource_limit is null then return new; end if;

  if tg_table_name = 'profiles' then
    select count(*) into active_count from public.profiles profile
    where profile.barbershop_id = new.barbershop_id and profile.active
      and profile.role in ('owner', 'admin', 'employee') and profile.id is distinct from new.id;
  elsif tg_table_name = 'employees' then
    select count(*) into active_count from public.employees employee
    where employee.barbershop_id = new.barbershop_id and employee.active and employee.id is distinct from new.id;
  else
    select count(*) into active_count from public.services service
    where service.barbershop_id = new.barbershop_id and service.active and service.id is distinct from new.id;
  end if;

  if active_count >= resource_limit then
    raise exception 'Limite de % do plano % atingido (%). Altere o plano antes de adicionar outro registro.',
      resource_name, plan_name, resource_limit using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_business_plan_capacity() from public, anon, authenticated;

create or replace function private.assert_plan_fits_business(target_barbershop_id uuid, target_plan_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_row public.saas_plans;
  user_count integer;
  professional_count integer;
  service_count integer;
begin
  if target_barbershop_id is null then return; end if;
  select * into plan_row from public.saas_plans where name = target_plan_name and active limit 1;
  if plan_row.id is null then raise exception 'Plano ativo não encontrado' using errcode = 'P0001'; end if;
  select count(*) into user_count from public.profiles where barbershop_id = target_barbershop_id and active and role in ('owner','admin','employee');
  select count(*) into professional_count from public.employees where barbershop_id = target_barbershop_id and active;
  select count(*) into service_count from public.services where barbershop_id = target_barbershop_id and active;
  if plan_row.max_users is not null and user_count > plan_row.max_users then raise exception 'O negócio possui % usuários ativos; o plano % permite %.', user_count, plan_row.name, plan_row.max_users using errcode='P0001'; end if;
  if plan_row.max_professionals is not null and professional_count > plan_row.max_professionals then raise exception 'O negócio possui % profissionais ativos; o plano % permite %.', professional_count, plan_row.name, plan_row.max_professionals using errcode='P0001'; end if;
  if plan_row.max_services is not null and service_count > plan_row.max_services then raise exception 'O negócio possui % serviços ativos; o plano % permite %.', service_count, plan_row.name, plan_row.max_services using errcode='P0001'; end if;
end;
$$;

revoke all on function private.assert_plan_fits_business(uuid,text) from public, anon, authenticated;

create or replace function private.enforce_plan_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_plan_fits_business(new.barbershop_id, new.plan);
  return new;
end;
$$;

create or replace function private.enforce_plan_limit_reduction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare assigned record;
begin
  for assigned in select barbershop_id from public.saas_clients where plan = new.name and deleted_at is null loop
    perform private.assert_plan_fits_business(assigned.barbershop_id, new.name);
  end loop;
  return new;
end;
$$;

revoke all on function private.enforce_plan_assignment() from public, anon, authenticated;
revoke all on function private.enforce_plan_limit_reduction() from public, anon, authenticated;

create trigger enforce_profiles_plan_capacity
before insert or update of active, barbershop_id, role on public.profiles
for each row execute function private.enforce_business_plan_capacity();

create trigger enforce_employees_plan_capacity
before insert or update of active, barbershop_id on public.employees
for each row execute function private.enforce_business_plan_capacity();

create trigger enforce_services_plan_capacity
before insert or update of active, barbershop_id on public.services
for each row execute function private.enforce_business_plan_capacity();

create trigger enforce_saas_client_plan_assignment
after insert or update of plan, barbershop_id on public.saas_clients
for each row execute function private.enforce_plan_assignment();

create trigger enforce_saas_plan_limit_reduction
after update of max_users, max_professionals, max_services, active on public.saas_plans
for each row execute function private.enforce_plan_limit_reduction();
