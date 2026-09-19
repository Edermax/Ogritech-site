-- Acrescenta retorno por e-mail ao assistente comercial e mantém o envio em fila durável.

alter table public.platform_callback_requests
    alter column phone drop not null,
    add column email text;

alter table public.platform_callback_requests
    drop constraint if exists platform_callback_requests_phone_check,
    drop constraint if exists platform_callback_requests_contact_channel_check;

alter table public.platform_callback_requests
    add constraint platform_callback_requests_channel_check
        check (contact_channel in ('WhatsApp','Ligação','E-mail')),
    add constraint platform_callback_requests_destination_check
        check (
            (contact_channel in ('WhatsApp','Ligação') and phone is not null and length(phone) between 10 and 15 and email is null)
            or
            (contact_channel = 'E-mail' and phone is null and email is not null and length(email) between 5 and 320)
        );

create table private.platform_email_outbox (
    id uuid primary key default gen_random_uuid(),
    callback_request_id uuid not null references public.platform_callback_requests(id) on delete cascade,
    recipient_email text not null check (length(recipient_email) between 5 and 320),
    template_key text not null default 'ogritech_commercial_welcome',
    status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
    attempts integer not null default 0 check (attempts between 0 and 10),
    provider_message_id text,
    last_error_code text,
    next_attempt_at timestamptz not null default now(),
    last_attempt_at timestamptz,
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    unique(callback_request_id)
);

create index platform_email_outbox_queue_idx
    on private.platform_email_outbox(next_attempt_at, created_at)
    where status in ('queued','failed');

alter table private.platform_email_outbox enable row level security;
revoke all on table private.platform_email_outbox from public, anon, authenticated;

drop function if exists public.public_submit_assistant_callback(text,text,boolean,boolean,text);
drop function if exists private.public_submit_assistant_callback(text,text,boolean,boolean,text);

create function private.public_submit_assistant_callback(
    supplied_phone text,
    supplied_email text,
    supplied_channel text,
    accepted_privacy boolean,
    accepted_whatsapp boolean,
    website text default ''
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
    clean_phone text := regexp_replace(coalesce(supplied_phone,''),'\D','','g');
    clean_email text := lower(trim(coalesce(supplied_email,'')));
    request_id uuid;
    recent_count integer;
begin
    if coalesce(trim(website),'') <> '' then
        raise exception 'Não foi possível enviar' using errcode='22023';
    end if;
    if not accepted_privacy then
        raise exception 'É necessário aceitar o aviso de privacidade' using errcode='22023';
    end if;
    if supplied_channel not in ('WhatsApp','Ligação','E-mail')
       or (supplied_channel in ('WhatsApp','Ligação') and length(clean_phone) not between 10 and 15)
       or (supplied_channel = 'E-mail' and (length(clean_email) not between 5 and 320 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
       or (supplied_channel = 'WhatsApp' and not accepted_whatsapp) then
        raise exception 'Dados de contato inválidos' using errcode='22023';
    end if;

    select count(*)::integer into recent_count
    from public.platform_callback_requests
    where ((supplied_channel = 'E-mail' and email = clean_email) or (supplied_channel <> 'E-mail' and phone = clean_phone))
      and created_at > now() - interval '1 hour';
    if recent_count >= 3 then
        raise exception 'Muitas solicitações. Aguarde antes de tentar novamente' using errcode='P0001';
    end if;

    insert into public.platform_callback_requests(
        phone, email, contact_channel, status, privacy_consent_at, whatsapp_consent_at
    ) values (
        case when supplied_channel = 'E-mail' then null else clean_phone end,
        case when supplied_channel = 'E-mail' then clean_email else null end,
        supplied_channel,
        case when supplied_channel in ('WhatsApp','E-mail') then 'queued' else 'new' end,
        now(), case when supplied_channel = 'WhatsApp' then now() else null end
    ) returning id into request_id;

    if supplied_channel = 'WhatsApp' then
        insert into private.platform_whatsapp_outbox(callback_request_id, recipient_phone)
        values(request_id, clean_phone);
    elsif supplied_channel = 'E-mail' then
        insert into private.platform_email_outbox(callback_request_id, recipient_email)
        values(request_id, clean_email);
    end if;

    return jsonb_build_object(
        'data', jsonb_build_object(
            'id', request_id,
            'channel', supplied_channel,
            'delivery_status', case when supplied_channel in ('WhatsApp','E-mail') then 'queued' else 'requested' end
        )
    );
end;
$$;

create function public.public_submit_assistant_callback(
    supplied_phone text,
    supplied_email text,
    supplied_channel text,
    accepted_privacy boolean,
    accepted_whatsapp boolean,
    website text default ''
) returns jsonb
language sql security invoker
set search_path = pg_catalog, public, private
as $$
    select private.public_submit_assistant_callback(
        supplied_phone, supplied_email, supplied_channel, accepted_privacy, accepted_whatsapp, website
    )
$$;

revoke all on function private.public_submit_assistant_callback(text,text,text,boolean,boolean,text)
from public, anon, authenticated;
grant execute on function private.public_submit_assistant_callback(text,text,text,boolean,boolean,text)
to anon, authenticated;

revoke all on function public.public_submit_assistant_callback(text,text,text,boolean,boolean,text)
from public;
grant execute on function public.public_submit_assistant_callback(text,text,text,boolean,boolean,text)
to anon, authenticated;

create function private.claim_assistant_email(target_request_id uuid)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
declare
    claimed private.platform_email_outbox;
begin
    update private.platform_email_outbox
       set status = 'sending', attempts = attempts + 1, last_attempt_at = now()
     where callback_request_id = target_request_id
       and (status in ('queued','failed') or (status = 'sending' and last_attempt_at < now() - interval '10 minutes'))
       and attempts < 10
       and next_attempt_at <= now()
    returning * into claimed;

    if claimed.id is null then return null; end if;
    return jsonb_build_object('outbox_id', claimed.id, 'recipient_email', claimed.recipient_email, 'template_key', claimed.template_key);
end;
$$;

create function private.complete_assistant_email(
    target_outbox_id uuid,
    delivered boolean,
    supplied_provider_message_id text default null,
    supplied_error_code text default null
) returns void
language plpgsql security definer
set search_path = pg_catalog, public, private
as $$
begin
    update private.platform_email_outbox
       set status = case when delivered then 'sent' else 'failed' end,
           provider_message_id = case when delivered then left(supplied_provider_message_id, 200) else provider_message_id end,
           last_error_code = case when delivered then null else left(coalesce(supplied_error_code, 'delivery_failed'), 200) end,
           sent_at = case when delivered then now() else null end,
           next_attempt_at = case when delivered then next_attempt_at else now() + interval '5 minutes' end
     where id = target_outbox_id;

    if delivered then
        update public.platform_callback_requests r
           set status = 'contacted', updated_at = now()
          from private.platform_email_outbox o
         where o.id = target_outbox_id and r.id = o.callback_request_id;
    end if;
end;
$$;

revoke all on function private.claim_assistant_email(uuid) from public, anon, authenticated;
revoke all on function private.complete_assistant_email(uuid,boolean,text,text) from public, anon, authenticated;
grant execute on function private.claim_assistant_email(uuid) to service_role;
grant execute on function private.complete_assistant_email(uuid,boolean,text,text) to service_role;

create function public.platform_claim_assistant_email(target_request_id uuid)
returns jsonb
language sql security invoker
set search_path = pg_catalog, public, private
as $$ select private.claim_assistant_email(target_request_id) $$;

create function public.platform_complete_assistant_email(
    target_outbox_id uuid,
    delivered boolean,
    supplied_provider_message_id text default null,
    supplied_error_code text default null
) returns void
language sql security invoker
set search_path = pg_catalog, public, private
as $$ select private.complete_assistant_email(target_outbox_id, delivered, supplied_provider_message_id, supplied_error_code) $$;

revoke all on function public.platform_claim_assistant_email(uuid) from public, anon, authenticated;
revoke all on function public.platform_complete_assistant_email(uuid,boolean,text,text) from public, anon, authenticated;
grant execute on function public.platform_claim_assistant_email(uuid) to service_role;
grant execute on function public.platform_complete_assistant_email(uuid,boolean,text,text) to service_role;
