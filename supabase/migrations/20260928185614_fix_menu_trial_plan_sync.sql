update public.saas_plans
set name='Cardápio'
where product_id=(select id from public.platform_products where code='menu') and code='foundation';

create or replace function public.platform_sync_client_subscription()
returns trigger language plpgsql security definer set search_path='public'
as $$
declare
  customer public.billing_customers;
  selected_plan uuid;
  selected_product uuid;
  agenda_product uuid;
begin
  if new.deleted_at is not null then return new; end if;
  select id into agenda_product from public.platform_products where code='agenda';
  select id,product_id into selected_plan,selected_product
  from public.saas_plans where name=new.plan and active order by display_order limit 1;

  -- Produtos não-Agenda são provisionados explicitamente pela jornada própria.
  if selected_product is not null and selected_product<>agenda_product then return new; end if;

  insert into public.billing_customers(saas_client_id,billing_email)
  values(new.id,coalesce(new.owner_email,''))
  on conflict(saas_client_id) do update set billing_email=excluded.billing_email
  returning * into customer;

  if selected_plan is null then
    select id into selected_plan from public.saas_plans
    where product_id=agenda_product and code='agenda';
  end if;
  if exists(select 1 from public.platform_subscriptions where billing_customer_id=customer.id and product_id=agenda_product and status<>'cancelled') then
    update public.platform_subscriptions set plan_id=selected_plan,base_amount=new.monthly_fee,
      status=case when new.status='Ativo' then 'active' when new.status='Suspenso' then 'suspended' else status end
    where billing_customer_id=customer.id and product_id=agenda_product and status<>'cancelled';
  else
    insert into public.platform_subscriptions(billing_customer_id,plan_id,product_id,status,base_amount,next_billing_on)
    values(customer.id,selected_plan,agenda_product,case when new.status='Ativo' then 'active' else 'pending_activation' end,new.monthly_fee,current_date+interval '1 month');
  end if;
  return new;
end;
$$;
