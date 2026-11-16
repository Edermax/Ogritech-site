-- Persistent platform inbox. Sources are committed atomically with each event.
-- No historical backfill: only activity after activation generates alerts.
create table public.platform_notifications (
  id bigint generated always as identity primary key,
  event_type text not null check(event_type in ('user.created','menu.published','support.requested')),
  source_key text not null unique,
  barbershop_id uuid references public.barbershops(id) on delete set null,
  title text not null,
  body text not null,
  destination text not null check(destination in ('users','businesses','support')),
  created_at timestamptz not null default now()
);
create index platform_notifications_business_idx on public.platform_notifications(barbershop_id) where barbershop_id is not null;
alter table public.platform_notifications enable row level security;
revoke all on public.platform_notifications from public, anon, authenticated;
-- No direct Data API grants: read and acknowledge only through the checked RPCs.

create table private.platform_notification_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_id bigint not null references public.platform_notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key(user_id,notification_id)
);
create index platform_notification_reads_notification_idx on private.platform_notification_reads(notification_id);
alter table private.platform_notification_reads enable row level security;
revoke all on private.platform_notification_reads from public, anon, authenticated;

create function private.capture_platform_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare business_name text;
begin
  if tg_table_schema='auth' and tg_table_name='users' then
    insert into public.platform_notifications(event_type,source_key,title,body,destination)
    values('user.created','user:'||new.id,'Novo usuário cadastrado',
      left(coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'Novo usuário'),100)
      ||case when new.email is not null then ' · '||left(new.email,254) else '' end,'users');
  elsif tg_table_name='menu_onboarding_events' then
    select left(name,100) into business_name from public.barbershops where id=new.barbershop_id;
    insert into public.platform_notifications(event_type,source_key,barbershop_id,title,body,destination)
    values('menu.published','publication:'||new.id,new.barbershop_id,'Cardápio publicado',
      coalesce(business_name,'Um negócio')||' publicou o cardápio.','businesses');
  elsif tg_table_name='platform_callback_requests' then
    select left(name,100) into business_name from public.barbershops where id=new.barbershop_id;
    insert into public.platform_notifications(event_type,source_key,barbershop_id,title,body,destination)
    values('support.requested','support:'||new.id,new.barbershop_id,'Atendimento humano solicitado',
      coalesce(business_name,'Visitante')||' solicitou retorno por '||new.contact_channel||'. '
      ||left(coalesce(new.email,new.phone,''),254),'support');
  end if;
  return new;
end;
$$;
revoke all on function private.capture_platform_notification() from public,anon,authenticated,service_role;
create trigger notify_platform_user_created after insert on auth.users
for each row execute function private.capture_platform_notification();
create trigger notify_platform_menu_published after insert on public.menu_onboarding_events
for each row when(new.event_type='published') execute function private.capture_platform_notification();
create trigger notify_platform_support_requested after insert on public.platform_callback_requests
for each row execute function private.capture_platform_notification();

create function private.platform_notification_inbox(page_size integer default 30, before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_platform_admin() or not exists(select 1 from public.profiles where id=auth.uid() and active) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if page_size is null or page_size not between 1 and 100 or (before_id is not null and before_id<1) then
    raise exception 'Paginação inválida' using errcode='22023';
  end if;
  with page as (
    select n.id,n.event_type,n.title,n.body,n.destination,n.created_at,r.read_at
    from public.platform_notifications n left join private.platform_notification_reads r
      on r.notification_id=n.id and r.user_id=auth.uid()
    where before_id is null or n.id<before_id order by n.id desc limit page_size
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('id',p.id::text) order by p.id desc) from page p),'[]'::jsonb),
    'unread_count',(select count(*) from public.platform_notifications n where not exists(
      select 1 from private.platform_notification_reads r where r.user_id=auth.uid() and r.notification_id=n.id)),
    'latest_id',(select max(id)::text from public.platform_notifications),
    'next_before_id',(select min(id)::text from page having count(*)=page_size)
  ) into result;
  return result;
end;
$$;

create function private.platform_mark_notifications_read(through_id bigint, notification_id bigint default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_platform_admin() or not exists(select 1 from public.profiles where id=auth.uid() and active) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if through_id is null or through_id<1 or (notification_id is not null and (notification_id<1 or notification_id>through_id)) then
    raise exception 'Notificação inválida' using errcode='22023';
  end if;
  insert into private.platform_notification_reads(user_id,notification_id)
  select auth.uid(),n.id from public.platform_notifications n
  where n.id<=through_id and (notification_id is null or n.id=notification_id)
  on conflict do nothing;
end;
$$;

create function public.platform_notification_inbox(page_size integer default 30, before_id bigint default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.platform_notification_inbox(page_size,before_id)
$$;
create function public.platform_mark_notifications_read(through_id bigint, notification_id bigint default null)
returns void language sql security invoker set search_path='' as $$
  select private.platform_mark_notifications_read(through_id,notification_id)
$$;
revoke all on function private.platform_notification_inbox(integer,bigint),private.platform_mark_notifications_read(bigint,bigint),
  public.platform_notification_inbox(integer,bigint),public.platform_mark_notifications_read(bigint,bigint) from public,anon,authenticated;
grant execute on function private.platform_notification_inbox(integer,bigint),private.platform_mark_notifications_read(bigint,bigint),
  public.platform_notification_inbox(integer,bigint),public.platform_mark_notifications_read(bigint,bigint) to authenticated;
notify pgrst,'reload schema';
