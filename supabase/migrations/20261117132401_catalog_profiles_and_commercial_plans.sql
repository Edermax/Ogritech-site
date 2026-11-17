-- New commercial versions do not reprice or replace existing subscriptions.
alter table public.saas_plans add column catalog_version integer not null default 1 check(catalog_version in (1,2));
alter table public.saas_plans alter column catalog_version set default 2;
insert into public.saas_plans(product_id,code,name,menu_offer_code,monthly_fee,annual_fee,description,features,active,featured,display_order,catalog_version)
select id,'catalogo-essencial','Catálogo Essencial','cardapio',9.90,99.00,
 'Catálogo com fotos, opções e atendimento pelo WhatsApp.',
 '["Catálogo e opções de produtos","Link e QR Code","Resumo para WhatsApp","Personalização básica"]'::jsonb,true,false,1,2
from public.platform_products where code='menu' on conflict(product_id,code) do nothing;
insert into public.saas_plans(product_id,code,name,menu_offer_code,monthly_fee,annual_fee,description,features,active,featured,display_order,catalog_version)
select id,'catalogo-completo','Catálogo Completo','encomendas',29.90,299.00,
 'Catálogo e gestão de pedidos, retirada, entrega local e relatórios.',
 '["Todos os recursos do Essencial","Gestão de pedidos","Entrega local e retirada","Relatórios de vendas","Cupom de desconto fixo","Capa e personalização ampliada"]'::jsonb,true,true,2,2
from public.platform_products where code='menu' on conflict(product_id,code) do nothing;
update public.saas_plans set active=false,featured=false
where product_id=(select id from public.platform_products where code='menu') and code in ('cardapio','foundation');
update public.platform_products set name='Catálogo',description='Catálogo para alimentação, artesanato e produtos, com atendimento no WhatsApp ou gestão de pedidos.' where code='menu';

-- Extend the existing templates; keep every existing catalog and address intact.
alter table public.menu_catalog_templates drop constraint menu_catalog_templates_segment_check;
alter table public.menu_catalog_templates add constraint menu_catalog_templates_segment_check
 check(segment in ('pizzeria','snack_bar','restaurant','confectionery','crafts','products'));
insert into public.menu_catalog_templates(code,segment,name,description,definition) values
 ('crafts','crafts','Artesanato e personalizados','Peças, presentes e produtos sob encomenda.',
 '{"theme":{"primary_color":"#70452D","accent_color":"#B87540"},"categories":["Peças artesanais","Presentes e lembranças","Personalizados"],"recommended_item_type":"configurable","profile_code":"crafts"}'),
 ('products','products','Produtos em geral','Produtos, modelos, cores e tamanhos.',
 '{"theme":{"primary_color":"#243B53","accent_color":"#237C89"},"categories":["Produtos","Acessórios","Decoração"],"recommended_item_type":"simple","profile_code":"products"}')
on conflict(code) do nothing;

create function private.catalog_profile(template text,segment text default '') returns text
language sql immutable set search_path='' as $$
 select case when template in ('pizzeria','snack-bar','restaurant','confectionery') then 'food'
 when template in ('crafts','products') then template
 when lower(segment) ~ '(artesan|personaliz)' then 'crafts'
 when lower(segment) ~ '(pizza|hamburg|lanche|restaurante|marmita|confeita|bolo|doce|alimenta)' then 'food' else 'products' end
$$;
revoke all on function private.catalog_profile(text,text) from public,anon,authenticated;

-- Change presentation only. Applying an initial template remains a different operation.
create function private.change_catalog_profile(target_barbershop_id uuid,target_template_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare chosen public.menu_catalog_templates; menu public.online_menus;
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id)
 or not private.business_has_product_access(target_barbershop_id,'menu') then raise exception 'Acesso negado' using errcode='42501'; end if;
 select * into strict chosen from public.menu_catalog_templates where code=target_template_code and active;
 select * into strict menu from public.online_menus where barbershop_id=target_barbershop_id for update;
 update public.online_menus set template_code=chosen.code where id=menu.id;
 return jsonb_build_object('template_code',chosen.code,'profile_code',private.catalog_profile(chosen.code));
exception when no_data_found then raise exception 'Modelo ou catálogo indisponível' using errcode='22023';
end $$;
create function public.change_catalog_profile(target_barbershop_id uuid,target_template_code text) returns jsonb language sql security invoker set search_path='' as $$ select private.change_catalog_profile(target_barbershop_id,target_template_code) $$;
revoke all on function private.change_catalog_profile(uuid,text),public.change_catalog_profile(uuid,text) from public,anon;
grant execute on function private.change_catalog_profile(uuid,text),public.change_catalog_profile(uuid,text) to authenticated;

-- The current paid entitlement survives a downgrade until the purchased period ends.
alter table public.platform_subscriptions add column catalog_access_offer text check(catalog_access_offer in ('cardapio','encomendas'));
alter table public.platform_subscriptions add column catalog_access_until timestamptz;
create function private.preserve_catalog_paid_access() returns trigger language plpgsql security definer set search_path='' as $$
declare previous text; desired text; paid_until timestamptz;
begin
 if new.plan_id is not distinct from old.plan_id then return new; end if;
 select p.menu_offer_code into desired from public.saas_plans p where id=new.plan_id;
 select p.menu_offer_code into previous from public.saas_plans p where id=old.plan_id;
 select bs.access_until into paid_until from private.billing_signups bs join public.billing_customers bc on bc.saas_client_id=bs.saas_client_id
 where bc.id=old.billing_customer_id and bs.product_code='menu';
 if desired='cardapio' and (previous='encomendas' or (old.catalog_access_offer='encomendas' and old.catalog_access_until>now())) and paid_until>now() then
  new.catalog_access_offer:='encomendas'; new.catalog_access_until:=paid_until;
 end if;
 return new;
end $$;
revoke all on function private.preserve_catalog_paid_access() from public,anon,authenticated;
create trigger b_preserve_catalog_paid_access before update of plan_id on public.platform_subscriptions
for each row execute function private.preserve_catalog_paid_access();

create or replace function private.menu_offer(target_barbershop_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select case
 when s.catalog_access_until>now() then s.catalog_access_offer
 when p.catalog_version=2 and b.trial_ends_at>now() and b.status not in ('cancelled','failed') then 'encomendas'
 else p.menu_offer_code end
 from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id
 join public.saas_clients c on c.id=bc.saas_client_id join public.platform_products product on product.id=s.product_id
 join public.saas_plans p on p.id=s.plan_id left join private.billing_signups b on b.saas_client_id=c.id and b.product_code='menu'
 where c.barbershop_id=target_barbershop_id and c.deleted_at is null and product.code='menu' and s.status<>'cancelled'
 order by s.created_at desc limit 1
$$;

-- Attach profile and separate effective trial access from the selected commercial plan.
do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.public_menu(text)'::regprocedure);
 patched:=replace(definition,'''offer_code'',offer,',
 '''profile_code'',(select private.catalog_profile(m.template_code,b.segment) from public.online_menus m join public.barbershops b on b.id=m.barbershop_id where m.barbershop_id=tenant),''offer_code'',offer,');
 if patched=definition then raise exception 'Public catalog context anchor missing'; end if; execute patched;
 definition:=pg_get_functiondef('private.menu_onboarding_snapshot(uuid)'::regprocedure);
 patched:=replace(definition,'result:=result||jsonb_build_object(',
 'result:=result||jsonb_build_object(''profile_code'',(select private.catalog_profile(m.template_code,b.segment) from public.barbershops b left join public.online_menus m on m.barbershop_id=b.id where b.id=target_barbershop_id),''selected_offer_code'',(select p.menu_offer_code from public.platform_subscriptions s join public.billing_customers bc on bc.id=s.billing_customer_id join public.saas_clients c on c.id=bc.saas_client_id join public.saas_plans p on p.id=s.plan_id join public.platform_products pr on pr.id=s.product_id where c.barbershop_id=target_barbershop_id and pr.code=''menu'' and s.status<>''cancelled'' order by s.created_at desc limit 1),');
 if patched=definition then raise exception 'Panel catalog context anchor missing'; end if; execute patched;
 -- Business subscription UI receives the effective capability, not a guessed price tier.
 definition:=pg_get_functiondef('private.business_subscription_center(uuid)'::regprocedure);
 patched:=replace(definition,'''plan_name'',plan.name,',
 '''effective_offer_code'',case when product.code=''menu'' then private.menu_offer(target_barbershop_id) end,''catalog_access_until'',subscription.catalog_access_until,''plan_name'',plan.name,');
 if patched=definition then raise exception 'Subscription effective offer anchor missing'; end if; execute patched;
end $patch$;

-- Billing status exposes the same effective capabilities as public catalog and panel.
alter function public.backend_billing_status(uuid,text) rename to backend_billing_status_before_catalog;
revoke all on function public.backend_billing_status_before_catalog(uuid,text) from public,anon,authenticated;
create function public.backend_billing_status(target_barbershop_id uuid,target_product_code text) returns jsonb
language sql stable security definer set search_path='' as $$
 select public.backend_billing_status_before_catalog(target_barbershop_id,target_product_code)||
 jsonb_build_object('effective_offer_code',case when target_product_code='menu' then private.menu_offer(target_barbershop_id) end)
$$;
revoke all on function public.backend_billing_status(uuid,text) from public,anon,authenticated;
grant execute on function public.backend_billing_status(uuid,text) to service_role;

-- Existing accepted orders remain readable and may be completed after trial/downgrade.
create function private.catalog_order_access(tenant uuid,created timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select private.menu_has_orders(tenant) or exists(
 select 1 from private.billing_signups b join public.saas_plans p on p.id=b.saas_plan_id
 where b.barbershop_id=tenant and b.product_code='menu' and p.catalog_version=2
 and created<=greatest(b.trial_ends_at,coalesce(b.access_until,b.trial_ends_at)))
$$;
revoke all on function private.catalog_order_access(uuid,timestamptz) from public,anon;
grant execute on function private.catalog_order_access(uuid,timestamptz) to authenticated;
drop policy menu_offer_orders on public.menu_orders;
create policy menu_offer_orders on public.menu_orders as restrictive for select to authenticated using(private.catalog_order_access(barbershop_id,created_at));
create policy menu_offer_order_updates on public.menu_orders as restrictive for update to authenticated
 using(private.catalog_order_access(barbershop_id,created_at)) with check(private.catalog_order_access(barbershop_id,created_at));
create policy menu_offer_order_inserts on public.menu_orders as restrictive for insert to authenticated with check(private.menu_has_orders(barbershop_id));
create policy menu_offer_order_deletes on public.menu_orders as restrictive for delete to authenticated using(private.menu_has_orders(barbershop_id));
create or replace function private.guard_menu_order_offer() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and private.catalog_order_access(old.barbershop_id,old.created_at)
 and (to_jsonb(new)-array['status','updated_at','total_amount'])=(to_jsonb(old)-array['status','updated_at','total_amount'])
 and old.status in ('received','confirmed') and new.status in ('completed','cancelled')
 then return new; end if;
 if private.menu_offer(new.barbershop_id)='cardapio' or (current_setting('role',true) in ('anon','authenticated') and not private.menu_has_orders(new.barbershop_id))
 then raise exception 'Novos pedidos exigem o plano Completo ativo' using errcode='42501'; end if;
 return new;
end $$;

-- Reserve a plan/cycle change using the same durable provider reconciliation mechanism.
alter table private.menu_offer_changes add column target_cycle text check(target_cycle in ('monthly','annual'));
create function public.backend_catalog_offer_change_claim(target_barbershop_id uuid,target_offer text,expected_updated_at timestamptz,target_cycle text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; signup private.billing_signups; operation private.menu_offer_changes; plan public.saas_plans;
begin
 if target_cycle is null or target_cycle not in ('monthly','annual') then raise exception 'Periodicidade inválida' using errcode='22023'; end if;
 result:=public.backend_billing_offer_change_claim(target_barbershop_id,target_offer,expected_updated_at);
 if coalesce((result->>'unchanged')::boolean,false) then
  select * into strict signup from private.billing_signups where id=(result->'signup'->>'id')::uuid for update;
  if signup.cycle=target_cycle then return result; end if;
  select * into strict plan from public.saas_plans where id=signup.saas_plan_id and active for share;
  insert into private.menu_offer_changes(signup_id,target_offer,expected_updated_at,target_plan_id,target_monthly_cents,target_annual_cents,target_cycle)
  values(signup.id,plan.menu_offer_code,signup.updated_at,plan.id,(plan.monthly_fee*100)::integer,(plan.annual_fee*100)::integer,target_cycle) returning * into operation;
  result:=jsonb_build_object('operation_id',operation.id,'lease_token',operation.lease_token,'signup',to_jsonb(signup),'target_plan',to_jsonb(plan));
 else
  update private.menu_offer_changes set target_cycle=backend_catalog_offer_change_claim.target_cycle where id=(result->>'operation_id')::uuid;
 end if;
 return result||jsonb_build_object('target_cycle',target_cycle);
end $$;
revoke all on function public.backend_catalog_offer_change_claim(uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.backend_catalog_offer_change_claim(uuid,text,timestamptz,text) to service_role;

create function private.commit_catalog_offer_change(operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare operation private.menu_offer_changes; signup private.billing_signups; plan public.saas_plans; sub public.platform_subscriptions; chosen text;
begin
 select * into strict operation from private.menu_offer_changes where id=operation_id for update;
 select * into strict signup from private.billing_signups where id=operation.signup_id for update;
 if signup.updated_at is distinct from operation.expected_updated_at then raise exception 'Assinatura alterada' using errcode='40001'; end if;
 select * into strict plan from public.saas_plans where id=operation.target_plan_id and active for share;
 if (plan.monthly_fee*100)::integer<>operation.target_monthly_cents or (plan.annual_fee*100)::integer<>operation.target_annual_cents then raise exception 'Preço alterado' using errcode='40001'; end if;
 chosen:=coalesce(operation.target_cycle,signup.cycle);
 perform set_config('ogritech.offer_operation',operation.lease_token::text,true);
 perform set_config('ogritech.offer_change','provider_updated',true);
 update public.platform_subscriptions s set plan_id=plan.id,billing_cycle=chosen,base_amount=plan.monthly_fee
 from public.billing_customers bc,public.platform_products pr where bc.id=s.billing_customer_id and bc.saas_client_id=signup.saas_client_id and pr.id=s.product_id and pr.code='menu' and s.status<>'cancelled' returning s.* into strict sub;
 update private.billing_signups set saas_plan_id=plan.id,plan_name_snapshot=plan.name,offer_code=plan.menu_offer_code,
 base_monthly_cents=operation.target_monthly_cents,plan_annual_cents=operation.target_annual_cents,cycle=chosen,
 cycle_months=case when chosen='annual' then 12 else 1 end,
 total_cents=case when chosen='annual' then operation.target_annual_cents else operation.target_monthly_cents end,
 discount_bps=case when chosen='annual' then round((plan.monthly_fee*12-plan.annual_fee)*10000/(plan.monthly_fee*12))::integer else 0 end where id=signup.id;
 insert into public.platform_billing_audit_log(action,entity_type,entity_id,details) values('subscription.catalog_changed','subscription',sub.id,jsonb_build_object('previous_plan',signup.saas_plan_id,'plan_id',plan.id,'previous_cycle',signup.cycle,'cycle',chosen,'access_until',signup.access_until));
 return jsonb_build_object('offer',plan.menu_offer_code,'plan_id',plan.id,'plan_name',plan.name,'cycle',chosen,'access_until',signup.access_until,'trial_ends_at',signup.trial_ends_at);
end $$;
revoke all on function private.commit_catalog_offer_change(uuid) from public,anon,authenticated;
do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.backend_billing_offer_change_commit(uuid,uuid)'::regprocedure);
 patched:=replace(definition,'result:=public.backend_billing_change_offer(signup.barbershop_id,coalesce(plan.code,operation.target_offer),operation.expected_updated_at);',
 'if operation.target_cycle is not null then result:=private.commit_catalog_offer_change(operation.id); else result:=public.backend_billing_change_offer(signup.barbershop_id,coalesce(plan.code,operation.target_offer),operation.expected_updated_at); end if;');
 if patched=definition then raise exception 'Offer commit anchor missing'; end if; execute patched;
 definition:=pg_get_functiondef('public.backend_billing_offer_change_recover()'::regprocedure);
 patched:=replace(definition,'''total_cents'',signup.total_cents,','''cycle_months'',signup.cycle_months,''total_cents'',signup.total_cents,');
 if patched=definition then raise exception 'Recovery cycle anchor missing'; end if; execute patched;
end $patch$;
-- Quotes for general physical products continue with the seller; no reference-price sale.
do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.create_menu_order_core(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,boolean)'::regprocedure);
 patched:=replace(definition,'if not private.menu_has_orders(menu.barbershop_id) then',
 'if not test_mode and menu.template_code in (''crafts'',''products'') and exists(select 1 from jsonb_array_elements(supplied_items) entry join public.menu_item_prices price on price.id=case when entry->>''menu_item_price_id'' ~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then (entry->>''menu_item_price_id'')::uuid end join public.menu_items item on item.id=price.menu_item_id where item.barbershop_id=menu.barbershop_id and item.metadata->>''order_mode''=''quote'') then raise exception ''Produto sob orçamento: combine o preço final com o vendedor pelo WhatsApp'' using errcode=''22023''; end if;
 if not private.menu_has_orders(menu.barbershop_id) then');
 if patched=definition then raise exception 'Quote guard anchor missing'; end if; execute patched;
end $patch$;
create function private.guard_catalog_quote_contact() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.published and new.template_code in ('crafts','products') and exists(select 1 from public.menu_items i where i.barbershop_id=new.barbershop_id and i.active and i.metadata->>'order_mode'='quote')
 and not exists(select 1 from public.online_menus m left join public.business_whatsapp_shares w on w.barbershop_id=m.barbershop_id where m.id=new.id and private.normalized_menu_whatsapp(coalesce(nullif(new.whatsapp_phone,''),w.phone)) is not null)
 then raise exception 'Cadastre o WhatsApp público para receber solicitações de orçamento antes de publicar' using errcode='23514'; end if;
 return null;
end $$;
revoke all on function private.guard_catalog_quote_contact() from public,anon,authenticated;
create trigger guard_catalog_quote_contact after insert or update on public.online_menus for each row execute function private.guard_catalog_quote_contact();

-- Preserve existing cover rights; new Essential contracts cannot add a cover outside trial.
create function private.catalog_can_cover(tenant uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.business_product_is_active(tenant,'menu') and coalesce((select p.catalog_version=1 or private.menu_has_orders(tenant)
 from public.platform_subscriptions s join public.saas_plans p on p.id=s.plan_id join public.billing_customers bc on bc.id=s.billing_customer_id
 join public.saas_clients c on c.id=bc.saas_client_id join public.platform_products pr on pr.id=s.product_id
 where c.barbershop_id=tenant and c.deleted_at is null and pr.code='menu' and s.status<>'cancelled' order by s.created_at desc limit 1),false)
$$;
revoke all on function private.catalog_can_cover(uuid) from public,anon,authenticated;
create function private.guard_catalog_cover() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if nullif(new.visual_identity->>'cover_path','') is not null and
 (tg_op='INSERT' or new.visual_identity->>'cover_path' is distinct from old.visual_identity->>'cover_path') and not private.catalog_can_cover(new.barbershop_id)
 then raise exception 'Adicionar uma capa exige o Completo ativo' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function private.guard_catalog_cover() from public,anon,authenticated;
create trigger guard_catalog_cover before insert or update on public.online_menus for each row execute function private.guard_catalog_cover();
do $patch$ declare definition text; patched text;
begin
 definition:=pg_get_functiondef('private.menu_branding(uuid,text,jsonb)'::regprocedure);
 patched:=replace(definition,'if action=''save'' then','if action=''save'' then
 if nullif(payload->>''cover_path'','''') is not null and payload->>''cover_path'' is distinct from coalesce((select bd.identity->>''cover_path'' from private.menu_branding_drafts bd where bd.barbershop_id=target_barbershop_id),menu.visual_identity->>''cover_path'') and not private.catalog_can_cover(target_barbershop_id) then raise exception ''Adicionar uma capa exige o Completo ativo'' using errcode=''42501''; end if;');
 if patched=definition then raise exception 'Cover draft guard anchor missing'; end if; execute patched;
end $patch$;

-- One optional fixed-value coupon per business, calculated only on the server.
alter table public.online_menus add column catalog_coupon_code text check(catalog_coupon_code ~ '^[A-Z0-9_-]{3,24}$');
alter table public.online_menus add column catalog_coupon_amount numeric(12,2) not null default 0 check(catalog_coupon_amount between 0 and 1000000);
alter table public.online_menus add column catalog_coupon_expires_at timestamptz;
alter table public.menu_orders add column catalog_coupon_code text;
create function private.guard_catalog_coupon() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (tg_op='INSERT' and new.catalog_coupon_code is not null) or
 (tg_op='UPDATE' and (new.catalog_coupon_code,new.catalog_coupon_amount,new.catalog_coupon_expires_at) is distinct from (old.catalog_coupon_code,old.catalog_coupon_amount,old.catalog_coupon_expires_at)) then
  if not private.menu_has_orders(new.barbershop_id) then raise exception 'Cupons exigem o plano Completo ativo' using errcode='42501'; end if;
 end if;
 return new;
end $$;
revoke all on function private.guard_catalog_coupon() from public,anon,authenticated;
create trigger guard_catalog_coupon before insert or update on public.online_menus for each row execute function private.guard_catalog_coupon();
create function private.save_catalog_coupon(target_barbershop_id uuid,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare code text; amount numeric; expiry timestamptz;
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id) or not private.menu_has_orders(target_barbershop_id) then raise exception 'Acesso negado' using errcode='42501'; end if;
 if jsonb_typeof(payload) is distinct from 'object' or octet_length(payload::text)>1000 then raise exception 'Cupom inválido' using errcode='22023'; end if;
 code:=nullif(upper(btrim(payload->>'code')),''); amount:=coalesce((payload->>'amount')::numeric,0); expiry:=nullif(payload->>'expires_at','')::timestamptz;
 if code is not null and (code !~ '^[A-Z0-9_-]{3,24}$' or amount<=0 or amount>1000000 or (expiry is not null and expiry<=now())) then raise exception 'Confira código, desconto e validade' using errcode='22023'; end if;
 update public.online_menus set catalog_coupon_code=code,catalog_coupon_amount=case when code is null then 0 else round(amount,2) end,catalog_coupon_expires_at=expiry where barbershop_id=target_barbershop_id;
 if not found then raise exception 'Crie primeiro o catálogo' using errcode='22023'; end if;
 return jsonb_build_object('saved',true);
end $$;
create function public.save_catalog_coupon(target_barbershop_id uuid,payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_catalog_coupon(target_barbershop_id,payload) $$;
revoke all on function private.save_catalog_coupon(uuid,jsonb),public.save_catalog_coupon(uuid,jsonb) from public,anon;
grant execute on function private.save_catalog_coupon(uuid,jsonb),public.save_catalog_coupon(uuid,jsonb) to authenticated;

create function private.public_create_catalog_order(target_slug text,supplied_name text,supplied_email text,supplied_phone text,
 target_fulfillment_type text,supplied_address jsonb,supplied_notes text,supplied_items jsonb,accepted_privacy boolean,
 client_request_id uuid,requested_for timestamptz default null,website text default '',supplied_coupon text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare result_payload jsonb; request_key uuid:=client_request_id; menu public.online_menus; saved public.menu_orders; code text:=upper(btrim(coalesce(supplied_coupon,'')));
begin
 if code='' then return private.public_create_menu_order_v2(target_slug,supplied_name,supplied_email,supplied_phone,target_fulfillment_type,supplied_address,supplied_notes,supplied_items,accepted_privacy,client_request_id,requested_for,website); end if;
 if code !~ '^[A-Z0-9_-]{3,24}$' then raise exception 'Cupom inválido' using errcode='22023'; end if;
 select * into strict menu from public.online_menus where lower(slug)=lower(btrim(target_slug)) for share;
 -- Binding the coupon to notes includes it in the existing request fingerprint.
 result_payload:=private.public_create_menu_order_v2(target_slug,supplied_name,supplied_email,supplied_phone,target_fulfillment_type,supplied_address,
 '[Cupom '||code||'] '||coalesce(supplied_notes,''),supplied_items,accepted_privacy,client_request_id,requested_for,website);
 select * into strict saved from public.menu_orders where public_reference=result_payload->>'reference' and barbershop_id=menu.barbershop_id
 and public_token_hash=encode(extensions.digest(result_payload->>'token','sha256'),'hex') for update;
 if saved.catalog_coupon_code is null then
  if menu.catalog_coupon_code is distinct from code or menu.catalog_coupon_amount<=0 or menu.catalog_coupon_expires_at<=now() then raise exception 'Cupom inválido ou vencido' using errcode='22023'; end if;
  update public.menu_orders set discount_amount=least(menu.catalog_coupon_amount,subtotal),catalog_coupon_code=code where id=saved.id returning * into saved;
 end if;
 result_payload:=result_payload||jsonb_build_object('subtotal',saved.subtotal,'discount_amount',saved.discount_amount,'total_amount',saved.total_amount,'coupon_code',saved.catalog_coupon_code);
 update private.menu_order_idempotency i set response=result_payload where i.menu_id=menu.id and i.client_request_id=request_key;
 return result_payload;
end $$;
create function public.public_create_catalog_order(target_slug text,supplied_name text,supplied_email text,supplied_phone text,
 target_fulfillment_type text,supplied_address jsonb,supplied_notes text,supplied_items jsonb,accepted_privacy boolean,
 client_request_id uuid,requested_for timestamptz default null,website text default '',supplied_coupon text default '') returns jsonb language sql security invoker set search_path='' as $$
 select private.public_create_catalog_order(target_slug,supplied_name,supplied_email,supplied_phone,target_fulfillment_type,supplied_address,supplied_notes,supplied_items,accepted_privacy,client_request_id,requested_for,website,supplied_coupon)
$$;
revoke all on function private.public_create_catalog_order(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,text),public.public_create_catalog_order(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,text) from public;
grant execute on function private.public_create_catalog_order(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,text),public.public_create_catalog_order(text,text,text,text,text,jsonb,text,jsonb,boolean,uuid,timestamptz,text,text) to anon,authenticated;

-- A narrow transition path resolves orders accepted before losing Complete access.
create function private.catalog_order_history(target_barbershop_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id) then raise exception 'Acesso negado' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(row)) from (select o.id,o.order_number,o.customer_name,o.status,o.total_amount,o.created_at,
 coalesce((select jsonb_agg(jsonb_build_object('name',i.item_name,'quantity',i.quantity,'option',i.price_label)) from public.menu_order_items i where i.order_id=o.id),'[]'::jsonb) as items
 from public.menu_orders o where o.barbershop_id=target_barbershop_id and not o.is_test and private.catalog_order_access(o.barbershop_id,o.created_at) order by o.created_at desc limit 100) row),'[]'::jsonb);
end $$;
create function private.finish_catalog_order(target_barbershop_id uuid,target_order_id uuid,target_status text) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.menu_orders;
begin
 if auth.uid() is null or not public.is_business_manager(target_barbershop_id) then raise exception 'Acesso negado' using errcode='42501'; end if;
 if target_status is null or target_status not in ('completed','cancelled') then raise exception 'Situação inválida' using errcode='22023'; end if;
 select * into strict saved from public.menu_orders where id=target_order_id and barbershop_id=target_barbershop_id for update;
 if not private.catalog_order_access(saved.barbershop_id,saved.created_at) or saved.status not in ('received','confirmed') then raise exception 'Pedido indisponível para conclusão' using errcode='23514'; end if;
 update public.menu_orders set status=target_status where id=saved.id;
 return jsonb_build_object('id',saved.id,'status',target_status);
end $$;
create function public.catalog_order_history(target_barbershop_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.catalog_order_history(target_barbershop_id) $$;
create function public.finish_catalog_order(target_barbershop_id uuid,target_order_id uuid,target_status text) returns jsonb language sql security invoker set search_path='' as $$ select private.finish_catalog_order(target_barbershop_id,target_order_id,target_status) $$;
revoke all on function private.catalog_order_history(uuid),private.finish_catalog_order(uuid,uuid,text),public.catalog_order_history(uuid),public.finish_catalog_order(uuid,uuid,text) from public,anon;
grant execute on function private.catalog_order_history(uuid),private.finish_catalog_order(uuid,uuid,text),public.catalog_order_history(uuid),public.finish_catalog_order(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
