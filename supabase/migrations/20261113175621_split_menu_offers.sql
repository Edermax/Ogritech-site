-- Cardápio: WhatsApp. Encomendas: operação existente. O produto técnico menu
-- permanece estável para preservar catálogo, links, assinaturas e histórico.
update public.saas_plans set name='Encomendas',monthly_fee=49.90,
 description='Ogritech Encomendas: catálogo, entrega, retirada e acompanhamento de pedidos.',
 features='["Catálogo completo","Gestão de pedidos","Entrega e retirada","Acompanhamento"]'::jsonb,display_order=2
where product_id=(select id from public.platform_products where code='menu') and code='foundation';
insert into public.saas_plans(product_id,code,name,monthly_fee,description,features,active,featured,display_order)
select id,'cardapio','Cardápio',29.90,'Ogritech Cardápio: seleção de produtos e atendimento pelo WhatsApp.',
 '["Fotos, preços e pesos","Sabores e adicionais","Resumo da seleção","Atendimento no WhatsApp"]'::jsonb,true,false,1
from public.platform_products where code='menu'
on conflict(product_id,code) do update set name=excluded.name,monthly_fee=excluded.monthly_fee,description=excluded.description,features=excluded.features,active=true;
update public.platform_products set name='Cardápio e Encomendas',description='Catálogo e atendimento no WhatsApp ou gestão completa dos pedidos.' where code='menu';
-- Preserve the full feature set for existing accounts, including their original trial boundary.
update public.saas_clients c set plan='Encomendas' where c.deleted_at is null and c.plan='Cardápio'
 and exists(select 1 from public.billing_customers bc join public.platform_subscriptions s on s.billing_customer_id=bc.id
 join public.saas_plans p on p.id=s.plan_id join public.platform_products pr on pr.id=s.product_id
 where bc.saas_client_id=c.id and pr.code='menu' and p.code='foundation');
alter table private.billing_signups add column offer_code text not null default 'encomendas' check(offer_code in ('cardapio','encomendas'));
alter table private.billing_signups drop constraint billing_signups_product_price_check;
alter table private.billing_signups drop constraint billing_signups_discount_bps_check;
alter table private.billing_signups add constraint billing_signups_offer_price_check check(
 (product_code='agenda' and base_monthly_cents=9700)
 or (product_code='menu' and (
   (offer_code='cardapio' and base_monthly_cents=2990 and ((cycle='monthly' and cycle_months=1 and discount_bps=0 and total_cents=2990) or (cycle='annual' and cycle_months=12 and discount_bps=1667 and total_cents=29900)))
   or (offer_code='encomendas' and base_monthly_cents=4990 and ((cycle='monthly' and cycle_months=1 and discount_bps=0 and total_cents=4990) or (cycle='annual' and cycle_months=12 and discount_bps=1667 and total_cents=49900)))
 )));
alter table private.billing_signups add constraint billing_signups_discount_bps_check check(discount_bps in (0,300,500,1000,1667));
-- UNIQUE(product_code,tax_document) continues to cover BOTH menu offers.
comment on table private.billing_signups is 'Teste único por CPF/CNPJ na família Cardápio/Encomendas. Trocas nunca reiniciam o teste.';
create function private.preserve_menu_trial() returns trigger language plpgsql set search_path='' as $$ begin
 if old.product_code='menu' and (new.trial_started_at is distinct from old.trial_started_at or new.trial_ends_at>old.trial_ends_at) then
  raise exception 'A troca de plano não gera novo período gratuito' using errcode='23514';
 end if; return new;
end $$;
revoke all on function private.preserve_menu_trial() from public,anon,authenticated;
create trigger preserve_menu_trial before update on private.billing_signups for each row execute function private.preserve_menu_trial();

create function private.menu_offer(target_barbershop_id uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.code='cardapio' then 'cardapio' when p.code='foundation' then 'encomendas' end
 from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id
 join public.saas_clients c on c.id=bc.saas_client_id join public.platform_products product on product.id=s.product_id
 join public.saas_plans p on p.id=s.plan_id
 where c.barbershop_id=target_barbershop_id and c.deleted_at is null and product.code='menu' and s.status<>'cancelled'
 order by s.created_at desc limit 1
$$;
revoke all on function private.menu_offer(uuid) from public,anon,authenticated;
create function private.menu_has_orders(target_barbershop_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.menu_offer(target_barbershop_id)='encomendas',false) and private.business_product_is_active(target_barbershop_id,'menu')
$$;
revoke all on function private.menu_has_orders(uuid) from public,anon;
grant execute on function private.menu_has_orders(uuid) to authenticated;
create function private.guard_menu_order_offer() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if private.menu_offer(new.barbershop_id)='cardapio' or (current_setting('role',true) in ('anon','authenticated') and not private.menu_has_orders(new.barbershop_id)) then raise exception 'A gestão de pedidos está disponível no Ogritech Encomendas' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.guard_menu_order_offer() from public,anon,authenticated;
create trigger guard_menu_order_offer before insert or update on public.menu_orders for each row execute function private.guard_menu_order_offer();
-- Restrictive policies compose with the existing tenant policies; history is preserved.
create policy menu_offer_orders on public.menu_orders as restrictive for all to authenticated using(private.menu_has_orders(barbershop_id)) with check(private.menu_has_orders(barbershop_id));
create policy menu_offer_order_items on public.menu_order_items as restrictive for all to authenticated using(private.menu_has_orders(barbershop_id)) with check(private.menu_has_orders(barbershop_id));
create policy menu_offer_order_options on public.menu_order_item_options as restrictive for all to authenticated using(private.menu_has_orders(barbershop_id)) with check(private.menu_has_orders(barbershop_id));


-- Derive offer inside the existing protected signup insert; preserve identity claims,
-- SMS proof consumption and trial review behavior from the production backend.
create function private.assign_menu_signup_offer() returns trigger language plpgsql set search_path='' as $$ begin
 if new.product_code='menu' then new.offer_code:=case when new.base_monthly_cents=2990 then 'cardapio' else 'encomendas' end; end if; return new;
end $$;
revoke all on function private.assign_menu_signup_offer() from public,anon,authenticated;
create trigger assign_menu_signup_offer before insert on private.billing_signups for each row execute function private.assign_menu_signup_offer();
create or replace view public.backend_billing_signups with(security_invoker=true) as select * from private.billing_signups;

-- Extend the current catalog response without replacing contact, Pix, postcode,
-- delivery, metadata or receipt behavior introduced after the original menu.
alter function private.public_menu(text) rename to public_menu_encomendas;
revoke all on function private.public_menu_encomendas(text) from public,anon,authenticated;
create function private.public_menu(target_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; tenant uuid; offer text; phone text;
begin
 result:=private.public_menu_encomendas(target_slug);
 select barbershop_id into strict tenant from public.online_menus where lower(slug)=lower(trim(target_slug));
 offer:=private.menu_offer(tenant);
 select coalesce(nullif(m.whatsapp_phone,''),w.phone) into phone from public.online_menus m left join public.business_whatsapp_shares w on w.barbershop_id=m.barbershop_id where m.barbershop_id=tenant;
 result:=jsonb_set(result,'{menu}',(result->'menu')||jsonb_build_object('offer_code',offer,'whatsapp_phone',phone));
 if offer='cardapio' then
  result:=jsonb_set(result,'{menu}',(result->'menu')||jsonb_build_object('accepts_pickup',false,'accepts_delivery',false,'pix_key',null,'pix_amount_city',null,'payment_methods','[]'::jsonb));
  result:=jsonb_set(result,'{delivery_zones}','[]'::jsonb);
 end if;
 return result;
end $$;
create or replace function public.public_menu(target_slug text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.public_menu(target_slug) $$;
revoke all on function private.public_menu(text) from public;
grant execute on function private.public_menu(text) to anon,authenticated;

alter function private.menu_onboarding_snapshot(uuid) rename to menu_onboarding_snapshot_encomendas;
revoke all on function private.menu_onboarding_snapshot_encomendas(uuid) from public,anon,authenticated;
create function private.menu_onboarding_snapshot(target_barbershop_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; checks jsonb; next_step text:='ready'; step text; completed integer:=0; phone_ok boolean;
begin
 result:=private.menu_onboarding_snapshot_encomendas(target_barbershop_id);
 result:=result||jsonb_build_object('offer_code',private.menu_offer(target_barbershop_id));
 if private.menu_offer(target_barbershop_id)<>'cardapio' or not coalesce((result->>'exists')::boolean,false) then return result; end if;
 select exists(select 1 from public.online_menus m left join public.business_whatsapp_shares w on w.barbershop_id=m.barbershop_id
 where m.barbershop_id=target_barbershop_id and coalesce(nullif(m.whatsapp_phone,''),w.phone) is not null) into phone_ok;
 checks:=(result->'checks')||jsonb_build_object('fulfillment',phone_ok,'payments',true,'test_order',true);
 foreach step in array array['segment','identity','catalog','fulfillment','payments','hours','test_order','review'] loop
  if coalesce((checks->>step)::boolean,false) then completed:=completed+1;
  elsif next_step='ready' then next_step:=step; end if;
 end loop;
 return result||jsonb_build_object('checks',checks,'next_step',next_step,'completed_count',completed);
end $$;
revoke all on function private.menu_onboarding_snapshot(uuid) from public,anon,authenticated;

-- Insert only the new entitlement checks into the current function definitions.
-- All existing order validation, snapshots and idempotency remain intact.
do $migration$
declare definition text; patched text; target regprocedure;
begin
 target:='private.confirm_menu_review(uuid)'::regprocedure;
 definition:=pg_get_functiondef(target);
 patched:=replace(definition,'if menu.test_order_completed_at is null then',
  'if private.menu_offer(target_barbershop_id)<>''cardapio'' and menu.test_order_completed_at is null then');
 if patched=definition then raise exception 'Review guard anchor missing'; end if; execute patched;
 target:='private.create_menu_order_core(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,boolean)'::regprocedure;
 definition:=pg_get_functiondef(target);
 patched:=replace(definition,'if menu.id is null then raise exception ''Cardápio indisponível'' using errcode=''22023''; end if;',
 'if menu.id is null then raise exception ''Cardápio indisponível'' using errcode=''22023''; end if;
 if not private.menu_has_orders(menu.barbershop_id) then raise exception ''Continue seu atendimento pelo WhatsApp do estabelecimento'' using errcode=''42501''; end if;');
 if patched=definition then raise exception 'Order guard anchor missing'; end if; execute patched;
 target:='private.self_service_product_subscription(uuid,text,text,uuid,text)'::regprocedure;
 definition:=pg_get_functiondef(target);
 patched:=replace(definition,'if target_action not in',
 'if target_product_code=''menu'' and target_action=''subscribe'' then raise exception ''Use a contratação pelo cadastro ou a central de pagamento, sem novo teste gratuito'' using errcode=''23514''; end if;
 if target_action not in');
 if patched=definition then raise exception 'Subscription guard anchor missing'; end if; execute patched;
end $migration$;

-- Receipt, sales and payment management are Encomendas features as well.
do $migration$
declare target regprocedure; definition text; patched text;
begin
 for target in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('review_menu_order_decision','menu_order_receipt_access','record_menu_order_payment','menu_sales_reports','menu_sales_report') loop
  definition:=pg_get_functiondef(target);
  patched:=regexp_replace(definition,'\mbegin\M','begin
 if not private.menu_has_orders(target_barbershop_id) then raise exception ''Recurso disponível no Ogritech Encomendas'' using errcode=''42501''; end if;','i');
  if patched=definition then raise exception 'Feature guard anchor missing: %',target; end if; execute patched;
 end loop;
end $migration$;

create function private.sync_menu_offer() returns trigger language plpgsql security definer set search_path='' as $$
declare plan public.saas_plans; signup private.billing_signups; client_id uuid; offer text; amount integer;
begin
 if new.plan_id is not distinct from old.plan_id then return new; end if;
 if not exists(select 1 from public.platform_products where id=new.product_id and code='menu') then return new; end if;
 select * into strict plan from public.saas_plans where id=new.plan_id and product_id=new.product_id and active;
 offer:=case when plan.code='cardapio' then 'cardapio' when plan.code='foundation' then 'encomendas' end;
 if offer is null then raise exception 'Plano incompatível' using errcode='22023'; end if;
 select saas_client_id into client_id from public.billing_customers where id=new.billing_customer_id;
 select * into signup from private.billing_signups where saas_client_id=client_id and product_code='menu' for update;
 if signup.id is not null then
  if signup.status='payment_pending' or exists(select 1 from private.billing_payment_intents where signup_id=signup.id and status='pending') then
   raise exception 'Conclua o pagamento pendente antes de trocar de plano' using errcode='23514';
  end if;
  if signup.provider_subscription_id is not null and coalesce(current_setting('ogritech.offer_change',true),'')<>'provider_updated' then
   raise exception 'Use a alteração de plano na central de assinatura' using errcode='23514';
  end if;
  amount:=case when offer='cardapio' then 2990 else 4990 end;
  update private.billing_signups set offer_code=offer,base_monthly_cents=amount,
    total_cents=case when cycle='annual' then amount*10 else amount end,
    discount_bps=case when cycle='annual' then 1667 else 0 end where id=signup.id;
 end if;
 new.base_amount:=plan.monthly_fee;
 -- Neither trial dates, paid access, status nor renewal boundaries are reset.
 update public.saas_clients set plan=plan.name,monthly_fee=plan.monthly_fee where id=client_id;
 return new;
end $$;
revoke all on function private.sync_menu_offer() from public,anon,authenticated;
create trigger sync_menu_offer before update of plan_id on public.platform_subscriptions for each row execute function private.sync_menu_offer();

create function public.backend_billing_change_offer(target_barbershop_id uuid,target_offer text,expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare signup private.billing_signups; plan public.saas_plans; subscription public.platform_subscriptions;
begin
 if target_offer not in ('cardapio','encomendas') or target_offer is null then raise exception 'Plano inválido' using errcode='22023'; end if;
 -- Lock subscriptions before signup, consistently with the plan-edit trigger.
 select s.* into strict subscription from public.platform_subscriptions s join public.billing_customers c on c.id=s.billing_customer_id
 join public.saas_clients sc on sc.id=c.saas_client_id join public.platform_products p on p.id=s.product_id
 where sc.barbershop_id=target_barbershop_id and sc.deleted_at is null and p.code='menu' and s.status<>'cancelled' for update of s;
 select * into strict signup from private.billing_signups where barbershop_id=target_barbershop_id and product_code='menu' for update;
 if signup.updated_at is distinct from expected_updated_at then raise exception 'Assinatura alterada; atualize a página e tente novamente' using errcode='40001'; end if;
 if signup.status in ('cancelled','failed','payment_pending','cancel_at_period_end') or subscription.cancel_at_period_end then raise exception 'Regularize a assinatura antes de trocar de plano' using errcode='23514'; end if;
 select p.* into strict plan from public.saas_plans p where product_id=subscription.product_id
 and code=case when target_offer='cardapio' then 'cardapio' else 'foundation' end and active;
 perform set_config('ogritech.offer_change','provider_updated',true);
 update public.platform_subscriptions set plan_id=plan.id,base_amount=plan.monthly_fee where id=subscription.id;
 insert into public.platform_billing_audit_log(action,entity_type,entity_id,details)
 values('subscription.offer_changed','subscription',subscription.id,jsonb_build_object('previous_offer',signup.offer_code,'offer',target_offer,'trial_ends_at',signup.trial_ends_at));
 return jsonb_build_object('offer',target_offer,'trial_ends_at',signup.trial_ends_at,'access_until',signup.access_until,'cycle',signup.cycle);
end $$;
revoke all on function public.backend_billing_change_offer(uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.backend_billing_change_offer(uuid,text,timestamptz) to service_role;


create function private.require_cardapio_whatsapp() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.phone is null and private.menu_offer(new.barbershop_id)='cardapio' and exists(select 1 from public.online_menus where barbershop_id=new.barbershop_id and published) then
 raise exception 'Despublique o Cardápio antes de remover o WhatsApp' using errcode='23514'; end if; return new;
end $$;
revoke all on function private.require_cardapio_whatsapp() from public,anon,authenticated;
create trigger require_cardapio_whatsapp before update on public.business_whatsapp_shares for each row execute function private.require_cardapio_whatsapp();

-- Administrative copy/limits may change, but the four approved commercial prices
-- must remain consistent with the checkout and advertised offer catalog.
create function private.enforce_menu_offer_prices() returns trigger language plpgsql set search_path='' as $$ begin
 if exists(select 1 from public.platform_products where id=new.product_id and code='menu') and
    ((new.code='cardapio' and new.monthly_fee<>29.90) or (new.code='foundation' and new.monthly_fee<>49.90)) then
  raise exception 'Preços definidos: Cardápio R$ 29,90/mês e Encomendas R$ 49,90/mês' using errcode='23514';
 end if; return new;
end $$;
revoke all on function private.enforce_menu_offer_prices() from public,anon,authenticated;
create trigger enforce_menu_offer_prices before insert or update on public.saas_plans for each row execute function private.enforce_menu_offer_prices();
notify pgrst,'reload schema';
