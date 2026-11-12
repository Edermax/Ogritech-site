-- Human-facing numbers are scoped to the business. Random references and tokens
-- remain the tracking credentials, so sequential numbers never authorize access.
lock table public.menu_orders in share row exclusive mode;
alter table public.menu_orders add column order_number bigint;
alter table public.menu_orders add column payment_received_at timestamptz;
alter table public.menu_orders add column payment_received_date_estimated boolean not null default false;
alter table public.menu_orders disable trigger menu_orders_set_updated_at;
with numbered as (
 select id,row_number() over(partition by barbershop_id order by created_at,id) number
 from public.menu_orders where not is_test
) update public.menu_orders o set order_number=n.number from numbered n where n.id=o.id;
-- Legacy payments have no recorded receipt timestamp: retain their order date.
update public.menu_orders set payment_received_at=created_at,payment_received_date_estimated=true where payment_status='paid';
alter table public.menu_orders enable trigger menu_orders_set_updated_at;
alter table public.menu_orders add constraint menu_orders_number_valid check(is_test or order_number>0);
create unique index menu_orders_business_number_key on public.menu_orders(barbershop_id,order_number);
create index menu_orders_paid_period_idx on public.menu_orders(barbershop_id,payment_received_at)
 where payment_status='paid' and not is_test;

create table private.menu_order_counters (
 barbershop_id uuid primary key references public.barbershops(id) on delete cascade,
 last_number bigint not null check(last_number>=0)
);
insert into private.menu_order_counters select barbershop_id,max(order_number) from public.menu_orders
 where not is_test group by barbershop_id;
alter table private.menu_order_counters enable row level security;
revoke all on private.menu_order_counters from public,anon,authenticated;
create function private.assign_menu_order_number() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.order_number is distinct from old.order_number or new.is_test is distinct from old.is_test
    or new.barbershop_id is distinct from old.barbershop_id then raise exception 'Order identity is immutable' using errcode='23514'; end if;
 else
  if new.is_test then new.order_number:=null;
  else
   insert into private.menu_order_counters(barbershop_id,last_number) values(new.barbershop_id,1)
   on conflict(barbershop_id) do update set last_number=private.menu_order_counters.last_number+1 returning last_number into new.order_number;
  end if;
 end if;
 if new.payment_status='paid' and (tg_op='INSERT' or old.payment_status is distinct from 'paid') then
  new.payment_received_at:=now(); new.payment_received_date_estimated:=false;
 end if;
 return new;
end $$;
create trigger assign_menu_order_number before insert or update on public.menu_orders for each row execute function private.assign_menu_order_number();

create function private.menu_order_display(response jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select response||coalesce((select jsonb_build_object('order_number',o.order_number,'order_code',case when o.is_test then 'TESTE' else '#'||o.order_number end)
 from public.menu_orders o where o.public_reference=response->>'reference'
  and o.public_token_hash=encode(extensions.digest(response->>'token','sha256'),'hex')),'{}'::jsonb)
$$;
create or replace function private.public_create_menu_order_v2(target_slug text,supplied_name text,supplied_email text,supplied_phone text,
 target_fulfillment_type text,supplied_address jsonb,supplied_notes text,supplied_items jsonb,accepted_privacy boolean,
 client_request_id uuid,requested_for timestamptz default null,website text default '') returns jsonb
language sql security definer set search_path='' as $$
 select private.menu_order_display(private.create_menu_order_core(target_slug,supplied_name,supplied_email,supplied_phone,target_fulfillment_type,
 supplied_address,supplied_notes,supplied_items,accepted_privacy,client_request_id,requested_for,website,false))
$$;
create or replace function private.public_create_menu_order(target_slug text,supplied_name text,supplied_email text,supplied_phone text,
 target_fulfillment_type text,supplied_address jsonb,supplied_notes text,supplied_items jsonb,accepted_privacy boolean,website text default '') returns jsonb
language sql security definer set search_path='' as $$
 select private.menu_order_display(private.create_menu_order_core(target_slug,supplied_name,supplied_email,supplied_phone,target_fulfillment_type,
 supplied_address,supplied_notes,supplied_items,accepted_privacy,gen_random_uuid(),null,website,false))
$$;
-- Keep the existing, token-protected tracking implementation and decorate it.
alter function private.public_get_menu_order(text,text) rename to get_menu_order_tracking_data;
create function private.public_get_menu_order(target_reference text,target_token text) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.get_menu_order_tracking_data(target_reference,target_token)||jsonb_build_object('order_number',o.order_number,'order_code',
  case when o.is_test then 'TESTE' else '#'||o.order_number end)
 from public.menu_orders o where o.public_reference=upper(trim(target_reference))
  and o.public_token_hash=encode(extensions.digest(target_token,'sha256'),'hex')
$$;
revoke all on function private.assign_menu_order_number(),private.menu_order_display(jsonb),private.public_get_menu_order(text,text) from public,anon,authenticated;
grant execute on function private.public_get_menu_order(text,text) to anon,authenticated;
create or replace function public.public_get_menu_order(target_reference text,target_token text) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.public_get_menu_order(target_reference,target_token) $$;

create table private.menu_order_operation_events (
 id bigint generated always as identity primary key,
 barbershop_id uuid not null references public.barbershops(id) on delete restrict,
 order_id uuid not null references public.menu_orders(id) on delete restrict,
 actor_id uuid references auth.users(id) on delete set null,
 old_status text not null,new_status text not null,old_payment_status text not null,new_payment_status text not null,
 reason text not null default '',created_at timestamptz not null default now()
);
create index menu_order_events_order_idx on private.menu_order_operation_events(barbershop_id,order_id,created_at desc);
create index menu_order_events_actor_idx on private.menu_order_operation_events(actor_id);
alter table private.menu_order_operation_events enable row level security;
revoke all on private.menu_order_operation_events from public,anon,authenticated;
create function private.audit_menu_order_operation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status is distinct from old.status or new.payment_status is distinct from old.payment_status then
  insert into private.menu_order_operation_events(barbershop_id,order_id,actor_id,old_status,new_status,old_payment_status,new_payment_status,reason)
  values(new.barbershop_id,new.id,auth.uid(),old.status,new.status,old.payment_status,new.payment_status,
   left(coalesce(current_setting('ogritech.order_revision_reason',true),''),300));
 end if;
 return new;
end $$;
create trigger audit_menu_order_operation after update on public.menu_orders for each row execute function private.audit_menu_order_operation();
revoke all on function private.audit_menu_order_operation() from public,anon,authenticated;

create function private.review_menu_order_decision(target_barbershop_id uuid,target_order_id uuid,decision text,expected_updated_at timestamptz,reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_order public.menu_orders;
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu')
  then raise exception 'Access denied' using errcode='42501'; end if;
 if coalesce(decision,'') not in ('confirmed','rejected') or length(trim(coalesce(reason,''))) not between 5 and 300
  then raise exception 'Invalid review' using errcode='22023'; end if;
 select * into current_order from public.menu_orders where id=target_order_id and barbershop_id=target_barbershop_id for update;
 if not found or current_order.is_test or current_order.status not in ('confirmed','rejected') then raise exception 'Order unavailable for review' using errcode='22023'; end if;
 if expected_updated_at is null or current_order.updated_at<>expected_updated_at then raise exception 'order_changed' using errcode='40001'; end if;
 if decision=current_order.status then raise exception 'Choose a different decision' using errcode='22023'; end if;
 perform set_config('ogritech.order_revision_reason',trim(reason),true);
 update public.menu_orders set status=decision,confirmed_at=case when decision='confirmed' then now() else confirmed_at end,
  cancelled_at=case when decision='rejected' then now() else null end where id=current_order.id;
 return jsonb_build_object('id',current_order.id,'status',decision,'payment_status',current_order.payment_status);
end $$;
create function public.review_menu_order_decision(target_barbershop_id uuid,target_order_id uuid,decision text,expected_updated_at timestamptz,reason text)
returns jsonb language sql security invoker set search_path='' as $$ select private.review_menu_order_decision(target_barbershop_id,target_order_id,decision,expected_updated_at,reason) $$;
revoke all on function public.review_menu_order_decision(uuid,uuid,text,timestamptz,text),private.review_menu_order_decision(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.review_menu_order_decision(uuid,uuid,text,timestamptz,text),private.review_menu_order_decision(uuid,uuid,text,timestamptz,text) to authenticated;

-- Receipts are private; only the authenticated server issues short-lived URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('menu-payment-receipts','menu-payment-receipts',false,5242880,array['image/jpeg','image/png','application/pdf']) on conflict(id) do nothing;
create table private.menu_order_receipts (
 id uuid primary key default gen_random_uuid(),barbershop_id uuid not null references public.barbershops(id) on delete restrict,
 order_id uuid not null references public.menu_orders(id) on delete restrict,
 object_path text not null unique,original_name text not null check(length(original_name) between 1 and 150),
 content_type text not null check(content_type in ('image/jpeg','image/png','application/pdf')),
 file_size integer not null check(file_size between 1 and 5242880),
 state text not null default 'reserved' check(state in ('reserved','verified','attached','deleted')),
 created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),
 verified_at timestamptz,attached_at timestamptz,expires_at timestamptz not null default now()+interval '2 hours',
 cleanup_claimed_at timestamptz,cleanup_completed_at timestamptz,cleanup_attempts integer not null default 0,
 unique(id,barbershop_id,order_id)
);
create index menu_order_receipts_order_idx on private.menu_order_receipts(barbershop_id,order_id);
create index menu_order_receipts_creator_idx on private.menu_order_receipts(created_by);
create index menu_order_receipts_expiry_idx on private.menu_order_receipts(state,expires_at);
alter table private.menu_order_receipts enable row level security;
revoke all on private.menu_order_receipts from public,anon,authenticated;
alter table public.menu_orders add column payment_receipt_id uuid;
alter table public.menu_orders add constraint menu_order_receipt_same_order foreign key(payment_receipt_id,barbershop_id,id)
 references private.menu_order_receipts(id,barbershop_id,order_id) on delete restrict;
create index menu_orders_receipt_idx on public.menu_orders(payment_receipt_id) where payment_receipt_id is not null;

create function private.menu_order_receipt_access(target_barbershop_id uuid,target_order_id uuid,operation text,receipt_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_order public.menu_orders; receipt private.menu_order_receipts; receipt_id uuid:=gen_random_uuid(); extension text;
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu')
  then raise exception 'Access denied' using errcode='42501'; end if;
 select * into current_order from public.menu_orders where id=target_order_id and barbershop_id=target_barbershop_id for update;
 if not found or current_order.is_test then raise exception 'Order unavailable' using errcode='22023'; end if;
 if operation='reserve' then
  if current_order.payment_status<>'pending' or current_order.status in ('rejected','cancelled') then raise exception 'Payment unavailable' using errcode='22023'; end if;
  if (select count(*) from private.menu_order_receipts where order_id=target_order_id and state in ('reserved','verified') and expires_at>now())>=3
   then raise exception 'upload_limit' using errcode='23514'; end if;
  extension:=case receipt_payload->>'content_type' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'application/pdf' then 'pdf' end;
  if extension is null then raise exception 'Invalid file type' using errcode='22023'; end if;
  insert into private.menu_order_receipts(id,barbershop_id,order_id,object_path,original_name,content_type,file_size,created_by)
  values(receipt_id,target_barbershop_id,target_order_id,target_barbershop_id||'/'||target_order_id||'/'||receipt_id||'.'||extension,
    left(receipt_payload->>'original_name',150),receipt_payload->>'content_type',(receipt_payload->>'file_size')::integer,auth.uid()) returning * into receipt;
 elsif operation in ('pending','cancel') then
  select * into receipt from private.menu_order_receipts where id=(receipt_payload->>'receipt_id')::uuid and order_id=target_order_id
    and barbershop_id=target_barbershop_id and state in ('reserved','verified') for update;
  if operation='cancel' and receipt.id is not null then
   update private.menu_order_receipts set state='deleted' where id=receipt.id;
  end if;
 elsif operation='read' then
  select * into receipt from private.menu_order_receipts where id=current_order.payment_receipt_id and state='attached';
 else raise exception 'Invalid receipt operation' using errcode='22023'; end if;
 if receipt.id is null then raise exception 'Receipt unavailable' using errcode='22023'; end if;
 return to_jsonb(receipt);
end $$;
create function public.menu_order_receipt_access(target_barbershop_id uuid,target_order_id uuid,operation text,receipt_payload jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$ select private.menu_order_receipt_access(target_barbershop_id,target_order_id,operation,receipt_payload) $$;
revoke all on function public.menu_order_receipt_access(uuid,uuid,text,jsonb),private.menu_order_receipt_access(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.menu_order_receipt_access(uuid,uuid,text,jsonb),private.menu_order_receipt_access(uuid,uuid,text,jsonb) to authenticated;

create function public.backend_menu_receipt_state(target_receipt_id uuid,operation text,actual_size integer default null,actual_type text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if operation='verify' then
  update private.menu_order_receipts set state='verified',verified_at=now() where id=target_receipt_id and state='reserved' and expires_at>now()
   and file_size=actual_size and content_type=actual_type;
 elsif operation='delete' then
  update private.menu_order_receipts set state='deleted',cleanup_completed_at=case when expires_at<now()-interval '1 day' then now() else null end
   where id=target_receipt_id and state in ('reserved','verified','deleted');
 else raise exception 'Invalid receipt state' using errcode='22023'; end if;
 if not found then raise exception 'Receipt unavailable' using errcode='22023'; end if;
end $$;
revoke all on function public.backend_menu_receipt_state(uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.backend_menu_receipt_state(uuid,text,integer,text) to service_role;
create function public.backend_menu_receipt_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with candidates as (
  select id from private.menu_order_receipts where state in ('reserved','verified','deleted') and expires_at<now()-interval '1 day'
   and cleanup_completed_at is null and cleanup_attempts<10 and (cleanup_claimed_at is null or cleanup_claimed_at<now()-interval '15 minutes')
   order by expires_at limit 50 for update skip locked
 ), claimed as (
  update private.menu_order_receipts r set state='deleted',cleanup_claimed_at=now(),cleanup_attempts=cleanup_attempts+1
   from candidates c where r.id=c.id returning r.id,r.object_path
 ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
revoke all on function public.backend_menu_receipt_cleanup() from public,anon,authenticated;
grant execute on function public.backend_menu_receipt_cleanup() to service_role;

create function private.record_menu_order_payment(target_barbershop_id uuid,target_order_id uuid,expected_updated_at timestamptz,receipt_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare current_order public.menu_orders;
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id) or not private.business_has_product_access(target_barbershop_id,'menu')
  then raise exception 'Access denied' using errcode='42501'; end if;
 select * into current_order from public.menu_orders where id=target_order_id and barbershop_id=target_barbershop_id for update;
 if not found or current_order.is_test or current_order.payment_status<>'pending' or current_order.status in ('rejected','cancelled')
  then raise exception 'Payment unavailable' using errcode='22023'; end if;
 if expected_updated_at is null or current_order.updated_at<>expected_updated_at then raise exception 'order_changed' using errcode='40001'; end if;
 if receipt_id is not null then
  update private.menu_order_receipts set state='attached',attached_at=now() where id=receipt_id and order_id=target_order_id
   and barbershop_id=target_barbershop_id and state='verified' and expires_at>now();
  if not found then raise exception 'Receipt unavailable' using errcode='22023'; end if;
 end if;
 update public.menu_orders set payment_status='paid',payment_receipt_id=receipt_id where id=current_order.id;
 return jsonb_build_object('id',current_order.id,'payment_status','paid','has_receipt',receipt_id is not null);
end $$;
create function public.record_menu_order_payment(target_barbershop_id uuid,target_order_id uuid,expected_updated_at timestamptz,receipt_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.record_menu_order_payment(target_barbershop_id,target_order_id,expected_updated_at,receipt_id) $$;
revoke all on function public.record_menu_order_payment(uuid,uuid,timestamptz,uuid),private.record_menu_order_payment(uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.record_menu_order_payment(uuid,uuid,timestamptz,uuid),private.record_menu_order_payment(uuid,uuid,timestamptz,uuid) to authenticated;
-- Business mutations use the checked RPCs; direct writes cannot forge numbers or receipts.
revoke insert,update,delete on public.menu_orders from anon,authenticated;

create function private.wake_menu_receipt_cleanup() returns void language plpgsql security definer set search_path='' as $$
declare worker_url text; worker_secret text;
begin
 if not exists(select 1 from private.menu_order_receipts where state in ('reserved','verified','deleted') and expires_at<now()-interval '1 day'
   and cleanup_completed_at is null and cleanup_attempts<10) then return; end if;
 if to_regclass('vault.decrypted_secrets') is null then return; end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_url using 'menu_order_push_dispatch_url';
 execute 'select decrypted_secret from vault.decrypted_secrets where name=$1 limit 1' into worker_secret using 'menu_order_push_dispatch_secret';
 if worker_url is null or worker_secret is null or worker_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/menu-order-push-dispatch$' then return; end if;
 execute 'select net.http_post(url:=$1,headers:=$2,body:=$3,timeout_milliseconds:=10000)' using
  regexp_replace(worker_url,'/menu-order-push-dispatch$','/menu-receipt-cleanup'),
  jsonb_build_object('Content-Type','application/json','x-menu-receipts-secret',worker_secret),'{}'::jsonb;
exception when others then raise log 'menu_receipt_cleanup_wakeup_failed';
end $$;
revoke all on function private.wake_menu_receipt_cleanup() from public,anon,authenticated;
select cron.schedule('ogritech-menu-receipt-cleanup','15 * * * *','select private.wake_menu_receipt_cleanup();');
