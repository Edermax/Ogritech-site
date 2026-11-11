-- Device subscriptions are capabilities. Keep endpoints out of the Data API.
create table private.menu_order_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  endpoint_hash text not null unique,
  endpoint text not null check (length(endpoint) <= 2048),
  vapid_key text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
create index menu_order_push_devices_user_idx on private.menu_order_push_devices(user_id);
create index menu_order_push_devices_business_idx on private.menu_order_push_devices(barbershop_id) where active;
alter table private.menu_order_push_devices enable row level security;
revoke all on private.menu_order_push_devices from public, anon, authenticated;

create table private.menu_order_push_jobs (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.menu_orders(id) on delete cascade,
  device_id uuid not null references private.menu_order_push_devices(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','processing','sent','failed','expired')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  lease_token uuid,
  result_code text,
  created_at timestamptz not null default now(),
  unique(order_id, device_id)
);
create index menu_order_push_jobs_pending_idx on private.menu_order_push_jobs(available_at,id) where state in ('pending','processing');
create index menu_order_push_jobs_device_idx on private.menu_order_push_jobs(device_id);
create index menu_order_push_jobs_created_idx on private.menu_order_push_jobs(created_at);
alter table private.menu_order_push_jobs enable row level security;
revoke all on private.menu_order_push_jobs from public, anon, authenticated;

create function private.menu_order_push_device(
  target_barbershop_id uuid, supplied_endpoint text, supplied_vapid_key text default null, operation text default 'status'
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,extensions as $$
declare device private.menu_order_push_devices; endpoint_hash_value text;
begin
  if auth.uid() is null or operation is null or operation not in ('status','enable','disable') then
    raise exception 'Operação não permitida' using errcode='42501';
  end if;
  if length(supplied_endpoint) > 2048 or supplied_endpoint !~ '^https://(fcm\.googleapis\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_~./%?=&:+-]+$' then
    raise exception 'Dispositivo inválido' using errcode='22023';
  end if;
  if supplied_endpoint is null then raise exception 'Dispositivo inválido' using errcode='22023'; end if;
  endpoint_hash_value := encode(digest(supplied_endpoint,'sha256'),'hex');
  -- Serialize registrations per account, including the maximum-device check.
  perform 1 from public.profiles where id=auth.uid() for update;
  select * into device from private.menu_order_push_devices where endpoint_hash=endpoint_hash_value for update;
  if operation='disable' then
    update private.menu_order_push_devices set active=false,updated_at=now()
    where endpoint_hash=endpoint_hash_value and user_id=auth.uid();
    return jsonb_build_object('enabled',false);
  end if;
  if not exists (
    select 1 from public.profiles p join public.barbershops b on b.id=p.barbershop_id
    where p.id=auth.uid() and p.active and p.role in ('owner','admin','employee')
      and p.barbershop_id=target_barbershop_id and b.active and b.deleted_at is null
  ) or not private.business_product_is_active(target_barbershop_id,'menu') then
    raise exception 'Acesso não permitido' using errcode='42501';
  end if;
  if operation='status' then
    return jsonb_build_object('enabled',coalesce(device.user_id=auth.uid() and device.barbershop_id=target_barbershop_id and device.active and device.vapid_key=supplied_vapid_key,false));
  end if;
  if supplied_vapid_key is null or supplied_vapid_key !~ '^[A-Za-z0-9_-]{87}$' then
    raise exception 'Chave de notificação inválida' using errcode='22023';
  end if;
  if device.id is not null and device.user_id<>auth.uid() then
    raise exception 'Dispositivo vinculado a outra conta' using errcode='42501';
  end if;
  if (device.id is null or not device.active) and (select count(*) from private.menu_order_push_devices where user_id=auth.uid() and active)>=5 then
    raise exception 'Limite de cinco dispositivos atingido' using errcode='23514';
  end if;
  insert into private.menu_order_push_devices(user_id,barbershop_id,endpoint_hash,endpoint,vapid_key)
  values(auth.uid(),target_barbershop_id,endpoint_hash_value,supplied_endpoint,supplied_vapid_key)
  on conflict(endpoint_hash) do update set barbershop_id=excluded.barbershop_id,vapid_key=excluded.vapid_key,active=true,updated_at=now()
  where menu_order_push_devices.user_id=auth.uid();
  if not found then raise exception 'Dispositivo vinculado a outra conta' using errcode='42501'; end if;
  return jsonb_build_object('enabled',true);
end $$;
create function public.menu_order_push_device(target_barbershop_id uuid,supplied_endpoint text,supplied_vapid_key text default null,operation text default 'status')
returns jsonb language sql security invoker set search_path=pg_catalog,public,private as $$
  select private.menu_order_push_device(target_barbershop_id,supplied_endpoint,supplied_vapid_key,operation)
$$;
revoke all on function private.menu_order_push_device(uuid,text,text,text),public.menu_order_push_device(uuid,text,text,text) from public,anon;
grant execute on function private.menu_order_push_device(uuid,text,text,text),public.menu_order_push_device(uuid,text,text,text) to authenticated;

-- Deployment supplies the dispatcher URL and secret through Vault. Missing
-- configuration leaves the durable queue available and never blocks an order.
create function private.wake_menu_order_push_dispatch() returns void language plpgsql security definer
set search_path=pg_catalog,private as $$
declare worker_url text; worker_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regnamespace('net') is null then return; end if;
  if not exists(select 1 from private.menu_order_push_jobs where state in ('pending','processing') and available_at<=now()) then return; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'menu_order_push_dispatch_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'menu_order_push_dispatch_secret';
  if worker_url is null or worker_secret is null then return; end if;
  execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=10000)'
  using worker_url,jsonb_build_object('Content-Type','application/json','x-menu-push-secret',worker_secret),'{}'::jsonb;
exception when others then
  raise log 'menu_order_push_dispatch_wakeup_failed';
end $$;
revoke all on function private.wake_menu_order_push_dispatch() from public,anon,authenticated;

create function private.enqueue_menu_order_push() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private as $$
begin
  if new.is_test or new.status<>'received' then return new; end if;
  insert into private.menu_order_push_jobs(order_id,device_id)
  select new.id,d.id from private.menu_order_push_devices d
  join public.profiles p on p.id=d.user_id and p.barbershop_id=d.barbershop_id
  where d.barbershop_id=new.barbershop_id and d.active and p.active and p.role in ('owner','admin','employee')
  on conflict(order_id,device_id) do nothing;
  perform private.wake_menu_order_push_dispatch();
  return new;
end $$;
revoke all on function private.enqueue_menu_order_push() from public,anon,authenticated;
create trigger enqueue_menu_order_push after insert on public.menu_orders for each row execute function private.enqueue_menu_order_push();

create function private.claim_menu_order_push_jobs(supplied_vapid_key text)
returns table(job_id bigint,lease uuid,endpoint text,topic text) language plpgsql security definer
set search_path=pg_catalog,public,private as $$
begin
  delete from private.menu_order_push_jobs where created_at<now()-interval '7 days';
  update private.menu_order_push_jobs set state='expired',locked_until=null
  where state in ('pending','processing') and (created_at<now()-interval '15 minutes' or attempts>=5 and locked_until<now());
  return query
  with candidates as (
    select j.id from private.menu_order_push_jobs j
    join private.menu_order_push_devices d on d.id=j.device_id
    join public.menu_orders o on o.id=j.order_id and o.barbershop_id=d.barbershop_id and not o.is_test
    join public.profiles p on p.id=d.user_id and p.barbershop_id=d.barbershop_id
    join public.barbershops b on b.id=d.barbershop_id
    where j.state in ('pending','processing') and j.available_at<=now()
      and (j.locked_until is null or j.locked_until<now()) and j.attempts<5
      and d.active and d.vapid_key=supplied_vapid_key and p.active and p.role in ('owner','admin','employee')
      and b.active and b.deleted_at is null and private.business_product_is_active(b.id,'menu')
    order by j.id limit 20 for update of j skip locked
  ), claimed as (
    update private.menu_order_push_jobs j set state='processing',attempts=attempts+1,
      lease_token=gen_random_uuid(),locked_until=now()+interval '60 seconds'
    from candidates c where j.id=c.id returning j.*
  )
  select c.id,c.lease_token,d.endpoint,replace(c.order_id::text,'-','') from claimed c
  join private.menu_order_push_devices d on d.id=c.device_id;
end $$;
create function public.claim_menu_order_push_jobs(supplied_vapid_key text)
returns table(job_id bigint,lease uuid,endpoint text,topic text) language sql security invoker
set search_path=pg_catalog,private as $$ select * from private.claim_menu_order_push_jobs(supplied_vapid_key) $$;
create function private.finish_menu_order_push_job(target_job_id bigint,target_lease uuid,target_result text)
returns boolean language plpgsql security definer set search_path=pg_catalog,private as $$
declare job private.menu_order_push_jobs;
begin
  if target_result not in ('sent','retry','expired','failed') then raise exception 'Resultado inválido' using errcode='22023'; end if;
  select * into job from private.menu_order_push_jobs where id=target_job_id and lease_token=target_lease and state='processing' for update;
  if job.id is null then return false; end if;
  update private.menu_order_push_jobs set
    state=case when target_result='retry' then case when attempts>=5 then 'failed' else 'pending' end else target_result end,
    available_at=now()+make_interval(secs=>least(600,15*power(2,job.attempts))::int),
    locked_until=null,lease_token=null,result_code=target_result where id=job.id;
  if target_result='expired' then update private.menu_order_push_devices set active=false,updated_at=now() where id=job.device_id; end if;
  return true;
end $$;
create function public.finish_menu_order_push_job(target_job_id bigint,target_lease uuid,target_result text)
returns boolean language sql security invoker set search_path=pg_catalog,private as $$
  select private.finish_menu_order_push_job(target_job_id,target_lease,target_result)
$$;
revoke all on function private.claim_menu_order_push_jobs(text),public.claim_menu_order_push_jobs(text),
  private.finish_menu_order_push_job(bigint,uuid,text),public.finish_menu_order_push_job(bigint,uuid,text) from public,anon,authenticated;
grant execute on function private.claim_menu_order_push_jobs(text),public.claim_menu_order_push_jobs(text),
  private.finish_menu_order_push_job(bigint,uuid,text),public.finish_menu_order_push_job(bigint,uuid,text) to service_role;
grant usage on schema private to service_role;
