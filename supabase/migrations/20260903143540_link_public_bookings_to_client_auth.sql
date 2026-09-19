alter table public.business_appointments
  add column if not exists client_user_id uuid references auth.users(id) on delete set null,
  add column if not exists whatsapp_operational_consent_at timestamptz,
  add column if not exists marketing_consent_at timestamptz;

create index if not exists business_appointments_client_user_date_idx
  on public.business_appointments (client_user_id, appointment_date desc)
  where client_user_id is not null;

create or replace function private.link_public_appointment_to_authenticated_client()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private
as $$
begin
  if new.created_by = 'public' and new.client_user_id is null then
    new.client_user_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists business_appointments_link_public_client on public.business_appointments;
create trigger business_appointments_link_public_client
before insert on public.business_appointments
for each row execute function private.link_public_appointment_to_authenticated_client();

create or replace function private.client_list_my_appointments(target_slug text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'business', settings.display_name,
    'service', a.service,
    'professional', a.professional,
    'date', a.appointment_date,
    'time', a.appointment_time,
    'status', a.status,
    'can_cancel', a.status in ('requested', 'confirmed') and a.appointment_date >= current_date
  ) order by a.appointment_date desc, a.appointment_time desc), '[]'::jsonb)
  from public.business_appointments a
  join public.business_settings settings on settings.barbershop_id = a.barbershop_id
  where auth.uid() is not null
    and a.client_user_id = auth.uid()
    and lower(settings.public_slug) = lower(trim(target_slug));
$$;

create or replace function public.client_list_my_appointments(target_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, private
as $$ select private.client_list_my_appointments(target_slug) $$;

create or replace function private.client_cancel_my_appointment(target_appointment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update public.business_appointments
  set status = 'cancelled', cancelled_at = now(), cancellation_source = 'authenticated_client'
  where id = target_appointment_id
    and client_user_id = auth.uid()
    and status in ('requested', 'confirmed')
    and appointment_date >= current_date;
  return found;
end;
$$;

create or replace function public.client_cancel_my_appointment(target_appointment_id uuid)
returns boolean
language sql
security invoker
set search_path = pg_catalog, public, private
as $$ select private.client_cancel_my_appointment(target_appointment_id) $$;

create or replace function private.client_claim_phone_appointments(target_slug text)
returns integer language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $$
declare authenticated_phone text; affected_rows integer;
begin
  if auth.uid() is null then raise exception 'Autenticação necessária' using errcode = '28000'; end if;
  select regexp_replace(coalesce(phone, ''), '\D', '', 'g') into authenticated_phone from auth.users where id = auth.uid();
  if length(authenticated_phone) < 10 then raise exception 'Celular confirmado necessário' using errcode = '22023'; end if;
  update public.business_appointments appointment
  set client_user_id = auth.uid()
  from public.business_settings settings
  where settings.barbershop_id = appointment.barbershop_id
    and lower(settings.public_slug) = lower(trim(target_slug))
    and appointment.client_user_id is null
    and regexp_replace(appointment.client_phone, '\D', '', 'g') = authenticated_phone;
  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

create or replace function public.client_claim_phone_appointments(target_slug text)
returns integer language sql security invoker
set search_path = pg_catalog, public, private
as $$ select private.client_claim_phone_appointments(target_slug) $$;

create or replace function private.public_record_appointment_consents(target_reference text, target_token text, accepted_whatsapp_operational boolean, accepted_marketing boolean)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, private, extensions
as $$
begin
  update public.business_appointments
  set whatsapp_operational_consent_at = case when accepted_whatsapp_operational then now() else null end,
      marketing_consent_at = case when accepted_marketing then now() else null end
  where public_reference = upper(trim(target_reference))
    and public_token_hash = encode(digest(target_token, 'sha256'), 'hex');
  return found;
end;
$$;

create or replace function public.public_record_appointment_consents(target_reference text, target_token text, accepted_whatsapp_operational boolean, accepted_marketing boolean)
returns boolean language sql security invoker
set search_path = pg_catalog, public, private
as $$ select private.public_record_appointment_consents(target_reference, target_token, accepted_whatsapp_operational, accepted_marketing) $$;

create or replace function private.public_visual_schedule(target_slug text, target_service_id uuid, target_employee_id uuid, target_date date)
returns table(slot_time time, is_available boolean)
language sql stable security definer
set search_path = pg_catalog, public, private
as $$
  with context as (
    select settings.open_time, settings.close_time, settings.slot_duration_minutes, service.duration_minutes
    from public.business_settings settings
    join public.barbershops business on business.id = settings.barbershop_id
    join public.services service on service.barbershop_id = settings.barbershop_id and service.id = target_service_id and service.active
    join public.employees employee on employee.barbershop_id = settings.barbershop_id and employee.id = target_employee_id and employee.active
    where lower(settings.public_slug) = lower(trim(target_slug))
      and settings.public_booking_enabled and business.active and business.deleted_at is null
  ), candidates as (
    select generated::time as candidate_time
    from context
    cross join lateral generate_series(
      target_date + context.open_time,
      target_date + context.close_time - make_interval(mins => context.duration_minutes),
      make_interval(mins => context.slot_duration_minutes)
    ) generated
  ), available as (
    select available_slot.slot_time
    from private.public_available_slots(target_slug, target_service_id, target_employee_id, target_date) available_slot
  )
  select candidates.candidate_time, available.slot_time is not null
  from candidates left join available on available.slot_time = candidates.candidate_time
  order by candidates.candidate_time;
$$;

create or replace function public.public_visual_schedule(target_slug text, target_service_id uuid, target_employee_id uuid, target_date date)
returns table(slot_time time, is_available boolean)
language sql stable security invoker
set search_path = pg_catalog, public, private
as $$ select * from private.public_visual_schedule(target_slug, target_service_id, target_employee_id, target_date) $$;

revoke all on function private.link_public_appointment_to_authenticated_client(), private.client_list_my_appointments(text), private.client_cancel_my_appointment(uuid), private.client_claim_phone_appointments(text), private.public_record_appointment_consents(text,text,boolean,boolean), private.public_visual_schedule(text,uuid,uuid,date) from public, anon, authenticated;
revoke all on function public.client_list_my_appointments(text), public.client_cancel_my_appointment(uuid), public.client_claim_phone_appointments(text) from public, anon;
revoke all on function public.public_record_appointment_consents(text,text,boolean,boolean) from public;
revoke all on function public.public_visual_schedule(text,uuid,uuid,date) from public;
grant usage on schema private to authenticated;
grant execute on function private.client_list_my_appointments(text), private.client_cancel_my_appointment(uuid), private.client_claim_phone_appointments(text) to authenticated;
grant execute on function public.client_list_my_appointments(text), public.client_cancel_my_appointment(uuid), public.client_claim_phone_appointments(text) to authenticated;
grant execute on function private.public_record_appointment_consents(text,text,boolean,boolean), public.public_record_appointment_consents(text,text,boolean,boolean) to anon, authenticated;
grant execute on function private.public_visual_schedule(text,uuid,uuid,date), public.public_visual_schedule(text,uuid,uuid,date) to anon, authenticated;
