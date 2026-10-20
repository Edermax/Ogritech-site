-- Payment state and product entitlement must move together. No existing data is rewritten.
-- The billing backend uses service credentials, with no new client grants.
grant select on public.platform_products,public.saas_plans to service_role;
grant select,insert,update on public.billing_customers,public.platform_subscriptions to service_role;
grant select,insert,update on public.platform_billing_events to service_role;
grant insert on public.platform_billing_audit_log to service_role;

alter table private.billing_signups drop constraint billing_signups_discount_bps_check;
alter table private.billing_signups add constraint billing_signups_discount_bps_check check (
  discount_bps in (0,300,500,1000) or
  (product_code='menu' and cycle='annual' and cycle_months=12 and discount_bps=1667 and total_cents=49900)
);
create or replace function private.sync_menu_billing_access(target_signup_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare signup private.billing_signups;
begin
  select * into strict signup from private.billing_signups where id=target_signup_id;
  if signup.product_code<>'menu' then return; end if;
  update public.platform_subscriptions subscription set
    status=case
      when signup.status='cancelled' then 'cancelled'
      when signup.status in ('past_due','failed') then 'suspended'
      when signup.access_until>now() then 'active'
      when signup.trial_ends_at>now() then 'trial'
      else 'suspended' end,
    current_period_end=coalesce(signup.access_until,signup.trial_ends_at),
    next_billing_on=coalesce(signup.access_until,signup.trial_ends_at)::date,
    cancel_at_period_end=signup.status='cancel_at_period_end',
    cancelled_at=case when signup.status='cancelled' then coalesce(signup.cancelled_at,now()) else null end
  from public.billing_customers customer,public.platform_products product
  where subscription.billing_customer_id=customer.id and customer.saas_client_id=signup.saas_client_id
    and subscription.product_id=product.id and product.code='menu'
    and subscription.status<>'cancelled';
  -- Do not suspend the business or other products when just Cardápio expires.
end $$;
revoke all on function private.sync_menu_billing_access(uuid) from public,anon,authenticated;
grant execute on function private.sync_menu_billing_access(uuid) to service_role;

create or replace function public.backend_billing_lifecycle_pix_due(target_cutoff timestamptz)
returns jsonb language sql stable security definer set search_path=''
as $$ select coalesce(jsonb_agg(to_jsonb(signup)),'[]'::jsonb)
  from (select * from private.billing_signups where payment_method='pix'
    and status in ('trial_active','active','past_due') and payment_requested_at is null
    and coalesce(access_until,trial_ends_at)<=target_cutoff
    order by coalesce(access_until,trial_ends_at) limit 100) signup $$;

create or replace function public.backend_billing_lifecycle_record_pix(target_signup_id uuid,payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$
declare signup private.billing_signups;
begin
  select * into strict signup from private.billing_signups where id=target_signup_id for update;
  if signup.status not in ('trial_active','active','past_due') or signup.payment_requested_at is not null then return; end if;
  if (payload->>'amount_cents')::integer<>signup.total_cents then raise exception 'Payment amount mismatch' using errcode='22023'; end if;
  insert into private.billing_payment_intents(signup_id,purpose,amount_cents,provider_payment_id,external_reference,expires_at)
  values(target_signup_id,payload->>'purpose',signup.total_cents,payload->>'provider_payment_id',payload->>'external_reference',(payload->>'expires_at')::timestamptz)
  on conflict(provider_payment_id) do nothing;
  update private.billing_signups set provider_payment_id=payload->>'provider_payment_id',payment_requested_at=now(),status='payment_pending' where id=target_signup_id;
  insert into private.billing_outbox(signup_id,event_type,payload)
  values(target_signup_id,'pix_requested_'||(payload->>'provider_payment_id'),jsonb_build_object('qr_code',payload->>'qr_code','expires_at',payload->>'expires_at'))
  on conflict(signup_id,event_type) do nothing;
end $$;

create or replace function public.backend_billing_lifecycle_suspend(target_signup_id uuid,target_cancelled boolean,target_boundary timestamptz)
returns void language plpgsql security definer set search_path=''
as $$
declare signup private.billing_signups;
begin
  select * into strict signup from private.billing_signups where id=target_signup_id for update;
  -- A payment may have arrived since the worker selected this signup.
  if coalesce(signup.access_until,signup.trial_ends_at)>now()
    or coalesce(signup.access_until,signup.trial_ends_at)<>target_boundary
    or signup.status not in ('trial_active','payment_pending','active','cancel_at_period_end') then return; end if;
  update private.billing_signups set status=case when signup.status='cancel_at_period_end' then 'cancelled' else 'past_due' end,suspended_at=now()
    where id=target_signup_id;
  if signup.product_code='menu' then perform private.sync_menu_billing_access(signup.id);
  elsif signup.barbershop_id is not null then perform private.billing_set_business_access(signup.barbershop_id,false); end if;
  insert into private.billing_outbox(signup_id,event_type,payload)
  values(target_signup_id,case when signup.status='cancel_at_period_end' then 'cancellation_effective' else 'access_suspended' end,jsonb_build_object('access_until',target_boundary))
  on conflict(signup_id,event_type) do nothing;
end $$;

create or replace function public.backend_billing_webhook_apply(target_signup_id uuid,target_payment_id text,target_status text,target_access_until timestamptz default null)
returns void language plpgsql security definer set search_path=''
as $$
declare signup private.billing_signups; period_start timestamptz; period_end timestamptz; intent private.billing_payment_intents;
begin
  select * into strict signup from private.billing_signups where id=target_signup_id for update;
  select * into intent from private.billing_payment_intents where provider_payment_id=target_payment_id;
  if intent.id is not null and intent.signup_id<>signup.id then raise exception 'Payment belongs to another signup' using errcode='22023'; end if;
  if target_status='approved' then
    -- Different notification IDs for the same payment must not extend access twice.
    if intent.status in ('approved','refunded') then return; end if;
    if signup.product_code='menu' then
      period_start=greatest(now(),signup.trial_ends_at,signup.access_until);
      period_end=period_start+make_interval(months=>signup.cycle_months);
    else period_end=target_access_until; end if;
    insert into private.billing_payment_intents(signup_id,purpose,amount_cents,provider_payment_id,external_reference,status,paid_at)
    values(signup.id,case when signup.access_until is null then 'initial' else 'renewal' end,signup.total_cents,target_payment_id,'webhook:'||target_payment_id,'approved',now())
    on conflict(provider_payment_id) do update set status='approved',paid_at=now();
    update private.billing_signups set status='active',access_until=period_end,payment_requested_at=null,suspended_at=null,provider_payment_id=target_payment_id
      where id=signup.id;
    if signup.product_code='menu' then perform private.sync_menu_billing_access(signup.id);
    elsif signup.barbershop_id is not null then perform private.billing_set_business_access(signup.barbershop_id,true); end if;
    insert into private.billing_outbox(signup_id,event_type,payload)
      values(signup.id,'payment_approved_'||target_payment_id,jsonb_build_object('payment_id',target_payment_id))
      on conflict(signup_id,event_type) do nothing;
  elsif target_status='subscription_cancelled' then
    update private.billing_signups set status='cancel_at_period_end',cancelled_at=now() where id=signup.id;
    if signup.product_code='menu' then perform private.sync_menu_billing_access(signup.id); end if;
  elsif target_status in ('rejected','cancelled','refunded','charged_back') then
    -- A delayed rejection cannot undo an already approved payment.
    if target_status in ('rejected','cancelled') and intent.status in ('approved','refunded') then return; end if;
    update private.billing_payment_intents set status=case when target_status in ('refunded','charged_back') then 'refunded' when target_status='rejected' then 'rejected' else 'cancelled' end
      where provider_payment_id=target_payment_id;
    if signup.product_code='menu' and signup.provider_payment_id=target_payment_id then
      update private.billing_signups set
        status=case when target_status in ('refunded','charged_back') then 'past_due'
          when access_until>now() then 'active' when trial_ends_at>now() then 'trial_active' else 'past_due' end,
        access_until=case when target_status in ('refunded','charged_back') then now() else access_until end,
        payment_requested_at=null
      where id=signup.id and status not in ('cancelled','cancel_at_period_end');
      perform private.sync_menu_billing_access(signup.id);
    end if;
    if target_status='rejected' then
      insert into private.billing_outbox(signup_id,event_type,payload)
        values(signup.id,'payment_rejected_'||target_payment_id,jsonb_build_object('payment_id',target_payment_id))
        on conflict(signup_id,event_type) do nothing;
    end if;
  else raise exception 'Unsupported payment status' using errcode='22023'; end if;
end $$;

revoke all on function public.backend_billing_lifecycle_pix_due(timestamptz),public.backend_billing_lifecycle_record_pix(uuid,jsonb),
  public.backend_billing_lifecycle_suspend(uuid,boolean,timestamptz),public.backend_billing_webhook_apply(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.backend_billing_lifecycle_pix_due(timestamptz),public.backend_billing_lifecycle_record_pix(uuid,jsonb),
  public.backend_billing_lifecycle_suspend(uuid,boolean,timestamptz),public.backend_billing_webhook_apply(uuid,text,text,timestamptz) to service_role;
notify pgrst,'reload schema';
