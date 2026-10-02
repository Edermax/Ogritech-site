-- Explicit service-role RPCs keep private billing tables outside the Data API.
create or replace function public.backend_billing_status(target_barbershop_id uuid, target_product_code text)
returns jsonb language sql stable security definer set search_path=''
as $$
  select case when signup.id is null then null else to_jsonb(signup) || jsonb_build_object(
    'pix_payload', (
      select outbox.payload from private.billing_outbox outbox
      where outbox.signup_id=signup.id and outbox.event_type like 'pix_requested_%'
      order by outbox.created_at desc limit 1
    )
  ) end
  from (select signup.* from private.billing_signups signup
    where signup.barbershop_id=target_barbershop_id and signup.product_code=target_product_code limit 1) signup
$$;

create or replace function public.backend_billing_choose_payment_lookup(target_barbershop_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$ select to_jsonb(signup) from private.billing_signups signup
  where signup.barbershop_id=target_barbershop_id and signup.product_code='menu'
    and signup.status in ('trial_active','payment_pending','past_due') limit 1 $$;

create or replace function public.backend_billing_choose_payment_update(target_signup_id uuid, payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$ begin
  update private.billing_signups set
    cycle=payload->>'cycle', payment_method=payload->>'payment_method',
    base_monthly_cents=(payload->>'base_monthly_cents')::integer,
    cycle_months=(payload->>'cycle_months')::integer,
    discount_bps=(payload->>'discount_bps')::integer,
    total_cents=(payload->>'total_cents')::integer,
    provider_plan_id=nullif(payload->>'provider_plan_id',''),
    provider_subscription_id=nullif(payload->>'provider_subscription_id',''),
    status=payload->>'status'
  where id=target_signup_id;
  update private.billing_term_acceptances
    set recurring_authorized=coalesce((payload->>'recurring_authorized')::boolean,false)
    where signup_id=target_signup_id;
end $$;

create or replace function public.backend_billing_lifecycle_pix_due(target_cutoff timestamptz)
returns jsonb language sql stable security definer set search_path=''
as $$ select coalesce(jsonb_agg(to_jsonb(signup)),'[]'::jsonb)
  from (select * from private.billing_signups where payment_method='pix'
    and status in ('trial_active','active') and payment_requested_at is null
    and trial_ends_at<=target_cutoff order by trial_ends_at limit 100) signup $$;

create or replace function public.backend_billing_lifecycle_record_pix(target_signup_id uuid, payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$ begin
  insert into private.billing_payment_intents(signup_id,purpose,amount_cents,provider_payment_id,external_reference,expires_at)
  values(target_signup_id,payload->>'purpose',(payload->>'amount_cents')::integer,payload->>'provider_payment_id',payload->>'external_reference',(payload->>'expires_at')::timestamptz);
  update private.billing_signups set provider_payment_id=payload->>'provider_payment_id',payment_requested_at=now(),status='payment_pending' where id=target_signup_id;
  insert into private.billing_outbox(signup_id,event_type,payload)
  values(target_signup_id,'pix_requested_'||(payload->>'provider_payment_id'),jsonb_build_object('qr_code',payload->>'qr_code','expires_at',payload->>'expires_at'))
  on conflict(signup_id,event_type) do update set payload=excluded.payload;
end $$;

create or replace function public.backend_billing_lifecycle_expired()
returns jsonb language sql stable security definer set search_path=''
as $$ select coalesce(jsonb_agg(to_jsonb(signup)),'[]'::jsonb)
  from (select * from private.billing_signups where status in ('trial_active','payment_pending','active','cancel_at_period_end')
    and coalesce(access_until,trial_ends_at)<=now() limit 500) signup $$;

create or replace function public.backend_billing_lifecycle_suspend(target_signup_id uuid, target_cancelled boolean, target_boundary timestamptz)
returns void language plpgsql security definer set search_path=''
as $$ declare business_id uuid; begin
  update private.billing_signups set status=case when target_cancelled then 'cancelled' else 'past_due' end,suspended_at=now()
    where id=target_signup_id returning barbershop_id into business_id;
  if business_id is not null then perform private.billing_set_business_access(business_id,false); end if;
  insert into private.billing_outbox(signup_id,event_type,payload)
  values(target_signup_id,case when target_cancelled then 'cancellation_effective' else 'access_suspended' end,jsonb_build_object('access_until',target_boundary))
  on conflict(signup_id,event_type) do update set payload=excluded.payload;
end $$;

create or replace function public.backend_billing_webhook_lookup(target_signup_id uuid, target_subscription_id text, target_payment_id text)
returns jsonb language sql stable security definer set search_path=''
as $$ select to_jsonb(signup) from private.billing_signups signup where
  (target_signup_id is not null and signup.id=target_signup_id) or
  (target_signup_id is null and nullif(target_subscription_id,'') is not null and signup.provider_subscription_id=target_subscription_id) or
  (target_signup_id is null and nullif(target_subscription_id,'') is null and signup.provider_payment_id=target_payment_id)
  limit 1 $$;

create or replace function public.backend_billing_webhook_apply(target_signup_id uuid, target_payment_id text, target_status text, target_access_until timestamptz default null)
returns void language plpgsql security definer set search_path=''
as $$ declare business_id uuid; begin
  if target_status='approved' then
    update private.billing_signups set status='active',access_until=target_access_until,payment_requested_at=null,suspended_at=null
      where id=target_signup_id returning barbershop_id into business_id;
    update private.billing_payment_intents set status='approved',paid_at=now() where provider_payment_id=target_payment_id;
    if business_id is not null then perform private.billing_set_business_access(business_id,true); end if;
    insert into private.billing_outbox(signup_id,event_type,payload)
      values(target_signup_id,'payment_approved_'||target_payment_id,jsonb_build_object('payment_id',target_payment_id))
      on conflict(signup_id,event_type) do update set payload=excluded.payload;
  else
    update private.billing_payment_intents set status=case when target_status='rejected' then 'rejected' else 'cancelled' end where provider_payment_id=target_payment_id;
    if target_status='subscription_cancelled' then update private.billing_signups set status='cancel_at_period_end',cancelled_at=now() where id=target_signup_id; end if;
  end if;
end $$;

revoke all on function public.backend_billing_status(uuid,text),public.backend_billing_choose_payment_lookup(uuid),
  public.backend_billing_choose_payment_update(uuid,jsonb),public.backend_billing_lifecycle_pix_due(timestamptz),
  public.backend_billing_lifecycle_record_pix(uuid,jsonb),public.backend_billing_lifecycle_expired(),
  public.backend_billing_lifecycle_suspend(uuid,boolean,timestamptz),public.backend_billing_webhook_lookup(uuid,text,text),
  public.backend_billing_webhook_apply(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.backend_billing_status(uuid,text),public.backend_billing_choose_payment_lookup(uuid),
  public.backend_billing_choose_payment_update(uuid,jsonb),public.backend_billing_lifecycle_pix_due(timestamptz),
  public.backend_billing_lifecycle_record_pix(uuid,jsonb),public.backend_billing_lifecycle_expired(),
  public.backend_billing_lifecycle_suspend(uuid,boolean,timestamptz),public.backend_billing_webhook_lookup(uuid,text,text),
  public.backend_billing_webhook_apply(uuid,text,text,timestamptz) to service_role;
notify pgrst, 'reload schema';
