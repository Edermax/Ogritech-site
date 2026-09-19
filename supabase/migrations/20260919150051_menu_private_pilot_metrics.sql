-- Fase 7K-B: métricas agregadas e restritas do piloto do Cardápio.
-- A função não retorna nomes, telefones, e-mails, endereços ou itens do pedido.

create function public.menu_pilot_metrics(
  target_barbershop_id uuid,
  target_started_at timestamptz default null,
  target_ends_at timestamptz default null,
  target_max_consumers integer default 25,
  target_max_orders integer default 100
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if target_barbershop_id is null
    or target_max_consumers not between 1 and 100000
    or target_max_orders not between 1 and 1000000
    or (target_started_at is not null and target_ends_at is not null and target_started_at >= target_ends_at)
  then
    raise exception 'Parâmetros de monitoramento inválidos' using errcode = '22023';
  end if;

  if not public.is_business_team(target_barbershop_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  with scoped_orders as (
    select o.*
    from public.menu_orders o
    where o.barbershop_id = target_barbershop_id
      and not o.is_test
      and (target_started_at is null or o.created_at >= target_started_at)
      and (target_ends_at is null or o.created_at < target_ends_at)
  ), order_integrity as (
    select o.id,
      o.subtotal,
      coalesce(sum(i.line_total), 0)::numeric(12,2) as calculated_subtotal
    from scoped_orders o
    left join public.menu_order_items i
      on i.order_id = o.id and i.barbershop_id = o.barbershop_id
    group by o.id, o.subtotal
  ), status_counts as (
    select status, count(*)::integer as total
    from scoped_orders
    group by status
  ), fulfillment_counts as (
    select fulfillment_type, count(*)::integer as total
    from scoped_orders
    group by fulfillment_type
  ), possible_duplicates as (
    select count(*)::integer as groups_count
    from (
      select regexp_replace(customer_phone, '\D', '', 'g'), total_amount, date_trunc('minute', created_at)
      from scoped_orders
      group by regexp_replace(customer_phone, '\D', '', 'g'), total_amount, date_trunc('minute', created_at)
      having count(*) > 1
    ) grouped
  ), totals as (
    select
      count(*)::integer as orders_count,
      count(distinct coalesce(nullif(regexp_replace(customer_phone, '\D', '', 'g'), ''), nullif(lower(trim(customer_email)), ''), id::text))::integer as consumers_count,
      count(*) filter (where status = 'received' and created_at < now() - interval '24 hours')::integer as received_over_24h,
      count(*) filter (where payment_status = 'pending')::integer as payment_pending,
      count(*) filter (where consent_at is null)::integer as missing_consent,
      max(created_at) as last_order_at
    from scoped_orders
  )
  select jsonb_build_object(
    'generated_at', now(),
    'window', jsonb_build_object('started_at', target_started_at, 'ends_at', target_ends_at),
    'limits', jsonb_build_object('maximum_consumers', target_max_consumers, 'maximum_orders', target_max_orders),
    'orders_count', totals.orders_count,
    'consumers_count', totals.consumers_count,
    'orders_usage_percent', round(totals.orders_count * 100.0 / target_max_orders, 2),
    'consumers_usage_percent', round(totals.consumers_count * 100.0 / target_max_consumers, 2),
    'approaching_order_limit', totals.orders_count * 100 >= target_max_orders * 80,
    'approaching_consumer_limit', totals.consumers_count * 100 >= target_max_consumers * 80,
    'order_limit_reached', totals.orders_count >= target_max_orders,
    'consumer_limit_reached', totals.consumers_count >= target_max_consumers,
    'status_counts', coalesce((select jsonb_object_agg(status, total) from status_counts), '{}'::jsonb),
    'fulfillment_counts', coalesce((select jsonb_object_agg(fulfillment_type, total) from fulfillment_counts), '{}'::jsonb),
    'possible_duplicate_groups', (select groups_count from possible_duplicates),
    'price_divergences', (select count(*)::integer from order_integrity where subtotal <> calculated_subtotal),
    'received_over_24h', totals.received_over_24h,
    'payment_pending', totals.payment_pending,
    'missing_consent', totals.missing_consent,
    'last_order_at', totals.last_order_at,
    'contains_personal_data', false
  ) into result
  from totals;

  return result;
end;
$$;

revoke all on function public.menu_pilot_metrics(uuid,timestamptz,timestamptz,integer,integer) from public, anon;
grant execute on function public.menu_pilot_metrics(uuid,timestamptz,timestamptz,integer,integer) to authenticated;
