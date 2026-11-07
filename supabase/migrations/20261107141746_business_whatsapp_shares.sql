create table public.business_whatsapp_shares (
    barbershop_id uuid primary key references public.barbershops(id) on delete cascade,
    share_id uuid not null unique default gen_random_uuid(),
    phone text check (phone ~ '^55[1-9][0-9]{9,10}$')
);

alter table public.business_whatsapp_shares enable row level security;
revoke all on public.business_whatsapp_shares from public, anon, authenticated;
grant select on public.business_whatsapp_shares to authenticated;
grant insert (barbershop_id, phone), update (phone) on public.business_whatsapp_shares to authenticated;
grant select, insert on public.business_whatsapp_shares to service_role;

create policy manage_own_whatsapp_share on public.business_whatsapp_shares
for all to authenticated
using (public.is_business_manager(barbershop_id))
with check (public.is_business_manager(barbershop_id));

create function private.resolve_business_whatsapp(target_share_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
    select 'https://wa.me/' || s.phone ||
        '?text=Ol%C3%A1%21%20Gostaria%20de%20atendimento.'
    from public.business_whatsapp_shares s
    join public.barbershops b on b.id = s.barbershop_id
    where s.share_id = target_share_id and b.active and b.deleted_at is null
$$;

create function public.resolve_business_whatsapp(target_share_id uuid)
returns text language sql stable security invoker set search_path = ''
as $$ select private.resolve_business_whatsapp(target_share_id) $$;

revoke all on function private.resolve_business_whatsapp(uuid), public.resolve_business_whatsapp(uuid) from public;
grant execute on function private.resolve_business_whatsapp(uuid), public.resolve_business_whatsapp(uuid) to anon, authenticated;

create function public.save_business_whatsapp(target_barbershop_id uuid, target_phone text)
returns uuid language sql security invoker set search_path = ''
as $$
    insert into public.business_whatsapp_shares (barbershop_id, phone)
    values (target_barbershop_id, target_phone)
    on conflict (barbershop_id) do update set phone = excluded.phone
    returning share_id
$$;
revoke all on function public.save_business_whatsapp(uuid,text) from public, anon;
grant execute on function public.save_business_whatsapp(uuid,text) to authenticated;
