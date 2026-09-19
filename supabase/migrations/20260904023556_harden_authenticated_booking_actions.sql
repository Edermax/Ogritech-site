-- Mantém o cancelamento do cliente dentro do contrato de auditoria transacional.
create or replace function private.client_cancel_my_appointment(target_appointment_id uuid)
returns boolean language plpgsql security definer
set search_path = ''
as $$
declare
  previous_source text := coalesce(current_setting('ogritech.operation_source', true), '');
  previous_note text := coalesce(current_setting('ogritech.operation_note', true), '');
  changed boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária' using errcode = '28000';
  end if;
  perform set_config('ogritech.operation_source', 'public_link', true);
  perform set_config('ogritech.operation_note', 'Cancelado pelo cliente autenticado', true);
  update public.business_appointments
  set status = 'cancelled', cancelled_at = now(), cancellation_source = 'authenticated_client'
  where id = target_appointment_id
    and client_user_id = (select auth.uid())
    and status in ('requested', 'confirmed')
    and appointment_date >= current_date;
  changed := found;
  perform set_config('ogritech.operation_source', previous_source, true);
  perform set_config('ogritech.operation_note', previous_note, true);
  return changed;
end;
$$;

-- Número cadastrado sem confirmação não prova posse do telefone.
create or replace function private.client_claim_phone_appointments(target_slug text)
returns integer language plpgsql security definer
set search_path = ''
as $$
declare
  authenticated_phone text;
  affected_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticação necessária' using errcode = '28000';
  end if;
  select regexp_replace(coalesce(phone, ''), '\D', '', 'g')
  into authenticated_phone
  from auth.users
  where id = (select auth.uid()) and phone_confirmed_at is not null;
  if authenticated_phone is null or length(authenticated_phone) < 10 then
    raise exception 'Celular confirmado necessário' using errcode = '22023';
  end if;
  update public.business_appointments appointment
  set client_user_id = (select auth.uid())
  from public.business_settings settings
  where settings.barbershop_id = appointment.barbershop_id
    and lower(settings.public_slug) = lower(trim(target_slug))
    and appointment.client_user_id is null
    and regexp_replace(appointment.client_phone, '\D', '', 'g') = authenticated_phone;
  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function private.client_cancel_my_appointment(uuid),
  private.client_claim_phone_appointments(text) from public, anon;
grant execute on function private.client_cancel_my_appointment(uuid),
  private.client_claim_phone_appointments(text) to authenticated;
