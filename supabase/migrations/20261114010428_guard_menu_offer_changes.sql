-- Durable reservation: no second offer change can touch the provider until the first is resolved.
create table private.menu_offer_changes (
 signup_id uuid primary key references private.billing_signups(id) on delete cascade,
 id uuid not null unique default gen_random_uuid(),
 lease_token uuid not null default gen_random_uuid(),
 target_offer text not null check(target_offer in ('cardapio','encomendas')),
 expected_updated_at timestamptz not null,
 state text not null default 'processing' check(state in ('processing','reconciliation_required','reconciling','manual_review')),
 attempts integer not null default 0 check(attempts between 0 and 10),
 updated_at timestamptz not null default clock_timestamp()
);
alter table private.menu_offer_changes enable row level security;
revoke all on private.menu_offer_changes from public,anon,authenticated,service_role;

create function private.normalized_menu_whatsapp(value text) returns text language sql immutable set search_path='' as $$
 select case when phone ~ '^55[1-9][0-9]{9,10}$' then phone end from (
 select case when length(digits) in (10,11) and btrim(coalesce(value,'')) not like '+%' then '55'||digits else digits end as phone
 from (select regexp_replace(value,'[^0-9]','','g') digits where value ~ '^\+?[0-9 ().-]+$') cleaned
 ) canonical
$$;
revoke all on function private.normalized_menu_whatsapp(text) from public,anon,authenticated;

create function private.assert_cardapio_contact(tenant uuid,force_cardapio boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Serialize plan, publication and contact edits. Read again after waiting for another transaction.
 perform pg_advisory_xact_lock(hashtextextended('menu-contact:'||tenant::text,0));
 if (force_cardapio or private.menu_offer(tenant)='cardapio') and exists(
  select 1 from public.online_menus m left join public.business_whatsapp_shares w on w.barbershop_id=m.barbershop_id
  where m.barbershop_id=tenant and m.published and private.normalized_menu_whatsapp(coalesce(nullif(m.whatsapp_phone,''),w.phone)) is null
 ) then raise exception 'Cadastre um WhatsApp válido antes de publicar ou mudar para Cardápio. Para remover o contato, despublique primeiro.' using errcode='23514'; end if;
end $$;
revoke all on function private.assert_cardapio_contact(uuid,boolean) from public,anon,authenticated;

create function private.guard_cardapio_contact() returns trigger language plpgsql security definer set search_path='' as $$
declare tenant uuid; tenants uuid[];
begin
 if tg_table_name='platform_subscriptions' then
  select array_agg(distinct c.barbershop_id order by c.barbershop_id) into tenants from public.billing_customers bc join public.saas_clients c on c.id=bc.saas_client_id
  where bc.id in (case when tg_op<>'DELETE' then new.billing_customer_id end,case when tg_op<>'INSERT' then old.billing_customer_id end);
 else
  select array_agg(distinct id order by id) into tenants from unnest(array[case when tg_op<>'DELETE' then new.barbershop_id end,case when tg_op<>'INSERT' then old.barbershop_id end]) id where id is not null;
 end if;
 foreach tenant in array coalesce(tenants,'{}'::uuid[]) loop perform private.assert_cardapio_contact(tenant); end loop;
 return null;
end $$;
revoke all on function private.guard_cardapio_contact() from public,anon,authenticated;
drop trigger require_cardapio_whatsapp on public.business_whatsapp_shares;
create trigger guard_cardapio_share after insert or update or delete on public.business_whatsapp_shares for each row execute function private.guard_cardapio_contact();
create trigger guard_cardapio_menu after insert or update on public.online_menus for each row execute function private.guard_cardapio_contact();
create trigger guard_cardapio_plan after insert or update on public.platform_subscriptions for each row execute function private.guard_cardapio_contact();

do $existing$ declare tenant uuid; begin
 for tenant in select barbershop_id from public.online_menus where published and private.menu_offer(barbershop_id)='cardapio' loop
  perform private.assert_cardapio_contact(tenant);
 end loop;
end $existing$;

do $patch$ declare original text; patched text;
begin
 original:=pg_get_functiondef('private.public_menu(text)'::regprocedure);
 patched:=replace(original,'if offer=''cardapio'' then','if offer=''cardapio'' then
 result:=jsonb_set(result,''{menu}'',(result->''menu'')||jsonb_build_object(''whatsapp_phone'',private.normalized_menu_whatsapp(phone)));');
 if patched=original then raise exception 'Public contact anchor missing'; end if; execute patched;
 original:=pg_get_functiondef('private.menu_onboarding_snapshot(uuid)'::regprocedure);
 patched:=replace(original,'coalesce(nullif(m.whatsapp_phone,''''),w.phone) is not null','private.normalized_menu_whatsapp(coalesce(nullif(m.whatsapp_phone,''''),w.phone)) is not null');
 if patched=original then raise exception 'Onboarding contact anchor missing'; end if; execute patched;
end $patch$;

create function private.guard_offer_operation() returns trigger language plpgsql security definer set search_path='' as $$
declare signup_key uuid; token text;
begin
 if tg_table_name='platform_subscriptions' then
  if new.plan_id is not distinct from old.plan_id then return new; end if;
  select bs.id into signup_key from private.billing_signups bs join public.billing_customers bc on bc.saas_client_id=bs.saas_client_id
   where bc.id=new.billing_customer_id and bs.product_code='menu';
 else
  if (new.offer_code,new.cycle,new.payment_method,new.total_cents,new.base_monthly_cents,new.provider_subscription_id)
    is not distinct from (old.offer_code,old.cycle,old.payment_method,old.total_cents,old.base_monthly_cents,old.provider_subscription_id) then return new; end if;
  signup_key:=new.id;
 end if;
 select lease_token::text into token from private.menu_offer_changes where signup_id=signup_key;
 if token is not null and token is distinct from coalesce(current_setting('ogritech.offer_operation',true),'') then
  raise exception 'Existe uma alteração de plano em processamento. Atualize sua assinatura em instantes.' using errcode='55000';
 end if;
 return new;
end $$;
revoke all on function private.guard_offer_operation() from public,anon,authenticated;
create trigger a_guard_offer_operation before update on public.platform_subscriptions for each row execute function private.guard_offer_operation();
create trigger a_guard_offer_operation before update on private.billing_signups for each row execute function private.guard_offer_operation();

create function public.backend_billing_offer_change_claim(target_barbershop_id uuid,target_offer text,expected_updated_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare signup private.billing_signups; operation private.menu_offer_changes; subscription public.platform_subscriptions;
begin
 if target_offer is null or target_offer not in ('cardapio','encomendas') then raise exception 'Plano inválido' using errcode='22023'; end if;
 select s.* into strict subscription from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id
 join public.saas_clients c on c.id=bc.saas_client_id join public.platform_products p on p.id=s.product_id
 where c.barbershop_id=target_barbershop_id and c.deleted_at is null and p.code='menu' and s.status<>'cancelled' for update of s;
 select * into strict signup from private.billing_signups where barbershop_id=target_barbershop_id and product_code='menu' for update;
 if exists(select 1 from private.menu_offer_changes where signup_id=signup.id) then raise exception 'Existe uma alteração de plano em processamento. Atualize sua assinatura em instantes.' using errcode='55000'; end if;
 if signup.updated_at is distinct from expected_updated_at then raise exception 'Assinatura alterada; atualize a página e tente novamente' using errcode='40001'; end if;
 if signup.status in ('cancelled','failed','payment_pending','cancel_at_period_end') or subscription.cancel_at_period_end
  or exists(select 1 from private.billing_payment_intents where signup_id=signup.id and status='pending') then raise exception 'Regularize o pagamento ou a assinatura antes de trocar de plano' using errcode='23514'; end if;
 if target_offer='cardapio' then perform private.assert_cardapio_contact(target_barbershop_id,true); end if;
 if signup.offer_code=target_offer then return jsonb_build_object('unchanged',true,'signup',to_jsonb(signup)); end if;
 insert into private.menu_offer_changes(signup_id,target_offer,expected_updated_at) values(signup.id,target_offer,signup.updated_at) returning * into operation;
 return jsonb_build_object('operation_id',operation.id,'lease_token',operation.lease_token,'signup',to_jsonb(signup));
end $$;

-- Only the reserved commit is callable by the service role.
revoke all on function public.backend_billing_change_offer(uuid,text,timestamptz) from service_role;
create function public.backend_billing_offer_change_commit(target_operation_id uuid,target_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation private.menu_offer_changes; signup private.billing_signups; result jsonb;
begin
 select * into strict operation from private.menu_offer_changes where id=target_operation_id and lease_token=target_token and state='processing' for update;
 select * into strict signup from private.billing_signups where id=operation.signup_id;
 perform set_config('ogritech.offer_operation',target_token::text,true);
 result:=public.backend_billing_change_offer(signup.barbershop_id,operation.target_offer,operation.expected_updated_at);
 return result;
end $$;

create function public.backend_billing_offer_change_finish(target_operation_id uuid,target_token uuid,needs_reconciliation boolean) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if needs_reconciliation then
  update private.menu_offer_changes set state=case when attempts>=10 then 'manual_review' else 'reconciliation_required' end,updated_at=clock_timestamp() where id=target_operation_id and lease_token=target_token;
 else
  delete from private.menu_offer_changes where id=target_operation_id and lease_token=target_token;
 end if;
 return found;
end $$;

create function public.backend_billing_offer_change_recover() returns jsonb language plpgsql security definer set search_path='' as $$
declare operation private.menu_offer_changes; signup private.billing_signups; items jsonb:='[]';
begin
 -- 15 minutes exceeds the hosted Edge worker lifetime (maximum 400 seconds).
 -- Fence recovery workers; never just expire and release an unresolved operation.
 for operation in select * from private.menu_offer_changes where attempts<10 and updated_at<clock_timestamp()-interval '15 minutes' order by updated_at for update skip locked limit 5 loop
  update private.menu_offer_changes set state='reconciling',attempts=attempts+1,lease_token=gen_random_uuid(),updated_at=clock_timestamp() where id=operation.id returning * into operation;
  select * into strict signup from private.billing_signups where id=operation.signup_id;
  items:=items||jsonb_build_array(jsonb_build_object('operation_id',operation.id,'lease_token',operation.lease_token,'provider_subscription_id',signup.provider_subscription_id,'total_cents',signup.total_cents,'signup_id',signup.id));
 end loop;
 return items;
end $$;

revoke all on function public.backend_billing_offer_change_claim(uuid,text,timestamptz),public.backend_billing_offer_change_commit(uuid,uuid),public.backend_billing_offer_change_finish(uuid,uuid,boolean),public.backend_billing_offer_change_recover() from public,anon,authenticated;
grant execute on function public.backend_billing_offer_change_claim(uuid,text,timestamptz),public.backend_billing_offer_change_commit(uuid,uuid),public.backend_billing_offer_change_finish(uuid,uuid,boolean),public.backend_billing_offer_change_recover() to service_role;
notify pgrst,'reload schema';
