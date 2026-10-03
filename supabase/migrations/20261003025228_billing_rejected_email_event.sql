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
    if target_status='rejected' then
      insert into private.billing_outbox(signup_id,event_type,payload)
        values(target_signup_id,'payment_rejected_'||target_payment_id,jsonb_build_object('payment_id',target_payment_id))
        on conflict(signup_id,event_type) do update set payload=excluded.payload;
    end if;
    if target_status='subscription_cancelled' then update private.billing_signups set status='cancel_at_period_end',cancelled_at=now() where id=target_signup_id; end if;
  end if;
end $$;

revoke all on function public.backend_billing_webhook_apply(uuid,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.backend_billing_webhook_apply(uuid,text,text,timestamptz) to service_role;
