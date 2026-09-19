-- Fase 5: gestão comercial e portabilidade self-service por produto.

create or replace function private.is_business_owner(target_barbershop_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.profiles
    where id=(select auth.uid()) and active and barbershop_id=target_barbershop_id and role='owner'
  ) or public.is_platform_admin();
$$;
revoke all on function private.is_business_owner(uuid) from public,anon,authenticated;
grant execute on function private.is_business_owner(uuid) to authenticated;

create or replace function private.business_subscription_center(target_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not private.is_business_owner(target_barbershop_id) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;

  select jsonb_build_object(
    'products',coalesce((select jsonb_agg(jsonb_build_object(
      'code',product.code,'name',product.name,'description',product.description,
      'plans',coalesce((select jsonb_agg(jsonb_build_object('id',plan.id,'code',plan.code,'name',plan.name,'monthly_fee',plan.monthly_fee,'description',plan.description) order by plan.monthly_fee,plan.name) from public.saas_plans plan where plan.product_id=product.id and plan.active),'[]'::jsonb),
      'modules',coalesce((select jsonb_agg(jsonb_build_object('id',module.id,'code',module.code,'name',module.name,'description',module.description) order by module.name) from public.platform_modules module where module.product_id=product.id and module.active),'[]'::jsonb)
    ) order by product.display_order) from public.platform_products product where product.active),'[]'::jsonb),
    'subscriptions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',subscription.id,'product_code',product.code,'product_name',product.name,
      'plan_id',subscription.plan_id,'plan_name',plan.name,'status',subscription.status,
      'base_amount',subscription.base_amount,'billing_cycle',subscription.billing_cycle,
      'current_period_end',subscription.current_period_end,'cancel_at_period_end',subscription.cancel_at_period_end,
      'modules',coalesce((select jsonb_agg(jsonb_build_object('module_id',item.module_id,'code',module.code,'name',module.name,'status',item.status) order by module.name)
        from public.subscription_modules item join public.platform_modules module on module.id=item.module_id
        where item.platform_subscription_id=subscription.id and item.status<>'cancelled'),'[]'::jsonb)
    ) order by product.display_order)
      from public.platform_subscriptions subscription
      join public.billing_customers customer on customer.id=subscription.billing_customer_id
      join public.saas_clients client on client.id=customer.saas_client_id
      join public.platform_products product on product.id=subscription.product_id
      left join public.saas_plans plan on plan.id=subscription.plan_id
      where client.barbershop_id=target_barbershop_id and client.deleted_at is null and subscription.status<>'cancelled'),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function private.self_service_product_subscription(
  target_barbershop_id uuid,
  target_product_code text,
  target_action text,
  target_plan_id uuid default null,
  target_reason text default null
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  client public.saas_clients; customer public.billing_customers; product public.platform_products;
  plan public.saas_plans; subscription public.platform_subscriptions; result public.platform_subscriptions;
begin
  if (select auth.uid()) is null or not private.is_business_owner(target_barbershop_id) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if target_action not in ('subscribe','change_plan','cancel','reactivate') then
    raise exception 'Ação inválida' using errcode='22023';
  end if;
  if length(coalesce(target_reason,''))>500 then raise exception 'Motivo muito extenso' using errcode='22023'; end if;

  select * into client from public.saas_clients where barbershop_id=target_barbershop_id and deleted_at is null for update;
  if client.id is null then raise exception 'Negócio não encontrado' using errcode='22023'; end if;
  select * into product from public.platform_products where code=target_product_code and active;
  if product.id is null then raise exception 'Solução indisponível' using errcode='22023'; end if;
  insert into public.billing_customers(saas_client_id,billing_email)
  values(client.id,coalesce(client.owner_email,''))
  on conflict(saas_client_id) do update set billing_email=coalesce(nullif(public.billing_customers.billing_email,''),excluded.billing_email)
  returning * into customer;
  update public.platform_subscriptions set status='cancelled',cancelled_at=coalesce(cancelled_at,now()),cancel_at_period_end=false,updated_at=now()
  where billing_customer_id=customer.id and product_id=product.id and status<>'cancelled'
    and cancel_at_period_end and current_period_end is not null and current_period_end<=now();
  select * into subscription from public.platform_subscriptions
  where billing_customer_id=customer.id and product_id=product.id and status<>'cancelled' for update;

  if target_action in ('subscribe','change_plan') then
    select * into plan from public.saas_plans where id=target_plan_id and product_id=product.id and active;
    if plan.id is null then raise exception 'Plano incompatível ou inativo' using errcode='22023'; end if;
    if target_action='subscribe' and subscription.id is not null then raise exception 'Solução já contratada' using errcode='23505'; end if;
    if target_action='change_plan' and subscription.id is null then raise exception 'Assinatura ativa não encontrada' using errcode='22023'; end if;
    if subscription.id is null then
      insert into public.platform_subscriptions(billing_customer_id,product_id,plan_id,status,base_amount,starts_on,next_billing_on,current_period_start,current_period_end)
      values(customer.id,product.id,plan.id,'active',plan.monthly_fee,current_date,current_date+interval '1 month',now(),now()+interval '1 month') returning * into result;
    else
      update public.platform_subscriptions set plan_id=plan.id,base_amount=plan.monthly_fee,cancel_at_period_end=false,cancelled_at=null,
        current_period_end=coalesce(current_period_end,now()+interval '1 month'),updated_at=now()
      where id=subscription.id returning * into result;
    end if;
  elsif target_action='cancel' then
    if subscription.id is null then raise exception 'Assinatura ativa não encontrada' using errcode='22023'; end if;
    update public.platform_subscriptions set cancel_at_period_end=true,current_period_end=coalesce(current_period_end,now()+interval '1 month'),updated_at=now()
    where id=subscription.id returning * into result;
    update public.subscription_modules set status='cancel_at_period_end',current_period_end=result.current_period_end,updated_at=now()
    where platform_subscription_id=result.id and status in ('trial','active');
  else
    if subscription.id is null or not subscription.cancel_at_period_end then raise exception 'Cancelamento agendado não encontrado' using errcode='22023'; end if;
    if subscription.current_period_end is not null and subscription.current_period_end<=now() then raise exception 'Período encerrado; faça uma nova contratação' using errcode='22023'; end if;
    update public.platform_subscriptions set cancel_at_period_end=false,cancelled_at=null,updated_at=now()
    where id=subscription.id returning * into result;
    update public.subscription_modules set status='active',current_period_end=null,cancelled_at=null,updated_at=now()
    where platform_subscription_id=result.id and status='cancel_at_period_end';
  end if;

  insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'subscription.self_service_'||target_action,'subscription',result.id,
    jsonb_build_object('barbershop_id',target_barbershop_id,'product_code',product.code,'plan_id',result.plan_id,'reason',nullif(btrim(coalesce(target_reason,'')),''),'cancel_at_period_end',result.cancel_at_period_end));
  return jsonb_build_object('id',result.id,'status',result.status,'plan_id',result.plan_id,'current_period_end',result.current_period_end,'cancel_at_period_end',result.cancel_at_period_end);
end;
$$;

create or replace function private.self_service_subscription_module(
  target_barbershop_id uuid,target_product_code text,target_module_id uuid,target_enabled boolean
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare subscription public.platform_subscriptions; module public.platform_modules; item public.subscription_modules;
begin
  if (select auth.uid()) is null or not private.is_business_owner(target_barbershop_id) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if target_enabled is null then raise exception 'Estado do módulo inválido' using errcode='22023'; end if;
  select s.* into subscription from public.platform_subscriptions s
    join public.billing_customers c on c.id=s.billing_customer_id join public.saas_clients sc on sc.id=c.saas_client_id
    join public.platform_products p on p.id=s.product_id
    where sc.barbershop_id=target_barbershop_id and sc.deleted_at is null and p.code=target_product_code
      and s.status in ('trial','active','grace_period') and not s.cancel_at_period_end for update;
  if subscription.id is null then raise exception 'Assinatura ativa não encontrada' using errcode='22023'; end if;
  select m.* into module from public.platform_modules m where m.id=target_module_id and m.product_id=subscription.product_id and m.active;
  if module.id is null then raise exception 'Módulo incompatível ou inativo' using errcode='22023'; end if;
  insert into public.subscription_modules(platform_subscription_id,module_id,product_id,status,cancelled_at)
  values(subscription.id,module.id,module.product_id,case when target_enabled then 'active' else 'cancelled' end,case when target_enabled then null else now() end)
  on conflict(platform_subscription_id,module_id) do update set status=excluded.status,cancelled_at=excluded.cancelled_at,updated_at=now()
  returning * into item;
  insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),case when target_enabled then 'module.self_service_enabled' else 'module.self_service_disabled' end,'subscription_module',item.id,
    jsonb_build_object('barbershop_id',target_barbershop_id,'product_code',target_product_code,'module_code',module.code));
  return jsonb_build_object('id',item.id,'status',item.status,'module_code',module.code);
end;
$$;

create or replace function private.business_portability_export(target_barbershop_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not private.is_business_owner(target_barbershop_id) then raise exception 'Acesso negado' using errcode='42501'; end if;
  select jsonb_build_object(
    'schema_version',1,'exported_at',now(),
    'business',(select to_jsonb(b) - 'updated_at' from public.barbershops b where b.id=target_barbershop_id),
    'team',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'full_name',p.full_name,'role',p.role,'active',p.active,'created_at',p.created_at)) from public.profiles p where p.barbershop_id=target_barbershop_id),'[]'::jsonb),
    'product_access',private.business_subscription_center(target_barbershop_id),
    'services',coalesce((select jsonb_agg(to_jsonb(s)) from public.services s where s.barbershop_id=target_barbershop_id),'[]'::jsonb),
    'business_clients',coalesce((select jsonb_agg(to_jsonb(c)) from public.business_clients c where c.barbershop_id=target_barbershop_id),'[]'::jsonb),
    'appointments',coalesce((select jsonb_agg(to_jsonb(a)) from public.business_appointments a where a.barbershop_id=target_barbershop_id),'[]'::jsonb),
    'menus',coalesce((select jsonb_agg(to_jsonb(m)) from public.online_menus m where m.barbershop_id=target_barbershop_id),'[]'::jsonb),
    'menu_orders',coalesce((select jsonb_agg(to_jsonb(o)-'public_access_token'-'idempotency_key') from public.menu_orders o where o.barbershop_id=target_barbershop_id and not o.is_test),'[]'::jsonb)
  ) into result;
  insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'business.self_service_exported','barbershop',target_barbershop_id,jsonb_build_object('schema_version',1));
  return result;
end;
$$;

revoke all on function private.business_subscription_center(uuid),private.self_service_product_subscription(uuid,text,text,uuid,text),private.self_service_subscription_module(uuid,text,uuid,boolean),private.business_portability_export(uuid) from public,anon,authenticated;
grant execute on function private.business_subscription_center(uuid),private.self_service_product_subscription(uuid,text,text,uuid,text),private.self_service_subscription_module(uuid,text,uuid,boolean),private.business_portability_export(uuid) to authenticated;

create function public.business_subscription_center(target_barbershop_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.business_subscription_center(target_barbershop_id)$$;
create function public.self_service_product_subscription(target_barbershop_id uuid,target_product_code text,target_action text,target_plan_id uuid default null,target_reason text default null) returns jsonb language sql security invoker set search_path='' as $$select private.self_service_product_subscription(target_barbershop_id,target_product_code,target_action,target_plan_id,target_reason)$$;
create function public.self_service_subscription_module(target_barbershop_id uuid,target_product_code text,target_module_id uuid,target_enabled boolean) returns jsonb language sql security invoker set search_path='' as $$select private.self_service_subscription_module(target_barbershop_id,target_product_code,target_module_id,target_enabled)$$;
create function public.business_portability_export(target_barbershop_id uuid) returns jsonb language sql security invoker set search_path='' as $$select private.business_portability_export(target_barbershop_id)$$;
revoke all on function public.business_subscription_center(uuid),public.self_service_product_subscription(uuid,text,text,uuid,text),public.self_service_subscription_module(uuid,text,uuid,boolean),public.business_portability_export(uuid) from public,anon;
grant execute on function public.business_subscription_center(uuid),public.self_service_product_subscription(uuid,text,text,uuid,text),public.self_service_subscription_module(uuid,text,uuid,boolean),public.business_portability_export(uuid) to authenticated;
