-- Automatiza bloqueio/liberação e torna o estado de billing consultável no servidor.
alter table private.billing_signups
  add column if not exists payment_requested_at timestamptz,
  add column if not exists suspended_at timestamptz;

create or replace function private.billing_has_access(target_barbershop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = private, public
as $$
  select exists (
    select 1
    from private.billing_signups signup
    where signup.barbershop_id = target_barbershop_id
      and (
        (signup.status = 'trial_active' and signup.trial_ends_at > now())
        or (signup.status in ('active', 'cancel_at_period_end') and signup.access_until > now())
      )
  );
$$;

revoke all on function private.billing_has_access(uuid) from public, anon, authenticated;
grant execute on function private.billing_has_access(uuid) to service_role;

create or replace function private.billing_set_business_access(target_barbershop_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = private, public
as $$
begin
  update public.barbershops set active = enabled where id = target_barbershop_id;
  update public.saas_clients
     set status = case when enabled then 'Ativo' else 'Suspenso' end
   where barbershop_id = target_barbershop_id and deleted_at is null;
end;
$$;

revoke all on function private.billing_set_business_access(uuid, boolean) from public, anon, authenticated;
grant execute on function private.billing_set_business_access(uuid, boolean) to service_role;

drop trigger if exists billing_signups_set_updated_at on private.billing_signups;
create trigger billing_signups_set_updated_at
before update on private.billing_signups
for each row execute function public.ogritech_set_updated_at();
