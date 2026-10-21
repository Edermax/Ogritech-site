-- Expired Pix attempts remain in history, but cannot block the next payment forever.
create function private.billing_pix_can_replace(target_signup_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from private.billing_signups s where s.id=target_signup_id
  and s.payment_method='pix' and s.product_code='menu'
  and s.status in ('trial_active','active','past_due','payment_pending')
  and (s.payment_requested_at is null or exists(
    select 1 from private.billing_payment_intents i where i.signup_id=s.id
      and i.provider_payment_id=s.provider_payment_id and i.status not in ('approved','refunded')
      and (i.status in ('expired','rejected','cancelled') or i.expires_at<=now())
  ))) $$;
revoke all on function private.billing_pix_can_replace(uuid) from public,anon,authenticated;

create table private.billing_pix_requests (
  signup_id uuid primary key references private.billing_signups(id) on delete cascade,
  request_id uuid not null default gen_random_uuid(),
  boundary timestamptz not null,
  previous_payment_id text,
  amount_cents integer not null,
  external_reference text not null,
  expires_at timestamptz not null
);
alter table private.billing_pix_requests enable row level security;
revoke all on table private.billing_pix_requests from public,anon,authenticated;

create function public.backend_billing_lifecycle_prepare_pix(target_signup_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare signup private.billing_signups; attempt private.billing_pix_requests; boundary timestamptz; request_id uuid;
begin
  select * into strict signup from private.billing_signups where id=target_signup_id for update;
  boundary:=coalesce(signup.access_until,signup.trial_ends_at);
  if not private.billing_pix_can_replace(signup.id) or boundary>now()+interval '48 hours' then return null; end if;
  select * into attempt from private.billing_pix_requests where signup_id=signup.id;
  if attempt.signup_id is null or attempt.boundary<>boundary or attempt.amount_cents<>signup.total_cents
    or attempt.previous_payment_id is distinct from signup.provider_payment_id or attempt.expires_at<=now()+interval '30 minutes' then
    request_id:=gen_random_uuid();
    insert into private.billing_pix_requests(signup_id,request_id,boundary,previous_payment_id,amount_cents,external_reference,expires_at)
    values(signup.id,request_id,boundary,signup.provider_payment_id,signup.total_cents,'signup:'||signup.id||':pix:'||request_id,date_trunc('second',now())+interval '72 hours')
    on conflict(signup_id) do update set request_id=excluded.request_id,boundary=excluded.boundary,
      previous_payment_id=excluded.previous_payment_id,amount_cents=excluded.amount_cents,
      external_reference=excluded.external_reference,expires_at=excluded.expires_at
    returning * into attempt;
  end if;
  return to_jsonb(attempt);
end $$;
revoke all on function public.backend_billing_lifecycle_prepare_pix(uuid) from public,anon,authenticated;
grant execute on function public.backend_billing_lifecycle_prepare_pix(uuid) to service_role;

create or replace function public.backend_billing_lifecycle_pix_due(target_cutoff timestamptz)
returns jsonb language sql stable security definer set search_path=''
as $$ select coalesce(jsonb_agg(to_jsonb(signup)),'[]'::jsonb) from (
  select s.* from private.billing_signups s where private.billing_pix_can_replace(s.id)
    and coalesce(s.access_until,s.trial_ends_at)<=target_cutoff
  order by coalesce(s.access_until,s.trial_ends_at) limit 100
) signup $$;

create or replace function public.backend_billing_lifecycle_record_pix(target_signup_id uuid,payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$ declare signup private.billing_signups; expiry timestamptz; attempt private.billing_pix_requests;
begin
  select * into strict signup from private.billing_signups where id=target_signup_id for update;
  if not private.billing_pix_can_replace(signup.id) then return; end if;
  if coalesce((payload->>'amount_cents')::integer,0)<>signup.total_cents
    or coalesce(payload->>'provider_payment_id','')!~'^[a-zA-Z0-9_-]{1,128}$'
    or length(coalesce(payload->>'qr_code','')) not between 1 and 4096
    or coalesce(payload->>'purpose','') not in ('initial','renewal')
    or length(coalesce(payload->>'external_reference','')) not between 1 and 256
    then raise exception 'Invalid Pix payment' using errcode='22023'; end if;
  expiry:=(payload->>'expires_at')::timestamptz;
  if expiry is null or expiry<=now() or expiry>now()+interval '30 days' then
    raise exception 'Invalid Pix expiration' using errcode='22023'; end if;
  select * into attempt from private.billing_pix_requests where signup_id=signup.id;
  if attempt.signup_id is not null and (attempt.boundary<>coalesce(signup.access_until,signup.trial_ends_at)
    or attempt.amount_cents<>signup.total_cents or attempt.previous_payment_id is distinct from signup.provider_payment_id
    or attempt.external_reference<>payload->>'external_reference' or attempt.expires_at<>expiry) then
    raise exception 'Pix request changed' using errcode='40001'; end if;
  insert into private.billing_payment_intents(signup_id,purpose,amount_cents,provider_payment_id,external_reference,expires_at)
  values(signup.id,payload->>'purpose',signup.total_cents,payload->>'provider_payment_id',payload->>'external_reference',expiry);
  update private.billing_signups set provider_payment_id=payload->>'provider_payment_id',payment_requested_at=now(),status='payment_pending' where id=signup.id;
  insert into private.billing_outbox(signup_id,event_type,payload)
  values(signup.id,'pix_requested_'||(payload->>'provider_payment_id'),jsonb_build_object('qr_code',payload->>'qr_code','expires_at',expiry));
end $$;
revoke all on function public.backend_billing_lifecycle_pix_due(timestamptz),public.backend_billing_lifecycle_record_pix(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.backend_billing_lifecycle_pix_due(timestamptz),public.backend_billing_lifecycle_record_pix(uuid,jsonb) to service_role;

-- Match the QR to the current payment, including when two attempts share a timestamp.
create or replace function public.backend_billing_status(target_barbershop_id uuid,target_product_code text)
returns jsonb language sql stable security definer set search_path=''
as $$ select to_jsonb(signup)||jsonb_build_object('pix_payload',case when signup.payment_method='pix' then (
  select o.payload from private.billing_outbox o where o.signup_id=signup.id
    and o.event_type='pix_requested_'||signup.provider_payment_id limit 1
) else null end) from private.billing_signups signup
where signup.barbershop_id=target_barbershop_id and signup.product_code=target_product_code limit 1 $$;
revoke all on function public.backend_billing_status(uuid,text) from public,anon,authenticated;
grant execute on function public.backend_billing_status(uuid,text) to service_role;
