-- Ofertas de substituição preservam o agendamento original até o aceite do cliente.
create table public.appointment_reassignment_offers (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  appointment_id uuid not null references public.business_appointments(id) on delete cascade,
  original_employee_id uuid not null references public.employees(id) on delete restrict,
  proposed_employee_id uuid not null references public.employees(id) on delete restrict,
  proposed_employee_name text not null check (length(trim(proposed_employee_name)) between 1 and 120),
  offered_period tsrange not null,
  original_price numeric(10,2) not null check (original_price >= 0),
  proposed_price numeric(10,2) not null check (proposed_price >= 0),
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','expired','cancelled')),
  public_token_hash text not null check (length(public_token_hash) = 64),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_reassignment_different_employee
    check (original_employee_id <> proposed_employee_id),
  constraint appointment_reassignment_valid_expiry
    check (expires_at > created_at),
  constraint appointment_reassignment_response_consistency
    check ((status = 'pending' and responded_at is null) or (status <> 'pending' and responded_at is not null))
);

create unique index appointment_reassignment_one_pending_per_appointment
  on public.appointment_reassignment_offers(appointment_id)
  where status = 'pending';

create index appointment_reassignment_business_created_idx
  on public.appointment_reassignment_offers(barbershop_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.appointment_reassignment_offers'::regclass
      and conname = 'appointment_reassignment_no_pending_overlap'
  ) then
    alter table public.appointment_reassignment_offers
      add constraint appointment_reassignment_no_pending_overlap
      exclude using gist (
        barbershop_id with =,
        proposed_employee_id with =,
        offered_period with &&
      ) where (status = 'pending');
  end if;
end $$;

alter table public.appointment_reassignment_offers enable row level security;
revoke all on table public.appointment_reassignment_offers from anon, authenticated;
grant select on table public.appointment_reassignment_offers to authenticated;

create policy "Business team views relevant reassignment offers"
on public.appointment_reassignment_offers for select to authenticated
using (
  public.is_business_manager(barbershop_id)
  or original_employee_id = public.current_profile_employee_id()
  or proposed_employee_id = public.current_profile_employee_id()
);

create trigger appointment_reassignment_set_updated_at
before update on public.appointment_reassignment_offers
for each row execute function public.ogritech_set_updated_at();

create function private.suggest_appointment_reassignment(
  target_appointment_id uuid,
  target_proposed_employee_id uuid,
  offer_minutes integer default 120
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  appointment_row public.business_appointments;
  caller_profile public.profiles;
  proposed_employee public.employees;
  secret_token text := encode(extensions.gen_random_bytes(32), 'hex');
  created_offer public.appointment_reassignment_offers;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticacao obrigatoria' using errcode = '42501';
  end if;
  if offer_minutes < 15 or offer_minutes > 1440 then
    raise exception 'A oferta deve durar entre 15 minutos e 24 horas' using errcode = '22023';
  end if;

  select * into appointment_row
  from public.business_appointments
  where id = target_appointment_id
  for update;

  if appointment_row.id is null then
    raise exception 'Agendamento nao encontrado' using errcode = 'P0002';
  end if;
  if appointment_row.status not in ('requested','confirmed') then
    raise exception 'Somente agendamentos ativos podem receber sugestao' using errcode = '22023';
  end if;

  select * into caller_profile
  from public.profiles
  where id = (select auth.uid())
    and active
    and barbershop_id = appointment_row.barbershop_id;

  if caller_profile.id is null
     or caller_profile.role not in ('owner','admin','employee')
     or (caller_profile.role = 'employee' and caller_profile.employee_id is distinct from appointment_row.employee_id) then
    raise exception 'Sem permissao para sugerir substituicao' using errcode = '42501';
  end if;

  select * into proposed_employee
  from public.employees
  where id = target_proposed_employee_id
    and barbershop_id = appointment_row.barbershop_id
    and active;

  if proposed_employee.id is null or proposed_employee.id = appointment_row.employee_id then
    raise exception 'Profissional substituto invalido' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.employee_services es
    where es.employee_id = proposed_employee.id
  ) and not exists (
    select 1 from public.employee_services es
    where es.employee_id = proposed_employee.id and es.service_id = appointment_row.service_id
  ) then
    raise exception 'Profissional nao atende este servico' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from private.list_available_slots(
      appointment_row.barbershop_id,
      appointment_row.service_id,
      proposed_employee.id,
      appointment_row.appointment_date
    ) slot
    where slot.slot_time = appointment_row.appointment_time
  ) then
    raise exception 'Profissional indisponivel neste horario' using errcode = '23P01';
  end if;

  update public.appointment_reassignment_offers
  set status = 'cancelled', responded_at = now()
  where appointment_id = appointment_row.id and status = 'pending';

  insert into public.appointment_reassignment_offers(
    barbershop_id, appointment_id, original_employee_id, proposed_employee_id,
    proposed_employee_name, offered_period, original_price, proposed_price,
    public_token_hash, expires_at, created_by
  ) values (
    appointment_row.barbershop_id, appointment_row.id, appointment_row.employee_id,
    proposed_employee.id, proposed_employee.name, appointment_row.appointment_period,
    appointment_row.price_snapshot, appointment_row.price_snapshot,
    encode(extensions.digest(secret_token, 'sha256'), 'hex'),
    now() + make_interval(mins => offer_minutes), (select auth.uid())
  ) returning * into created_offer;

  return jsonb_build_object(
    'id', created_offer.id,
    'appointment_id', created_offer.appointment_id,
    'proposed_employee_id', created_offer.proposed_employee_id,
    'proposed_employee_name', created_offer.proposed_employee_name,
    'action_label', 'Aceitar ' || created_offer.proposed_employee_name,
    'expires_at', created_offer.expires_at,
    'token', secret_token
  );
end;
$$;

create function public.suggest_appointment_reassignment(
  target_appointment_id uuid,
  target_proposed_employee_id uuid,
  offer_minutes integer default 120
) returns jsonb
language sql security invoker
set search_path = ''
as $$
  select private.suggest_appointment_reassignment(
    target_appointment_id, target_proposed_employee_id, offer_minutes
  )
$$;

revoke all on function private.suggest_appointment_reassignment(uuid,uuid,integer)
  from public, anon, authenticated;
grant execute on function private.suggest_appointment_reassignment(uuid,uuid,integer)
  to authenticated;
revoke all on function public.suggest_appointment_reassignment(uuid,uuid,integer)
  from public, anon;
grant execute on function public.suggest_appointment_reassignment(uuid,uuid,integer)
  to authenticated;
