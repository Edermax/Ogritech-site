-- Resolve support channels from the authenticated profile and current subscription.
create function private.assistant_contact_options() returns jsonb language sql stable security definer set search_path='' as $$
 select case when exists (
  select 1 from public.profiles profile
  join public.saas_clients client on client.barbershop_id=profile.barbershop_id and client.deleted_at is null
  join public.billing_customers customer on customer.saas_client_id=client.id
  join public.platform_subscriptions subscription on subscription.billing_customer_id=customer.id
  join public.platform_products product on product.id=subscription.product_id and product.code='menu' and product.active
  where profile.id=(select auth.uid()) and profile.active and profile.role in ('owner','admin','employee')
   and ((subscription.status='active' and (subscription.current_period_end is null or subscription.current_period_end>now()))
    or (subscription.status='trial' and subscription.current_period_end>now()))
 ) then jsonb_build_object('channels',jsonb_build_array('Ligação','WhatsApp','E-mail'),'email','suporte@ogritech.com.br','phone','5516994577762')
 else jsonb_build_object('channels',jsonb_build_array('E-mail'),'email','contato@ogritech.com.br') end
$$;
revoke all on function private.assistant_contact_options() from public;
grant execute on function private.assistant_contact_options() to anon,authenticated;
create function public.assistant_contact_options() returns jsonb language sql stable security invoker set search_path='' as $$ select private.assistant_contact_options() $$;
revoke all on function public.assistant_contact_options() from public;
grant execute on function public.assistant_contact_options() to anon,authenticated;

alter table public.platform_callback_requests add column barbershop_id uuid references public.barbershops(id) on delete set null;
alter table public.platform_callback_requests add column requested_by uuid references auth.users(id) on delete set null;
create index platform_callback_requests_business_idx on public.platform_callback_requests(barbershop_id) where barbershop_id is not null;
create index platform_callback_requests_requested_by_idx on public.platform_callback_requests(requested_by) where requested_by is not null;

create or replace function private.public_submit_assistant_callback(
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
    contact_business uuid := (select p.barbershop_id from public.profiles p where p.id=auth.uid() and p.active and p.role in ('owner','admin','employee'));
begin
    if supplied_channel in ('WhatsApp','Ligação') and not (private.assistant_contact_options()->'channels' ? supplied_channel) then
        raise exception 'Telefone e WhatsApp estão disponíveis para clientes com assinatura ativa ou em teste vigente. Solicite contato por e-mail.' using errcode='42501';
    end if;
    if coalesce(trim(website),'') <> '' then
        raise exception 'Não foi possível enviar' using errcode='22023';
    end if;
    if accepted_privacy is distinct from true then
        raise exception 'É necessário aceitar o aviso de privacidade' using errcode='22023';
    end if;
    if supplied_channel not in ('WhatsApp','Ligação','E-mail')
       or (supplied_channel in ('WhatsApp','Ligação') and length(clean_phone) not between 10 and 15)
       or (supplied_channel = 'E-mail' and (length(clean_email) not between 5 and 320 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
       or (supplied_channel = 'WhatsApp' and accepted_whatsapp is distinct from true) then
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
        phone, email, contact_channel, status, privacy_consent_at, whatsapp_consent_at,barbershop_id,requested_by
    ) values (
        case when supplied_channel = 'E-mail' then null else clean_phone end,
        case when supplied_channel = 'E-mail' then clean_email else null end,
        supplied_channel,
        'new',
        now(), case when supplied_channel = 'WhatsApp' then now() else null end,contact_business,auth.uid()
    ) returning id into request_id;

    -- Human requests are handled in the administration queue; no automatic welcome.

    return jsonb_build_object(
        'data', jsonb_build_object(
            'id', request_id,
            'channel', supplied_channel,
            'delivery_status', 'requested'
        )
    );
end;
$$;

notify pgrst,'reload schema';

-- Leads request e-mail only, including the separate public contact form.
alter table public.platform_contact_leads drop constraint platform_contact_leads_phone_check;
alter table public.platform_contact_leads add constraint platform_contact_leads_phone_check check(length(phone) between 10 and 15 or (phone='' and preferred_contact='E-mail'));
do $lead$ declare definition text; patched text;
begin
 select pg_get_functiondef(p.oid) into strict definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='public_submit_platform_contact';
 patched:=replace(definition,'or length(clean_phone) not between 10 and 15','or (clean_phone<>'''' and length(clean_phone) not between 10 and 15)');
 patched:=replace(patched,'or supplied_preference not in (''WhatsApp'',''E-mail'',''Ligação'')','or supplied_preference is distinct from ''E-mail''');
 if patched=definition then raise exception 'Lead validation anchor missing'; end if;
 execute patched;
end $lead$;
