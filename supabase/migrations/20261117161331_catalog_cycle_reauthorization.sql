-- Mercado Pago ignores frequency changes on existing preapprovals. Cancel the
-- old recurrence before asking the owner to authorize a new hosted checkout.
alter table private.billing_signups add column catalog_reauthorization_required boolean not null default false;
alter table private.menu_offer_changes add column cycle_reauthorization boolean not null default false;
alter table private.menu_offer_changes add column previous_provider_subscription_id text;
create table private.catalog_retired_recurrences (
 provider_subscription_id text primary key,
 signup_id uuid not null references private.billing_signups(id) on delete cascade,
 retired_at timestamptz not null default now()
);
create index catalog_retired_recurrences_signup_idx on private.catalog_retired_recurrences(signup_id);
alter table private.catalog_retired_recurrences enable row level security;
revoke all on private.catalog_retired_recurrences from public,anon,authenticated,service_role;

alter function public.backend_catalog_offer_change_claim(uuid,text,timestamptz,text) rename to backend_catalog_offer_change_claim_before_reauthorization;
revoke all on function public.backend_catalog_offer_change_claim_before_reauthorization(uuid,text,timestamptz,text) from public,anon,authenticated,service_role;
create function public.backend_catalog_offer_change_claim(target_barbershop_id uuid,target_offer text,expected_updated_at timestamptz,target_cycle text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; signup private.billing_signups; needs_reauthorization boolean;
begin
 result:=public.backend_catalog_offer_change_claim_before_reauthorization(target_barbershop_id,target_offer,expected_updated_at,target_cycle);
 if result->>'operation_id' is null then return result; end if;
 select * into strict signup from private.billing_signups where id=(result->'signup'->>'id')::uuid;
 needs_reauthorization:=signup.provider_subscription_id is not null and signup.cycle is distinct from target_cycle;
 update private.menu_offer_changes set cycle_reauthorization=needs_reauthorization,previous_provider_subscription_id=case when needs_reauthorization then signup.provider_subscription_id end
 where id=(result->>'operation_id')::uuid;
 return result||jsonb_build_object('cycle_reauthorization',needs_reauthorization);
end $$;
revoke all on function public.backend_catalog_offer_change_claim(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.backend_catalog_offer_change_claim(uuid,text,timestamptz,text) to service_role;

create function public.backend_catalog_cycle_cancel_commit(target_operation_id uuid,target_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare operation private.menu_offer_changes; signup private.billing_signups; result jsonb;
begin
 select * into strict operation from private.menu_offer_changes where id=target_operation_id and lease_token=target_token and state in ('processing','reconciling') for update;
 if not operation.cycle_reauthorization or operation.previous_provider_subscription_id is null then raise exception 'Operação de periodicidade inválida' using errcode='23514'; end if;
 select * into strict signup from private.billing_signups where id=operation.signup_id for update;
 if signup.catalog_reauthorization_required and signup.provider_subscription_id is null and signup.cycle=operation.target_cycle and signup.saas_plan_id=operation.target_plan_id then
  return jsonb_build_object('offer',signup.offer_code,'cycle',signup.cycle,'reauthorization_required',true,'access_until',signup.access_until);
 end if;
 if signup.provider_subscription_id is distinct from operation.previous_provider_subscription_id then raise exception 'Recorrência alterada; atualize a assinatura' using errcode='40001'; end if;
 -- The authenticated backend calls this only after a provider GET confirms cancellation.
 result:=private.commit_catalog_offer_change(operation.id);
 insert into private.catalog_retired_recurrences(provider_subscription_id,signup_id) values(operation.previous_provider_subscription_id,signup.id) on conflict do nothing;
 update private.billing_signups set provider_subscription_id=null,provider_plan_id=null,payment_requested_at=null,catalog_reauthorization_required=true where id=signup.id;
 update public.billing_customers set provider_subscription_id=null where saas_client_id=signup.saas_client_id;
 insert into public.platform_billing_audit_log(action,entity_type,entity_id,details) values('billing.cycle_reauthorization_required','billing_signup',signup.id,jsonb_build_object('previous_subscription_id',operation.previous_provider_subscription_id,'cycle',operation.target_cycle,'access_until',signup.access_until));
 return result||jsonb_build_object('reauthorization_required',true);
end $$;
revoke all on function public.backend_catalog_cycle_cancel_commit(uuid,uuid) from public,anon,authenticated;
grant execute on function public.backend_catalog_cycle_cancel_commit(uuid,uuid) to service_role;

do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.backend_billing_offer_change_recover()'::regprocedure);
 patched:=replace(definition,'''operation_id'',operation.id,','''cycle_reauthorization'',operation.cycle_reauthorization,''previous_provider_subscription_id'',operation.previous_provider_subscription_id,''operation_id'',operation.id,');
 if patched=definition then raise exception 'Cycle recovery anchor missing'; end if;execute patched;
 definition:=pg_get_functiondef('public.backend_billing_choose_payment_lookup(uuid)'::regprocedure);
 patched:=replace(definition,'signup.status in (''trial_active'',''payment_pending'',''past_due'')','(signup.status in (''trial_active'',''payment_pending'',''past_due'') or (signup.status=''active'' and signup.catalog_reauthorization_required))');
 if patched=definition then raise exception 'Cycle payment lookup anchor missing'; end if;execute patched;
 definition:=pg_get_functiondef('public.backend_billing_choose_payment_update(uuid,jsonb)'::regprocedure);
 patched:=replace(definition,'status=payload->>''status''','status=payload->>''status'',catalog_reauthorization_required=false');
 if patched=definition then raise exception 'Cycle payment update anchor missing'; end if;execute patched;
end $patch$;

-- A delayed cancellation from the retired recurrence cannot cancel the replacement.
alter function public.backend_billing_webhook_lookup(uuid,text,text) rename to backend_billing_webhook_lookup_before_catalog_cycle;
revoke all on function public.backend_billing_webhook_lookup_before_catalog_cycle(uuid,text,text) from public,anon,authenticated,service_role;
create function public.backend_billing_webhook_lookup(target_signup_id uuid,target_subscription_id text,target_payment_id text)
returns jsonb language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.catalog_retired_recurrences where provider_subscription_id=nullif(target_subscription_id,'')) then null
 else public.backend_billing_webhook_lookup_before_catalog_cycle(target_signup_id,target_subscription_id,target_payment_id) end
$$;
revoke all on function public.backend_billing_webhook_lookup(uuid,text,text) from public,anon,authenticated;
grant execute on function public.backend_billing_webhook_lookup(uuid,text,text) to service_role;
notify pgrst,'reload schema';
