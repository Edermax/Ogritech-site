-- Solicitações de retorno iniciadas pelo assistente comercial.
-- O telefone permanece inacessível a visitantes; somente administradores da plataforma podem consultar.

create table public.platform_callback_requests (
    id uuid primary key default gen_random_uuid(),
    phone text not null check (length(phone) between 10 and 15),
    contact_channel text not null check (contact_channel in ('WhatsApp','Ligação')),
    source text not null default 'assistant_plans',
    status text not null default 'new' check (status in ('new','queued','contacted','failed','discarded')),
    privacy_consent_at timestamptz not null,
    whatsapp_consent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint callback_whatsapp_consent_check check (
        contact_channel <> 'WhatsApp' or whatsapp_consent_at is not null
    )
);

create index platform_callback_requests_status_created_idx
    on public.platform_callback_requests(status, created_at desc);

alter table public.platform_callback_requests enable row level security;
revoke all on table public.platform_callback_requests from public, anon, authenticated;
grant select, update, delete on table public.platform_callback_requests to authenticated;

create policy "Platform admins view callback requests"
on public.platform_callback_requests for select to authenticated
using ((select public.is_platform_admin()));

create policy "Platform admins update callback requests"
on public.platform_callback_requests for update to authenticated
using ((select public.is_platform_admin()))
with check ((select public.is_platform_admin()));

create policy "Platform admins delete callback requests"
on public.platform_callback_requests for delete to authenticated
using ((select public.is_platform_admin()));

create table private.platform_whatsapp_outbox (
    id uuid primary key default gen_random_uuid(),
    callback_request_id uuid not null references public.platform_callback_requests(id) on delete cascade,
    recipient_phone text not null check (length(recipient_phone) between 10 and 15),
    template_key text not null default 'ogritech_commercial_welcome',
    status text not null default 'queued' check (status in ('queued','sending','sent','failed')),
    attempts integer not null default 0 check (attempts between 0 and 10),
    provider_message_id text,
    last_error_code text,
    next_attempt_at timestamptz not null default now(),
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    unique(callback_request_id)
);

create index platform_whatsapp_outbox_queue_idx
    on private.platform_whatsapp_outbox(next_attempt_at, created_at)
    where status in ('queued','failed');

alter table private.platform_whatsapp_outbox enable row level security;
revoke all on table private.platform_whatsapp_outbox from public, anon, authenticated;

create function private.public_submit_assistant_callback(
    supplied_phone text,
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
    request_id uuid;
    recent_count integer;
begin
    if coalesce(trim(website),'') <> '' then
        raise exception 'Não foi possível enviar' using errcode='22023';
    end if;
    if not accepted_privacy then
        raise exception 'É necessário aceitar o aviso de privacidade' using errcode='22023';
    end if;
    if supplied_channel not in ('WhatsApp','Ligação')
       or length(clean_phone) not between 10 and 15
       or (supplied_channel = 'WhatsApp' and not accepted_whatsapp) then
        raise exception 'Dados de contato inválidos' using errcode='22023';
    end if;

    select count(*)::integer into recent_count
    from public.platform_callback_requests
    where phone = clean_phone and created_at > now() - interval '1 hour';
    if recent_count >= 3 then
        raise exception 'Muitas solicitações. Aguarde antes de tentar novamente' using errcode='P0001';
    end if;

    insert into public.platform_callback_requests(
        phone, contact_channel, status, privacy_consent_at, whatsapp_consent_at
    ) values (
        clean_phone, supplied_channel,
        case when supplied_channel = 'WhatsApp' then 'queued' else 'new' end,
        now(), case when supplied_channel = 'WhatsApp' then now() else null end
    ) returning id into request_id;

    if supplied_channel = 'WhatsApp' then
        insert into private.platform_whatsapp_outbox(callback_request_id, recipient_phone)
        values(request_id, clean_phone);
    end if;

    return jsonb_build_object(
        'data', jsonb_build_object(
            'id', request_id,
            'channel', supplied_channel,
            'delivery_status', case when supplied_channel = 'WhatsApp' then 'queued' else 'requested' end
        )
    );
end;
$$;

create function public.public_submit_assistant_callback(
    supplied_phone text,
    supplied_channel text,
    accepted_privacy boolean,
    accepted_whatsapp boolean,
    website text default ''
) returns jsonb
language sql security invoker
set search_path = pg_catalog, public, private
as $$
    select private.public_submit_assistant_callback(
        supplied_phone, supplied_channel, accepted_privacy, accepted_whatsapp, website
    )
$$;

revoke all on function private.public_submit_assistant_callback(text,text,boolean,boolean,text)
from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.public_submit_assistant_callback(text,text,boolean,boolean,text)
to anon, authenticated;

revoke all on function public.public_submit_assistant_callback(text,text,boolean,boolean,text)
from public;
grant execute on function public.public_submit_assistant_callback(text,text,boolean,boolean,text)
to anon, authenticated;
