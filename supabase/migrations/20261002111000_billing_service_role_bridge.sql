-- Data API bridge restricted to service_role. The private schema remains unexposed.
create or replace view public.backend_billing_signups
with (security_invoker = true) as select * from private.billing_signups;
create or replace view public.backend_billing_payment_intents
with (security_invoker = true) as select * from private.billing_payment_intents;
create or replace view public.backend_billing_outbox
with (security_invoker = true) as select * from private.billing_outbox;
create or replace view public.backend_billing_term_acceptances
with (security_invoker = true) as select * from private.billing_term_acceptances;

revoke all on public.backend_billing_signups, public.backend_billing_payment_intents,
  public.backend_billing_outbox, public.backend_billing_term_acceptances
  from public, anon, authenticated;
grant select, insert, update, delete on public.backend_billing_signups,
  public.backend_billing_payment_intents, public.backend_billing_outbox,
  public.backend_billing_term_acceptances to service_role;

create or replace function public.backend_billing_set_business_access(
  target_barbershop_id uuid, enabled boolean
) returns void language sql security definer set search_path=''
as $$ select private.billing_set_business_access(target_barbershop_id, enabled) $$;

create or replace function public.backend_billing_enqueue_once(
  target_signup_id uuid, target_event_type text, target_payload jsonb
) returns void language sql security definer set search_path=''
as $$
  insert into private.billing_outbox(signup_id,event_type,payload)
  values(target_signup_id,target_event_type,target_payload)
  on conflict(signup_id,event_type) do update set payload=excluded.payload
$$;

revoke all on function public.backend_billing_set_business_access(uuid,boolean),
  public.backend_billing_enqueue_once(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.backend_billing_set_business_access(uuid,boolean),
  public.backend_billing_enqueue_once(uuid,text,jsonb) to service_role;
