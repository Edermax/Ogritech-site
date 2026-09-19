-- Ativação administrativa e catálogo de acesso para o painel do negócio.

insert into public.saas_plans(product_id,code,name,monthly_fee,description,features,featured,active,display_order)
select product.id,'foundation',product.name || ' — Configuração',0,
  'Configuração interna para validação local; preço comercial ainda não definido.',
  '[]'::jsonb,false,true,100 + product.display_order
from public.platform_products product
where product.code in ('pages','quotes','menu')
on conflict(product_id,code) do update set
  name=excluded.name,description=excluded.description,active=true;

create or replace function private.business_product_catalog(target_barbershop_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null
     or not (public.is_platform_admin() or public.is_business_team(target_barbershop_id)) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'code',product.code,
    'name',product.name,
    'launch_state',product.launch_state,
    'subscribed',subscription.id is not null,
    'subscription_id',subscription.id,
    'status',subscription.status,
    'plan_id',subscription.plan_id,
    'plan_name',plan.name,
    'base_amount',subscription.base_amount,
    'current_period_end',subscription.current_period_end
  ) order by product.display_order),'[]'::jsonb) into result
  from public.platform_products product
  left join lateral (
    select item.* from public.platform_subscriptions item
    join public.billing_customers customer on customer.id=item.billing_customer_id
    join public.saas_clients client on client.id=customer.saas_client_id
    where client.barbershop_id=target_barbershop_id
      and client.deleted_at is null
      and item.product_id=product.id
      and item.status<>'cancelled'
    order by item.created_at desc limit 1
  ) subscription on true
  left join public.saas_plans plan on plan.id=subscription.plan_id
  where product.active;
  return result;
end;
$$;

create or replace function private.platform_set_product_subscription(
  target_saas_client_id uuid,
  target_product_code text,
  target_plan_id uuid,
  target_status text,
  target_base_amount numeric default null
) returns public.platform_subscriptions
language plpgsql security definer set search_path=''
as $$
declare
  customer public.billing_customers;
  product public.platform_products;
  plan public.saas_plans;
  existing public.platform_subscriptions;
  result public.platform_subscriptions;
begin
  if (select auth.uid()) is null or not public.is_platform_admin() then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  if target_status not in ('trial','active','suspended','cancelled') then
    raise exception 'Status de assinatura inválido' using errcode='22023';
  end if;
  select * into product from public.platform_products
  where code=target_product_code and active;
  if product.id is null then raise exception 'Produto indisponível' using errcode='22023'; end if;

  select * into plan from public.saas_plans
  where id=target_plan_id and product_id=product.id and active;
  if plan.id is null then raise exception 'Plano incompatível ou inativo' using errcode='22023'; end if;

  insert into public.billing_customers(saas_client_id,billing_email)
  select id,coalesce(owner_email,'') from public.saas_clients
  where id=target_saas_client_id and deleted_at is null
  on conflict(saas_client_id) do update
    set billing_email=coalesce(nullif(public.billing_customers.billing_email,''),excluded.billing_email)
  returning * into customer;
  if customer.id is null then raise exception 'Cliente não encontrado' using errcode='22023'; end if;

  select * into existing from public.platform_subscriptions
  where billing_customer_id=customer.id and product_id=product.id and status<>'cancelled'
  for update;

  if target_status='cancelled' then
    if existing.id is null then raise exception 'Assinatura ativa não encontrada' using errcode='22023'; end if;
    update public.platform_subscriptions set status='cancelled',cancelled_at=now(),cancel_at_period_end=false
    where id=existing.id returning * into result;
  elsif existing.id is null then
    insert into public.platform_subscriptions(
      billing_customer_id,product_id,plan_id,status,base_amount,starts_on,next_billing_on
    ) values(
      customer.id,product.id,plan.id,target_status,coalesce(target_base_amount,plan.monthly_fee),
      current_date,current_date+interval '1 month'
    ) returning * into result;
  else
    update public.platform_subscriptions set
      plan_id=plan.id,status=target_status,
      base_amount=coalesce(target_base_amount,plan.monthly_fee),
      cancelled_at=null,cancel_at_period_end=false
    where id=existing.id returning * into result;
  end if;

  insert into public.platform_billing_audit_log(actor_id,action,entity_type,entity_id,details)
  values((select auth.uid()),'subscription.product_status_changed','subscription',result.id,
    jsonb_build_object('product_code',product.code,'status',result.status,'plan_id',result.plan_id));
  return result;
end;
$$;

revoke all on function private.business_product_catalog(uuid) from public,anon,authenticated;
revoke all on function private.platform_set_product_subscription(uuid,text,uuid,text,numeric) from public,anon,authenticated;
grant execute on function private.business_product_catalog(uuid) to authenticated;
grant execute on function private.platform_set_product_subscription(uuid,text,uuid,text,numeric) to authenticated;

create function public.business_product_catalog(target_barbershop_id uuid)
returns jsonb language sql stable security invoker set search_path=''
as $$ select private.business_product_catalog(target_barbershop_id) $$;
create function public.platform_set_product_subscription(
  target_saas_client_id uuid,target_product_code text,target_plan_id uuid,
  target_status text,target_base_amount numeric default null
) returns public.platform_subscriptions
language sql security invoker set search_path=''
as $$ select * from private.platform_set_product_subscription(
  target_saas_client_id,target_product_code,target_plan_id,target_status,target_base_amount
) $$;

revoke all on function public.business_product_catalog(uuid) from public,anon;
revoke all on function public.platform_set_product_subscription(uuid,text,uuid,text,numeric) from public,anon;
grant execute on function public.business_product_catalog(uuid) to authenticated;
grant execute on function public.platform_set_product_subscription(uuid,text,uuid,text,numeric) to authenticated;
