-- Ponte mínima e restrita para Edge Functions operarem o faturamento privado
-- sem expor o schema private na Data API.

create function public.backend_billing_signup_create(payload jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$
declare result_id uuid;
begin
  insert into private.billing_signups(
    product_code,tax_document,business_name,responsible_name,email,phone,segment,
    cycle,payment_method,base_monthly_cents,cycle_months,discount_bps,total_cents,
    terms_version,management_token_hash,trial_ends_at
  ) values(
    payload->>'product_code',payload->>'tax_document',payload->>'business_name',payload->>'responsible_name',
    payload->>'email',payload->>'phone',payload->>'segment',payload->>'cycle',payload->>'payment_method',
    (payload->>'base_monthly_cents')::integer,(payload->>'cycle_months')::integer,
    (payload->>'discount_bps')::integer,(payload->>'total_cents')::integer,
    payload->>'terms_version',payload->>'management_token_hash',(payload->>'trial_ends_at')::timestamptz
  ) returning id into result_id;
  return result_id;
end;
$$;

create function public.backend_billing_signup_link(
  target_signup_id uuid,target_barbershop_id uuid,target_saas_client_id uuid
) returns void language sql security definer set search_path=''
as $$ update private.billing_signups set barbershop_id=target_barbershop_id,saas_client_id=target_saas_client_id where id=target_signup_id $$;

create function public.backend_billing_accept_terms(payload jsonb)
returns void language sql security definer set search_path=''
as $$
  insert into private.billing_term_acceptances(signup_id,terms_version,terms_sha256,recurring_authorized,privacy_accepted,ip_address,user_agent)
  values((payload->>'signup_id')::uuid,payload->>'terms_version',payload->>'terms_sha256',
    coalesce((payload->>'recurring_authorized')::boolean,false),true,nullif(payload->>'ip_address','')::inet,coalesce(payload->>'user_agent',''))
$$;

create function public.backend_billing_enqueue(target_signup_id uuid,target_event_type text,target_payload jsonb)
returns void language sql security definer set search_path=''
as $$ insert into private.billing_outbox(signup_id,event_type,payload) values(target_signup_id,target_event_type,target_payload) $$;

create function public.backend_billing_signup_provider_update(target_signup_id uuid,target_plan_id text,target_subscription_id text)
returns void language sql security definer set search_path=''
as $$ update private.billing_signups set provider_plan_id=target_plan_id,provider_subscription_id=nullif(target_subscription_id,'') where id=target_signup_id $$;

create function public.backend_billing_signup_delete(target_signup_id uuid)
returns void language sql security definer set search_path=''
as $$ delete from private.billing_signups where id=target_signup_id $$;

create function public.backend_billing_store_ready()
returns boolean language sql stable security definer set search_path=''
as $$ select to_regclass('private.billing_signups') is not null $$;

revoke all on function public.backend_billing_signup_create(jsonb),
  public.backend_billing_signup_link(uuid,uuid,uuid),public.backend_billing_accept_terms(jsonb),
  public.backend_billing_enqueue(uuid,text,jsonb),public.backend_billing_signup_provider_update(uuid,text,text),
  public.backend_billing_signup_delete(uuid),public.backend_billing_store_ready() from public,anon,authenticated;
grant execute on function public.backend_billing_signup_create(jsonb),
  public.backend_billing_signup_link(uuid,uuid,uuid),public.backend_billing_accept_terms(jsonb),
  public.backend_billing_enqueue(uuid,text,jsonb),public.backend_billing_signup_provider_update(uuid,text,text),
  public.backend_billing_signup_delete(uuid),public.backend_billing_store_ready() to service_role;
